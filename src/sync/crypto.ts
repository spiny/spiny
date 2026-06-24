import aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * Application-layer encryption for credential payloads stored in the
 * `sync_credentials` table (technical/storage.md, constraints C-07).
 *
 * Approach: AES-256-CBC with a per-install 256-bit master key. The master key
 * is generated with `expo-crypto` and kept only in `expo-secure-store` (the OS
 * keystore/keychain), never in SQLite. Payloads are serialized as
 * `${ivHex}:${ciphertextHex}` with PKCS#7 padding.
 *
 * Note: SSH/SFTP and FTP transports are feasibility-gated and non-functional in
 * v1, so this path is provided for completeness and tested in isolation.
 */

const MASTER_KEY_STORE_KEY = 'spiny.credentialMasterKey.v1';

let cachedKey: Uint8Array | null = null;

async function getOrCreateMasterKey(): Promise<Uint8Array> {
  if (cachedKey) return cachedKey;
  const existing = await SecureStore.getItemAsync(MASTER_KEY_STORE_KEY);
  if (existing) {
    cachedKey = Uint8Array.from(aesjs.utils.hex.toBytes(existing));
    return cachedKey;
  }
  const key = Crypto.getRandomBytes(32); // 256-bit
  const hex = aesjs.utils.hex.fromBytes(key);
  await SecureStore.setItemAsync(MASTER_KEY_STORE_KEY, hex);
  cachedKey = key;
  return key;
}

export async function encryptPayload(plaintext: string): Promise<string> {
  const key = await getOrCreateMasterKey();
  const iv = Crypto.getRandomBytes(16);
  const textBytes = aesjs.utils.utf8.toBytes(plaintext);
  const padded = aesjs.padding.pkcs7.pad(textBytes);
  const cbc = new aesjs.ModeOfOperation.cbc(key, iv);
  const cipher = cbc.encrypt(padded);
  return `${aesjs.utils.hex.fromBytes(iv)}:${aesjs.utils.hex.fromBytes(cipher)}`;
}

export async function decryptPayload(payload: string): Promise<string> {
  const key = await getOrCreateMasterKey();
  const sep = payload.indexOf(':');
  if (sep < 0) throw new Error('Malformed credential payload');
  const iv = aesjs.utils.hex.toBytes(payload.slice(0, sep));
  const cipher = aesjs.utils.hex.toBytes(payload.slice(sep + 1));
  const cbc = new aesjs.ModeOfOperation.cbc(key, iv);
  const padded = cbc.decrypt(cipher);
  const textBytes = aesjs.padding.pkcs7.strip(padded);
  return aesjs.utils.utf8.fromBytes(textBytes);
}

/** Diagnostic/testing helper to drop the in-memory key cache. */
export function __resetCredentialKeyCache(): void {
  cachedKey = null;
}
