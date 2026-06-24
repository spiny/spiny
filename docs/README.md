# Spiny Documentation

Spiny is a local-first thoughts repository for Android and iOS, implemented with Expo and React Native. It is conceptually close to Obsidian, but is intentionally leaner: quick Markdown capture, catalog-scoped search, local persistence by default, and optional user-owned sync providers.

## Source policy

- Product requirements come from the project owner conversation dated 2026-06-20.
- Technical claims cite current official documentation wherever available.
- Community libraries are marked as community sources, not platform guarantees.
- If a capability is not confirmed by official Expo/React Native documentation, the docs call that out instead of assuming support.

## Documentation map

### Product concepts

- [Use cases](product/use-cases.md): user goals and acceptance criteria.
- [Features](product/features.md): v1 feature scope and roadmap separation.
- [Constraints](product/constraints.md): product, platform, sync, and security constraints.

### Technical requirements

- [Platform](technical/platform.md): Expo/React Native stack, navigation, theming, locale, Android focus.
- [Storage](technical/storage.md): SQLite data model, required tables, indexing, autosave, and dirty-document sync state.
- [Editor](technical/editor.md): Obsidian comparison, v1 Markdown editor, toolbar, and document navigation requirements.
- [Sync](technical/sync.md): provider architecture, Google Drive, SSH/SFTP, FTP, dirty-document processing, and latest-wins sync.
- [AI assistant](technical/ai-assistant.md): non-functional v1 UX and future provider/tool architecture.
- [Android testing](technical/testing-android.md): physical-device validation requirements.
- [Sources](sources.md): consolidated source list.

## Implementation status

Spiny v1 is implemented and validated on a physical Android device (Moto G Play, Android 11). The stack is Expo SDK 56, React Native 0.85, `expo-router`, TypeScript, and the New Architecture. The Android build requires JDK 17.

- **Storage**: all required SQLite tables with migrations and repositories; transactional autosave updating `documents`, `catalog_indexes`, and `document_relationships` together; tombstones; dirty flags; navigation-event retention (20 per catalog).
- **Screens**: home, catalog selector/create/settings, document editor (autosave, Markdown toolbar for bold/italic/H1–H5/rule/document-link/external-link, separate preview, 64 KB byte limit with warning, navigation surface), expanded mind map (multi-select copy/move), catalog-scoped offline search, app settings (theme, locale, providers), and the assistant (non-functional v1 UX).
- **Theme and locale**: system/light/dark theme and full English and French message catalogs, persisted across restarts.
- **Sync**: provider abstraction and an in-app catalog sync service (latest-wins, dirty-document processing, exponential backoff at 30s/2min/5min/15min, conflict notifications, status subscriptions). The Google Drive provider uses OAuth PKCE against the Drive `appDataFolder` REST API and is gated on a user-supplied client id (no bundled secrets). SSH/SFTP and FTP are intentionally marked non-functional in v1. Credentials are encrypted (AES-256 via `aes-js`) with the key held in `expo-secure-store`.
- **Markdown**: a custom, dependency-free Markdown renderer (decision recorded in [editor](technical/editor.md)).

Quality gates at the last validation: `tsc --noEmit` reports 0 errors and `expo-doctor` passes 21/21 checks.

**Known limitations**: SSH/SFTP/FTP remain non-functional by design; Google Drive requires a user-provided OAuth client id; a single dev-only LogBox warning originates inside `expo-router` initial-URL handling and is absent from release builds.

## Current decisions

| Area | Decision |
| --- | --- |
| App framework | Expo + React Native |
| Initial target | Android physical device first; iOS remains a target |
| Persistence | Local SQLite via `expo-sqlite` |
| Core records | `catalogs`, `documents`, `catalog_indexes` minimum |
| Markdown editor | Simple Markdown source editor plus separate preview mode for v1; 64 KB byte limit on document body |
| Document navigation | Show a document navigation graph or recently viewed documents with current document highlighted; no document-history back/forward buttons; retain the most recent 20 navigation events per catalog |
| Document size limit | 64 KB max for `body_markdown` (byte length); UI warns when approaching limit |
| Mind map | Single/multi-node selection with copy and move actions; populates unvisited relationships from `document_relationships` |
| Sync providers | Google Drive, SSH/SFTP, FTP in v1 scope; feasibility differs by provider |
| Sync conflict policy | Bidirectional sync on document open, catalog-wide async sync after provider connect/reconnect, and dirty-document async sync after autosave/app start; latest document wins; user notified when remote overwrites local dirty content |
| Sync retry | Exponential backoff (30s, 2min, 5min, 15min); permanent failure after 4 consecutive failures per document |
| Offline behavior | When provider is configured but network unavailable, local document opens immediately; sync deferred |
| Document versions | Future feature, not v1 |
| AI assistant | UX present in v1, provider execution non-functional until roadmap phase |
| Secure credential storage | `expo-secure-store` for small secrets (~2 KB iOS limit); `sync_credentials` table with app-layer encryption for larger payloads (e.g., SSH keys) |

## Glossary

- **Catalog**: A user-selected collection of documents with title, description, sync configuration, and a searchable index.
- **Document**: A single Markdown thought with title, topics/tags, body, timestamps, and sync metadata.
- **Catalog index**: Search-oriented metadata for documents in one catalog.
- **Document relationship**: A directed relationship between two documents, initially derived from explicit Spiny document links in Markdown.
- **Document navigation history**: Local record of document opens used to show recently viewed documents and navigation context.
- **Storage connection**: Application-level credentials/configuration for a sync provider.
- **Sync provider**: A backend selected by the user for one catalog, such as Google Drive, SSH/SFTP, or FTP.
- **Catalog sync service**: An in-app asynchronous service that compares local and remote timestamps, synchronizes documents to the latest copy, processes `dirty = 1` documents after autosave/app start, and publishes status for UI components to subscribe to. Uses exponential backoff retry: 30s, 2min, 5min, 15min, then permanent failure.
- **Conflict notification**: A user-visible message (toast, banner, or sync history entry) when a newer remote document overwrites local dirty content during latest-wins sync.
- **Mind map**: The document navigation graph view. Supports selecting one or more document nodes and executing copy or move actions. Populates unvisited relationships from `document_relationships`.

## Naming note

The requirements mention both "Google Drive" and "Google Docs" in sync-provider context. These docs use **Google Drive** for v1 because Drive is the user-owned file storage API with documented upload/download/list operations. This does not imply integration with the Google Docs editor format unless a later requirement explicitly adds it.
