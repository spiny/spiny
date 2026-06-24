import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useT, useTheme } from '@/state';
import { formatRelative } from '@/domain/time';
import { Card } from './Card';
import { Icon } from './Icon';

interface DocumentRowProps {
  title: string;
  topics?: string[];
  updatedAt?: string;
  dirty?: boolean;
  selected?: boolean;
  selectable?: boolean;
  directionLabel?: string;
  current?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  trailing?: ReactNode;
}

/** Reusable document list row for home, search, recent, and relationship lists. */
export function DocumentRow({
  title,
  topics,
  updatedAt,
  dirty = false,
  selected = false,
  selectable = false,
  directionLabel,
  current = false,
  onPress,
  onLongPress,
  trailing,
}: DocumentRowProps) {
  const theme = useTheme();
  const t = useT();
  const displayTitle = title.trim().length > 0 ? title : t('common.untitled');

  return (
    <Card
      onPress={onPress}
      onLongPress={onLongPress}
      selected={selected || current}
      accessibilityLabel={displayTitle}
      accessibilityHint={current ? t('editor.navigation.current') : undefined}
    >
      <View style={styles.row}>
        {selectable ? (
          <Icon
            name={selected ? 'checkbox' : 'square-outline'}
            size={20}
            color={selected ? theme.colors.primary : theme.colors.textMuted}
          />
        ) : null}
        <View style={styles.main}>
          <View style={styles.titleRow}>
            <Text numberOfLines={1} style={[styles.title, { color: theme.colors.text }]}>
              {displayTitle}
            </Text>
            {current ? <Icon name="location" size={14} color={theme.colors.primary} /> : null}
          </View>
          {topics && topics.length > 0 ? (
            <Text numberOfLines={1} style={[styles.topics, { color: theme.colors.textMuted }]}>
              {topics.join(' · ')}
            </Text>
          ) : null}
        </View>
        <View style={styles.meta}>
          {directionLabel ? (
            <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>{directionLabel}</Text>
          ) : null}
          {updatedAt ? (
            <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
              {formatRelative(updatedAt)}
            </Text>
          ) : null}
          {dirty ? <View style={[styles.dot, { backgroundColor: theme.colors.warning }]} /> : null}
          {trailing}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  main: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  topics: { fontSize: 13 },
  meta: { alignItems: 'flex-end', gap: 4 },
  metaText: { fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
