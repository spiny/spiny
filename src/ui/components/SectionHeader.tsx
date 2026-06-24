import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/state';

interface SectionHeaderProps {
  title: string;
  right?: ReactNode;
}

export function SectionHeader({ title, right }: SectionHeaderProps) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.title, { color: theme.colors.textMuted }]}>{title.toUpperCase()}</Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
});
