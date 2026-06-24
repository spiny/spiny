import type { SQLiteDatabase } from 'expo-sqlite';

import { newId } from '@/domain/ids';
import { nowIso } from '@/domain/time';
import { decryptPayload, encryptPayload } from '@/sync/crypto';
import type { CredentialType, SyncCredentialRow } from '../types';

/**
 * Encrypted credential storage companion to `expo-secure-store`
 * (technical/storage.md): bulky credentials or user-provided key files are kept
 * here with application-layer encryption. One credential per (connection, type).
 */
export async function setCredential(
  db: SQLiteDatabase,
  connectionId: string,
  type: CredentialType,
  plaintext: string
): Promise<void> {
  const payload = await encryptPayload(plaintext);
  const ts = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'DELETE FROM sync_credentials WHERE connection_id = ? AND credential_type = ?',
      connectionId,
      type
    );
    await db.runAsync(
      `INSERT INTO sync_credentials
         (id, connection_id, credential_type, payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      newId(),
      connectionId,
      type,
      payload,
      ts,
      ts
    );
  });
}

export async function getCredential(
  db: SQLiteDatabase,
  connectionId: string,
  type: CredentialType
): Promise<string | null> {
  const row = await db.getFirstAsync<SyncCredentialRow>(
    'SELECT * FROM sync_credentials WHERE connection_id = ? AND credential_type = ? LIMIT 1',
    connectionId,
    type
  );
  if (!row) return null;
  try {
    return await decryptPayload(row.payload);
  } catch {
    return null;
  }
}

export async function listCredentialTypes(
  db: SQLiteDatabase,
  connectionId: string
): Promise<CredentialType[]> {
  const rows = await db.getAllAsync<{ credential_type: CredentialType }>(
    'SELECT credential_type FROM sync_credentials WHERE connection_id = ?',
    connectionId
  );
  return rows.map((r) => r.credential_type);
}

export async function deleteCredentialsForConnection(
  db: SQLiteDatabase,
  connectionId: string
): Promise<void> {
  await db.runAsync('DELETE FROM sync_credentials WHERE connection_id = ?', connectionId);
}
