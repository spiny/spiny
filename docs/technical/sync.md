# Technical Requirements: Sync

Related docs: [Use cases](../product/use-cases.md), [Constraints](../product/constraints.md), [Storage](storage.md), [AI assistant](ai-assistant.md), [Sources](../sources.md).

## Sync scope

v1 sync providers:

- Google Drive.
- SSH/SFTP for SSH-based file transfer.
- FTP.

The product notes mention both "Google Drive" and "Google Docs". This technical document uses Google Drive because the official Drive API provides file upload/download/list operations suitable for Spiny catalog manifests and document objects. Native Google Docs document-format editing is not part of v1 unless explicitly added later.

Core sync behavior:

- Sync is optional per catalog.
- Storage connections are configured at the application level.
- A catalog may use only one active sync provider at a time.
- Sync is bidirectional on document open.
- After provider connect/reconnect, an asynchronous catalog sync service synchronizes all documents in the current catalog.
- After autosave marks a document dirty, the same service scans dirty documents and uploads or reconciles them.
- At app start, the same service resumes dirty-document synchronization from previous sessions.
- App components can subscribe to catalog sync service status and document-level updates.
- Latest document wins.
- Document version history is not implemented in v1.

## Provider feasibility summary

| Provider | v1 product target | Official Expo/RN path | Requirement |
| --- | --- | --- | --- |
| Google Drive | Yes | HTTPS REST API + OAuth flow | Implement first |
| SSH/SFTP | Yes | No built-in official Expo/RN provider found; `ssh2` is a candidate Node.js SSH/SFTP library, not yet validated for Expo/React Native | Validate third-party/native/custom module before release |
| FTP | Yes | No built-in official Expo/RN provider found | Validate third-party/native/custom module before release |

React Native official networking documentation covers Fetch, XMLHttpRequest, and WebSocket. It does not provide raw TCP, SSH, SFTP, or FTP APIs. Expo official docs do not provide a built-in SSH/SFTP/FTP sync provider. Therefore SSH/SFTP and FTP must not be claimed functional until a third-party library or custom native module is selected and an Android device proof-of-concept succeeds.

## Provider adapter interface

Implement sync through a provider abstraction so UI and catalog logic are provider-neutral.

Required operations:

```ts
type SyncProvider = {
  kind: 'google_drive' | 'sftp' | 'ftp';
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getCatalogManifest(catalogId: string): Promise<CatalogManifest | null>;
  putCatalogManifest(manifest: CatalogManifest): Promise<void>;
  getDocument(catalogId: string, documentId: string): Promise<RemoteDocument | null>;
  putDocument(document: RemoteDocument): Promise<void>;
  deleteDocument(catalogId: string, documentId: string, deletedAt: string): Promise<void>;
};
```

This interface is a requirement document, not finalized application code.

## Catalog sync service

The catalog sync service is an in-app asynchronous service responsible for synchronizing every document in the current catalog after a sync provider is connected or reconnected. The same service also resumes dirty-document synchronization at app start and processes documents marked `dirty = 1` by autosave. It provides the shared synchronization path that document-open sync can reuse for a single high-priority document.

Assumption: this service runs while the app is active. It is not an OS-level background worker unless a later requirement explicitly adds background execution.

### Lifecycle requirements

1. Start automatically after a catalog sync provider is connected or reconnected.
2. Start automatically after autosave marks a document `dirty = 1`, if that document's catalog has an active sync provider.
3. Start at app launch to resume documents left with `dirty = 1` from a previous session.
4. Scope catalog-wide runs to the current active catalog.
5. For dirty-document resume, scan all catalogs with active sync providers unless implementation intentionally limits v1 to the active catalog and documents that limitation.
6. Ensure only one active sync run exists per catalog/provider pair.
7. Allow document-open sync to enqueue or prioritize the opened document without racing the catalog-wide run.
8. Stop, cancel, or restart safely if the active catalog or provider changes.
9. Stop when no `dirty = 1` documents remain and no catalog-wide sync work is pending.
10. Publish status updates for app components.

### Subscription requirements

Home, search, editor, catalog settings, and other interested components must be able to subscribe to sync state.

Minimum published state:

```ts
type CatalogSyncState = {
  catalogId: string;
  providerConnectionId: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  totalDocuments: number;
  completedDocuments: number;
  currentDocumentId?: string;
  lastError?: string;
  updatedDocumentIds: string[];
};
```

The exact state-management library is not specified here. The implementation may use React context, a state store, or an event emitter, as long as multiple app components can subscribe and unsubscribe safely.

### Catalog-wide sync algorithm

For each service run:

1. Load the current catalog, active provider connection, and local document/index metadata from SQLite.
2. Fetch the remote catalog manifest or equivalent remote document listing.
3. Build the union of local and remote document ids.
4. For each document id, compare local and remote `updatedAt`/`deletedAt` timestamps.
5. Apply latest-wins:
   - Remote newer: download remote content or tombstone and update local SQLite rows.
   - Local newer or equal: upload local content or tombstone and update remote state.
6. Update the catalog manifest/index after document changes.
7. Update `last_synced_at`, `remote_updated_at`, `dirty`, and `catalog_indexes` transactionally.
8. Publish per-document progress and final run status to subscribers.

Rules:

- The service must not block navigation or editing.
- The service must serialize writes for the same document.
- If sync fails for one document, the service should continue with other documents where safe and report the failure.
- Clock differences across devices can affect latest-wins behavior; document versioning remains future work.
- **Retry policy**: When sync fails for a document (network error, provider rejected, timeout), the service should retry with exponential backoff: 30 seconds, then 2 minutes, then 5 minutes, then 15 minutes. After four consecutive failures for the same document, mark it as a permanent failure and surface the error in the sync status. The user can retry manually from the UI (e.g., a retry action in the sync status indicator).
- **Conflict notification**: When the remote document is newer and overwrites local dirty content, the app must surface a user-visible notification (e.g., a sync history entry, toast, or in-editor banner) indicating that local changes were replaced by a newer remote version. The overwritten local content is not recoverable in v1 (no version history), so the notification is informational only.

### Dirty-document sync algorithm

Autosave marks edited documents `dirty = 1`. The sync service must process those rows asynchronously.

For each dirty-document run:

1. Query SQLite for documents where `dirty = 1` and the catalog has an active sync provider.
2. If no dirty documents are found and no catalog-wide sync work is pending, stop the service.
3. For each dirty document, fetch remote metadata/content when available.
4. Compare local and remote timestamps using the same latest-wins rule as document-open sync.
5. If local is newer or equal, upload the local document or tombstone.
6. If upload succeeds, set `dirty = 0`, update `last_synced_at`, and update `remote_updated_at`.
7. If remote is newer, apply remote content or tombstone locally, update `catalog_indexes`, and set `dirty = 0` so the overwritten local dirty state is ignored in future processing.
8. If sync fails, keep `dirty = 1`, publish/report the failure, and reschedule a later run.

The service must not clear `dirty` merely because an upload was attempted.

## Remote object model

Use a provider-neutral object model:

- Catalog manifest: metadata and index summary.
- Document object: Markdown document content and metadata.
- Tombstone: deletion timestamp for deleted documents.

Required document object fields:

```json
{
  "schema": "spiny.document.v1",
  "catalogId": "...",
  "documentId": "...",
  "title": "...",
  "topics": ["..."],
  "bodyMarkdown": "...",
  "linkedDocumentIds": ["..."],
  "createdAt": "...",
  "updatedAt": "...",
  "deletedAt": null
}
```

`linkedDocumentIds` is derived from explicit Spiny document links in Markdown. The Markdown body remains the source of truth; local `document_relationships` rows can be rebuilt after sync.

## Document-open sync algorithm

When opening a document, the app may run a single-document sync directly or enqueue the document as a high-priority item in the catalog sync service. In either case:

1. Load local document from SQLite.
2. If the catalog has no active sync provider, open local document immediately.
3. If a provider is configured, attempt to fetch remote document metadata/content.
   - If the network is unavailable or the fetch fails (timeout, DNS failure), open the local document immediately and the catalog sync service will attempt synchronization later. Do not block the editor on network availability.
   - The sync status indicator in the UI should reflect the failure so the user knows the document may be stale.
4. If remote does not exist and local is not deleted, upload local document and manifest/index changes.
5. If local does not exist and remote exists, create local document and index row.
6. If both exist, compare `deleted_at`/`deletedAt` and `updated_at`/`updatedAt` timestamps.
7. Apply latest-wins:
   - Remote newer: replace local content or tombstone locally.
   - Local newer or equal: upload local content or tombstone remotely.
8. Update `last_synced_at`, `remote_updated_at`, `dirty`, and `catalog_indexes`.
9. Open the winning content in the editor.

Rules:

- No merge conflict UI in v1.
- No historical version recovery in v1.
- User-visible documentation must state that the newest edit wins.
- Clock differences across devices can affect latest-wins behavior; document versioning is future work.

## Google Drive requirements

Implementation path:

- Use OAuth 2.0 native/installed app flow with PKCE.
- Use Expo `AuthSession` or a provider-specific native library that is validated in a development build.
- Use least-privilege Google Drive scopes.
- Prefer app-private Drive storage where appropriate, such as `appDataFolder`, if it matches the desired user visibility.
- Upload/download/list files through Drive REST APIs.
- Store OAuth tokens in `expo-secure-store`.

Drive operations required:

- List/search files.
- Download file content.
- Upload file content.
- Update catalog manifest.
- Handle token refresh/reconnect.

## SSH/SFTP requirements

Status: v1 product target with implementation feasibility gate.

Candidate library: [`mscdex/ssh2`](https://github.com/mscdex/ssh2). Its README describes it as SSH2 client/server modules written in pure JavaScript for Node.js, with a Node.js v16+ requirement, SFTP support through `conn.sftp(...)`, and examples for directory listing through SFTP. Because it targets Node.js and React Native does not provide Node's standard networking/runtime APIs by default, this remains a candidate only until validated in the Expo/React Native environment.

Requirements before release:

1. Evaluate `ssh2` first as the candidate SSH/SFTP library.
2. Verify whether `ssh2` can run in an Expo development build on the physical Android device, including any required polyfills or native TCP/socket support.
3. If `ssh2` is not viable in Expo/React Native, select another SSH/SFTP library or custom Expo module.
4. Verify authentication modes to support in v1: password and/or private key.
5. Verify credential storage through `expo-secure-store`.
6. Verify upload/download/list/delete operations.
7. Document unsupported server configurations.

Do not implement by shelling out to device tools; mobile apps cannot assume such tools exist.

## FTP requirements

Status: v1 product target with implementation feasibility gate.

Requirements before release:

1. Select an FTP library or custom Expo module.
2. Verify it works in an Expo development build on the physical Android device.
3. Verify TLS/FTPS support if secure FTP is required.
4. Verify credential storage through `expo-secure-store`.
5. Verify upload/download/list/delete operations.
6. Document plaintext FTP security risks if non-TLS FTP is allowed.

## Credential storage

Store small provider secrets and tokens in `expo-secure-store`. Store only non-secret provider metadata in SQLite.

Examples:

- SQLite: provider type, display label, remote base path, non-secret account id.
- SecureStore: OAuth refresh token, access token, password, private-key passphrase.

Do not store large remote document payloads in SecureStore.

## Sources

- React Native networking: https://reactnative.dev/docs/network
- Expo development builds: https://docs.expo.dev/develop/development-builds/introduction/
- Expo customization/native library constraints: https://docs.expo.dev/workflow/customizing/
- Expo Modules API: https://docs.expo.dev/modules/overview/
- `expo-auth-session`: https://docs.expo.dev/versions/latest/sdk/auth-session/
- `expo-secure-store`: https://docs.expo.dev/versions/latest/sdk/securestore/
- `expo-file-system`: https://docs.expo.dev/versions/latest/sdk/filesystem/
- `ssh2` candidate SSH/SFTP library: https://github.com/mscdex/ssh2
- Google OAuth native apps: https://developers.google.com/identity/protocols/oauth2/native-app
- Google Drive uploads: https://developers.google.com/workspace/drive/api/guides/manage-uploads
- Google Drive downloads/exports: https://developers.google.com/workspace/drive/api/guides/manage-downloads
- Google Drive search/list: https://developers.google.com/workspace/drive/api/guides/search-files
- Google Drive app data folder: https://developers.google.com/workspace/drive/api/guides/appdata
- Google Drive scopes: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
