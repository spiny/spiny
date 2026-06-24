# Product Features

Related docs: [Use cases](use-cases.md), [Constraints](constraints.md), [Platform](../technical/platform.md), [Editor](../technical/editor.md), [Sync](../technical/sync.md).

## Product principles

1. **Local-first**: Spiny works with local data by default.
2. **Serverless by default**: Core notes, catalogs, and search do not require a Spiny-hosted backend.
3. **Lean UI**: Every primary screen should support quick capture or retrieval.
4. **Opinionated sync**: Catalogs sync through user-owned storage providers, one provider per catalog.
5. **Roadmap-aware AI**: AI UX exists early, but assistant execution is not part of v1 functionality.

## Screens and required actions

### Home

Purpose: show the active catalog and recent activity.

Required content/actions:

- List of last edited documents for the active catalog.
- Create new document.
- Open catalog settings.
- Select or create a different catalog.
- Open search.
- Open application settings.

### Document editor

Purpose: quick-draft and edit a thought.

Required content/actions:

- Title field.
- Topics/tags field.
- Markdown editor.
- Separate Markdown preview mode in v1.
- Document navigation surface showing a graph or recently viewed documents with the current document highlighted.
- Back to home.
- Delete document.
- Autosave; no manual save required.

### Catalog selector

Purpose: switch repositories.

Required content/actions:

- Simple list of catalogs.
- Back home.
- Create new catalog.
- Import a catalog from an archive. Create and import are presented in a floating action menu (see [Storage](../technical/storage.md): "Catalog export/import archive").

### Catalog settings

Purpose: edit catalog properties and sync provider selection.

Required content/actions:

- Catalog title.
- Catalog description.
- Current sync provider, if any.
- Connect/disconnect provider action.
- Provider switching must preserve local data.
- Export the catalog to a portable archive (see [Storage](../technical/storage.md): "Catalog export/import archive").

### Search

Purpose: find documents in the active catalog.

Required content/actions:

- Single search field.
- List of matching document results.
- Open selected result.

### Application settings

Purpose: manage global preferences and provider connections.

Required content/actions:

- Theme: dark, light, system.
- Locale: English and French for now.
- Sync providers: Google Drive, SSH/SFTP, FTP.
- AI providers: Copilot, local agent if available, and future providers ordered by usage priority.

### Assistant

Purpose: prepare for future AI-assisted workflows.

Required v1 behavior:

- Chat-like screen is present.
- Shows provider status/setup state.
- Clearly indicates that assistant execution is not enabled yet.

Future behavior:

- AI-assisted document classification/tag editing.
- Text proofreading.
- Linking documents to related documents to help build a mind map.
- Tool calls through a Spiny-owned tool harness.

## Data concepts

### Catalog

A catalog is a self-contained thought repository. In the SQLite implementation, it is stored as a row in `catalogs` and represented for sync as a catalog manifest containing metadata and an index summary.

Required fields:

- Identifier.
- Title.
- Description.
- Active sync provider reference, if connected.
- Updated timestamp.

### Document

A document is one Markdown thought in one catalog.

Required fields:

- Identifier.
- Catalog identifier.
- Title.
- Topics/tags.
- Markdown body (max 64 KB byte length).
- Created and updated timestamps.
- Deletion timestamp when removed.
- Sync metadata.

### Catalog index

The catalog index supports search. It contains searchable document metadata derived from document rows.

Required fields:

- Catalog identifier.
- Document identifier.
- Searchable title.
- Searchable topics/tags.
- Searchable excerpt or body-derived text.
- Indexed timestamp.

### Document relationship

A document relationship records how two documents relate to each other. In v1, relationships are derived from explicit Spiny document links inserted into Markdown. Future assistant features may suggest additional relationships, but user confirmation is required before writing them.

Required fields:

- Catalog identifier.
- Source document identifier.
- Target document identifier.
- Relationship type/source.
- Created and updated timestamps.

### Document navigation history

Navigation history records document opens so Spiny can show recently viewed documents. It is local-first and scoped by catalog.

Retention: the most recent 20 navigation events per catalog are kept; older entries are pruned automatically.

Required fields:

- Catalog identifier.
- Current document identifier.
- Optional source document identifier.
- Open timestamp.
- Open source, such as home, search, document link, or navigation surface.

## v1 feature matrix

| Feature | v1 requirement | Notes |
| --- | --- | --- |
| Local catalog storage | Functional | SQLite |
| Local document storage | Functional | SQLite |
| Catalog export/import | Functional | Portable ZIP archive; non-secret local content only; shares layout with Drive remote |
| Home recent list | Functional | Active catalog only |
| Markdown editing | Functional | Text editor plus preview; 64 KB byte limit on body |
| Markdown helper toolbar | Functional | Bold, italic, headings, horizontal rule, document link, external link |
| Document navigation | Functional | Graph or recently viewed documents with current document highlighted; no document-history back/forward buttons |
| Autosave | Functional | Local first; marks edited documents dirty and triggers async sync when provider exists |
| Search | Functional | Uses catalog index |
| Theme setting | Functional | Dark/light/system |
| Locale setting | Functional | English/French |
| Google Drive sync | Functional target | Uses official Drive HTTP APIs/OAuth |
| SSH/SFTP sync | Functional target with feasibility constraint | Requires native/third-party validation |
| FTP sync | Functional target with feasibility constraint | Requires native/third-party validation |
| Document-open sync | Functional | Latest document wins |
| Catalog-wide async sync service | Functional | Starts after sync provider connect/reconnect for the current catalog |
| Dirty-document async sync | Functional | Starts after autosave and app start; stops when no dirty documents remain |
| Version history | Not v1 | Roadmap |
| AI assistant UI | Visible | Non-functional in v1 |
| AI tool execution | Not v1 | Roadmap |

## Provider naming

- **Google Drive** is the v1 Google storage provider name used in technical docs. The product notes also mention "Google Docs"; for v1 this is interpreted as Google-owned document storage through Drive APIs, not as editing native Google Docs files.
- **SSH/SFTP** means file transfer over an SSH-based connection. The exact protocol and library support must be validated before release.

## Explicit non-goals for v1

- Real-time collaboration.
- Multi-user permissions.
- Spiny-hosted cloud account.
- OS-level background sync while the app is closed.
- Merge conflict resolution.
- Historical document versions.
- Full mind-map editor beyond the document navigation view. (The navigation graph supports selecting one or more document nodes for copy/move actions, but it is not a general-purpose mind-map editor.)
- Full Obsidian plugin compatibility.
- Full Obsidian Live Preview parity.
