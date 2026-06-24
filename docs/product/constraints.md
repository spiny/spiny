# Product Constraints

Related docs: [Features](features.md), [Storage](../technical/storage.md), [Sync](../technical/sync.md), [AI assistant](../technical/ai-assistant.md), [Sources](../sources.md).

## C-01: Local-first and serverless by default

Spiny must store catalogs and documents locally by default. Opening, editing, and searching local data must work without network access.

Implications:

- Local SQLite is the primary data store.
- Sync is optional per catalog.
- A Spiny-hosted backend is not required for core v1 note-taking.

## C-02: Expo and React Native target

Spiny targets React Native through Expo. Android is the first validation target because a physical Android device is available over USB. iOS remains a product target.

Implications:

- Prefer Expo-supported libraries.
- Use development builds when native modules are required.
- Test Android behavior on the physical device before claiming support.

## C-03: SQLite is the preferred local data store

SQLite is preferred if usable on both Android and iOS. `expo-sqlite` supports Android and iOS and provides an async API for SQLite databases, so SQLite is the selected local storage path.

Minimum required local tables:

- `catalogs`
- `documents`
- `catalog_indexes`

See [Storage](../technical/storage.md) for schema requirements.

## C-04: One active sync provider per catalog

Storage connections are configured at the application level. A catalog may connect to one sync provider at a time. It may later disconnect and reconnect to a different provider.

Implications:

- Provider credentials/configuration are not duplicated per document.
- Catalog settings own provider selection.
- Switching providers must preserve local data.

## C-05: v1 sync is latest-wins on document open, catalog-wide sync, and dirty-document sync

When a synced document is opened, the app checks local and remote versions and keeps the newest one. After a catalog connects or reconnects a sync provider, an asynchronous catalog sync service must synchronize all documents in the current catalog using the same latest-wins rule. After autosave and at app start, the same service must process documents marked `dirty = 1`. v1 does not merge conflicting edits.

Implications:

- Documents require reliable updated timestamps.
- Deletes require tombstones so a deletion can win over old content.
- Version history must be documented as future work.
- App components need a subscription path for sync status and per-document updates.
- Autosave must mark changed documents dirty, trigger asynchronous dirty-document sync, keep dirty state after sync failure, and resume dirty-document sync at app start.
- If a newer remote document wins against a dirty local document, the local dirty flag is cleared after the remote version is applied.
- Unless a later requirement explicitly adds mobile OS background work, this is an in-app asynchronous service, not a guarantee that sync continues while the app is closed.
- When a provider is configured but the network is unavailable, the local document is opened immediately and the sync service retries later. The user must not be blocked from editing when offline.

## C-06: Provider support must be truthful

Google Drive has an official HTTP API and OAuth documentation compatible with a mobile app architecture. Expo/React Native official docs do not provide built-in SSH/SFTP or FTP clients.

Implications:

- Google Drive is the clearest v1 sync provider path.
- SSH/SFTP and FTP remain v1 product targets, but require explicit technical validation with third-party native modules, JavaScript libraries, or custom Expo modules before release claims.
- The UI may list providers before all are functional only if their status is clear.

## C-07: Secrets cannot be embedded in the app bundle

Provider credentials and tokens must not be hard-coded into the mobile app. Expo public environment variables are embedded into the bundle and are not secret. React Native security guidance also warns that sensitive keys in app code can be inspected.

Implications:

- Store user OAuth tokens and short credentials in `expo-secure-store`.
- Note: `expo-secure-store` on iOS may reject values above approximately 2048 bytes. Split credentials into separate keys if needed. Larger credential payloads (e.g., SSH private keys) may be stored in the `sync_credentials` SQLite table with application-layer encryption.
- Do not ship app-owned LLM or storage provider secrets inside the app.
- AI providers that require app-owned secrets need a backend, short-lived tokens, or a provider-supported mobile-safe auth model.

## C-08: AI is a roadmap capability with v1 UX only

The assistant screen and provider settings must exist in v1, but AI provider communication and tool calls are future work.

Implications:

- The v1 UI must not imply that AI features are working.
- Future implementation must use a provider abstraction and Spiny-owned tool harness.
- Destructive AI actions require user confirmation.

## C-09: Markdown UX is pragmatic, not Obsidian-equivalent

Obsidian uses CodeMirror 6 for its Markdown editor extension model and supports separate editing/reading experiences. Spiny v1 should use a simple Markdown source editor with a separate preview mode unless a richer React Native-compatible editor is validated.

Implications:

- Store Markdown source as plain text.
- Do not promise Obsidian plugin or Live Preview parity.
- Future richer editing must be validated against Expo/development-build constraints.

## C-10: Accessibility and localization are first-class requirements

The app must support English and French UI text in v1, and must use accessible labels/roles for controls.

Implications:

- Theme and locale settings must be testable.
- Interactive controls need meaningful accessibility labels and roles.
- Text entry should not disable font scaling unless a documented exception exists.

## C-11: Document navigation replaces document-history back/forward controls

Spiny must keep document navigation history and document relationship data, then expose that context through a navigation graph or recently viewed documents view with the current document highlighted.

Implications:

- Do not design document-history back and forward buttons as the primary document navigation pattern.
- A home/back-to-home action is still allowed because it is app navigation, not document-history navigation.
- Navigation history and relationships must be available offline from local SQLite data.
- In v1, document relationships are derived from explicit Spiny document links in Markdown.
- Deleted documents must be excluded from navigation displays.
- If a graph renderer is introduced, it must be validated on the Android physical device; a recently viewed list is an acceptable lean v1 representation.
