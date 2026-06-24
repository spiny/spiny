import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/state';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'muted';

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
}

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const theme = useTheme();
  const tones: Record<BadgeTone, { bg: string; fg: string }> = {
    neutral: { bg: theme.colors.surfaceAlt, fg: theme.colors.textSecondary },
    primary: { bg: theme.colors.surfaceSelected, fg: theme.colors.primary },
    success: { bg: theme.colors.surfaceAlt, fg: theme.colors.success },
    warning: { bg: theme.colors.warningSurface, fg: theme.colors.warning },
    danger: { bg: theme.colors.surfaceAlt, fg: theme.colors.danger },
    muted: { bg: theme.colors.surfaceAlt, fg: theme.colors.textMuted },
  };
  const c = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderRadius: theme.radius.pill }]}>
      <Text style={[styles.text, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  text: { fontSize: 11, fontWeight: '600' },
});
