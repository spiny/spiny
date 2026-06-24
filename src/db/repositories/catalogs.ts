import type { SQLiteDatabase } from 'expo-sqlite';

import { newId } from '@/domain/ids';
import { nowIso } from '@/domain/time';
import type { Catalog, CatalogRow, CatalogWithCount } from '../types';

function rowToCatalog(row: CatalogRow): Catalog {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    activeSyncConnectionId: row.active_sync_connection_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createCatalog(
  db: SQLiteDatabase,
  input: { title: string; description?: string }
): Promise<Catalog> {
  const id = newId();
  const ts = nowIso();
  await db.runAsync(
    `INSERT INTO catalogs (id, title, description, active_sync_connection_id, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?)`,
    id,
    input.title.trim(),
    (input.description ?? '').trim(),
    ts,
    ts
  );
  return {
    id,
    title: input.title.trim(),
    description: (input.description ?? '').trim(),
    activeSyncConnectionId: null,
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Active (non-deleted) catalog by id. */
export async function getCatalog(db: SQLiteDatabase, id: string): Promise<Catalog | null> {
  const row = await db.getFirstAsync<CatalogRow>(
    'SELECT * FROM catalogs WHERE id = ? AND deleted_at IS NULL',
    id
  );
  return row ? rowToCatalog(row) : null;
}

/** List active catalogs with their active document counts, newest first. */
export async function listCatalogs(db: SQLiteDatabase): Promise<CatalogWithCount[]> {
  const rows = await db.getAllAsync<CatalogRow & { document_count: number }>(
    `SELECT c.*,
            (SELECT COUNT(*) FROM documents d
              WHERE d.catalog_id = c.id AND d.deleted_at IS NULL) AS document_count
       FROM catalogs c
      WHERE c.deleted_at IS NULL
      ORDER BY c.updated_at DESC`
  );
  return rows.map((r) => ({ ...rowToCatalog(r), documentCount: r.document_count }));
}

export async function countActiveDocuments(db: SQLiteDatabase, catalogId: string): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM documents WHERE catalog_id = ? AND deleted_at IS NULL',
    catalogId
  );
  return row?.count ?? 0;
}

export async function updateCatalogMetadata(
  db: SQLiteDatabase,
  id: string,
  input: { title: string; description: string }
): Promise<void> {
  await db.runAsync(
    'UPDATE catalogs SET title = ?, description = ?, updated_at = ? WHERE id = ?',
    input.title.trim(),
    input.description.trim(),
    nowIso(),
    id
  );
}

export async function setActiveSyncConnection(
  db: SQLiteDatabase,
  catalogId: string,
  connectionId: string | null
): Promise<void> {
  await db.runAsync(
    'UPDATE catalogs SET active_sync_connection_id = ?, updated_at = ? WHERE id = ?',
    connectionId,
    nowIso(),
    catalogId
  );
}

export async function softDeleteCatalog(db: SQLiteDatabase, id: string): Promise<void> {
  const ts = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE catalogs SET deleted_at = ?, updated_at = ? WHERE id = ?', ts, ts, id);
    await db.runAsync(
      'UPDATE documents SET deleted_at = COALESCE(deleted_at, ?), updated_at = ? WHERE catalog_id = ?',
      ts,
      ts,
      id
    );
  });
}

/** Any catalog id that still exists (including soft-deleted), for sync use. */
export async function listAllCatalogIds(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM catalogs');
  return rows.map((r) => r.id);
}
