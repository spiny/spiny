# Product Use Cases

Related docs: [Features](features.md), [Constraints](constraints.md), [Storage](../technical/storage.md), [Sync](../technical/sync.md), [AI assistant](../technical/ai-assistant.md).

## Actors

- **Author**: The primary user who captures, edits, searches, and organizes thoughts.
- **Catalog owner**: The same user when configuring catalog metadata and sync.
- **Assistant user**: A future user of AI-assisted classification, proofreading, and linking. In v1, the assistant UX is present but non-functional.

## Use case summary

| ID | Use case | Priority | v1 status |
| --- | --- | --- | --- |
| UC-01 | Open the active catalog home | High | Required |
| UC-02 | Create a catalog | High | Required |
| UC-03 | Select a different catalog | High | Required |
| UC-04 | Create a quick thought | High | Required |
| UC-05 | Edit and autosave a document | High | Required |
| UC-06 | Delete a document | High | Required |
| UC-07 | Search within the active catalog | High | Required |
| UC-08 | Edit catalog settings | High | Required |
| UC-09 | Configure app settings | High | Required |
| UC-10 | Sync a document on open | High | Required |
| UC-11 | Disconnect/reconnect catalog sync and start catalog sync | Medium | Required |
| UC-12 | Navigate document history and relationships | High | Required |
| UC-13 | Use assistant chat | Medium | UX only in v1 |

## UC-01: Open the active catalog home

**Goal**: Resume work quickly in the currently active catalog.

**Main flow**:

1. User opens Spiny.
2. App loads the active catalog.
3. App shows the home screen with the last edited documents for that catalog.
4. User can create a new document, edit catalog settings, select/create a catalog, search, or edit app settings.

**Acceptance criteria**:

- Home never requires network access to display local data.
- The document list is ordered by last edited timestamp.
- Empty catalogs show an empty state with a create-document action.

## UC-02: Create a catalog

**Goal**: Start a separate thought repository.

**Main flow**:

1. User opens the catalog selector.
2. User chooses create catalog.
3. User enters at least a title; description is optional.
4. App creates a local catalog and makes it selectable.

**Acceptance criteria**:

- Catalogs are created locally first.
- A new catalog has no sync provider until configured.
- Catalog metadata can later be edited from catalog settings.

## UC-03: Select a different catalog

**Goal**: Switch between independent repositories.

**Main flow**:

1. User opens the catalog selector.
2. App shows a simple list of catalogs.
3. User selects one catalog.
4. App returns to home for that catalog.

**Acceptance criteria**:

- Catalog selector has actions to go back home and create a new catalog.
- Switching catalogs updates the active-catalog setting.

## UC-04: Create a quick thought

**Goal**: Capture a thought with minimal friction.

**Main flow**:

1. User taps create new document.
2. App opens the document editor.
3. User enters title, topics/tags, and Markdown body.
4. App autosaves changes locally.

**Acceptance criteria**:

- No explicit save action is required.
- A blank or untitled document has a safe local draft state.
- The user can return home at any time.

## UC-05: Edit and autosave a document

**Goal**: Continue editing a thought without managing files manually.

**Main flow**:

1. User opens a document from home or search.
2. App performs document-open sync when a provider is configured.
3. User edits title, topics/tags, or Markdown body.
4. App autosaves locally and updates the catalog index.

**Acceptance criteria**:

- Autosave updates the document row and catalog index together.
- The latest local edit timestamp is updated whenever content changes.
- If sync is configured, latest-wins conflict behavior is documented to the user.
- Autosave marks the document dirty and triggers the asynchronous sync service to process dirty documents in the background.
- If dirty-document sync fails, the dirty state remains and synchronization is retried later.
- When the app transitions to the background, any pending autosave is flushed immediately so the document is saved before the app may be suspended.
- If a remote document is newer and overwrites local dirty changes, the user is notified (e.g., a toast, sync history entry, or in-editor banner) that local changes were replaced. The overwritten content is not recoverable in v1.

## UC-06: Delete a document

**Goal**: Remove a thought from the catalog.

**Main flow**:

1. User opens a document.
2. User chooses delete.
3. App asks for confirmation.
4. App marks the document deleted and removes it from normal lists/search.

**Acceptance criteria**:

- Deletion is represented with a timestamped tombstone so sync can propagate it.
- Deleted documents are excluded from home and search results.

## UC-07: Search within the active catalog

**Goal**: Find thoughts quickly.

**Main flow**:

1. User opens search.
2. App shows a single search field.
3. User enters text.
4. App searches the active catalog index and lists matching documents.
5. User opens a result.

**Acceptance criteria**:

- Search is scoped to the active catalog.
- Search works offline.
- Results include enough context to identify documents, such as title and topics.

## UC-08: Edit catalog settings

**Goal**: Manage catalog identity and sync selection.

**Main flow**:

1. User opens catalog settings.
2. App shows title, description, and sync provider state.
3. User edits metadata or connects/disconnects a provider.

**Acceptance criteria**:

- A catalog can be connected to only one sync provider at a time.
- Disconnecting a provider does not delete local catalog data.

## UC-09: Configure app settings

**Goal**: Configure global preferences and provider connections.

**Main flow**:

1. User opens app settings.
2. User can set theme: dark, light, or system.
3. User can set locale: English or French for now.
4. User can manage storage connections: Google Drive, SSH/SFTP, FTP.
5. User can view AI agent providers ordered by usage priority.

**Acceptance criteria**:

- Storage connections are app-level resources.
- Catalogs reference an existing storage connection when sync is enabled.
- AI provider controls are visible but clearly non-functional in v1.

## UC-10: Sync a document on open

**Goal**: Keep a document reasonably current across devices without requiring continuous OS-level background sync.

**Main flow**:

1. User opens a document.
2. App checks whether the catalog has a sync provider.
3. App attempts to load remote metadata/content for that document:
   - If the network is unavailable or the fetch fails, the local document is opened immediately and sync is deferred.
   - The sync status indicator reflects the failure so the user knows the document may be stale.
4. App compares local and remote document timestamps.
5. The newest document wins.
6. App opens the winning content in the editor and updates local/remote state as required.

**Acceptance criteria**:

- Sync is bidirectional on document open.
- v1 does not merge concurrent edits.
- v1 does not keep historical document versions.
- Future document versioning is documented as a roadmap feature.
- Document-open sync must coordinate with the catalog sync service so the same document is not synchronized by two competing flows at the same time.
- When a remote document is newer and overwrites local content on open, the user sees a notification that local changes were replaced.
- When the provider is configured but the network is unavailable, the local document opens immediately and the sync service retries later.

## UC-11: Disconnect/reconnect catalog sync and start catalog sync

**Goal**: Move a catalog between storage providers when needed and then synchronize the current catalog.

**Main flow**:

1. User opens catalog settings.
2. User disconnects the current provider.
3. User selects another configured provider.
4. App records the new provider for future document-open sync.
5. App automatically starts an asynchronous catalog sync service for the current catalog.

**Catalog sync service behavior**:

1. Service performs a remote lookup for the current catalog.
2. Service compares local and remote document timestamps for every document known locally or remotely.
3. For each document, the latest timestamp wins.
4. Service downloads newer remote documents or uploads newer local documents.
5. Service updates local document rows and catalog index rows as documents synchronize.
6. Home, search, editor, settings, and other interested app components can subscribe to service status and document-level updates.

**Acceptance criteria**:

- Only one provider is active for a catalog.
- Switching providers does not delete local documents.
- Provider-specific remote initialization occurs only after the user confirms.
- The catalog sync service runs asynchronously so the app remains usable.
- Subscribed components receive enough status to show running, completed, failed, and per-document update states.
- Latest-wins behavior is consistent with document-open sync.
- The same service also resumes dirty-document synchronization at app start and stops when no dirty documents remain.

## UC-12: Navigate document history and relationships

**Goal**: Move between related or recently viewed documents without linear back/forward document-history buttons.

**Main flow**:

1. User opens a document.
2. App records a document navigation history event.
3. App loads recently viewed documents and document relationships for the active catalog.
4. App shows a navigation graph or a recently viewed documents view with the current document highlighted.
5. User selects a related or recently viewed document.
6. App opens the selected document, records the navigation event, and refreshes the highlighted current document.

**Acceptance criteria**:

- The document editor does not use document-history back and forward buttons.
- The current document is visually highlighted in the graph or recently viewed view.
- Recently viewed documents are scoped to the active catalog.
- Deleted documents are excluded from navigation history display and relationship navigation.
- Explicit Spiny document links in Markdown create or update document relationship records.
- Document navigation works offline from local SQLite data.
- **Navigation history retention**: The most recent 20 navigation events per catalog are retained. Older entries are pruned automatically.
- **Mind map actions**: The navigation graph (mind map) supports selecting one or more document nodes and executing copy or move actions on the selection.
- **Relationship populating**: When loading the mind map, unvisited document relationships are populated from `document_relationships` for navigation context, even if no navigation event exists for those documents yet.

## UC-13: Use assistant chat

**Goal**: Later, ask an AI assistant to classify, proofread, or link documents.

**v1 behavior**:

- Assistant screen exists.
- Provider setup/status is visible.
- Chat execution and tool calls are disabled or explicitly marked unavailable.

**Future acceptance criteria**:

- Assistant can call Spiny-owned tools for document search/create/edit/delete.
- Assistant can suggest tags, proofread text, and suggest links to related documents.
- User remains in control before destructive changes are applied.
