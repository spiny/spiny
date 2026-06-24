# Sources

Sources were gathered for documentation work on 2026-06-20. Re-check exact version numbers before starting implementation because framework documentation changes over time.

## Expo and React Native

- Expo SDK latest docs: https://docs.expo.dev/versions/latest/
- Expo Router introduction: https://docs.expo.dev/router/introduction/
- Expo Router core concepts: https://docs.expo.dev/router/basics/core-concepts/
- Expo Router navigation: https://docs.expo.dev/router/basics/navigation/
- Expo development builds: https://docs.expo.dev/develop/development-builds/introduction/
- Expo dev client: https://docs.expo.dev/versions/latest/sdk/dev-client/
- Expo Android physical device setup: https://docs.expo.dev/get-started/set-up-your-environment/?platform=android&device=physical&mode=development-build
- Expo customization/native library constraints: https://docs.expo.dev/workflow/customizing/
- Expo Modules API: https://docs.expo.dev/modules/overview/
- Expo color themes: https://docs.expo.dev/develop/user-interface/color-themes/
- React Native networking: https://reactnative.dev/docs/network
- React Native `TextInput`: https://reactnative.dev/docs/textinput
- React Native `FlatList`: https://reactnative.dev/docs/flatlist
- React Native `SectionList`: https://reactnative.dev/docs/sectionlist
- React Native `Appearance`: https://reactnative.dev/docs/appearance
- React Native `useColorScheme`: https://reactnative.dev/docs/usecolorscheme
- React Native `AppState`: https://reactnative.dev/docs/appstate
- React Native accessibility: https://reactnative.dev/docs/accessibility
- React Native security: https://reactnative.dev/docs/security#storing-sensitive-info

## Expo packages

- `expo-sqlite`: https://docs.expo.dev/versions/latest/sdk/sqlite/
- `expo-secure-store`: https://docs.expo.dev/versions/latest/sdk/securestore/ (note: iOS may reject values > ~2048 bytes)
- `expo-system-ui`: https://docs.expo.dev/versions/latest/sdk/system-ui/
- `expo-localization`: https://docs.expo.dev/versions/latest/sdk/localization/
- `expo-file-system` (new `File`/`Directory`/`Paths` API; legacy API in `expo-file-system/legacy`): https://docs.expo.dev/versions/latest/sdk/filesystem/
- `expo-auth-session`: https://docs.expo.dev/versions/latest/sdk/auth-session/
- `react-native-webview` Expo docs: https://docs.expo.dev/versions/latest/sdk/webview/
- Expo environment variable security: https://docs.expo.dev/guides/environment-variables/#security-considerations

## Obsidian and Markdown editor research

- Obsidian edit/read help: https://obsidian.md/help/edit-and-read
- Obsidian Editor API: https://docs.obsidian.md/Reference/TypeScript+API/Editor
- Obsidian MarkdownView editor API: https://docs.obsidian.md/Reference/TypeScript+API/MarkdownView/editor
- Obsidian editor extensions: https://docs.obsidian.md/Plugins/Editor/Editor+extensions
- Obsidian Markdown post-processing: https://docs.obsidian.md/Plugins/Editor/Markdown+post+processing
- Obsidian API type definitions: https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts
- CodeMirror reference: https://codemirror.net/docs/ref/
- CommonMark Markdown reference: https://commonmark.org/help/
- `react-native-marked` community source: https://github.com/gmsgowtham/react-native-marked
- `react-native-markdown-display` community source: https://github.com/iamacup/react-native-markdown-display
- `react-native-enriched-markdown` community source: https://github.com/software-mansion/react-native-enriched-markdown
- `@expensify/react-native-live-markdown` community source: https://github.com/Expensify/react-native-live-markdown

## SQLite

- SQLite FTS5: https://www.sqlite.org/fts5.html
- Expo SQLite enables FTS5 by default via `enableFTS: true` in config plugin: https://docs.expo.dev/versions/latest/sdk/sqlite/#configuration-in-app-config

## Google Drive and OAuth

- Google OAuth native apps: https://developers.google.com/identity/protocols/oauth2/native-app
- Google Drive uploads: https://developers.google.com/workspace/drive/api/guides/manage-uploads
- Google Drive downloads/exports: https://developers.google.com/workspace/drive/api/guides/manage-downloads
- Google Drive search/list: https://developers.google.com/workspace/drive/api/guides/search-files
- Google Drive app data folder: https://developers.google.com/workspace/drive/api/guides/appdata
- Google Drive scopes: https://developers.google.com/workspace/drive/api/guides/api-specific-auth

## SSH/SFTP candidates

- `ssh2` candidate Node.js SSH/SFTP library: https://github.com/mscdex/ssh2

## AI providers and security

- OpenAI JS/TS SDK requirements: https://github.com/openai/openai-node#requirements
- OpenAI API authentication: https://developers.openai.com/api/docs/api-reference/authentication
- OpenAI Realtime client secrets: https://developers.openai.com/api/docs/api-reference/realtime-sessions/create-realtime-client-secret
- GitHub Copilot SDK local CLI: https://docs.github.com/en/copilot/how-tos/copilot-sdk/setup/local-cli
- GitHub Copilot SDK backend services: https://docs.github.com/en/copilot/how-tos/copilot-sdk/setup/backend-services
- VS Code Language Model API: https://code.visualstudio.com/api/extension-guides/language-model
