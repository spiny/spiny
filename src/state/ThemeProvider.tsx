import * as SystemUI from 'expo-system-ui';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

import { getTheme, type ColorScheme, type Theme } from '@/ui/theme';
import { useSettings } from './SettingsProvider';

interface ThemeContextValue {
  theme: Theme;
  scheme: ColorScheme;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Resolves the effective color scheme from the user's theme override and the
 * system appearance (technical/platform.md theme requirements), exposes theme
 * tokens, and keeps the root/system UI background in sync.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { theme: setting } = useSettings();
  const systemScheme = useColorScheme();

  const scheme: ColorScheme = useMemo(() => {
    if (setting === 'light' || setting === 'dark') return setting;
    return systemScheme === 'dark' ? 'dark' : 'light';
  }, [setting, systemScheme]);

  const theme = useMemo(() => getTheme(scheme), [scheme]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.background).catch(() => undefined);
  }, [theme.colors.background]);

  const value = useMemo<ThemeContextValue>(() => ({ theme, scheme }), [theme, scheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx.theme;
}

export function useColorSchemeValue(): ColorScheme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useColorSchemeValue must be used within ThemeProvider');
  return ctx.scheme;
}
