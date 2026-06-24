# Technical Requirements: Android Testing

Related docs: [Platform](platform.md), [Storage](storage.md), [Editor](editor.md), [Sync](sync.md), [AI assistant](ai-assistant.md), [Sources](../sources.md).

## Goal

Validate Spiny first on a physical Android device connected over USB.

## Environment requirements

Follow the current Expo Android physical-device setup documentation before claiming Android support.

Required checks:

- Java/Android tooling installed per current Expo docs.
- Android SDK platform installed per current Expo docs.
- `ANDROID_HOME` configured if required by the local environment.
- USB debugging enabled on the device.
- `adb devices` shows the device.
- Development build installed when native modules are used.

## Build/run requirements

Use:

```bash
npx expo run:android
```

when a local development build is needed.

Use EAS development builds only when local builds are not appropriate or when release-like distribution is required.

## Product acceptance tests

| Area | Required validation |
| --- | --- |
| Home | Active catalog loads offline and shows recent documents |
| Catalogs | Create, select, edit settings, disconnect/reconnect provider |
| Editor | Title/topics/body editing, autosave, preview, delete |
| Document navigation | History/relationships are recorded and graph or recently viewed view highlights current document |
| Search | Search active catalog offline |
| Settings | Theme, locale, provider list, AI provider list |
| Catalog sync service | Starts after provider connect/reconnect and publishes subscriber-visible status |
| Dirty-document sync | Autosave marks dirty rows, triggers service, retries failures, resumes at app start |
| Assistant | Screen visible, execution clearly disabled in v1 |

## Storage tests

- Create a catalog and verify a `catalogs` row exists.
- Create a document and verify a `documents` row exists.
- Edit document title/topics/body and verify `catalog_indexes` updates.
- Open documents and verify `document_navigation_events` records history.
- Open 25+ documents in a catalog and verify the navigation history retains only the most recent 20 entries.
- Insert a Spiny document link and verify `document_relationships` records the relationship after autosave.
- Remove a Spiny document link and verify stale relationship rows are removed after autosave.
- Edit a synced document and verify `dirty = 1` before successful provider synchronization.
- Verify successful sync clears `dirty` only after upload succeeds or a newer remote document has been applied locally.
- Delete a document and verify it is hidden but tombstoned.
- Restart the app and verify data persists.
- Restart with a dirty document and verify the sync service resumes processing.
- Verify user input is written through parameterized SQL paths.

## Editor tests

- Multiline Markdown input starts at top on Android.
- Autosave survives navigation away and app restart.
- Preview does not mutate stored Markdown.
- Document navigation surface highlights the current document.
- Document navigation surface opens selected related/recent documents without document-history back/forward buttons.
- Mind map populates unvisited document relationships from `document_relationships` even if no navigation event exists.
- Mind map supports selecting one or more document nodes and executing copy or move actions.
- Preview/document-link activation opens the linked document and records a navigation event.
- Long-enough notes remain usable on the physical device.
- Approaching the 64 KB document body limit shows a warning.
- Exceeding the 64 KB limit truncates on save with a user-visible warning.
- Keyboard behavior does not hide critical controls.

## Sync tests

Google Drive before release:

- Connect account.
- Create remote catalog manifest.
- Upload document.
- Download document.
- Update local newer than remote and verify upload wins on open.
- Update remote newer than local and verify download wins on open.
- Delete locally and verify tombstone behavior.
- Connect or reconnect a provider and verify the asynchronous catalog sync service compares all local/remote document timestamps.
- Verify subscribed screens receive running/completed/failed status without blocking navigation.
- Force a provider sync failure and verify dirty documents remain dirty and are retried later with exponential backoff.
- Verify the sync service stops when no dirty documents remain and no catalog-wide sync work is pending.
- Disconnect the device network, open a synced document, and verify the local document opens immediately with a stale indicator.
- Simulate a remote document that is newer than a local dirty document; verify the remote content wins and the user receives a conflict notification.
- Verify the sync service retries failed documents at least 4 times before marking as permanently failed.

SSH/SFTP and FTP before release:

- Prove selected implementation works in an Expo development build on the Android device.
- Validate connect/list/upload/download/delete.
- Validate credential storage and reconnect behavior.
- Document unsupported server configurations.

## Accessibility and localization tests

- Run Android TalkBack through all primary screens.
- Verify labels for icon-only actions.
- Verify theme modes: system, light, dark.
- Verify locale selection: English and French.
- Verify text scaling does not break core screens.

## Sources

- Expo Android physical device setup: https://docs.expo.dev/get-started/set-up-your-environment/?platform=android&device=physical&mode=development-build
- Expo development builds: https://docs.expo.dev/develop/development-builds/introduction/
- React Native accessibility: https://reactnative.dev/docs/accessibility
