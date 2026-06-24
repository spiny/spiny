import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';

import type { SyncConnection } from '@/db';
import type { ProviderType } from '@/db/types';
import { compareIso, nowIso } from '@/domain/time';
import {
  archiveEntryFromManifestEntry,
  archiveEntryFromRemote,
  composeDriveManifest,
  driveDocumentFileName,
  DRIVE_DOCUMENTS_DIR,
  DRIVE_MANIFEST_FILE,
  DRIVE_RELATIONSHIPS_FILE,
  manifestToService,
  relationshipsFromEntries,
  remoteFromArchiveEntry,
  upsertArchiveEntry,
  type DriveArchiveCatalogInfo,
  type DriveArchiveDocumentEntry,
  type DriveArchiveManifest,
} from './driveLayout';
import {
  deleteTokenSet,
  getTokenSet,
  setTokenSet,
  type StoredTokenSet,
} from './secrets';
import {
  SyncTransientError,
  type CatalogManifest,
  type ProviderStatus,
  type PutResult,
  type RemoteDocument,
  type SyncProvider,
} from './types';

// Ensures the auth redirect dismisses the in-app browser.
WebBrowser.maybeCompleteAuthSession();

const DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

/**
 * OAuth scope (issue #4). VERIFIED against the official Google Drive scopes
 * documentation (https://developers.google.com/workspace/drive/api/guides/api-specific-auth,
 * "Choose Google Drive API scopes"):
 *
 * Issue #4 requires (1) browsing the user's EXISTING Drive folders to pick a
 * target and (2) creating/reading/updating Spiny's files inside that folder.
 *  - `drive.appdata` (the previous scope) is hidden app storage and CANNOT see
 *    real user folders.
 *  - `drive.file` (non-sensitive) only grants access to files the app itself
 *    created or that the user opened via the Google Picker, so a REST
 *    `files.list` parent query CANNOT enumerate arbitrary pre-existing folders.
 *  - The minimal SINGLE scope that satisfies both requirements is the restricted
 *    `drive` scope ("View and manage all your Drive files"). Spiny is a
 *    note-taking app, which Google lists as a qualifying "Productivity and
 *    education" category for restricted-scope use.
 *
 * Least-privilege tradeoff (documented in docs/technical/sync.md): `drive` is
 * broad. A future Google Picker integration could narrow this to `drive.file`.
 */
const SCOPES = ['https://www.googleapis.com/auth/drive'];

const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

// Folder MIME type per Drive "Create and populate folders" docs.
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MARKDOWN_MIME = 'text/markdown';
const JSON_MIME = 'application/json';

/** A Drive folder reference surfaced to the folder-browser UI. */
export interface DriveFolder {
  id: string;
  name: string;
}

/**
 * App-level (build-configured) Google OAuth client id.
 *
 * Per Google "OAuth 2.0 for Mobile & Desktop Apps", a native client id used with
 * PKCE is a PUBLIC identifier, not a secret, so no client secret is bundled
 * (constraints C-07). Distributors register an Android+iOS OAuth client and set
 * `expo.extra.googleDriveClientId` in app.json; the repo ships it empty.
 */
export function getGoogleDriveClientId(): string | undefined {
  const raw = Constants.expoConfig?.extra?.googleDriveClientId;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

/** Whether this build can run Google Drive OAuth (client id configured). */
export function isGoogleDriveConfigured(): boolean {
  return getGoogleDriveClientId() !== undefined;
}

/** App-level client id, falling back to a legacy per-connection id if present. */
function resolveClientId(legacyClientId?: string): string | undefined {
  const appLevel = getGoogleDriveClientId();
  if (appLevel) return appLevel;
  return legacyClientId && legacyClientId.trim() ? legacyClientId.trim() : undefined;
}

function redirectUri(): string {
  return AuthSession.makeRedirectUri({ scheme: 'spiny', path: 'oauthredirect' });
}

/** Escape a value embedded in a Drive `files.list` `q` string (single quotes). */
function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Interactive OAuth authorization (called from settings UI). Uses the app-level
 * public PKCE client id and stores the resulting token set in `expo-secure-store`.
 * Returns `false` if the build has no client id configured or the user cancels;
 * the UI checks {@link isGoogleDriveConfigured} first to show a clear message.
 */
export async function authorizeGoogleDrive(
  connectionId: string,
  legacyClientId?: string
): Promise<boolean> {
  const clientId = resolveClientId(legacyClientId);
  if (!clientId) return false;

  const request = new AuthSession.AuthRequest({
    clientId,
    scopes: SCOPES,
    redirectUri: redirectUri(),
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    extraParams: { access_type: 'offline', prompt: 'consent' },
  });
  await request.makeAuthUrlAsync(DISCOVERY);
  const result = await request.promptAsync(DISCOVERY);
  if (result.type !== 'success' || !result.params.code) return false;

  const token = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: result.params.code,
      redirectUri: redirectUri(),
      extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : undefined,
    },
    DISCOVERY
  );
  await persistToken(connectionId, token);
  return true;
}

export async function disconnectGoogleDrive(connectionId: string): Promise<void> {
  await deleteTokenSet(connectionId);
}

async function persistToken(connectionId: string, token: AuthSession.TokenResponse): Promise<void> {
  const expiresAt = token.expiresIn
    ? (token.issuedAt + token.expiresIn) * 1000
    : undefined;
  // Google's OAuth refresh grant does not return a new refresh_token, and the
  // standalone AuthSession.refreshAsync() does not re-attach the prior one (only
  // the TokenResponse instance method does). Preserve the previously stored
  // refresh token so subsequent refreshes keep working instead of falling back
  // to an expired access token (technical/sync.md "Handle token refresh/reconnect").
  const prev = await getTokenSet(connectionId);
  const stored: StoredTokenSet = {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken ?? prev?.refreshToken,
    expiresAt,
    scope: token.scope,
    tokenType: token.tokenType,
  };
  await setTokenSet(connectionId, stored);
}

export interface GoogleDriveConfig {
  /**
   * Legacy per-connection client id (pre issue #4). The app-level
   * `expo.extra.googleDriveClientId` is preferred; this is only a
   * backward-compatible fallback for connections created before the change.
   */
  clientId?: string;
  /** Drive folder id chosen as the storage target (`root` = My Drive). */
  targetFolderId?: string;
  /** Display name of the target folder (non-secret metadata). */
  targetFolderName?: string;
  /** Optional human-readable path of the target folder. */
  targetFolderPath?: string;
}

/** Parse a stored connection `config_json` into a typed Google Drive config. */
export function googleDriveConfigFromConnection(
  config: Record<string, unknown>
): GoogleDriveConfig {
  const str = (key: string): string | undefined => {
    const value = config[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };
  return {
    clientId: str('clientId'),
    targetFolderId: str('targetFolderId'),
    targetFolderName: str('targetFolderName'),
    targetFolderPath: str('targetFolderPath'),
  };
}

export class GoogleDriveProvider implements SyncProvider {
  readonly kind: ProviderType = 'google_drive';
  private readonly connectionId: string;
  private readonly clientId: string | undefined;
  private readonly targetFolderId: string | undefined;
  /** Folder-id cache keyed by a logical path, scoped to this provider instance. */
  private readonly dirCache = new Map<string, string>();

  constructor(connectionId: string, config: GoogleDriveConfig) {
    this.connectionId = connectionId;
    this.clientId = resolveClientId(config.clientId);
    this.targetFolderId = config.targetFolderId;
  }

  async status(): Promise<ProviderStatus> {
    // Ready requires: configured client id AND a chosen target folder AND a token.
    if (!this.clientId) return 'needs_setup';
    if (!this.targetFolderId) return 'needs_setup';
    const tokens = await getTokenSet(this.connectionId);
    return tokens?.refreshToken || tokens?.accessToken ? 'ready' : 'needs_setup';
  }

  async connect(): Promise<void> {
    // Interactive authorization happens in the UI via authorizeGoogleDrive().
    // connect() simply validates that a usable token exists.
    await this.getAccessToken();
  }

  async disconnect(): Promise<void> {
    await deleteTokenSet(this.connectionId);
  }

  // ---- Auth / transport ----

  private async getAccessToken(): Promise<string> {
    if (!this.clientId) {
      throw new SyncTransientError('Google Drive client id is not configured.');
    }
    const tokens = await getTokenSet(this.connectionId);
    if (!tokens) throw new SyncTransientError('Google Drive account is not connected.');

    const fresh =
      tokens.accessToken &&
      tokens.expiresAt !== undefined &&
      Date.now() < tokens.expiresAt - 60_000;
    if (fresh) return tokens.accessToken;

    if (tokens.refreshToken) {
      try {
        const refreshed = await AuthSession.refreshAsync(
          { clientId: this.clientId, refreshToken: tokens.refreshToken },
          DISCOVERY
        );
        await persistToken(this.connectionId, refreshed);
        return refreshed.accessToken;
      } catch (err) {
        throw new SyncTransientError('Failed to refresh Google Drive token.', err);
      }
    }
    if (tokens.accessToken) return tokens.accessToken;
    throw new SyncTransientError('Google Drive account requires re-authentication.');
  }

  private async authedFetch(url: string, init: RequestInit, retry = true): Promise<Response> {
    const token = await this.getAccessToken();
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      throw new SyncTransientError('Network request to Google Drive failed.', err);
    }
    if (res.status === 401 && retry) {
      // Force refresh by clearing the cached expiry and retrying once.
      const tokens = await getTokenSet(this.connectionId);
      if (tokens) await setTokenSet(this.connectionId, { ...tokens, expiresAt: 0 });
      return this.authedFetch(url, init, false);
    }
    if (res.status === 429 || res.status >= 500) {
      throw new SyncTransientError(`Google Drive responded with ${res.status}.`);
    }
    return res;
  }

  // ---- Folder browsing (Drive "Search for files and folders") ----

  /**
   * List child folders of `parentId` (default `root` = My Drive), used by the
   * folder-browser UI. Query verified against the official Drive search docs:
   * `mimeType='application/vnd.google-apps.folder' and trashed=false and
   * '<parentId>' in parents`.
   */
  async listFolders(parentId: string = 'root'): Promise<DriveFolder[]> {
    const q =
      `mimeType='${FOLDER_MIME}' and trashed=false and ` +
      `'${escapeQueryValue(parentId)}' in parents`;
    const url =
      `${FILES_URL}?q=${encodeURIComponent(q)}` +
      `&fields=${encodeURIComponent('files(id,name)')}` +
      `&orderBy=${encodeURIComponent('name')}` +
      `&spaces=drive&pageSize=200`;
    const res = await this.authedFetch(url, { method: 'GET' });
    if (!res.ok) throw new SyncTransientError(`Drive folder list failed (${res.status}).`);
    const json = (await res.json()) as { files?: DriveFolder[] };
    return (json.files ?? []).map((f) => ({ id: f.id, name: f.name }));
  }

  /** Create a metadata-only child folder under `parentId` and return it. */
  async createFolder(parentId: string, name: string): Promise<DriveFolder> {
    const metadata = { name, mimeType: FOLDER_MIME, parents: [parentId] };
    const res = await this.authedFetch(`${FILES_URL}?fields=${encodeURIComponent('id,name')}`, {
      method: 'POST',
      headers: { 'Content-Type': JSON_MIME },
      body: JSON.stringify(metadata),
    });
    if (!res.ok) throw new SyncTransientError(`Drive folder create failed (${res.status}).`);
    const json = (await res.json()) as { id: string; name?: string };
    return { id: json.id, name: json.name ?? name };
  }

  // ---- Folder / file resolution within the target folder ----

  private requireTargetFolder(): string {
    if (!this.targetFolderId) {
      throw new SyncTransientError('Google Drive target folder is not configured.');
    }
    return this.targetFolderId;
  }

  private async findChildFolder(parentId: string, name: string): Promise<string | null> {
    const q =
      `mimeType='${FOLDER_MIME}' and trashed=false and ` +
      `name='${escapeQueryValue(name)}' and '${escapeQueryValue(parentId)}' in parents`;
    const url =
      `${FILES_URL}?q=${encodeURIComponent(q)}` +
      `&fields=${encodeURIComponent('files(id)')}&spaces=drive&pageSize=1`;
    const res = await this.authedFetch(url, { method: 'GET' });
    if (!res.ok) throw new SyncTransientError(`Drive folder lookup failed (${res.status}).`);
    const json = (await res.json()) as { files?: { id: string }[] };
    return json.files && json.files.length > 0 ? json.files[0].id : null;
  }

  private async findChildFile(parentId: string, name: string): Promise<{ id: string } | null> {
    const q =
      `trashed=false and name='${escapeQueryValue(name)}' and ` +
      `'${escapeQueryValue(parentId)}' in parents`;
    const url =
      `${FILES_URL}?q=${encodeURIComponent(q)}` +
      `&fields=${encodeURIComponent('files(id)')}&spaces=drive&pageSize=1`;
    const res = await this.authedFetch(url, { method: 'GET' });
    if (!res.ok) throw new SyncTransientError(`Drive file lookup failed (${res.status}).`);
    const json = (await res.json()) as { files?: { id: string }[] };
    return json.files && json.files.length > 0 ? json.files[0] : null;
  }

  /** Resolve `<targetFolder>/<catalogId>/`; create it when `create` is true. */
  private async resolveCatalogDir(catalogId: string, create: boolean): Promise<string | null> {
    const cacheKey = `cat:${catalogId}`;
    const cached = this.dirCache.get(cacheKey);
    if (cached) return cached;
    const target = this.requireTargetFolder();
    const existing = await this.findChildFolder(target, catalogId);
    if (existing) {
      this.dirCache.set(cacheKey, existing);
      return existing;
    }
    if (!create) return null;
    const created = (await this.createFolder(target, catalogId)).id;
    this.dirCache.set(cacheKey, created);
    return created;
  }

  /** Resolve `<targetFolder>/<catalogId>/documents/`; create when `create`. */
  private async resolveDocumentsDir(catalogId: string, create: boolean): Promise<string | null> {
    const catalogDir = await this.resolveCatalogDir(catalogId, create);
    if (!catalogDir) return null;
    const cacheKey = `docs:${catalogId}`;
    const cached = this.dirCache.get(cacheKey);
    if (cached) return cached;
    const existing = await this.findChildFolder(catalogDir, DRIVE_DOCUMENTS_DIR);
    if (existing) {
      this.dirCache.set(cacheKey, existing);
      return existing;
    }
    if (!create) return null;
    const created = (await this.createFolder(catalogDir, DRIVE_DOCUMENTS_DIR)).id;
    this.dirCache.set(cacheKey, created);
    return created;
  }

  // ---- Blob helpers (Drive upload/download REST) ----

  private async downloadText(fileId: string): Promise<string | null> {
    const res = await this.authedFetch(`${FILES_URL}/${fileId}?alt=media`, { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) throw new SyncTransientError(`Drive download failed (${res.status}).`);
    return res.text();
  }

  private async downloadJsonFile<T>(fileId: string): Promise<T | null> {
    const text = await this.downloadText(fileId);
    if (text === null) return null;
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new SyncTransientError('Google Drive returned malformed JSON.', err);
    }
  }

  /**
   * Create (multipart) or update (media PATCH) a file inside `parentId`.
   * Verified against the Drive "Upload file data" docs: multipart/related body
   * with a JSON metadata part followed by the media part; PATCH to update.
   */
  private async uploadFile(
    parentId: string,
    name: string,
    mimeType: string,
    content: string,
    existingId?: string
  ): Promise<{ id: string }> {
    if (existingId) {
      const res = await this.authedFetch(
        `${UPLOAD_URL}/${existingId}?uploadType=media&fields=${encodeURIComponent('id')}`,
        { method: 'PATCH', headers: { 'Content-Type': mimeType }, body: content }
      );
      if (!res.ok) throw new SyncTransientError(`Drive update failed (${res.status}).`);
      const json = (await res.json()) as { id: string };
      return { id: json.id };
    }
    const boundary = `spiny${Date.now()}`;
    const metadata = { name, parents: [parentId], mimeType };
    const multipart =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n` +
      `${content}\r\n--${boundary}--`;
    const res = await this.authedFetch(
      `${UPLOAD_URL}?uploadType=multipart&fields=${encodeURIComponent('id')}`,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipart,
      }
    );
    if (!res.ok) throw new SyncTransientError(`Drive upload failed (${res.status}).`);
    const json = (await res.json()) as { id: string };
    return { id: json.id };
  }

  private async deleteFile(fileId: string): Promise<void> {
    const res = await this.authedFetch(`${FILES_URL}/${fileId}`, { method: 'DELETE' });
    // 204 No Content on success; tolerate 404 (already gone).
    if (!res.ok && res.status !== 404) {
      throw new SyncTransientError(`Drive delete failed (${res.status}).`);
    }
  }

  // ---- Manifest / relationships read-modify-write ----

  private async readManifest(
    catalogDirId: string
  ): Promise<{ fileId: string; manifest: DriveArchiveManifest } | null> {
    const file = await this.findChildFile(catalogDirId, DRIVE_MANIFEST_FILE);
    if (!file) return null;
    const manifest = await this.downloadJsonFile<DriveArchiveManifest>(file.id);
    if (!manifest) return null;
    return { fileId: file.id, manifest };
  }

  private async writeManifest(
    catalogDirId: string,
    manifest: DriveArchiveManifest,
    existingId?: string
  ): Promise<void> {
    await this.uploadFile(
      catalogDirId,
      DRIVE_MANIFEST_FILE,
      JSON_MIME,
      JSON.stringify(manifest, null, 2),
      existingId
    );
  }

  private async writeRelationships(
    catalogDirId: string,
    catalogId: string,
    documents: DriveArchiveDocumentEntry[]
  ): Promise<void> {
    const existing = await this.findChildFile(catalogDirId, DRIVE_RELATIONSHIPS_FILE);
    const rel = relationshipsFromEntries(catalogId, documents);
    await this.uploadFile(
      catalogDirId,
      DRIVE_RELATIONSHIPS_FILE,
      JSON_MIME,
      JSON.stringify(rel, null, 2),
      existing?.id
    );
  }

  // ---- SyncProvider surface ----

  async getCatalogManifest(catalogId: string): Promise<CatalogManifest | null> {
    const catalogDir = await this.resolveCatalogDir(catalogId, false);
    if (!catalogDir) return null;
    const found = await this.readManifest(catalogDir);
    if (!found) return null;
    return manifestToService(catalogId, found.manifest);
  }

  async putCatalogManifest(manifest: CatalogManifest): Promise<void> {
    const { catalogId } = manifest;
    const catalogDir = await this.resolveCatalogDir(catalogId, true);
    if (!catalogDir) throw new SyncTransientError('Google Drive target folder is not configured.');

    const existing = await this.readManifest(catalogDir);
    const documents = manifest.documents.map(archiveEntryFromManifestEntry);
    const catalog: DriveArchiveCatalogInfo = {
      id: catalogId,
      title: manifest.title,
      description: manifest.description,
      // The provider-neutral manifest has no catalog createdAt; preserve any
      // existing value, else seed from updatedAt (best-effort archive metadata).
      createdAt: existing?.manifest.catalog?.createdAt ?? manifest.updatedAt ?? nowIso(),
      updatedAt: manifest.updatedAt,
    };
    const archive = composeDriveManifest(catalog, documents, nowIso());
    await this.writeManifest(catalogDir, archive, existing?.fileId);
    await this.writeRelationships(catalogDir, catalogId, documents);
  }

  async getDocument(catalogId: string, documentId: string): Promise<RemoteDocument | null> {
    const catalogDir = await this.resolveCatalogDir(catalogId, false);
    if (!catalogDir) return null;
    const found = await this.readManifest(catalogDir);
    if (!found) return null;
    const entry = (found.manifest.documents ?? []).find((d) => d.documentId === documentId);
    if (!entry) return null;

    let body = '';
    let remoteKey: string | null = null;
    if (entry.deletedAt == null) {
      const docsDir = await this.resolveDocumentsDir(catalogId, false);
      if (docsDir) {
        const file = await this.findChildFile(docsDir, driveDocumentFileName(documentId));
        if (file) {
          remoteKey = file.id;
          body = (await this.downloadText(file.id)) ?? '';
        }
      }
    }
    return remoteFromArchiveEntry(catalogId, entry, body, remoteKey);
  }

  async putDocument(document: RemoteDocument): Promise<PutResult> {
    return this.writeDocument(document);
  }

  async deleteDocument(
    catalogId: string,
    documentId: string,
    deletedAt: string
  ): Promise<PutResult> {
    const tombstone: RemoteDocument = {
      schema: 'spiny.document.v1',
      catalogId,
      documentId,
      title: '',
      topics: [],
      bodyMarkdown: '',
      linkedDocumentIds: [],
      createdAt: deletedAt,
      updatedAt: deletedAt,
      deletedAt,
    };
    return this.writeDocument(tombstone);
  }

  /**
   * Write one document body and upsert its manifest entry (read-modify-write).
   * The manifest must be updated here because `getDocument` reads metadata from
   * it and the sync service does not always call `putCatalogManifest` after each
   * `putDocument` (e.g. dirty-document sync).
   */
  private async writeDocument(document: RemoteDocument): Promise<PutResult> {
    const { catalogId, documentId } = document;
    const catalogDir = await this.resolveCatalogDir(catalogId, true);
    if (!catalogDir) throw new SyncTransientError('Google Drive target folder is not configured.');
    const docsDir = await this.resolveDocumentsDir(catalogId, true);
    if (!docsDir) throw new SyncTransientError('Google Drive target folder is not configured.');

    const fileName = driveDocumentFileName(documentId);
    const existingFile = await this.findChildFile(docsDir, fileName);
    let remoteKey: string | null = null;

    if (document.deletedAt != null) {
      // Tombstone: remove the body file; metadata stays in the manifest.
      if (existingFile) await this.deleteFile(existingFile.id);
    } else {
      const saved = await this.uploadFile(
        docsDir,
        fileName,
        MARKDOWN_MIME,
        document.bodyMarkdown,
        existingFile?.id
      );
      remoteKey = saved.id;
    }

    const existing = await this.readManifest(catalogDir);
    const entry = archiveEntryFromRemote(document);
    const documents = upsertArchiveEntry(existing?.manifest.documents ?? [], entry);
    const baseCatalog = existing?.manifest.catalog;
    const catalog: DriveArchiveCatalogInfo = {
      id: catalogId,
      title: baseCatalog?.title ?? '',
      description: baseCatalog?.description ?? '',
      createdAt: baseCatalog?.createdAt ?? document.createdAt,
      updatedAt:
        baseCatalog && compareIso(baseCatalog.updatedAt, document.updatedAt) >= 0
          ? baseCatalog.updatedAt
          : document.updatedAt,
    };
    const archive = composeDriveManifest(catalog, documents, nowIso());
    await this.writeManifest(catalogDir, archive, existing?.fileId);
    await this.writeRelationships(catalogDir, catalogId, documents);

    return { remoteKey, remoteUpdatedAt: document.updatedAt };
  }
}

/** Build a Google Drive provider from a stored connection (UI/registry helper). */
function providerFromConnection(connection: SyncConnection): GoogleDriveProvider {
  return new GoogleDriveProvider(
    connection.id,
    googleDriveConfigFromConnection(connection.config)
  );
}

/** List child folders for the folder-browser UI (issue #4). */
export async function listGoogleDriveFolders(
  connection: SyncConnection,
  parentId: string
): Promise<DriveFolder[]> {
  return providerFromConnection(connection).listFolders(parentId);
}

/** Create a folder from the folder-browser UI and return it (issue #4). */
export async function createGoogleDriveFolder(
  connection: SyncConnection,
  parentId: string,
  name: string
): Promise<DriveFolder> {
  return providerFromConnection(connection).createFolder(parentId, name);
}
