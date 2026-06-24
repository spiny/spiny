# Technical Requirements: AI Assistant

Related docs: [Features](../product/features.md), [Constraints](../product/constraints.md), [Storage](storage.md), [Sync](sync.md), [Sources](../sources.md).

## v1 status

The assistant is a roadmap feature. In v1:

- The assistant screen must exist.
- AI provider settings must exist.
- Provider list should include Copilot and local agent if available, ordered by usage priority.
- Chat execution must be disabled or clearly marked unavailable.
- No document-modifying AI tool calls should run.

## Future capabilities

Future assistant features:

- Document classification and tag editing.
- Text proofreading.
- Linking a document to related documents.
- Helping build a mind map from document relationships.
- Tool calls for document search/create/edit/delete through Spiny's own harness.

Future provider integrations should use provider-supported SDKs or third-party libraries where they are compatible with Expo/React Native and the provider's security model. If a library is not React Native-compatible, or requires secrets that cannot safely live in the app bundle, the integration must be placed behind a backend or serverless adapter.

## Security constraints

Do not ship app-owned AI provider secrets inside the mobile app.

Relevant documented constraints:

- Expo public environment variables are embedded in the app bundle and are not secret.
- React Native security guidance says sensitive API keys in app code can be inspected.
- OpenAI's official JavaScript/TypeScript SDK states React Native is not supported at this time.
- OpenAI API keys are secrets and must not be exposed in client-side code.

Implications:

- If an AI provider requires app-owned secrets, route through a backend or serverless function.
- If a future provider supports mobile-safe short-lived tokens, use those instead of long-lived secrets.
- If supporting user-provided keys directly, store them as user secrets in `expo-secure-store` and disclose the risk; this still requires provider-specific review.

## Provider abstraction

Future code should use a provider abstraction rather than coupling the app to one vendor.

Proposed interface:

```ts
type AssistantProvider = {
  kind: 'copilot' | 'openai' | 'local_agent' | string;
  label: string;
  status(): Promise<'unavailable' | 'needs_setup' | 'ready'>;
  sendMessage(request: AssistantRequest): Promise<AssistantResponse>;
};
```

This interface is a design target for future implementation, not v1 functional code.

## Tool harness

The app must own all tools exposed to an AI assistant. Providers should not manipulate SQLite directly.

Future tools:

| Tool | Purpose | Safety requirement |
| --- | --- | --- |
| `catalog.current` | Read active catalog metadata | Read-only |
| `document.search` | Search active catalog index | Read-only |
| `document.read` | Read selected document | Read-only |
| `document.create` | Create a new document | User confirmation or explicit user request |
| `document.update` | Edit title/topics/body | Confirmation for broad changes |
| `document.delete` | Delete a document | Always confirm |
| `document.classify` | Suggest topics/tags | Suggestion first; user applies |
| `document.proofread` | Suggest text edits | Suggestion first; user applies |
| `document.suggest_links` | Suggest related documents | Read-only suggestions |
| `document.relationships` | Read document relationship graph/navigation context | Read-only |

## Copilot limitation

Current public Copilot documentation focuses on Copilot SDK, CLI/server, and editor-extension integrations, not a general mobile LLM API for Expo apps. Therefore Copilot must remain a non-functional provider option until a supported integration path is identified and sourced.

## Local agent limitation

A local agent may be available only if the device or network exposes one. v1 must not assume a local model runtime exists on Android or iOS. The settings UI may show local agent discovery/status, but execution belongs to the roadmap phase.

## Roadmap stages

1. **v1**: Assistant screen and settings only; no execution.
2. **Provider spike**: Validate provider auth, mobile security model, and SDK compatibility.
3. **Read-only tools**: Search/read/classify suggestions without writes.
4. **User-confirmed writes**: Create/update/delete with explicit confirmation.
5. **Mind map support**: Store and display document relationships after the data model is extended.

## Sources

- Expo environment variable security: https://docs.expo.dev/guides/environment-variables/#security-considerations
- React Native security: https://reactnative.dev/docs/security#storing-sensitive-info
- `expo-secure-store`: https://docs.expo.dev/versions/latest/sdk/securestore/
- OpenAI JS/TS SDK requirements: https://github.com/openai/openai-node#requirements
- OpenAI API authentication: https://developers.openai.com/api/docs/api-reference/authentication
- OpenAI Realtime client secrets: https://developers.openai.com/api/docs/api-reference/realtime-sessions/create-realtime-client-secret
- GitHub Copilot SDK local CLI: https://docs.github.com/en/copilot/how-tos/copilot-sdk/setup/local-cli
- GitHub Copilot SDK backend services: https://docs.github.com/en/copilot/how-tos/copilot-sdk/setup/backend-services
- VS Code Language Model API: https://code.visualstudio.com/api/extension-guides/language-model
