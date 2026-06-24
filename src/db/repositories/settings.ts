import type { SQLiteDatabase } from 'expo-sqlite';

import { nowIso } from '@/domain/time';
import type { AppSettingRow } from '../types';

/** Read a single setting value (parsed from JSON), or `undefined` if unset. */
export async function getSettingRaw<T = unknown>(
  db: SQLiteDatabase,
  key: string
): Promise<T | undefined> {
  const row = await db.getFirstAsync<AppSettingRow>(
    'SELECT * FROM app_settings WHERE key = ?',
    key
  );
  if (!row) return undefined;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return undefined;
  }
}

/** Read all settings into a plain object map. */
export async function getAllSettings(db: SQLiteDatabase): Promise<Record<string, unknown>> {
  const rows = await db.getAllAsync<AppSettingRow>('SELECT * FROM app_settings');
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value_json);
    } catch {
      // ignore malformed entries
    }
  }
  return out;
}

/** Upsert a setting value (stored as JSON). */
export async function setSettingRaw(
  db: SQLiteDatabase,
  key: string,
  value: unknown
): Promise<void> {
  await db.runAsync(
    `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    key,
    JSON.stringify(value ?? null),
    nowIso()
  );
}
