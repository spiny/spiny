# Technical Requirements: Markdown Editor

Related docs: [Use cases](../product/use-cases.md), [Storage](storage.md), [Platform](platform.md), [Sources](../sources.md).

## Obsidian reference check

Obsidian's official help describes separate experiences for editing and reading notes. Obsidian developer documentation states that the Markdown editor is powered by CodeMirror 6, and editor extensions register CodeMirror extensions. Reading view rendering is handled through Markdown post-processing rather than the editor extension path.

Implication for Spiny: matching Obsidian's Live Preview behavior is not a small UI choice; it would require a substantial editor/rendering integration. Spiny v1 should therefore implement the project owner's fallback: a simple Markdown text editor with a separate preview mode.

## v1 editor decision

Use React Native `TextInput` for Markdown source editing and provide a separate preview mode.

Requirements:

- Store raw Markdown in `documents.body_markdown`.
- Do not transform Markdown source during editing except for direct user input.
- Provide title and topics fields above the Markdown body.
- Autosave title, topics, and Markdown body.
- Provide a preview toggle or tab that renders the current Markdown.
- Return to home without requiring manual save.
- Delete document with confirmation.
- Provide document navigation through a graph or recently viewed documents view with the current document highlighted.
- Do not provide document-history back/forward buttons as the primary document navigation pattern.

## Editor screen structure

Required regions:

1. Header: back action, delete action, sync/status indicator when relevant.
2. Title input.
3. Topics/tags input.
4. Markdown helper toolbar.
5. Markdown source editor.
6. Document navigation surface.
7. Preview mode.
8. Autosave status, if useful and non-intrusive.

## Markdown source editor requirements

- Use `TextInput` with `multiline`.
- On Android, align multiline text to the top.
- Preserve cursor/selection as much as React Native permits.
- Avoid aggressive formatting shortcuts in v1.
- Support large notes gracefully, but optimize for quick thoughts rather than book-length documents.
- **Size limit**: Maximum 64 KB for `body_markdown` (byte length, not character count). The UI should warn when approaching this limit. Truncation on save is acceptable if the limit is exceeded, with a user-visible warning.

## Markdown helper toolbar

The editor must provide a lightweight toolbar for common Markdown markup. Toolbar actions modify the Markdown source text directly and then rely on the normal autosave path.

Required toolbar actions:

| Action | Markdown behavior |
| --- | --- |
| Bold | Wrap selection with `**`; if no selection, insert `**bold text**` placeholder. |
| Italic | Wrap selection with `*`; if no selection, insert `*italic text*` placeholder. |
| Heading 1 | Prefix current line or selected lines with `# `. |
| Heading 2 | Prefix current line or selected lines with `## `. |
| Heading 3 | Prefix current line or selected lines with `### `. |
| Heading 4 | Prefix current line or selected lines with `#### `. |
| Heading 5 | Prefix current line or selected lines with `##### `. |
| Horizontal rule | Insert `---` on its own line. |
| Link to document | Opens the same document search UI, then inserts a Markdown link to the selected document. |
| External link | Opens a dialog to enter/paste the URL, then inserts a Markdown link. |

### Selection and insertion rules

- Toolbar actions must use the current `TextInput` selection when available.
- Bold and italic wrap selected text. With no selection, they insert placeholders and should place the cursor inside or after the placeholder when practical.
- Heading actions apply to the current line if there is no multi-line selection. For multi-line selections, apply the heading prefix to each selected line.
- Horizontal rule must be inserted on a separate line, preserving surrounding text by adding newlines as needed.
- Document link uses the same search experience defined for the Search screen, scoped to the active catalog.
- External link shows a dialog for the URL.
- For both document links and external links:
  - If text is selected, wrap it as Markdown link text using CommonMark inline link syntax: square-bracketed link text followed by a parenthesized target.
  - If no text is selected, insert placeholder link text using the same inline link syntax.
  - If no target has been selected/provided yet, insert a safe placeholder target, for example `[link text](spiny://document/document-id)` for document links or `[link text](https://example.com)` for external links.

### Document link target format

The exact internal document-link URL format must be finalized during implementation. Until then, use a provider-neutral app URI shape in requirements and tests:

```md
[Document title](spiny://document/{documentId})
```

Requirements:

- The selected document id must be stable across local storage and sync.
- Preview rendering should display the link text.
- Link activation opens the linked document, records a navigation event, and refreshes the document navigation surface.
- Inserting or removing document links updates document relationship records on autosave.
- **Link resolution**: Document links resolve only to existing documents. Document URLs cannot be predicted for documents that do not yet exist. When the link-to-document search dialog is used, it must only show existing documents in the active catalog. If a linked document is later deleted, the link text in the source document's Markdown persists but the link activation fails gracefully (e.g., show a "document not found" message).

## Document navigation surface

The editor must expose document navigation context without document-history back/forward buttons.

Required representation:

- Show either a navigation graph or a recently viewed documents view.
- The current document must be visually highlighted.
- The view must be scoped to the active catalog.
- The view must exclude deleted documents.
- Selecting a document in the navigation surface opens it and records a new navigation history event.

Graph requirements, if graph representation is used:

- Include the current document node.
- Include outgoing document links from the current document.
- Include backlinks from documents that link to the current document.
- Distinguish the current node visually.
- Use local `document_relationships` data.

Recently viewed requirements, if list/card representation is used:

- Show recently opened documents from local navigation history.
- Show each document once, ordered by most recent view.
- Highlight the current document.
- Include title and enough context, such as topics or last opened timestamp.

Implementation note: a recently viewed list is acceptable for lean v1. A graph renderer may be added if it performs well on the Android physical device.

## Preview requirements

Minimum preview:

- Render headings, paragraphs, emphasis, links, lists, block quotes, and code blocks if supported by the selected renderer.
- If a renderer does not support a Markdown feature, show a safe fallback instead of corrupting document source.

Selection requirement before implementation:

- Choose and validate a React Native-compatible Markdown renderer on Android.
- Record the chosen renderer and its source documentation in this file before implementation.

Known options from current research:

- `react-native-marked` is a community React Native renderer based on Marked.js.
- `react-native-markdown-display` is a community renderer, but its README says it is no longer actively maintained and recommends `react-native-enriched-markdown`.
- `react-native-enriched-markdown` and `@expensify/react-native-live-markdown` provide richer input/rendering paths but require modern native architecture/development-build validation and are not Expo Go-only choices.
- `react-native-webview` can host a web editor/renderer, but that adds a bridge, accessibility, and performance considerations.

### Implementation decision (v1)

The v1 preview uses a **small in-app Markdown renderer** (`src/markdown/parser.ts` +
`src/markdown/MarkdownPreview.tsx`) built on React Native primitives rather than a
third-party renderer. Rationale:

- It covers exactly the documented v1 feature set (headings, paragraphs, emphasis,
  links, lists, block quotes, code blocks) and falls back to literal text for any
  unrecognized syntax, so it can never corrupt the stored Markdown source.
- It needs no additional native dependency (e.g. `react-native-svg` required by
  `react-native-marked`), so it runs unchanged in Expo Go and development builds and
  avoids React 19 peer-dependency risk.
- It gives full control over `spiny://document/{id}` link activation, which must open
  the linked document and record a navigation event.

Community renderers reviewed before this decision: `react-native-marked` (maintained,
requires `react-native-svg`), `react-native-markdown-display` (pure JS but no longer
actively maintained), and `react-native-enriched-markdown` / `@expensify/react-native-live-markdown`
(richer, but require native-architecture validation). These remain candidates if a
richer preview is pursued later (see the spike below).

## Future richer editor considerations

Do not promise these in v1:

- Obsidian-compatible Live Preview.
- Wikilinks, embeds, callouts, or properties.
- CodeMirror extension compatibility.
- WYSIWYG editing.

If richer editing becomes a target, create a technical spike comparing:

1. Native rich Markdown input libraries.
2. WebView-hosted CodeMirror 6.
3. Continuing TextInput plus preview.

The spike must test Android physical-device performance, keyboard behavior, selection behavior, accessibility, and Expo development-build requirements.

## Sources

- Obsidian edit/read help: https://obsidian.md/help/edit-and-read
- Obsidian editor extensions: https://docs.obsidian.md/Plugins/Editor/Editor+extensions
- Obsidian Markdown post-processing: https://docs.obsidian.md/Plugins/Editor/Markdown+post+processing
- Obsidian Editor API: https://docs.obsidian.md/Reference/TypeScript+API/Editor
- CodeMirror reference: https://codemirror.net/docs/ref/
- React Native `TextInput`: https://reactnative.dev/docs/textinput
- CommonMark Markdown reference: https://commonmark.org/help/
- Expo customization/native library constraints: https://docs.expo.dev/workflow/customizing/
- Expo development builds: https://docs.expo.dev/develop/development-builds/introduction/
- `react-native-webview` Expo docs: https://docs.expo.dev/versions/latest/sdk/webview/
- `react-native-marked` community source: https://github.com/gmsgowtham/react-native-marked
- `react-native-markdown-display` community source: https://github.com/iamacup/react-native-markdown-display
- `react-native-enriched-markdown` community source: https://github.com/software-mansion/react-native-enriched-markdown
- `@expensify/react-native-live-markdown` community source: https://github.com/Expensify/react-native-live-markdown
