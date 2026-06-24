import type { SQLiteDatabase } from 'expo-sqlite';

import { MAX_BODY_BYTES, byteLength, truncateToBytes } from '@/domain/bytes';
import { newId } from '@/domain/ids';
import {
  extractLinkedDocumentIds,
  parseTopics,
  serializeTopics,
} from '@/domain/markdown';
import { nowIso } from '@/domain/time';
import type { DocumentModel, DocumentRow, DocumentSummary } from '../types';
import { reparentIndex, touchIndexTimestamp, upsertDocumentIndex } from './catalogIndex';
import { removeNavigationForDocument } from './navigation';
import {
  rebuildRelationshipsForSource,
  removeRelationshipsForDocument,
} from './relationships';

export interface DocumentListItem {
  id: string;
  title: string;
  topics: string[];
  updatedAt: string;
  dirty: boolean;
}

export interface SaveDocumentInput {
  title: string;
  topics: string[];
  body: string;
}

export interface SaveDocumentResult {
  document: DocumentModel;
  truncated: boolean;
}

function rowToDocument(row: DocumentRow): DocumentModel {
  return {
    id: row.id,
    catalogId: row.catalog_id,
    title: row.title,
    topics: parseTopics(row.topics_json),
    bodyMarkdown: row.body_markdown,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    remoteProviderKey: row.remote_provider_key,
    remoteUpdatedAt: row.remote_updated_at,
    lastSyncedAt: row.last_synced_at,
    dirty: row.dirty !== 0,
  };
}

async function getDocumentRowAny(db: SQLiteDatabase, id: string): Promise<DocumentRow | null> {
  return db.getFirstAsync<DocumentRow>('SELECT * FROM documents WHERE id = ?', id);
}

/** Active (non-deleted) document by id. */
export async function getDocument(db: SQLiteDatabase, id: string): Promise<DocumentModel | null> {
  const row = await db.getFirstAsync<DocumentRow>(
    'SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL',
    id
  );
  return row ? rowToDocument(row) : null;
}

/** Most recently edited active documents for the home list. */
export async function listRecentDocuments(
  db: SQLiteDatabase,
  catalogId: string,
  limit = 100
): Promise<DocumentListItem[]> {
  const rows = await db.getAllAsync<{
    id: string;
    title: string;
    topics_json: string;
    updated_at: string;
    dirty: number;
  }>(
    `SELECT id, title, topics_json, updated_at, dirty
       FROM documents
      WHERE catalog_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT ?`,
    catalogId,
    limit
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    topics: parseTopics(r.topics_json),
    updatedAt: r.updated_at,
    dirty: r.dirty !== 0,
  }));
}

/** Lightweight summaries for a set of ids (used by navigation surfaces). */
export async function getDocumentSummaries(
  db: SQLiteDatabase,
  ids: string[]
): Promise<Map<string, DocumentSummary>> {
  const result = new Map<string, DocumentSummary>();
  if (ids.length === 0) return result;
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.getAllAsync<{
    id: string;
    title: string;
    topics_json: string;
    updated_at: string;
  }>(
    `SELECT id, title, topics_json, updated_at FROM documents
      WHERE deleted_at IS NULL AND id IN (${placeholders})`,
    ...ids
  );
  for (const r of rows) {
    result.set(r.id, {
      id: r.id,
      title: r.title,
      topics: parseTopics(r.topics_json),
      updatedAt: r.updated_at,
    });
  }
  return result;
}

export async function createDocument(
  db: SQLiteDatabase,
  input: { catalogId: string; title?: string; topics?: string[]; body?: string }
): Promise<DocumentModel> {
  const id = newId();
  const ts = nowIso();
  const title = input.title ?? '';
  const topics = input.topics ?? [];
  const body = truncateToBytes(input.body ?? '');
  const topicsJson = serializeTopics(topics);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO documents
         (id, catalog_id, title, topics_json, body_markdown, created_at, updated_at, deleted_at,
          remote_provider_key, remote_updated_at, last_synced_at, dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 1)`,
      id,
      input.catalogId,
      title,
      topicsJson,
      body,
      ts,
      ts
    );
    await upsertDocumentIndex(db, {
      catalogId: input.catalogId,
      documentId: id,
      title,
      topics,
      body,
      documentUpdatedAt: ts,
    });
    await rebuildRelationshipsForSource(db, input.catalogId, id, extractLinkedDocumentIds(body));
  });

  const row = await getDocumentRowAny(db, id);
  return rowToDocument(row!);
}

/**
 * Autosave path (technical/storage.md): update documents + catalog index +
 * relationships in one transaction, mark dirty. Enforces the 64 KB byte limit
 * by truncating, and reports whether truncation occurred so the UI can warn.
 */
export async function saveDocument(
  db: SQLiteDatabase,
  id: string,
  input: SaveDocumentInput
): Promise<SaveDocumentResult> {
  const existing = await getDocumentRowAny(db, id);
  if (!existing) throw new Error(`Document not found: ${id}`);

  const body = truncateToBytes(input.body, MAX_BODY_BYTES);
  const truncated = byteLength(input.body) > MAX_BODY_BYTES;
  const topicsJson = serializeTopics(input.topics);
  const ts = nowIso();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE documents
          SET title = ?, topics_json = ?, body_markdown = ?, updated_at = ?, dirty = 1
        WHERE id = ?`,
      input.title,
      topicsJson,
      body,
      ts,
      id
    );
    await upsertDocumentIndex(db, {
      catalogId: existing.catalog_id,
      documentId: id,
      title: input.title,
      topics: input.topics,
      body,
      documentUpdatedAt: ts,
    });
    await rebuildRelationshipsForSource(
      db,
      existing.catalog_id,
      id,
      extractLinkedDocumentIds(body)
    );
  });

  const row = await getDocumentRowAny(db, id);
  return { document: rowToDocument(row!), truncated };
}

async function softDeleteStatements(db: SQLiteDatabase, id: string, ts: string): Promise<void> {
  await db.runAsync(
    'UPDATE documents SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?',
    ts,
    ts,
    id
  );
  await removeRelationshipsForDocument(db, id);
  await touchIndexTimestamp(db, id, ts);
}

/** Tombstone a document so it is hidden but can sync as a deletion. */
export async function softDeleteDocument(db: SQLiteDatabase, id: string): Promise<void> {
  const ts = nowIso();
  await db.withTransactionAsync(async () => {
    await softDeleteStatements(db, id, ts);
  });
}

async function insertCopyStatements(
  db: SQLiteDatabase,
  src: DocumentRow,
  targetCatalogId: string,
  ts: string
): Promise<string> {
  const newDocId = newId();
  await db.runAsync(
    `INSERT INTO documents
       (id, catalog_id, title, topics_json, body_markdown, created_at, updated_at, deleted_at,
        remote_provider_key, remote_updated_at, last_synced_at, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 1)`,
    newDocId,
    targetCatalogId,
    src.title,
    src.topics_json,
    src.body_markdown,
    ts,
    ts
  );
  await upsertDocumentIndex(db, {
    catalogId: targetCatalogId,
    documentId: newDocId,
    title: src.title,
    topics: parseTopics(src.topics_json),
    body: src.body_markdown,
    documentUpdatedAt: ts,
  });
  await rebuildRelationshipsForSource(
    db,
    targetCatalogId,
    newDocId,
    extractLinkedDocumentIds(src.body_markdown)
  );
  return newDocId;
}

/** Mind-map action: duplicate a document into another catalog. */
export async function copyDocumentToCatalog(
  db: SQLiteDatabase,
  id: string,
  targetCatalogId: string
): Promise<string | null> {
  const src = await getDocumentRowAny(db, id);
  if (!src || src.deleted_at) return null;
  const ts = nowIso();
  let newDocId = '';
  await db.withTransactionAsync(async () => {
    newDocId = await insertCopyStatements(db, src, targetCatalogId, ts);
  });
  return newDocId;
}

/**
 * Mind-map action: move a document into another catalog. Implemented as a copy
 * into the target catalog plus a tombstone of the original so each catalog's
 * sync state stays consistent (the source remote gets a deletion, the target
 * remote gets a new document).
 */
export async function moveDocumentToCatalog(
  db: SQLiteDatabase,
  id: string,
  targetCatalogId: string
): Promise<string | null> {
  const src = await getDocumentRowAny(db, id);
  if (!src || src.deleted_at) return null;
  if (src.catalog_id === targetCatalogId) return id;
  const ts = nowIso();
  let newDocId = '';
  await db.withTransactionAsync(async () => {
    newDocId = await insertCopyStatements(db, src, targetCatalogId, ts);
    await softDeleteStatements(db, id, ts);
    await removeNavigationForDocument(db, id);
  });
  return newDocId;
}

// ---- Sync support ----

/** Active-provider dirty documents to process (technical/sync.md dirty scan). */
export async function listDirtyDocuments(db: SQLiteDatabase): Promise<DocumentModel[]> {
  const rows = await db.getAllAsync<DocumentRow>(
    `SELECT d.* FROM documents d
       JOIN catalogs c ON c.id = d.catalog_id
      WHERE d.dirty = 1
        AND c.deleted_at IS NULL
        AND c.active_sync_connection_id IS NOT NULL`
  );
  return rows.map(rowToDocument);
}

export async function listDirtyDocumentsForCatalog(
  db: SQLiteDatabase,
  catalogId: string
): Promise<DocumentModel[]> {
  const rows = await db.getAllAsync<DocumentRow>(
    'SELECT * FROM documents WHERE catalog_id = ? AND dirty = 1',
    catalogId
  );
  return rows.map(rowToDocument);
}

export async function listAllDocumentsForCatalog(
  db: SQLiteDatabase,
  catalogId: string
): Promise<DocumentModel[]> {
  const rows = await db.getAllAsync<DocumentRow>(
    'SELECT * FROM documents WHERE catalog_id = ?',
    catalogId
  );
  return rows.map(rowToDocument);
}

export async function getDocumentForSync(
  db: SQLiteDatabase,
  id: string
): Promise<DocumentModel | null> {
  const row = await getDocumentRowAny(db, id);
  return row ? rowToDocument(row) : null;
}

/** Mark a successful upload: clear dirty, record remote markers. */
export async function markDocumentUploaded(
  db: SQLiteDatabase,
  id: string,
  remote: { providerKey: string | null; remoteUpdatedAt: string; syncedAt: string }
): Promise<void> {
  await db.runAsync(
    `UPDATE documents
        SET dirty = 0, remote_provider_key = ?, remote_updated_at = ?, last_synced_at = ?
      WHERE id = ?`,
    remote.providerKey,
    remote.remoteUpdatedAt,
    remote.syncedAt,
    id
  );
}

export interface RemoteDocumentInput {
  id: string;
  catalogId: string;
  title: string;
  topics: string[];
  body: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  remoteProviderKey: string | null;
  remoteUpdatedAt: string;
}

/**
 * Apply a remote document locally under latest-wins (download path). Clears the
 * dirty flag because the overwritten local state is intentionally replaced.
 */
export async function applyRemoteDocument(
  db: SQLiteDatabase,
  input: RemoteDocumentInput,
  syncedAt: string
): Promise<void> {
  const existing = await getDocumentRowAny(db, input.id);
  const createdAt = existing?.created_at ?? input.createdAt;
  const topicsJson = serializeTopics(input.topics);
  const body = truncateToBytes(input.body);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO documents
         (id, catalog_id, title, topics_json, body_markdown, created_at, updated_at, deleted_at,
          remote_provider_key, remote_updated_at, last_synced_at, dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET
         catalog_id = excluded.catalog_id,
         title = excluded.title,
         topics_json = excluded.topics_json,
         body_markdown = excluded.body_markdown,
         updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at,
         remote_provider_key = excluded.remote_provider_key,
         remote_updated_at = excluded.remote_updated_at,
         last_synced_at = excluded.last_synced_at,
         dirty = 0`,
      input.id,
      input.catalogId,
      input.title,
      topicsJson,
      body,
      createdAt,
      input.updatedAt,
      input.deletedAt,
      input.remoteProviderKey,
      input.remoteUpdatedAt,
      syncedAt
    );

    if (input.deletedAt) {
      await removeRelationshipsForDocument(db, input.id);
      await touchIndexTimestamp(db, input.id, input.updatedAt);
    } else {
      await upsertDocumentIndex(db, {
        catalogId: input.catalogId,
        documentId: input.id,
        title: input.title,
        topics: input.topics,
        body,
        documentUpdatedAt: input.updatedAt,
      });
      await rebuildRelationshipsForSource(
        db,
        input.catalogId,
        input.id,
        extractLinkedDocumentIds(body)
      );
    }
  });
}

export { rowToDocument };
