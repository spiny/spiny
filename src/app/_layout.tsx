import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppProviders, useColorSchemeValue, useTheme } from '@/state';

function RootNavigator() {
  const theme = useTheme();
  const scheme = useColorSchemeValue();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          animation: 'slide_from_right',
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}
