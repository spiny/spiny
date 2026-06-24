/**
 * SQLite row types and shared enums.
 *
 * Schema mirrors technical/storage.md. Timestamps are ISO-8601 UTC strings;
 * `dirty` is stored as INTEGER 0/1.
 */

export type ProviderType = 'google_drive' | 'sftp' | 'ftp';

export type OpenedFrom =
  | 'home'
  | 'search'
  | 'document_link'
  | 'navigation_surface'
  | 'direct';

export type CredentialType = 'password' | 'private_key' | 'passphrase';

export interface CatalogRow {
  id: string;
  title: string;
  description: string;
  active_sync_connection_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DocumentRow {
  id: string;
  catalog_id: string;
  title: string;
  topics_json: string;
  body_markdown: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  remote_provider_key: string | null;
  remote_updated_at: string | null;
  last_synced_at: string | null;
  dirty: number;
}

export interface CatalogIndexRow {
  catalog_id: string;
  document_id: string;
  searchable_title: string;
  searchable_topics: string;
  searchable_excerpt: string;
  document_updated_at: string;
  indexed_at: string;
}

export interface AppSettingRow {
  key: string;
  value_json: string;
  updated_at: string;
}

export interface SyncConnectionRow {
  id: string;
  provider_type: ProviderType;
  label: string;
  config_json: string;
  created_at: string;
  updated_at: string;
  disabled_at: string | null;
}

export interface SyncCredentialRow {
  id: string;
  connection_id: string;
  credential_type: CredentialType;
  payload: string;
  created_at: string;
  updated_at: string;
}

export interface NavigationEventRow {
  id: string;
  catalog_id: string;
  document_id: string;
  from_document_id: string | null;
  opened_from: OpenedFrom;
  opened_at: string;
}

export interface DocumentRelationshipRow {
  catalog_id: string;
  source_document_id: string;
  target_document_id: string;
  relationship_type: string;
  relationship_source: string;
  created_at: string;
  updated_at: string;
}

// ---- Derived view models used by the UI ----

export interface Catalog {
  id: string;
  title: string;
  description: string;
  activeSyncConnectionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogWithCount extends Catalog {
  documentCount: number;
}

export interface DocumentModel {
  id: string;
  catalogId: string;
  title: string;
  topics: string[];
  bodyMarkdown: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  remoteProviderKey: string | null;
  remoteUpdatedAt: string | null;
  lastSyncedAt: string | null;
  dirty: boolean;
}

export interface DocumentSummary {
  id: string;
  title: string;
  topics: string[];
  updatedAt: string;
}

export interface RecentlyViewedItem extends DocumentSummary {
  openedAt: string;
}

export type RelationshipDirection = 'outgoing' | 'incoming';

export interface RelatedDocument extends DocumentSummary {
  direction: RelationshipDirection;
}
