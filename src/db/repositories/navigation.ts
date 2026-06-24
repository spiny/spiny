import type { SQLiteDatabase } from 'expo-sqlite';

import { newId } from '@/domain/ids';
import { parseTopics } from '@/domain/markdown';
import { nowIso } from '@/domain/time';
import type { OpenedFrom, RecentlyViewedItem } from '../types';

export const NAVIGATION_RETENTION = 20;

/**
 * Record a document-open event and prune to the most recent
 * NAVIGATION_RETENTION (20) events per catalog (technical/storage.md retention).
 */
export async function recordNavigationEvent(
  db: SQLiteDatabase,
  input: {
    catalogId: string;
    documentId: string;
    fromDocumentId?: string | null;
    openedFrom: OpenedFrom;
  }
): Promise<void> {
  const id = newId();
  const openedAt = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO document_navigation_events
         (id, catalog_id, document_id, from_document_id, opened_from, opened_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      input.catalogId,
      input.documentId,
      input.fromDocumentId ?? null,
      input.openedFrom,
      openedAt
    );
    await db.runAsync(
      `DELETE FROM document_navigation_events
        WHERE catalog_id = ?
          AND id NOT IN (
            SELECT id FROM document_navigation_events
             WHERE catalog_id = ?
             ORDER BY opened_at DESC, id DESC
             LIMIT ?
          )`,
      input.catalogId,
      input.catalogId,
      NAVIGATION_RETENTION
    );
  });
}

interface RecentRow {
  id: string;
  title: string;
  topics_json: string;
  updated_at: string;
  opened_at: string;
}

/**
 * Recently viewed documents for a catalog: each document once, ordered by most
 * recent open, excluding deleted documents.
 */
export async function listRecentlyViewed(
  db: SQLiteDatabase,
  catalogId: string,
  limit = NAVIGATION_RETENTION
): Promise<RecentlyViewedItem[]> {
  const rows = await db.getAllAsync<RecentRow>(
    `SELECT d.id AS id, d.title AS title, d.topics_json AS topics_json,
            d.updated_at AS updated_at, MAX(e.opened_at) AS opened_at
       FROM document_navigation_events e
       JOIN documents d ON d.id = e.document_id
      WHERE e.catalog_id = ? AND d.deleted_at IS NULL
      GROUP BY d.id
      ORDER BY opened_at DESC
      LIMIT ?`,
    catalogId,
    limit
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    topics: parseTopics(r.topics_json),
    updatedAt: r.updated_at,
    openedAt: r.opened_at,
  }));
}

/** Count navigation events for a catalog (used by tests/diagnostics). */
export async function countNavigationEvents(
  db: SQLiteDatabase,
  catalogId: string
): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM document_navigation_events WHERE catalog_id = ?',
    catalogId
  );
  return row?.count ?? 0;
}

/** Remove navigation history for a document (used on move across catalogs). */
export async function removeNavigationForDocument(
  db: SQLiteDatabase,
  documentId: string
): Promise<void> {
  await db.runAsync(
    'DELETE FROM document_navigation_events WHERE document_id = ? OR from_document_id = ?',
    documentId,
    documentId
  );
}
