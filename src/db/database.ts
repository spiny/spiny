import {
  openDatabaseAsync,
  type SQLiteDatabase,
} from 'expo-sqlite';

import { nowIso } from '@/domain/time';
import { MIGRATIONS } from './migrations';

const DB_NAME = 'spiny.db';

let dbPromise: Promise<SQLiteDatabase> | null = null;

/**
 * Open (once) and return the app database, applying pragmas and migrations.
 * Subsequent calls return the same connection.
 */
export function getDatabase(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndPrepare().catch((err) => {
      // Reset so a later call can retry instead of caching the failure.
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

async function openAndPrepare(): Promise<SQLiteDatabase> {
  const db = await openDatabaseAsync(DB_NAME);
  // WAL improves concurrent read/write; foreign keys enforce referential rules.
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await runMigrations(db);
  return db;
}

async function runMigrations(db: SQLiteDatabase): Promise<void> {
  // Bootstrap the migrations ledger.
  await db.execAsync(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );`
  );

  const appliedRows = await db.getAllAsync<{ version: number }>(
    'SELECT version FROM schema_migrations'
  );
  const applied = new Set(appliedRows.map((r) => r.version));

  const pending = MIGRATIONS.filter((m) => !applied.has(m.version)).sort(
    (a, b) => a.version - b.version
  );

  for (const migration of pending) {
    await db.withTransactionAsync(async () => {
      for (const statement of migration.statements) {
        await db.execAsync(statement);
      }
      await db.runAsync(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
        migration.version,
        migration.name,
        nowIso()
      );
    });
  }
}

/** Test/diagnostic helper: reset the cached connection handle. */
export function __resetDatabaseHandle(): void {
  dbPromise = null;
}
