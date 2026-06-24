/**
 * Google Drive remote layout helpers (issue #4).
 *
 * The Drive remote storage MUST mirror the issue #2 catalog export archive
 * EXACTLY so the two formats interoperate. Per-catalog folder layout:
 *
 *   <targetFolder>/<catalogId>/manifest.json
 *   <targetFolder>/<catalogId>/relationships.json
 *   <targetFolder>/<catalogId>/documents/<documentId>.md
 *
 * The schema strings and field names below are intentionally IDENTICAL to
 * `src/export/catalogArchive.ts` (verified against the canonical issue #2
 * module: `spiny.catalog-archive.v1` / `spiny.catalog-relationships.v1`). They
 * are re-declared here, rather than imported from `@/export`, on purpose:
 *   - `@/export/catalogArchive` imports `jszip` at module scope, so importing
 *     its value exports would pull the zip library into the sync runtime path.
 *   - The sync layer should not depend on the export layer.
 * The duplication is small and deliberate; a post-merge DRY-up could extract a
 * shared, IO-free schema module (noted in the issue #4 report).
 *
 * Difference from a #2 export: a sync manifest also carries tombstones (entries
 * with `deletedAt` set and no body `.md` file) so latest-wins deletions
 * propagate. Such entries remain valid `spiny.catalog-archive.v1` documents
 * because the schema already allows `deletedAt: string | null`.
 */
import type { CatalogManifest, ManifestDocumentEntry, RemoteDocument } from './types';

export const DRIVE_ARCHIVE_SCHEMA = 'spiny.catalog-archive.v1';
export const DRIVE_RELATIONSHIPS_SCHEMA = 'spiny.catalog-relationships.v1';

export const DRIVE_MANIFEST_FILE = 'manifest.json';
export const DRIVE_RELATIONSHIPS_FILE = 'relationships.json';
export const DRIVE_DOCUMENTS_DIR = 'documents';

/** Relative archive path of a document body: `documents/<documentId>.md`. */
export function driveDocumentPath(documentId: string): string {
  return `${DRIVE_DOCUMENTS_DIR}/${documentId}.md`;
}

/** Body file name inside the `documents/` folder: `<documentId>.md`. */
export function driveDocumentFileName(documentId: string): string {
  return `${documentId}.md`;
}

// ---- Archive shapes (mirror src/export/catalogArchive.ts) ----

export interface DriveArchiveCatalogInfo {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface DriveArchiveCatalogSettings {
  documentCount: number;
}

export interface DriveArchiveDocumentEntry {
  documentId: string;
  title: string;
  topics: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  linkedDocumentIds: string[];
  /** Relative path of the body file inside the catalog folder. */
  path: string;
}

export interface DriveArchiveManifest {
  schema: typeof DRIVE_ARCHIVE_SCHEMA;
  exportedAt: string;
  catalog: DriveArchiveCatalogInfo;
  settings: DriveArchiveCatalogSettings;
  documents: DriveArchiveDocumentEntry[];
}

export interface DriveArchiveRelationship {
  catalogId: string;
  sourceDocumentId: string;
  targetDocumentId: string;
  relationshipType: string;
  relationshipSource: string;
  createdAt: string;
  updatedAt: string;
}

export interface DriveRelationshipsFile {
  schema: typeof DRIVE_RELATIONSHIPS_SCHEMA;
  catalogId: string;
  relationships: DriveArchiveRelationship[];
}

// ---- Mapping between the provider-neutral sync model and the archive ----

/** Active (non-tombstone) document count, mirroring #2's `documentCount`. */
export function activeDocumentCount(documents: DriveArchiveDocumentEntry[]): number {
  return documents.filter((d) => d.deletedAt == null).length;
}

/** Assemble a manifest envelope around already-mapped document entries. */
export function composeDriveManifest(
  catalog: DriveArchiveCatalogInfo,
  documents: DriveArchiveDocumentEntry[],
  exportedAt: string
): DriveArchiveManifest {
  return {
    schema: DRIVE_ARCHIVE_SCHEMA,
    exportedAt,
    catalog,
    settings: { documentCount: activeDocumentCount(documents) },
    documents,
  };
}

/** Replace or append a document entry, keeping a single entry per id. */
export function upsertArchiveEntry(
  documents: DriveArchiveDocumentEntry[],
  entry: DriveArchiveDocumentEntry
): DriveArchiveDocumentEntry[] {
  const next = documents.filter((d) => d.documentId !== entry.documentId);
  next.push(entry);
  return next;
}

/** Build an archive entry from a `RemoteDocument` (tombstones drop content). */
export function archiveEntryFromRemote(doc: RemoteDocument): DriveArchiveDocumentEntry {
  const deleted = doc.deletedAt != null;
  return {
    documentId: doc.documentId,
    title: deleted ? '' : doc.title,
    topics: deleted ? [] : doc.topics,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt,
    linkedDocumentIds: deleted ? [] : doc.linkedDocumentIds,
    path: driveDocumentPath(doc.documentId),
  };
}

/** Build an archive entry from a service manifest entry (full-refresh writes). */
export function archiveEntryFromManifestEntry(
  entry: ManifestDocumentEntry
): DriveArchiveDocumentEntry {
  const deleted = entry.deletedAt != null;
  return {
    documentId: entry.documentId,
    title: deleted ? '' : entry.title,
    topics: deleted ? [] : entry.topics,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    deletedAt: entry.deletedAt,
    linkedDocumentIds: deleted ? [] : entry.linkedDocumentIds,
    path: driveDocumentPath(entry.documentId),
  };
}

/** Reconstruct a full `RemoteDocument` from a manifest entry + its body. */
export function remoteFromArchiveEntry(
  catalogId: string,
  entry: DriveArchiveDocumentEntry,
  bodyMarkdown: string,
  remoteKey: string | null
): RemoteDocument {
  const deleted = entry.deletedAt != null;
  return {
    schema: 'spiny.document.v1',
    catalogId,
    documentId: entry.documentId,
    title: entry.title ?? '',
    topics: entry.topics ?? [],
    bodyMarkdown: deleted ? '' : bodyMarkdown,
    linkedDocumentIds: entry.linkedDocumentIds ?? [],
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    deletedAt: entry.deletedAt ?? null,
    remoteKey,
  };
}

/** Map a Drive archive manifest to the service's `CatalogManifest`. */
export function manifestToService(
  catalogId: string,
  archive: DriveArchiveManifest
): CatalogManifest {
  return {
    schema: 'spiny.catalog.v1',
    catalogId,
    title: archive.catalog?.title ?? '',
    description: archive.catalog?.description ?? '',
    updatedAt: archive.catalog?.updatedAt ?? '',
    documents: (archive.documents ?? []).map<ManifestDocumentEntry>((e) => ({
      documentId: e.documentId,
      title: e.title ?? '',
      topics: e.topics ?? [],
      createdAt: e.createdAt ?? e.updatedAt ?? '',
      updatedAt: e.updatedAt ?? '',
      deletedAt: e.deletedAt ?? null,
      linkedDocumentIds: e.linkedDocumentIds ?? [],
    })),
  };
}

/**
 * Derive `relationships.json` from the manifest entries' `linkedDocumentIds`,
 * mirroring issue #2's structure (source=document, target=linked id,
 * type='link', source='markdown_link'). The `SyncProvider` interface does not
 * receive `document_relationships` rows, so timestamps fall back to each
 * source document's `updatedAt` (best-effort structural parity).
 */
export function relationshipsFromEntries(
  catalogId: string,
  documents: DriveArchiveDocumentEntry[]
): DriveRelationshipsFile {
  const relationships: DriveArchiveRelationship[] = [];
  for (const e of documents) {
    if (e.deletedAt != null) continue;
    for (const targetDocumentId of e.linkedDocumentIds ?? []) {
      relationships.push({
        catalogId,
        sourceDocumentId: e.documentId,
        targetDocumentId,
        relationshipType: 'link',
        relationshipSource: 'markdown_link',
        createdAt: e.updatedAt,
        updatedAt: e.updatedAt,
      });
    }
  }
  return { schema: DRIVE_RELATIONSHIPS_SCHEMA, catalogId, relationships };
}
