import type { ProviderType } from '@/db/types';

/**
 * Provider-neutral sync object model (technical/sync.md remote object model).
 */

export interface ManifestDocumentEntry {
  documentId: string;
  title: string;
  topics: string[];
  /**
   * Document creation timestamp. Lets providers that store metadata only in the
   * manifest (e.g. Google Drive, issue #4) reconstruct `RemoteDocument.createdAt`
   * in `getDocument`. Mirrors the issue #2 archive manifest entry.
   */
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  linkedDocumentIds: string[];
}

export interface CatalogManifest {
  schema: 'spiny.catalog.v1';
  catalogId: string;
  title: string;
  description: string;
  updatedAt: string;
  documents: ManifestDocumentEntry[];
}

export interface RemoteDocument {
  schema: 'spiny.document.v1';
  catalogId: string;
  documentId: string;
  title: string;
  topics: string[];
  bodyMarkdown: string;
  linkedDocumentIds: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /** Provider-specific handle (e.g. Drive fileId) when known. */
  remoteKey?: string | null;
}

export interface PutResult {
  remoteKey: string | null;
  remoteUpdatedAt: string;
}

export type ProviderStatus = 'unavailable' | 'needs_setup' | 'ready';

/**
 * Provider adapter interface (technical/sync.md). Signatures refine the
 * requirement sketch so the sync service can persist remote markers.
 */
export interface SyncProvider {
  kind: ProviderType;
  /** Whether this provider can perform network sync right now. */
  status(): Promise<ProviderStatus>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getCatalogManifest(catalogId: string): Promise<CatalogManifest | null>;
  putCatalogManifest(manifest: CatalogManifest): Promise<void>;
  getDocument(catalogId: string, documentId: string): Promise<RemoteDocument | null>;
  putDocument(document: RemoteDocument): Promise<PutResult>;
  deleteDocument(catalogId: string, documentId: string, deletedAt: string): Promise<PutResult>;
}

/** Thrown by providers that are listed but not yet functional (SFTP/FTP v1). */
export class ProviderUnavailableError extends Error {
  readonly providerType: ProviderType;
  constructor(providerType: ProviderType, message?: string) {
    super(message ?? `Provider ${providerType} is not available in this version.`);
    this.name = 'ProviderUnavailableError';
    this.providerType = providerType;
  }
}

/** Thrown when a network/transport error occurs (eligible for retry). */
export class SyncTransientError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'SyncTransientError';
  }
}

// ---- Catalog sync service published state (technical/sync.md) ----

export type SyncRunStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface CatalogSyncState {
  catalogId: string;
  providerConnectionId: string | null;
  status: SyncRunStatus;
  totalDocuments: number;
  completedDocuments: number;
  currentDocumentId?: string;
  lastError?: string;
  updatedDocumentIds: string[];
  /** Documents that have exhausted retries (technical/sync.md retry policy). */
  permanentlyFailedDocumentIds: string[];
  /** Most recent document whose local dirty content was overwritten by remote. */
  lastConflictDocumentId?: string;
  /** Whether the provider could not be reached (offline/stale indicator). */
  offline: boolean;
  updatedAt: string;
}

export function initialCatalogSyncState(
  catalogId: string,
  providerConnectionId: string | null
): CatalogSyncState {
  return {
    catalogId,
    providerConnectionId,
    status: 'idle',
    totalDocuments: 0,
    completedDocuments: 0,
    updatedDocumentIds: [],
    permanentlyFailedDocumentIds: [],
    offline: false,
    updatedAt: new Date().toISOString(),
  };
}
