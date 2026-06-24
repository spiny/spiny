import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '@/state';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  edges?: readonly Edge[];
}

/** Themed, safe-area-aware screen container. */
export function Screen({
  children,
  scroll = false,
  contentStyle,
  edges = ['top', 'bottom', 'left', 'right'],
}: ScreenProps) {
  const theme = useTheme();
  return (
    <SafeAreaView
      edges={edges}
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
    >
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scrollContent, contentStyle]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },
});
