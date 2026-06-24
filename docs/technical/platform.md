# Technical Requirements: Platform

Related docs: [Storage](storage.md), [Editor](editor.md), [Sync](sync.md), [Android testing](testing-android.md), [Sources](../sources.md).

## Selected stack

| Concern | Requirement |
| --- | --- |
| App framework | Expo with React Native |
| Routing | Expo Router |
| Local database | `expo-sqlite` |
| Secure small secrets | `expo-secure-store` |
| Locale detection | `expo-localization` |
| File/network helpers | `expo-file-system` (new `File`/`Directory`/`Paths` API; the legacy function-based API is in `expo-file-system/legacy`) where file upload/download primitives are needed |
| OAuth browser flow | `expo-auth-session` where provider-specific SDKs are not used |
| Primary device target | Android physical device over USB |
| Secondary target | iOS |

As of the documentation retrieved on 2026-06-20, Expo's latest documentation identified SDK 56 as current, with React Native 0.85, React 19.2.3, Android 7+, Android target/compile SDK 36, iOS 16.4+, and Node 22.13.x requirements. Verify these exact versions again when initializing the app because Expo SDK versions advance.

## Development build requirement

Use Expo development builds for production-grade local testing and for any dependency that requires custom native code. Expo Go is useful for SDK-supported packages, but it has a fixed native runtime and cannot load arbitrary native modules.

This is especially relevant for:

- SSH/SFTP or FTP libraries.
- Rich Markdown editors with native code.
- Provider SDKs that require native configuration.

## Android-first validation

The project must support Android development on a connected physical device.

Implementation requirements:

1. Install and configure the Android toolchain required by the current Expo docs.
2. Enable USB debugging on the Android device.
3. Verify `adb devices` detects the device.
4. Install `expo-dev-client` when a development build is needed.
5. Use `npx expo run:android` for local device builds.

## Route map

Use Expo Router file-based routes. Proposed route names:

| Route | Screen |
| --- | --- |
| `/` | Home for active catalog |
| `/documents/new` | Create document |
| `/documents/[id]` | Document editor |
| `/documents/[id]/navigation` | Optional expanded document navigation graph/recently viewed view |
| `/catalogs` | Catalog selector |
| `/catalogs/new` | Create catalog |
| `/catalogs/[id]/settings` | Catalog settings |
| `/search` | Search active catalog |
| `/settings` | Application settings |
| `/assistant` | Assistant UX |

Navigation requirements:

- Use declarative links for simple navigation.
- Use imperative navigation only for flow control, such as returning home after selecting a catalog.
- Record document navigation history whenever a document route is opened.
- Do not model document-history navigation as back/forward buttons; show a navigation graph or recently viewed document surface instead.
- Every destructive action must return to a safe route after completion.

## UI implementation requirements

### Lists

Use `FlatList` for home, catalog selector, search results, recently viewed documents, and provider lists. Use stable keys and pass `extraData` when row rendering depends on external state.

### Text input

Use React Native `TextInput` for title, topics, search, and the v1 Markdown source editor.

Requirements:

- Markdown editor uses `multiline`.
- Android multiline input should set `textAlignVertical="top"` for top alignment.
- Keep text scaling enabled unless there is a documented accessibility exception.

### Theme

Supported theme settings:

- `system`
- `light`
- `dark`

Requirements:

- Configure Expo `userInterfaceStyle` to support system appearance.
- Use React Native `useColorScheme()` or `Appearance` to react to theme changes.
- Store the user override in local settings.
- `expo-system-ui` is needed if the app sets the root view background color or locks `userInterfaceStyle` on Android (which affects system bar appearance). If theming is handled entirely through React Native `useColorScheme()` and component-level styles, `expo-system-ui` may not be required. Evaluate during implementation whether system UI element customization is needed.

### Locale

Supported locales in v1:

- English (`en`)
- French (`fr`)

Requirements:

- Use `expo-localization` to inspect device locale.
- Store user override in local settings.
- Provide complete message catalogs for English and French before release.
- On Android, refresh locale-derived state when the app returns to foreground if relying on live device locale.

### Accessibility

Requirements:

- Custom interactive views must be accessible.
- Provide meaningful `accessibilityLabel` values.
- Use accessibility roles/states for buttons, toggles, selected catalogs, and disabled provider statuses.
- Test with Android TalkBack before release.

## App state handling

Use React Native `AppState` only for explicit foreground/background behavior, such as refreshing locale-derived values or sync status indicators. v1 sync is triggered on document open, after provider connect/reconnect, after autosave marks a document dirty, and at app start to resume dirty-document synchronization. This requirement does not define an OS-level background sync worker that continues while the app is closed.

### Autosave on app background

The debounced autosave timer runs while the app is active. When the app transitions to the background (detected via `AppState`), the current pending autosave must be flushed immediately so the document is saved before the app may be suspended. This applies to both editing and creating new documents. The sync service is not triggered from the background handler — only the local SQLite write and dirty-document flag are committed.

## Sources

- Expo SDK latest docs: https://docs.expo.dev/versions/latest/
- Expo Router introduction: https://docs.expo.dev/router/introduction/
- Expo Router navigation: https://docs.expo.dev/router/basics/navigation/
- Expo development builds: https://docs.expo.dev/develop/development-builds/introduction/
- Expo Android physical device setup: https://docs.expo.dev/get-started/set-up-your-environment/?platform=android&device=physical&mode=development-build
- Expo color themes: https://docs.expo.dev/develop/user-interface/color-themes/
- React Native `TextInput`: https://reactnative.dev/docs/textinput
- React Native `FlatList`: https://reactnative.dev/docs/flatlist
- React Native `Appearance`: https://reactnative.dev/docs/appearance
- React Native `useColorScheme`: https://reactnative.dev/docs/usecolorscheme
- React Native `AppState`: https://reactnative.dev/docs/appstate
- React Native accessibility: https://reactnative.dev/docs/accessibility
- `expo-localization`: https://docs.expo.dev/versions/latest/sdk/localization/
