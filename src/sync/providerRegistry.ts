import type { SyncConnection } from '@/db';
import { GoogleDriveProvider } from './googleDrive';
import type { SyncProvider } from './types';
import { UnavailableProvider } from './unavailableProvider';

/** Build a provider adapter from a stored connection (technical/sync.md). */
export function createProvider(connection: SyncConnection): SyncProvider {
  switch (connection.providerType) {
    case 'google_drive':
      return new GoogleDriveProvider(connection.id, {
        clientId:
          typeof connection.config.clientId === 'string'
            ? connection.config.clientId
            : undefined,
      });
    case 'sftp':
      return new UnavailableProvider('sftp');
    case 'ftp':
      return new UnavailableProvider('ftp');
    default:
      return new UnavailableProvider(connection.providerType);
  }
}
