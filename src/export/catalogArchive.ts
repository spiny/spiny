/**
 * Catalog export/import archive format (issue #2).
 *
 * A Spiny catalog archive is a ZIP file with this canonical layout. The Google
 * Drive remote layout (issue #4) mirrors it exactly, so keep it stable:
 *
 *   manifest.json          envelope: schema, exportedAt, catalog, settings, documents[]
 *   relationships.json      document_relationships rows for the catalog
 *   documents/{id}.md       raw body_markdown for each ACTIVE document
 *
 * Design choices (documented in docs/technical/storage.md):
 * - Document metadata (title, topics, timestamps, links) lives in manifest.json;
 *   the `.md` files carry only the Markdown body. This keeps a single source of
 *   truth for metadata and leaves the bodies as clean, diff-friendly Markdown.
 * - Only non-secret data is exported. `active_sync_connection_id`, anything from
 *   `sync_connections` / `sync_credentials`, and OAuth tokens are NEVER written
 *   to an archive.
 *
 * This module is pure (no SQLite, filesystem, or React Native), so it can be
 * unit tested and reused by the sync providers. Device IO lives in
 * `catalogTransfer.ts`.
 */
import JSZip from 'jszip';

import type { Catalog, DocumentModel } from '@/db/types';
import { newId } from '@/domain/ids';
import { buildDocumentUri, extractLinkedDocumentIds } from '@/domain/markdown';
import { nowIso } from '@/domain/time';
import { buildCatalogManifest } from '@/sync/mapping';

export const ARCHIVE_SCHEMA = 'spiny.catalog-archive.v1';
export const RELATIONSHIPS_SCHEMA = 'spiny.catalog-relationships.v1';

export const MANIFEST_FILE = 'manifest.json';
export const RELATIONSHIPS_FILE = 'relationships.json';
export const DOCUMENTS_DIR = 'documents';

/** Relative path of a document body inside the archive: `documents/{id}.md`. */
export function documentArchivePath(documentId: string): string {
  return `${DOCUMENTS_DIR}/${documentId}.md`;
}

// ---- Archive shapes ----

export interface ArchiveCatalogInfo {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Non-secret, catalog-scoped settings. v1 catalogs carry no settings beyond the
 * metadata in `catalog`, so this only records the active-document count. Sync
 * connection ids and credentials are intentionally excluded.
 */
export interface ArchiveCatalogSettings {
  documentCount: number;
}

export interface ArchiveDocumentEntry {
  documentId: string;
  title: string;
  topics: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  linkedDocumentIds: string[];
  /** Relative path of the body file inside the archive. */
  path: string;
}

export interface CatalogArchiveManifest {
  schema: typeof ARCHIVE_SCHEMA;
  exportedAt: string;
  catalog: ArchiveCatalogInfo;
  settings: ArchiveCatalogSettings;
  documents: ArchiveDocumentEntry[];
}

export interface ArchiveRelationship {
  catalogId: string;
  sourceDocumentId: string;
  targetDocumentId: string;
  relationshipType: string;
  relationshipSource: string;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogRelationshipsFile {
  schema: typeof RELATIONSHIPS_SCHEMA;
  catalogId: string;
  relationships: ArchiveRelationship[];
}

// ---- Build ----

/**
 * Build the export manifest. Extends the provider-neutral `spiny.catalog.v1`
 * manifest from `buildCatalogManifest` (reused for per-document link
 * extraction) with each document's `createdAt` and archive `path`.
 */
export function buildArchiveManifest(
  catalog: Catalog,
  activeDocuments: DocumentModel[],
  exportedAt: string
): CatalogArchiveManifest {
  const base = buildCatalogManifest(catalog, activeDocuments);
  const baseById = new Map(base.documents.map((e) => [e.documentId, e]));

  return {
    schema: ARCHIVE_SCHEMA,
    exportedAt,
    catalog: {
      id: catalog.id,
      title: catalog.title,
      description: catalog.description,
      createdAt: catalog.createdAt,
      updatedAt: catalog.updatedAt,
    },
    settings: { documentCount: activeDocuments.length },
    documents: activeDocuments.map((d) => ({
      documentId: d.id,
      title: d.title,
      topics: d.topics,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      deletedAt: d.deletedAt,
      linkedDocumentIds:
        baseById.get(d.id)?.linkedDocumentIds ?? extractLinkedDocumentIds(d.bodyMarkdown),
      path: documentArchivePath(d.id),
    })),
  };
}

export interface BuildCatalogArchiveInput {
  catalog: Catalog;
  /** ACTIVE (non-deleted) documents only. */
  documents: DocumentModel[];
  relationships: ArchiveRelationship[];
  /** Injectable for tests; defaults to the current time. */
  exportedAt?: string;
}

/**
 * Serialize a catalog archive to a base64 string ready for
 * `writeAsStringAsync(..., { encoding: EncodingType.Base64 })`.
 */
export async function buildCatalogArchive(input: BuildCatalogArchiveInput): Promise<string> {
  const exportedAt = input.exportedAt ?? nowIso();
  const manifest = buildArchiveManifest(input.catalog, input.documents, exportedAt);
  const relationshipsFile: CatalogRelationshipsFile = {
    schema: RELATIONSHIPS_SCHEMA,
    catalogId: input.catalog.id,
    relationships: input.relationships,
  };

  const zip = new JSZip();
  zip.file(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  zip.file(RELATIONSHIPS_FILE, JSON.stringify(relationshipsFile, null, 2));
  for (const doc of input.documents) {
    zip.file(documentArchivePath(doc.id), doc.bodyMarkdown);
  }

  // DEFLATE keeps Markdown archives small; base64 matches the legacy
  // FileSystem writer encoding.
  return zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
}

// ---- Parse ----

export type CatalogArchiveErrorCode =
  | 'manifest_missing'
  | 'manifest_invalid'
  | 'schema_unsupported';

export class CatalogArchiveError extends Error {
  readonly code: CatalogArchiveErrorCode;
  constructor(code: CatalogArchiveErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'CatalogArchiveError';
    this.code = code;
  }
}

export interface ParsedArchiveDocument {
  documentId: string;
  title: string;
  topics: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  body: string;
}

export interface ParsedCatalogArchive {
  catalog: ArchiveCatalogInfo;
  exportedAt: string;
  documents: ParsedArchiveDocument[];
  relationships: ArchiveRelationship[];
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === 'string');
}

/**
 * Document ids index DB rows and are embedded in `spiny://document/{id}` links.
 * Reject path separators / whitespace so a crafted archive cannot point an entry
 * at an unexpected zip path (zip-slip hardening) or a malformed id.
 */
function isSafeDocumentId(id: string): boolean {
  return id.length > 0 && !/[\\/\s]/.test(id) && !id.includes('..');
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Parse a base64 catalog archive into validated, structured data. Defensive
 * against malformed/untrusted input: unknown schemas are rejected and individual
 * fields are coerced to safe defaults.
 */
export async function parseCatalogArchive(base64: string): Promise<ParsedCatalogArchive> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(base64, { base64: true });
  } catch (err) {
    throw new CatalogArchiveError('manifest_invalid', errorText(err));
  }

  const manifestFile = zip.file(MANIFEST_FILE);
  if (!manifestFile) throw new CatalogArchiveError('manifest_missing');

  let manifest: CatalogArchiveManifest;
  try {
    manifest = JSON.parse(await manifestFile.async('string')) as CatalogArchiveManifest;
  } catch (err) {
    throw new CatalogArchiveError('manifest_invalid', errorText(err));
  }
  if (!manifest || manifest.schema !== ARCHIVE_SCHEMA) {
    throw new CatalogArchiveError('schema_unsupported');
  }

  const exportedAt = asString(manifest.exportedAt);
  const info = manifest.catalog ?? ({} as ArchiveCatalogInfo);
  const catalog: ArchiveCatalogInfo = {
    id: asString(info.id),
    title: asString(info.title),
    description: asString(info.description),
    createdAt: asString(info.createdAt, exportedAt),
    updatedAt: asString(info.updatedAt, exportedAt),
  };

  const documents: ParsedArchiveDocument[] = [];
  for (const entry of manifest.documents ?? []) {
    const documentId = asString(entry?.documentId);
    if (!isSafeDocumentId(documentId)) continue;
    const path = asString(entry?.path) || documentArchivePath(documentId);
    const bodyFile = zip.file(path);
    const body = bodyFile ? await bodyFile.async('string') : '';
    const updatedAt = asString(entry?.updatedAt, exportedAt);
    documents.push({
      documentId,
      title: asString(entry?.title),
      topics: asStringArray(entry?.topics),
      createdAt: asString(entry?.createdAt, updatedAt),
      updatedAt,
      deletedAt: typeof entry?.deletedAt === 'string' ? entry.deletedAt : null,
      body,
    });
  }

  // relationships.json is optional: links are rebuilt from bodies on import, so
  // this file is informational / forward-compatible (issue #4).
  let relationships: ArchiveRelationship[] = [];
  const relFile = zip.file(RELATIONSHIPS_FILE);
  if (relFile) {
    try {
      const parsed = JSON.parse(await relFile.async('string')) as CatalogRelationshipsFile;
      if (parsed && Array.isArray(parsed.relationships)) relationships = parsed.relationships;
    } catch {
      // Tolerate a malformed relationships file; bodies remain the source of truth.
    }
  }

  return { catalog, exportedAt, documents, relationships };
}

// ---- Import planning ----

export interface PlannedImportDocument {
  /** Final id used on insert (remapped if the original already existed locally). */
  id: string;
  originalId: string;
  title: string;
  topics: string[];
  /** Body with `spiny://document/{old}` links rewritten when ids were remapped. */
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ArchiveImportPlan {
  documents: PlannedImportDocument[];
  /** old id -> new id, only for documents whose id collided with an existing row. */
  idMap: Record<string, string>;
  remappedCount: number;
}

/**
 * Plan an import: decide each document's final id and rewrite link bodies.
 *
 * `documents.id` is a global PRIMARY KEY, so reusing an id that already exists
 * locally would overwrite an unrelated document (`applyRemoteDocument` upserts on
 * id). To avoid silent corruption, any colliding id is remapped to a fresh id and
 * every `spiny://document/{old}` link in the archive bodies is rewritten so
 * intra-catalog links — and the relationships rebuilt from them — stay valid.
 *
 * `makeId` is injectable for deterministic tests.
 */
export function planArchiveImport(
  parsed: ParsedCatalogArchive,
  existingIds: ReadonlySet<string>,
  makeId: () => string = newId
): ArchiveImportPlan {
  const idMap: Record<string, string> = {};
  for (const doc of parsed.documents) {
    if (existingIds.has(doc.documentId)) idMap[doc.documentId] = makeId();
  }
  const hasRemap = Object.keys(idMap).length > 0;

  const rewriteBody = (body: string): string => {
    if (!hasRemap) return body;
    let out = body;
    for (const [oldId, mappedId] of Object.entries(idMap)) {
      out = out.split(buildDocumentUri(oldId)).join(buildDocumentUri(mappedId));
    }
    return out;
  };

  const documents = parsed.documents.map<PlannedImportDocument>((doc) => ({
    id: idMap[doc.documentId] ?? doc.documentId,
    originalId: doc.documentId,
    title: doc.title,
    topics: doc.topics,
    body: rewriteBody(doc.body),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }));

  return { documents, idMap, remappedCount: Object.keys(idMap).length };
}
