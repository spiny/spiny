import type { ProviderType } from '@/db/types';
import {
  ProviderUnavailableError,
  type CatalogManifest,
  type ProviderStatus,
  type PutResult,
  type RemoteDocument,
  type SyncProvider,
} from './types';

/**
 * Placeholder provider for SSH/SFTP and FTP.
 *
 * Provider support must be truthful (constraints C-06, technical/sync.md): the
 * official Expo/React Native stack ships no built-in SSH/SFTP or FTP client, so
 * these remain v1 product targets pending native validation. This adapter keeps
 * the UI/provider contract intact while clearly reporting `unavailable`.
 */
export class UnavailableProvider implements SyncProvider {
  readonly kind: ProviderType;

  constructor(kind: ProviderType) {
    this.kind = kind;
  }

  async status(): Promise<ProviderStatus> {
    return 'unavailable';
  }

  async connect(): Promise<void> {
    throw new ProviderUnavailableError(this.kind);
  }

  async disconnect(): Promise<void> {
    // no-op
  }

  async getCatalogManifest(): Promise<CatalogManifest | null> {
    throw new ProviderUnavailableError(this.kind);
  }

  async putCatalogManifest(): Promise<void> {
    throw new ProviderUnavailableError(this.kind);
  }

  async getDocument(): Promise<RemoteDocument | null> {
    throw new ProviderUnavailableError(this.kind);
  }

  async putDocument(): Promise<PutResult> {
    throw new ProviderUnavailableError(this.kind);
  }

  async deleteDocument(): Promise<PutResult> {
    throw new ProviderUnavailableError(this.kind);
  }
}
