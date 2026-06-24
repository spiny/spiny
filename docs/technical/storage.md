# Technical Requirements: Storage

Related docs: [Features](../product/features.md), [Sync](sync.md), [Editor](editor.md), [Sources](../sources.md).

## Storage decision

Spiny uses SQLite locally through `expo-sqlite`.

Reasons:

- The project owner prefers SQLite if usable on Android and iOS.
- `expo-sqlite` supports Android and iOS.
- SQLite fits the required relational model: catalogs, documents, and catalog indexes.
- SQLite supports transactions, which are required for autosave plus index updates.

## Database rules

1. The local database is the source of truth for offline use.
2. All local writes must be transactional when multiple tables are updated.
3. User-provided values must use prepared statements or parameter binding.
4. `execAsync()` must not be used with unescaped user input.
5. Store documents in SQLite rows, not as standalone local files, unless a future export/import feature adds file representations.
6. Keep sync credentials out of SQLite; store small secrets in `expo-secure-store`.
7. `expo-secure-store` has a platform size caveat: on iOS, values above approximately 2048 bytes may be rejected by the underlying keychain service. Split credentials into individual keys if combined payloads approach this limit. See [expo-secure-store documentation](https://docs.expo.dev/versions/latest/sdk/securestore/).

## Required tables

The project owner requires at least three tables: `documents`, `catalogs`, and `catalog_indexes`. Additional tables below are implementation requirements for settings, sync state, document navigation, and migrations.

### `catalogs`

Stores catalog metadata and active sync selection.

```sql
CREATE TABLE catalogs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  active_sync_connection_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
```

Requirements:

- `id` must be stable across sync providers.
- `active_sync_connection_id` must be nullable because catalogs are local by default.
- `deleted_at` supports future catalog sync/delete behavior.

### `documents`

Stores individual Markdown thoughts.

```sql
CREATE TABLE documents (
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
);
```

Requirements:

- Each document is a separate row.
- `topics_json` stores a JSON array of tag/topic strings.
- `body_markdown` stores raw Markdown source.
- `updated_at` drives local ordering and latest-wins sync.
- `deleted_at` is a tombstone; deleted documents are hidden but retained long enough for sync.
- `dirty = 1` means local changes have not been confirmed by the active provider.
- **Document size limit**: Maximum 64 KB for `body_markdown`. Some UTF-8 characters may take more than one byte, so the limit applies to the encoded byte length, not character count. The UI should warn when approaching this limit.

### `catalog_indexes`

Stores searchable metadata derived from documents.

```sql
CREATE TABLE catalog_indexes (
  catalog_id TEXT NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  searchable_title TEXT NOT NULL DEFAULT '',
  searchable_topics TEXT NOT NULL DEFAULT '',
  searchable_excerpt TEXT NOT NULL DEFAULT '',
  document_updated_at TEXT NOT NULL,
  indexed_at TEXT NOT NULL,
  PRIMARY KEY (catalog_id, document_id)
);
```

Requirements:

- Search queries must be scoped by `catalog_id`.
- The row must be updated whenever title, topics, body excerpt, or deletion state changes.
- Deleted documents must be excluded from normal search results.

## Additional required tables

### `app_settings`

Stores application-level preferences.

```sql
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Required keys:

- `active_catalog_id`
- `theme` with values `system`, `light`, `dark`
- `locale` with values `en`, `fr`, or `system` if system locale following is supported
- `assistant_enabled` initially `false`

### `sync_connections`

Stores non-secret provider configuration.

```sql
CREATE TABLE sync_connections (
  id TEXT PRIMARY KEY,
  provider_type TEXT NOT NULL,
  label TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  disabled_at TEXT
);
```

Requirements:

- `provider_type` values for v1: `google_drive`, `sftp`, `ftp`.
- Secrets and tokens must be stored in `expo-secure-store`, keyed by connection id.
- Catalogs reference this table through `active_sync_connection_id`.

### `sync_credentials`

Stores credential payloads that exceed `expo-secure-store` size limits or where user-provided files (such as SSH private keys) are better managed in SQLite with file-size flexibility. Secrets here are stored encrypted at the application layer when written. This table is intentionally separate from `sync_connections` so connection metadata can be listed without loading credential blobs.

```sql
CREATE TABLE sync_credentials (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES sync_connections(id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Requirements:

- `credential_type` values: `password`, `private_key`, `passphrase`.
- `payload` stores the credential value (encrypted by the application layer before write).
- SSH private keys may be provided by the user as PEM text or uploaded from device storage; either method produces a string stored in `payload`.
- This table is a companion to `expo-secure-store`: OAuth tokens and short secrets still use SecureStore; bulky credentials or user-provided key files use this table.
- The encryption scheme for `payload` must be documented during implementation. Android `EncryptedSharedPreferences` or a SQLite encryption extension (`expo-sqlite` supports `useSQLCipher`) are candidate approaches, but must be validated before adoption.

### `schema_migrations`

Tracks database migrations.

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
```

Requirement: all schema changes after initial creation must have an explicit migration.

### `document_navigation_events`

Stores local document-open history for the active catalog. This table supports recently viewed document navigation and graph context.

```sql
CREATE TABLE document_navigation_events (
  id TEXT PRIMARY KEY,
  catalog_id TEXT NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  from_document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  opened_from TEXT NOT NULL,
  opened_at TEXT NOT NULL
);
```

Requirements:

- Insert one row whenever a document is opened from home, search, document link, or the navigation surface.
- `from_document_id` records the previously open document when available.
- `opened_from` values should include `home`, `search`, `document_link`, `navigation_surface`, and `direct`.
- Recently viewed queries must filter out deleted documents.
- This table is local UI history; it is not required to sync in v1.
- **Retention**: Keep the most recent 20 navigation events per catalog. When a new event is inserted and the catalog exceeds 20 events, the oldest event for that catalog is removed. This keeps the recently viewed list bounded.

Recommended indexes:

```sql
CREATE INDEX idx_document_navigation_events_catalog_opened
  ON document_navigation_events(catalog_id, opened_at DESC);

CREATE INDEX idx_document_navigation_events_document
  ON document_navigation_events(document_id, opened_at DESC);
```

Additional recommended indexes for common query patterns:

```sql
-- Home screen: most recently updated documents in a catalog
CREATE INDEX idx_documents_catalog_updated
  ON documents(catalog_id, updated_at DESC);

-- Dirty-document sync scan: find unsynchronized documents
CREATE INDEX idx_documents_dirty
  ON documents(dirty) WHERE dirty = 1;

-- Active (non-deleted) documents in a catalog
CREATE INDEX idx_documents_catalog_active
  ON documents(catalog_id, deleted_at) WHERE deleted_at IS NULL;
```

### `document_relationships`

Stores directed document relationships. In v1, relationships are derived from explicit Spiny document links in Markdown.

```sql
CREATE TABLE document_relationships (
  catalog_id TEXT NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  source_document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  target_document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL DEFAULT 'link',
  relationship_source TEXT NOT NULL DEFAULT 'markdown_link',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (catalog_id, source_document_id, target_document_id, relationship_type)
);
```

The table intentionally does not include a separate `dirty` flag in v1. Relationships derived from Markdown can be rebuilt from `documents.body_markdown`; the Markdown body remains the synchronized source of truth.

Requirements:

- `source_document_id` is the document containing the link.
- `target_document_id` is the linked document.
- v1 relationship type is `link`.
- v1 relationship source is `markdown_link` for links using the app URI format `spiny://document/{documentId}`.
- Rebuild relationships for a document when its Markdown body changes and autosaves.
- Remove relationships for a source document when its Markdown no longer contains the corresponding document links.
- Relationship queries must filter out deleted source or target documents.

Recommended indexes:

```sql
CREATE INDEX idx_document_relationships_target
  ON document_relationships(catalog_id, target_document_id);

CREATE INDEX idx_document_relationships_source
  ON document_relationships(catalog_id, source_document_id);
```

## Catalog as a sync artifact

The product requirement says a catalog is a file in itself: title, description, and index of documents with tags. With SQLite local storage, implement that requirement as a provider-neutral **catalog manifest** for sync/export.

Required manifest fields:

```json
{
  "schema": "spiny.catalog.v1",
  "catalogId": "...",
  "title": "...",
  "description": "...",
  "updatedAt": "...",
  "documents": [
    {
      "documentId": "...",
      "title": "...",
      "topics": ["..."],
      "updatedAt": "...",
      "deletedAt": null,
      "linkedDocumentIds": ["..."]
    }
  ]
}
```

The manifest is derived from `catalogs`, `catalog_indexes`, and document relationships. It is not a separate local source of truth in v1.

## Catalog export/import archive

A catalog can be exported to, and imported from, a single ZIP archive: the "Export catalog" action in catalog settings and the "Import catalog" action in the catalog-list action menu. The archive is the portable, on-disk form of a catalog and shares its layout with the Google Drive remote layout (issue #4), so the two stay interchangeable.

### Archive layout

```
manifest.json
relationships.json
documents/
  {documentId}.md
  ...
```

`manifest.json` is an envelope describing the catalog and its documents. It extends the provider-neutral `spiny.catalog.v1` manifest above with an export envelope (`schema`, `exportedAt`), full catalog timestamps, and per-document `createdAt` and relative `path`:

```json
{
  "schema": "spiny.catalog-archive.v1",
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "catalog": {
    "id": "...",
    "title": "...",
    "description": "...",
    "createdAt": "...",
    "updatedAt": "..."
  },
  "settings": { "documentCount": 0 },
  "documents": [
    {
      "documentId": "...",
      "title": "...",
      "topics": ["..."],
      "createdAt": "...",
      "updatedAt": "...",
      "deletedAt": null,
      "linkedDocumentIds": ["..."],
      "path": "documents/{documentId}.md"
    }
  ]
}
```

`relationships.json` is a snapshot of the `document_relationships` rows for the catalog:

```json
{
  "schema": "spiny.catalog-relationships.v1",
  "catalogId": "...",
  "relationships": [
    {
      "catalogId": "...",
      "sourceDocumentId": "...",
      "targetDocumentId": "...",
      "relationshipType": "link",
      "relationshipSource": "markdown_link",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

`documents/{documentId}.md` holds one file per ACTIVE (non-deleted) document, containing only the raw `body_markdown`. Document metadata lives in `manifest.json`; the `.md` files carry only the body, so bodies stay clean, diff-friendly Markdown and metadata keeps a single source of truth.

### Security: what is never exported

- Exported: catalog metadata, non-secret settings, document metadata, document Markdown bodies, and the derived relationship rows.
- Never exported: `active_sync_connection_id`, anything in `sync_connections` or `sync_credentials`, and OAuth tokens or other secrets. An archive contains only local catalog/document content plus non-secret metadata.

### Import behavior

- Import always creates a NEW local catalog with a fresh catalog id; it never overwrites an existing catalog.
- Each document keeps its original id when that id is not already present locally, which preserves `spiny://document/{id}` body links and relationships. If an id already exists locally (a global PRIMARY KEY collision, e.g. re-importing the same archive), the document is assigned a fresh id and every `spiny://document/{old}` link in the imported bodies is rewritten to the new id, so no existing document is overwritten.
- Documents are inserted with `applyRemoteDocument`, which rebuilds the catalog index and `document_relationships` from each Markdown body. Because relationships are rebuilt from bodies (the documented source of truth), `relationships.json` does not need to be replayed to restore links. After all documents are inserted, relationships are rebuilt once more so links whose target document was inserted later also resolve.

### Save target

- Android: the Storage Access Framework (from `expo-file-system/legacy`) prompts the user for a destination directory, then `createFileAsync` plus `writeAsStringAsync` (Base64 encoding) write the ZIP.
- iOS / web: the Storage Access Framework is unavailable, so the archive is written into the app document directory and the resulting path is surfaced to the user.

## Search requirements

Minimum v1 search:

- Search `catalog_indexes` by active `catalog_id`.
- Match title, topics, and excerpt/body-derived text.
- Return document id, title, topics, and last edited timestamp.

FTS5 availability:

SQLite FTS5 is available in `expo-sqlite` and is enabled by default (`enableFTS: true` in the expo-sqlite config plugin). It may be used in v1 for better search ranking in larger catalogs. The `expo-sqlite` config plugin does not require additional native build configuration to enable FTS5 — it is part of the default build. See [expo-sqlite configuration docs](https://docs.expo.dev/versions/latest/sdk/sqlite/#configuration-in-app-config).

## Autosave requirements

Autosave must update `documents` and `catalog_indexes` together.

Recommended flow:

1. Debounce editor changes to avoid writing on every keystroke.
2. Start a transaction.
3. Update `documents` with new title/topics/body and `updated_at`.
4. Upsert the matching `catalog_indexes` row.
5. Rebuild `document_relationships` for the edited document if the Markdown body changed.
6. Mark `dirty = 1`.
7. Commit.
8. Trigger the asynchronous catalog sync service when the document belongs to a catalog with an active sync provider.

Failure behavior:

- If index update fails, the document update must roll back.
- If relationship rebuild fails, the document update must roll back to avoid stale navigation graph data.
- If sync fails later, local autosave remains valid and the document stays dirty.
- A failed sync must be rescheduled for a later service run.

## Document navigation storage requirements

The document navigation surface depends on `document_navigation_events` and `document_relationships`.

Recently viewed query requirements:

- Scope by active `catalog_id`.
- Exclude deleted documents.
- Return each document once, ordered by most recent `opened_at`.
- Include enough data for display: document id, title, topics, and last opened timestamp.

Relationship graph query requirements:

- Scope by active `catalog_id`.
- Include relationships where the current document is the source or target.
- Exclude deleted source and target documents.
- Include relationship direction so the UI can distinguish outgoing links from backlinks.
- Highlight the current document in the returned graph model.

Persistence requirements:

- Document navigation history is local-only in v1 unless a future requirement adds sync.
- Document relationships derived from Markdown should sync indirectly because the Markdown body syncs; relationship rows can be rebuilt locally after body changes or remote downloads.
- When a remote document download changes Markdown content, rebuild `document_relationships` for that document.

## Catalog sync service storage requirements

The asynchronous catalog sync service can publish transient status from memory, but durable synchronization results must be written to SQLite. The same service handles catalog-wide sync after provider connect/reconnect, dirty-document upload after autosave, and dirty-document resume at app start.

Requirements:

- Use `documents.updated_at`, `documents.deleted_at`, `documents.remote_updated_at`, `documents.last_synced_at`, and `documents.dirty` to determine and record per-document sync state.
- Update `catalog_indexes` whenever the service downloads, uploads, or tombstones a document.
- Persist synchronized document content before publishing a completed document-level update to subscribers.
- If the app is interrupted during catalog sync, the next service run must be able to resume by comparing local and remote timestamps again.
- Do not store transient progress-only data in SQLite unless implementation needs crash recovery for a long-running sync run.

### Dirty-document sync behavior

The service must scan for dirty documents with `dirty = 1` and an active catalog sync provider.

Required triggers:

1. After autosave marks a document `dirty = 1`.
2. At app start, to resume synchronization for documents left dirty by a previous app session.
3. After catalog sync provider connect/reconnect, as part of the catalog-wide sync run.

Required processing rules:

1. Find documents where `dirty = 1` in catalogs that have an active sync provider.
2. For each dirty document, fetch remote metadata/content when available.
3. Compare local `updated_at`/`deleted_at` with remote `updatedAt`/`deletedAt`.
4. If the local document is newer or equal, upload the local document or tombstone to the provider.
5. If upload succeeds, set `dirty = 0`, update `last_synced_at`, and update `remote_updated_at`.
6. If the remote document is newer, apply the remote document or tombstone locally, update `catalog_indexes`, and set `dirty = 0` so the overwritten local dirty state is not retried.
7. If synchronization fails, keep `dirty = 1`, record/publish the failure through sync status, and reschedule processing for a later service run.
8. Stop the sync service when no dirty documents remain and no catalog-wide sync work is pending.

The service must not clear `dirty` before either the local upload succeeds or a newer remote document has been applied locally under the latest-wins rule.

## Sources

- `expo-sqlite`: https://docs.expo.dev/versions/latest/sdk/sqlite/
- `expo-secure-store`: https://docs.expo.dev/versions/latest/sdk/securestore/
- SQLite FTS5: https://www.sqlite.org/fts5.html
