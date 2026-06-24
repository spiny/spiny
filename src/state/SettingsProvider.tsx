import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { Settings } from '@/db';
import type { LocaleSetting } from '@/i18n';
import { useDatabase } from './DatabaseProvider';

export type ThemeSetting = 'system' | 'light' | 'dark';

const KEYS = {
  theme: 'theme',
  locale: 'locale',
  activeCatalog: 'active_catalog_id',
  assistantEnabled: 'assistant_enabled',
} as const;

interface SettingsContextValue {
  loaded: boolean;
  theme: ThemeSetting;
  locale: LocaleSetting;
  activeCatalogId: string | null;
  assistantEnabled: boolean;
  setTheme: (value: ThemeSetting) => Promise<void>;
  setLocale: (value: LocaleSetting) => Promise<void>;
  setActiveCatalogId: (value: string | null) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function isThemeSetting(v: unknown): v is ThemeSetting {
  return v === 'system' || v === 'light' || v === 'dark';
}
function isLocaleSetting(v: unknown): v is LocaleSetting {
  return v === 'system' || v === 'en' || v === 'fr';
}

/**
 * App-level preferences persisted in `app_settings` (technical/storage.md):
 * theme, locale, active catalog, and the assistant flag (false in v1).
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const db = useDatabase();
  const [loaded, setLoaded] = useState(false);
  const [theme, setThemeState] = useState<ThemeSetting>('system');
  const [locale, setLocaleState] = useState<LocaleSetting>('system');
  const [activeCatalogId, setActiveCatalogIdState] = useState<string | null>(null);
  const [assistantEnabled, setAssistantEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await Settings.getAllSettings(db);
      if (cancelled) return;
      if (isThemeSetting(all[KEYS.theme])) setThemeState(all[KEYS.theme] as ThemeSetting);
      if (isLocaleSetting(all[KEYS.locale])) setLocaleState(all[KEYS.locale] as LocaleSetting);
      if (typeof all[KEYS.activeCatalog] === 'string') {
        setActiveCatalogIdState(all[KEYS.activeCatalog] as string);
      }
      setAssistantEnabled(all[KEYS.assistantEnabled] === true);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [db]);

  const setTheme = useCallback(
    async (value: ThemeSetting) => {
      setThemeState(value);
      await Settings.setSettingRaw(db, KEYS.theme, value);
    },
    [db]
  );

  const setLocale = useCallback(
    async (value: LocaleSetting) => {
      setLocaleState(value);
      await Settings.setSettingRaw(db, KEYS.locale, value);
    },
    [db]
  );

  const setActiveCatalogId = useCallback(
    async (value: string | null) => {
      setActiveCatalogIdState(value);
      await Settings.setSettingRaw(db, KEYS.activeCatalog, value);
    },
    [db]
  );

  const value = useMemo<SettingsContextValue>(
    () => ({
      loaded,
      theme,
      locale,
      activeCatalogId,
      assistantEnabled,
      setTheme,
      setLocale,
      setActiveCatalogId,
    }),
    [loaded, theme, locale, activeCatalogId, assistantEnabled, setTheme, setLocale, setActiveCatalogId]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
