import type { SQLiteDatabase } from 'expo-sqlite';

import {
  Catalogs,
  Documents,
  SyncConnections,
  getDatabase,
  type RemoteDocumentInput,
  type SyncConnection,
} from '@/db';
import { compareIso, nowIso } from '@/domain/time';
import { isPermanentFailure, isRetryReady, nextRetryState, type RetryState } from './backoff';
import { buildCatalogManifest, documentToRemote } from './mapping';
import { createProvider } from './providerRegistry';
import {
  ProviderUnavailableError,
  initialCatalogSyncState,
  type CatalogSyncState,
  type ProviderStatus,
  type RemoteDocument,
  type SyncProvider,
} from './types';

export interface ConflictInfo {
  catalogId: string;
  documentId: string;
}

export interface DocumentSyncOutcome {
  status: 'synced' | 'offline' | 'no_provider' | 'conflict' | 'failed';
}

type StateListener = (state: CatalogSyncState) => void;
type ConflictListener = (info: ConflictInfo) => void;

function remoteToInput(r: RemoteDocument): RemoteDocumentInput {
  return {
    id: r.documentId,
    catalogId: r.catalogId,
    title: r.title,
    topics: r.topics,
    body: r.bodyMarkdown,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
    remoteProviderKey: r.remoteKey ?? null,
    remoteUpdatedAt: r.updatedAt,
  };
}

/**
 * In-app asynchronous catalog sync service (technical/sync.md). Runs while the
 * app is active. Handles catalog-wide sync after connect/reconnect, dirty
 * processing after autosave and at app start, document-open priority sync,
 * latest-wins reconciliation, retry/backoff, and subscriber notifications.
 */
class CatalogSyncService {
  private states = new Map<string, CatalogSyncState>();
  private listeners = new Set<StateListener>();
  private conflictListeners = new Set<ConflictListener>();
  private locks = new Map<string, Promise<unknown>>();
  private retry = new Map<string, RetryState>(); // key: documentId
  private timers = new Map<string, ReturnType<typeof setTimeout>>(); // key: catalogId
  private started = false;

  // ---- Subscriptions ----

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onConflict(listener: ConflictListener): () => void {
    this.conflictListeners.add(listener);
    return () => this.conflictListeners.delete(listener);
  }

  getState(catalogId: string): CatalogSyncState | undefined {
    return this.states.get(catalogId);
  }

  private publish(state: CatalogSyncState): void {
    this.states.set(state.catalogId, state);
    for (const l of this.listeners) l(state);
  }

  private patch(
    catalogId: string,
    providerConnectionId: string | null,
    patch: Partial<CatalogSyncState>
  ): CatalogSyncState {
    const base =
      this.states.get(catalogId) ?? initialCatalogSyncState(catalogId, providerConnectionId);
    const next: CatalogSyncState = {
      ...base,
      ...patch,
      providerConnectionId,
      updatedAt: nowIso(),
    };
    this.publish(next);
    return next;
  }

  private notifyConflict(info: ConflictInfo): void {
    for (const l of this.conflictListeners) l(info);
  }

  // ---- Locking (one active run per catalog) ----

  private withCatalogLock<T>(catalogId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(catalogId) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    this.locks.set(
      catalogId,
      next.catch(() => undefined)
    );
    return next;
  }

  // ---- Provider resolution ----

  private async resolveProvider(
    db: SQLiteDatabase,
    catalogId: string
  ): Promise<{ connection: SyncConnection; provider: SyncProvider; status: ProviderStatus } | null> {
    const catalog = await Catalogs.getCatalog(db, catalogId);
    if (!catalog || !catalog.activeSyncConnectionId) return null;
    const connection = await SyncConnections.getConnection(db, catalog.activeSyncConnectionId);
    if (!connection || connection.disabledAt) return null;
    const provider = createProvider(connection);
    let status: ProviderStatus;
    try {
      status = await provider.status();
    } catch {
      status = 'unavailable';
    }
    return { connection, provider, status };
  }

  // ---- Lifecycle entry points ----

  /** App start: resume dirty-document synchronization (technical/sync.md). */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.processDirty();
  }

  /** Catalog-wide sync after a provider is connected or reconnected. */
  syncCatalog(catalogId: string): Promise<void> {
    return this.withCatalogLock(catalogId, () => this.runCatalogSync(catalogId));
  }

  /** Process dirty documents across all catalogs with an active provider. */
  async processDirty(): Promise<void> {
    const db = await getDatabase();
    const dirty = await Documents.listDirtyDocuments(db);
    const byCatalog = new Map<string, string[]>();
    for (const doc of dirty) {
      const list = byCatalog.get(doc.catalogId) ?? [];
      list.push(doc.id);
      byCatalog.set(doc.catalogId, list);
    }
    await Promise.all(
      [...byCatalog.keys()].map((catalogId) =>
        this.withCatalogLock(catalogId, () => this.runDirtySync(catalogId))
      )
    );
  }

  /** High-priority single document sync used on document open (UC-10). */
  syncDocumentOnOpen(catalogId: string, documentId: string): Promise<DocumentSyncOutcome> {
    return this.withCatalogLock(catalogId, () => this.runDocumentSync(catalogId, documentId));
  }

  /** Stop scheduled retries for a catalog (e.g. provider disconnected). */
  cancelCatalog(catalogId: string): void {
    const timer = this.timers.get(catalogId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(catalogId);
    }
    const existing = this.states.get(catalogId);
    if (existing && existing.status === 'running') {
      this.patch(catalogId, existing.providerConnectionId, { status: 'cancelled' });
    }
  }

  // ---- Core runs ----

  private async runCatalogSync(catalogId: string): Promise<void> {
    const db = await getDatabase();
    const resolved = await this.resolveProvider(db, catalogId);
    if (!resolved) {
      this.patch(catalogId, null, { status: 'idle', offline: false });
      return;
    }
    const { connection, provider, status } = resolved;
    if (status !== 'ready') {
      this.patch(catalogId, connection.id, {
        status: 'idle',
        offline: status === 'unavailable',
        lastError: status === 'needs_setup' ? 'needs_setup' : undefined,
      });
      return;
    }

    const catalog = await Catalogs.getCatalog(db, catalogId);
    if (!catalog) return;

    this.patch(catalogId, connection.id, {
      status: 'running',
      offline: false,
      completedDocuments: 0,
      updatedDocumentIds: [],
      lastError: undefined,
    });

    let manifest;
    try {
      manifest = await provider.getCatalogManifest(catalogId);
    } catch (err) {
      this.patch(catalogId, connection.id, {
        status: 'failed',
        offline: true,
        lastError: errorMessage(err),
      });
      this.scheduleRetry(catalogId);
      return;
    }

    const localDocs = await Documents.listAllDocumentsForCatalog(db, catalogId);
    const localById = new Map(localDocs.map((d) => [d.id, d]));
    const manifestById = new Map((manifest?.documents ?? []).map((e) => [e.documentId, e]));
    const unionIds = new Set<string>([...localById.keys(), ...manifestById.keys()]);

    const updated: string[] = [];
    const failed: string[] = [];
    let completed = 0;

    this.patch(catalogId, connection.id, { totalDocuments: unionIds.size });

    for (const docId of unionIds) {
      this.patch(catalogId, connection.id, { currentDocumentId: docId });
      const local = localById.get(docId) ?? null;
      const entry = manifestById.get(docId) ?? null;
      try {
        let didUpdate = false;
        let conflict = false;
        if (local && !entry) {
          await this.uploadLocal(db, provider, docId);
          didUpdate = true;
        } else if (!local && entry) {
          conflict = await this.downloadRemote(db, provider, catalogId, docId, false);
          didUpdate = true;
        } else if (local && entry) {
          if (compareIso(entry.updatedAt, local.updatedAt) > 0) {
            conflict = await this.downloadRemote(db, provider, catalogId, docId, local.dirty);
            didUpdate = true;
          } else if (local.dirty || compareIso(local.updatedAt, entry.updatedAt) > 0) {
            await this.uploadLocal(db, provider, docId);
            didUpdate = true;
          }
        }
        if (didUpdate) {
          updated.push(docId);
          this.retry.delete(docId);
        }
        if (conflict) {
          this.notifyConflict({ catalogId, documentId: docId });
          this.patch(catalogId, connection.id, { lastConflictDocumentId: docId });
        }
      } catch (err) {
        this.recordFailure(docId);
        if (isPermanentFailure(this.retry.get(docId))) failed.push(docId);
      }
      completed += 1;
      this.patch(catalogId, connection.id, {
        completedDocuments: completed,
        updatedDocumentIds: updated,
      });
    }

    // Rebuild and publish the manifest from current local state.
    try {
      const refreshed = await Documents.listAllDocumentsForCatalog(db, catalogId);
      const freshCatalog = (await Catalogs.getCatalog(db, catalogId)) ?? catalog;
      await provider.putCatalogManifest(buildCatalogManifest(freshCatalog, refreshed));
    } catch {
      // Manifest publish is best-effort; document content is the source of truth.
    }

    const permanentlyFailed = [...this.retry.entries()]
      .filter(([id, st]) => unionIds.has(id) && isPermanentFailure(st))
      .map(([id]) => id);

    this.patch(catalogId, connection.id, {
      status: failed.length > 0 ? 'failed' : 'completed',
      currentDocumentId: undefined,
      permanentlyFailedDocumentIds: permanentlyFailed,
      updatedDocumentIds: updated,
    });
    if (this.hasPendingRetries(catalogId)) this.scheduleRetry(catalogId);
  }

  private async runDirtySync(catalogId: string): Promise<void> {
    const db = await getDatabase();
    const resolved = await this.resolveProvider(db, catalogId);
    if (!resolved) {
      this.patch(catalogId, null, { status: 'idle' });
      return;
    }
    const { connection, provider, status } = resolved;
    if (status !== 'ready') {
      this.patch(catalogId, connection.id, {
        status: 'idle',
        offline: status === 'unavailable',
      });
      return;
    }

    const dirty = await Documents.listDirtyDocumentsForCatalog(db, catalogId);
    const pending = dirty.filter((d) => isRetryReady(this.retry.get(d.id), Date.now()));
    if (pending.length === 0) {
      this.patch(catalogId, connection.id, { status: 'idle', dirtyRemaining: dirty.length } as Partial<CatalogSyncState>);
      return;
    }

    this.patch(catalogId, connection.id, {
      status: 'running',
      offline: false,
      totalDocuments: pending.length,
      completedDocuments: 0,
      updatedDocumentIds: [],
    });

    const updated: string[] = [];
    let completed = 0;
    let anyFailure = false;

    for (const doc of pending) {
      this.patch(catalogId, connection.id, { currentDocumentId: doc.id });
      try {
        const conflict = await this.reconcileDocument(db, provider, catalogId, doc.id);
        updated.push(doc.id);
        this.retry.delete(doc.id);
        if (conflict) {
          this.notifyConflict({ catalogId, documentId: doc.id });
          this.patch(catalogId, connection.id, { lastConflictDocumentId: doc.id });
        }
      } catch {
        anyFailure = true;
        this.recordFailure(doc.id);
      }
      completed += 1;
      this.patch(catalogId, connection.id, {
        completedDocuments: completed,
        updatedDocumentIds: updated,
      });
    }

    const remaining = await Documents.listDirtyDocumentsForCatalog(db, catalogId);
    const permanentlyFailed = remaining
      .filter((d) => isPermanentFailure(this.retry.get(d.id)))
      .map((d) => d.id);

    this.patch(catalogId, connection.id, {
      status: anyFailure ? 'failed' : 'completed',
      currentDocumentId: undefined,
      permanentlyFailedDocumentIds: permanentlyFailed,
    });
    if (this.hasPendingRetries(catalogId)) this.scheduleRetry(catalogId);
  }

  private async runDocumentSync(
    catalogId: string,
    documentId: string
  ): Promise<DocumentSyncOutcome> {
    const db = await getDatabase();
    const resolved = await this.resolveProvider(db, catalogId);
    if (!resolved) return { status: 'no_provider' };
    const { connection, provider, status } = resolved;
    if (status !== 'ready') {
      this.patch(catalogId, connection.id, { offline: status === 'unavailable' });
      return { status: status === 'unavailable' ? 'offline' : 'no_provider' };
    }
    try {
      const conflict = await this.reconcileDocument(db, provider, catalogId, documentId);
      this.patch(catalogId, connection.id, {
        offline: false,
        updatedDocumentIds: [documentId],
      });
      if (conflict) {
        this.notifyConflict({ catalogId, documentId });
        this.patch(catalogId, connection.id, { lastConflictDocumentId: documentId });
        return { status: 'conflict' };
      }
      return { status: 'synced' };
    } catch (err) {
      this.recordFailure(documentId);
      this.patch(catalogId, connection.id, { offline: true, lastError: errorMessage(err) });
      this.scheduleRetry(catalogId);
      return { status: 'offline' };
    }
  }

  // ---- Reconciliation primitives (latest-wins) ----

  /** Reconcile one document by fetching its remote copy. Returns true on conflict. */
  private async reconcileDocument(
    db: SQLiteDatabase,
    provider: SyncProvider,
    catalogId: string,
    documentId: string
  ): Promise<boolean> {
    const local = await Documents.getDocumentForSync(db, documentId);
    const remote = await provider.getDocument(catalogId, documentId);
    const syncedAt = nowIso();

    if (local && !remote) {
      const put = await provider.putDocument(documentToRemote(local));
      await Documents.markDocumentUploaded(db, documentId, {
        providerKey: put.remoteKey,
        remoteUpdatedAt: put.remoteUpdatedAt,
        syncedAt,
      });
      return false;
    }
    if (!local && remote) {
      await Documents.applyRemoteDocument(db, remoteToInput(remote), syncedAt);
      return false;
    }
    if (local && remote) {
      if (compareIso(remote.updatedAt, local.updatedAt) > 0) {
        const wasDirty = local.dirty;
        await Documents.applyRemoteDocument(db, remoteToInput(remote), syncedAt);
        return wasDirty;
      }
      const put = await provider.putDocument(documentToRemote(local));
      await Documents.markDocumentUploaded(db, documentId, {
        providerKey: put.remoteKey,
        remoteUpdatedAt: put.remoteUpdatedAt,
        syncedAt,
      });
    }
    return false;
  }

  private async uploadLocal(
    db: SQLiteDatabase,
    provider: SyncProvider,
    documentId: string
  ): Promise<void> {
    const local = await Documents.getDocumentForSync(db, documentId);
    if (!local) return;
    const put = await provider.putDocument(documentToRemote(local));
    await Documents.markDocumentUploaded(db, documentId, {
      providerKey: put.remoteKey,
      remoteUpdatedAt: put.remoteUpdatedAt,
      syncedAt: nowIso(),
    });
  }

  private async downloadRemote(
    db: SQLiteDatabase,
    provider: SyncProvider,
    catalogId: string,
    documentId: string,
    localWasDirty: boolean
  ): Promise<boolean> {
    const remote = await provider.getDocument(catalogId, documentId);
    if (!remote) {
      // Remote file missing despite manifest entry: upload local instead.
      await this.uploadLocal(db, provider, documentId);
      return false;
    }
    await Documents.applyRemoteDocument(db, remoteToInput(remote), nowIso());
    return localWasDirty;
  }

  // ---- Retry bookkeeping ----

  private recordFailure(documentId: string): void {
    const next = nextRetryState(this.retry.get(documentId), Date.now());
    this.retry.set(documentId, next);
  }

  private hasPendingRetries(catalogId: string): boolean {
    void catalogId;
    for (const st of this.retry.values()) {
      if (!isPermanentFailure(st)) return true;
    }
    return false;
  }

  private scheduleRetry(catalogId: string): void {
    if (this.timers.has(catalogId)) return;
    const now = Date.now();
    let soonest = Infinity;
    for (const st of this.retry.values()) {
      if (!isPermanentFailure(st)) soonest = Math.min(soonest, st.nextAttemptAt);
    }
    if (!Number.isFinite(soonest)) return;
    const delay = Math.max(1_000, soonest - now);
    const timer = setTimeout(() => {
      this.timers.delete(catalogId);
      void this.withCatalogLock(catalogId, () => this.runDirtySync(catalogId));
    }, delay);
    this.timers.set(catalogId, timer);
  }

  /** Manual retry (clears backoff for the catalog's documents). */
  async retryNow(catalogId: string): Promise<void> {
    const db = await getDatabase();
    const dirty = await Documents.listDirtyDocumentsForCatalog(db, catalogId);
    for (const d of dirty) this.retry.delete(d.id);
    await this.withCatalogLock(catalogId, () => this.runDirtySync(catalogId));
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof ProviderUnavailableError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Sync error';
}

export const catalogSyncService = new CatalogSyncService();
export type { CatalogSyncState };
