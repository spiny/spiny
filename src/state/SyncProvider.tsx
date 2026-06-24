import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { catalogSyncService, type CatalogSyncState } from '@/sync';
import { useI18n } from './I18nProvider';
import { useToast } from './ToastProvider';

interface SyncContextValue {
  states: Map<string, CatalogSyncState>;
  getState: (catalogId: string) => CatalogSyncState | undefined;
  syncCatalog: (catalogId: string) => Promise<void>;
  retryNow: (catalogId: string) => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

/**
 * Bridges the catalog sync service to React: resumes dirty sync at app start
 * and on foreground, republishes per-catalog state, and surfaces conflict
 * notifications as toasts (technical/sync.md subscription + conflict notice).
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [states, setStates] = useState<Map<string, CatalogSyncState>>(new Map());

  useEffect(() => {
    const unsubscribe = catalogSyncService.subscribe((state) => {
      setStates((prev) => {
        const next = new Map(prev);
        next.set(state.catalogId, state);
        return next;
      });
    });
    const unConflict = catalogSyncService.onConflict(() => {
      showToast(t('sync.conflict'), 'info');
    });
    // Resume dirty-document synchronization from previous sessions (UC-11).
    void catalogSyncService.start();
    return () => {
      unsubscribe();
      unConflict();
    };
  }, [showToast, t]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') void catalogSyncService.processDirty();
    });
    return () => sub.remove();
  }, []);

  const value = useMemo<SyncContextValue>(
    () => ({
      states,
      getState: (catalogId) => states.get(catalogId),
      syncCatalog: (catalogId) => catalogSyncService.syncCatalog(catalogId),
      retryNow: (catalogId) => catalogSyncService.retryNow(catalogId),
    }),
    [states]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}

export function useCatalogSyncState(catalogId: string | null): CatalogSyncState | undefined {
  const { states } = useSync();
  return catalogId ? states.get(catalogId) : undefined;
}
