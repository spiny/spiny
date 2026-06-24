import type { SQLiteDatabase } from 'expo-sqlite';

import { newId } from '@/domain/ids';
import { nowIso } from '@/domain/time';
import type { ProviderType, SyncConnectionRow } from '../types';

export interface SyncConnection {
  id: string;
  providerType: ProviderType;
  label: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  disabledAt: string | null;
}

function parseConfig(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function rowToConnection(row: SyncConnectionRow): SyncConnection {
  return {
    id: row.id,
    providerType: row.provider_type,
    label: row.label,
    config: parseConfig(row.config_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    disabledAt: row.disabled_at,
  };
}

export async function createConnection(
  db: SQLiteDatabase,
  input: { providerType: ProviderType; label: string; config?: Record<string, unknown> }
): Promise<SyncConnection> {
  const id = newId();
  const ts = nowIso();
  const config = input.config ?? {};
  await db.runAsync(
    `INSERT INTO sync_connections
       (id, provider_type, label, config_json, created_at, updated_at, disabled_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    id,
    input.providerType,
    input.label.trim(),
    JSON.stringify(config),
    ts,
    ts
  );
  return {
    id,
    providerType: input.providerType,
    label: input.label.trim(),
    config,
    createdAt: ts,
    updatedAt: ts,
    disabledAt: null,
  };
}

export async function listConnections(db: SQLiteDatabase): Promise<SyncConnection[]> {
  const rows = await db.getAllAsync<SyncConnectionRow>(
    'SELECT * FROM sync_connections WHERE disabled_at IS NULL ORDER BY created_at ASC'
  );
  return rows.map(rowToConnection);
}

export async function getConnection(
  db: SQLiteDatabase,
  id: string
): Promise<SyncConnection | null> {
  const row = await db.getFirstAsync<SyncConnectionRow>(
    'SELECT * FROM sync_connections WHERE id = ?',
    id
  );
  return row ? rowToConnection(row) : null;
}

export async function updateConnection(
  db: SQLiteDatabase,
  id: string,
  input: { label?: string; config?: Record<string, unknown> }
): Promise<void> {
  const current = await getConnection(db, id);
  if (!current) return;
  const label = input.label !== undefined ? input.label.trim() : current.label;
  const config = input.config !== undefined ? input.config : current.config;
  await db.runAsync(
    'UPDATE sync_connections SET label = ?, config_json = ?, updated_at = ? WHERE id = ?',
    label,
    JSON.stringify(config),
    nowIso(),
    id
  );
}

/** Hard-delete a connection; cascades to its `sync_credentials` rows and
 * clears the reference from any catalogs that used it. */
export async function deleteConnection(db: SQLiteDatabase, id: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE catalogs SET active_sync_connection_id = NULL, updated_at = ? WHERE active_sync_connection_id = ?',
      nowIso(),
      id
    );
    await db.runAsync('DELETE FROM sync_connections WHERE id = ?', id);
  });
}

/** Catalogs still referencing a connection (block/warn before deletion). */
export async function countCatalogsUsingConnection(
  db: SQLiteDatabase,
  connectionId: string
): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM catalogs WHERE active_sync_connection_id = ? AND deleted_at IS NULL',
    connectionId
  );
  return row?.count ?? 0;
}
