import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import type { ProviderType } from '@/db/types';
import { nowIso } from '@/domain/time';
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

// Least-privilege: app-private storage in the Drive appDataFolder
// (technical/sync.md Google Drive requirements).
const SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];

const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

function redirectUri(): string {
  return AuthSession.makeRedirectUri({ scheme: 'spiny', path: 'oauthredirect' });
}

/**
 * Interactive OAuth authorization (called from settings UI). Stores the
 * resulting token set in `expo-secure-store`. Requires the user's own Google
 * OAuth client id (no app-owned secrets are bundled — constraints C-07).
 */
export async function authorizeGoogleDrive(
  connectionId: string,
  clientId: string
): Promise<boolean> {
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
  const stored: StoredTokenSet = {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt,
    scope: token.scope,
    tokenType: token.tokenType,
  };
  await setTokenSet(connectionId, stored);
}

export interface GoogleDriveConfig {
  clientId?: string;
}

export class GoogleDriveProvider implements SyncProvider {
  readonly kind: ProviderType = 'google_drive';
  private readonly connectionId: string;
  private readonly clientId: string | undefined;

  constructor(connectionId: string, config: GoogleDriveConfig) {
    this.connectionId = connectionId;
    this.clientId = config.clientId?.trim() || undefined;
  }

  async status(): Promise<ProviderStatus> {
    if (!this.clientId) return 'needs_setup';
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

  private async findFileByName(name: string): Promise<{ id: string; modifiedTime?: string } | null> {
    const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}'`);
    const url = `${FILES_URL}?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&pageSize=1`;
    const res = await this.authedFetch(url, { method: 'GET' });
    if (!res.ok) return null;
    const json = (await res.json()) as { files?: { id: string; modifiedTime?: string }[] };
    return json.files && json.files.length > 0 ? json.files[0] : null;
  }

  private async downloadJson<T>(fileId: string): Promise<T | null> {
    const res = await this.authedFetch(`${FILES_URL}/${fileId}?alt=media`, { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) throw new SyncTransientError(`Drive download failed (${res.status}).`);
    return (await res.json()) as T;
  }

  private async upsertJsonFile(
    name: string,
    body: unknown,
    existingId?: string
  ): Promise<{ id: string; modifiedTime: string }> {
    const content = JSON.stringify(body);
    if (existingId) {
      const res = await this.authedFetch(
        `${UPLOAD_URL}/${existingId}?uploadType=media&fields=id,modifiedTime`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: content }
      );
      if (!res.ok) throw new SyncTransientError(`Drive update failed (${res.status}).`);
      const json = (await res.json()) as { id: string; modifiedTime?: string };
      return { id: json.id, modifiedTime: json.modifiedTime ?? nowIso() };
    }
    const boundary = `spiny${Date.now()}`;
    const metadata = { name, parents: ['appDataFolder'], mimeType: 'application/json' };
    const multipart =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
      `${content}\r\n--${boundary}--`;
    const res = await this.authedFetch(`${UPLOAD_URL}?uploadType=multipart&fields=id,modifiedTime`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart,
    });
    if (!res.ok) throw new SyncTransientError(`Drive upload failed (${res.status}).`);
    const json = (await res.json()) as { id: string; modifiedTime?: string };
    return { id: json.id, modifiedTime: json.modifiedTime ?? nowIso() };
  }

  private manifestName(catalogId: string): string {
    return `spiny.catalog.${catalogId}.json`;
  }

  private documentName(catalogId: string, documentId: string): string {
    return `spiny.doc.${catalogId}.${documentId}.json`;
  }

  async getCatalogManifest(catalogId: string): Promise<CatalogManifest | null> {
    const file = await this.findFileByName(this.manifestName(catalogId));
    if (!file) return null;
    return this.downloadJson<CatalogManifest>(file.id);
  }

  async putCatalogManifest(manifest: CatalogManifest): Promise<void> {
    const name = this.manifestName(manifest.catalogId);
    const existing = await this.findFileByName(name);
    await this.upsertJsonFile(name, manifest, existing?.id);
  }

  async getDocument(catalogId: string, documentId: string): Promise<RemoteDocument | null> {
    const file = await this.findFileByName(this.documentName(catalogId, documentId));
    if (!file) return null;
    const doc = await this.downloadJson<RemoteDocument>(file.id);
    if (!doc) return null;
    return { ...doc, remoteKey: file.id };
  }

  async putDocument(document: RemoteDocument): Promise<PutResult> {
    const name = this.documentName(document.catalogId, document.documentId);
    const existing = document.remoteKey
      ? { id: document.remoteKey }
      : await this.findFileByName(name);
    const saved = await this.upsertJsonFile(name, document, existing?.id);
    return { remoteKey: saved.id, remoteUpdatedAt: document.updatedAt };
  }

  async deleteDocument(
    catalogId: string,
    documentId: string,
    deletedAt: string
  ): Promise<PutResult> {
    // Write a tombstone so latest-wins can propagate the deletion.
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
    return this.putDocument(tombstone);
  }
}
