import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useT, useTheme } from '@/state';
import { IconButton } from './IconButton';

interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  backAccessibilityLabel?: string;
  left?: ReactNode;
  right?: ReactNode;
}

/**
 * Consistent screen header. A back-to-home action is app navigation and is
 * allowed (constraints C-11); document-history back/forward is not used.
 */
export function AppHeader({
  title,
  subtitle,
  onBack,
  backAccessibilityLabel,
  left,
  right,
}: AppHeaderProps) {
  const theme = useTheme();
  const t = useT();

  return (
    <View style={[styles.header, { borderBottomColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
      <View style={styles.side}>
        {onBack ? (
          <IconButton
            name="chevron-back"
            onPress={onBack}
            accessibilityLabel={backAccessibilityLabel ?? t('a11y.back')}
          />
        ) : (
          left
        )}
      </View>
      <View style={styles.center}>
        {title ? (
          <Text numberOfLines={1} style={[styles.title, { color: theme.colors.text }]}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text numberOfLines={1} style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  side: { minWidth: 44, flexDirection: 'row', alignItems: 'center' },
  right: { justifyContent: 'flex-end' },
  center: { flex: 1, paddingHorizontal: 4 },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 1 },
});
