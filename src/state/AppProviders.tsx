import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DatabaseProvider } from './DatabaseProvider';
import { I18nProvider } from './I18nProvider';
import { SettingsProvider } from './SettingsProvider';
import { SyncProvider } from './SyncProvider';
import { ThemeProvider } from './ThemeProvider';
import { ToastProvider } from './ToastProvider';

/**
 * Root provider stack. Order matters: settings feed locale + theme; theme feeds
 * toasts; sync depends on db, i18n (conflict copy) and toasts.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <DatabaseProvider>
          <SettingsProvider>
            <I18nProvider>
              <ThemeProvider>
                <ToastProvider>
                  <SyncProvider>{children}</SyncProvider>
                </ToastProvider>
              </ThemeProvider>
            </I18nProvider>
          </SettingsProvider>
        </DatabaseProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
