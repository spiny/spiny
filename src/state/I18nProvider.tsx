import * as Localization from 'expo-localization';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { makeTranslator, resolveLocale, type AppLocale, type TranslateFn } from '@/i18n';
import { useSettings } from './SettingsProvider';

interface I18nContextValue {
  locale: AppLocale;
  t: TranslateFn;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readSystemLanguageCodes(): string[] {
  try {
    return Localization.getLocales().map((l) => l.languageCode ?? l.languageTag);
  } catch {
    return [];
  }
}

/**
 * Resolves the effective locale from the user override and the device locale
 * (technical/platform.md). On Android, locale-derived state is refreshed when
 * the app returns to the foreground.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const { locale: setting } = useSettings();
  const [systemCodes, setSystemCodes] = useState<string[]>(() => readSystemLanguageCodes());

  useEffect(() => {
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') setSystemCodes(readSystemLanguageCodes());
    });
    return () => sub.remove();
  }, []);

  const locale = useMemo<AppLocale>(
    () => resolveLocale(setting, systemCodes),
    [setting, systemCodes]
  );

  const t = useMemo<TranslateFn>(() => makeTranslator(locale), [locale]);

  const value = useMemo<I18nContextValue>(() => ({ locale, t }), [locale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

/** Convenience hook returning just the translator. */
export function useT(): TranslateFn {
  return useI18n().t;
}
