import * as Crypto from 'expo-crypto';

/**
 * Generate a stable, sync-safe identifier.
 *
 * Storage requirement (technical/storage.md): document/catalog ids must be
 * stable across local storage and sync providers, so we use RFC4122 UUIDv4.
 */
export function newId(): string {
  return Crypto.randomUUID();
}
