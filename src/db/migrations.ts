/**
 * Database migrations.
 *
 * Every schema change after initial creation gets an explicit, ordered
 * migration (technical/storage.md). `schema_migrations` is bootstrapped by the
 * runner in db/database.ts; migration 1 creates all remaining tables/indexes.
 */

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    statements: [
      `CREATE TABLE catalogs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        active_sync_connection_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );`,

      `CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        catalog_id TEXT NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT '',
        topics_json TEXT NOT NULL DEFAULT '[]',
        body_markdown TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        remote_provider_key TEXT,
        remote_updated_at TEXT,
        last_synced_at TEXT,
        dirty INTEGER NOT NULL DEFAULT 0
      );`,

      `CREATE TABLE catalog_indexes (
        catalog_id TEXT NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        searchable_title TEXT NOT NULL DEFAULT '',
        searchable_topics TEXT NOT NULL DEFAULT '',
        searchable_excerpt TEXT NOT NULL DEFAULT '',
        document_updated_at TEXT NOT NULL,
        indexed_at TEXT NOT NULL,
        PRIMARY KEY (catalog_id, document_id)
      );`,

      `CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,

      `CREATE TABLE sync_connections (
        id TEXT PRIMARY KEY,
        provider_type TEXT NOT NULL,
        label TEXT NOT NULL,
        config_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        disabled_at TEXT
      );`,

      `CREATE TABLE sync_credentials (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL REFERENCES sync_connections(id) ON DELETE CASCADE,
        credential_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,

      `CREATE TABLE document_navigation_events (
        id TEXT PRIMARY KEY,
        catalog_id TEXT NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        from_document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
        opened_from TEXT NOT NULL,
        opened_at TEXT NOT NULL
      );`,

      `CREATE TABLE document_relationships (
        catalog_id TEXT NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
        source_document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        target_document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        relationship_type TEXT NOT NULL DEFAULT 'link',
        relationship_source TEXT NOT NULL DEFAULT 'markdown_link',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (catalog_id, source_document_id, target_document_id, relationship_type)
      );`,

      // Indexes for common query patterns (technical/storage.md).
      `CREATE INDEX idx_documents_catalog_updated
        ON documents(catalog_id, updated_at DESC);`,
      `CREATE INDEX idx_documents_dirty
        ON documents(dirty) WHERE dirty = 1;`,
      `CREATE INDEX idx_documents_catalog_active
        ON documents(catalog_id, deleted_at) WHERE deleted_at IS NULL;`,
      `CREATE INDEX idx_document_navigation_events_catalog_opened
        ON document_navigation_events(catalog_id, opened_at DESC);`,
      `CREATE INDEX idx_document_navigation_events_document
        ON document_navigation_events(document_id, opened_at DESC);`,
      `CREATE INDEX idx_document_relationships_target
        ON document_relationships(catalog_id, target_document_id);`,
      `CREATE INDEX idx_document_relationships_source
        ON document_relationships(catalog_id, source_document_id);`,
    ],
  },
];
