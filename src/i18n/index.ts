import { catalogs, type AppLocale, type MessageKey } from './messages';

export type { AppLocale, MessageKey } from './messages';

/** The persisted locale setting also allows following the system locale. */
export type LocaleSetting = AppLocale | 'system';

export const SUPPORTED_LOCALES: AppLocale[] = ['en', 'fr'];
export const DEFAULT_LOCALE: AppLocale = 'en';

export type TranslateParams = Record<string, string | number>;
export type TranslateFn = (key: MessageKey, params?: TranslateParams) => string;

/**
 * Resolve the effective app locale from the user's setting and the device's
 * preferred language codes (technical/platform.md: detect device locale via
 * `expo-localization`, store the user override in local settings).
 */
export function resolveLocale(
  setting: LocaleSetting,
  systemLanguageCodes: (string | null | undefined)[]
): AppLocale {
  if (setting !== 'system') return setting;
  for (const code of systemLanguageCodes) {
    if (!code) continue;
    const lang = code.toLowerCase().split('-')[0] as AppLocale;
    if (SUPPORTED_LOCALES.includes(lang)) return lang;
  }
  return DEFAULT_LOCALE;
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in params ? String(params[name]) : `{${name}}`
  );
}

/** Translate a key for a given locale, with `{placeholder}` interpolation. */
export function translate(locale: AppLocale, key: MessageKey, params?: TranslateParams): string {
  const table = catalogs[locale] ?? catalogs[DEFAULT_LOCALE];
  const template = table[key] ?? catalogs[DEFAULT_LOCALE][key] ?? key;
  return interpolate(template, params);
}

export function makeTranslator(locale: AppLocale): TranslateFn {
  return (key, params) => translate(locale, key, params);
}
