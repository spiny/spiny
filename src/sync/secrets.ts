import * as SecureStore from 'expo-secure-store';

/**
 * Small-secret storage for sync providers (OAuth tokens, short passwords),
 * keyed by connection id (technical/sync.md credential storage). Values are
 * kept in the OS keystore via `expo-secure-store`, never in SQLite.
 *
 * iOS keychain may reject values over ~2 KB; OAuth token sets are well under
 * that limit. Larger payloads (e.g. SSH keys) use the encrypted
 * `sync_credentials` table instead.
 */

function tokenKey(connectionId: string): string {
  // SecureStore keys must be alphanumeric plus ._- ; uuids satisfy that.
  return `spiny.sync.token.${connectionId}`.replace(/[^A-Za-z0-9._-]/g, '_');
}

export interface StoredTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms
  scope?: string;
  tokenType?: string;
}

export async function getTokenSet(connectionId: string): Promise<StoredTokenSet | null> {
  const raw = await SecureStore.getItemAsync(tokenKey(connectionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredTokenSet;
  } catch {
    return null;
  }
}

export async function setTokenSet(connectionId: string, tokens: StoredTokenSet): Promise<void> {
  await SecureStore.setItemAsync(tokenKey(connectionId), JSON.stringify(tokens));
}

export async function deleteTokenSet(connectionId: string): Promise<void> {
  await SecureStore.deleteItemAsync(tokenKey(connectionId));
}
