import type { SQLiteDatabase } from 'expo-sqlite';

import { deriveExcerpt, topicsToSearchable } from '@/domain/markdown';
import { nowIso } from '@/domain/time';

export interface IndexInput {
  catalogId: string;
  documentId: string;
  title: string;
  topics: string[];
  body: string;
  documentUpdatedAt: string;
}

/**
 * Upsert the catalog index row for a document. Runs inside the caller's
 * transaction so it commits atomically with the document write
 * (technical/storage.md autosave flow).
 */
export async function upsertDocumentIndex(db: SQLiteDatabase, input: IndexInput): Promise<void> {
  await db.runAsync(
    `INSERT INTO catalog_indexes
       (catalog_id, document_id, searchable_title, searchable_topics, searchable_excerpt, document_updated_at, indexed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(catalog_id, document_id) DO UPDATE SET
       searchable_title = excluded.searchable_title,
       searchable_topics = excluded.searchable_topics,
       searchable_excerpt = excluded.searchable_excerpt,
       document_updated_at = excluded.document_updated_at,
       indexed_at = excluded.indexed_at`,
    input.catalogId,
    input.documentId,
    input.title,
    topicsToSearchable(input.topics),
    deriveExcerpt(input.body),
    input.documentUpdatedAt,
    nowIso()
  );
}

/** Reflect a tombstone in the index (keeps the row but updates timestamps). */
export async function touchIndexTimestamp(
  db: SQLiteDatabase,
  documentId: string,
  documentUpdatedAt: string
): Promise<void> {
  await db.runAsync(
    'UPDATE catalog_indexes SET document_updated_at = ?, indexed_at = ? WHERE document_id = ?',
    documentUpdatedAt,
    nowIso(),
    documentId
  );
}

/** Move a document's index row to a different catalog. */
export async function reparentIndex(
  db: SQLiteDatabase,
  documentId: string,
  targetCatalogId: string,
  documentUpdatedAt: string
): Promise<void> {
  await db.runAsync(
    'UPDATE catalog_indexes SET catalog_id = ?, document_updated_at = ?, indexed_at = ? WHERE document_id = ?',
    targetCatalogId,
    documentUpdatedAt,
    nowIso(),
    documentId
  );
}
