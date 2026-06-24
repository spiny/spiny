import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';

import type { RecentlyViewedItem, RelatedDocument } from '@/db';
import { useT, useTheme } from '@/state';
import { Icon, IconButton, type IconName } from '@/ui/components';

interface NavigationStripProps {
  currentId: string;
  currentTitle: string;
  related: RelatedDocument[];
  recents: RecentlyViewedItem[];
  onOpen: (id: string) => void;
  onExpand: () => void;
}

interface Chip {
  id: string;
  title: string;
  icon: IconName;
  current?: boolean;
}

/**
 * Compact document navigation surface (technical/editor.md). Highlights the
 * current document and shows outgoing links, backlinks, and recently viewed
 * documents — no document-history back/forward buttons.
 */
export function NavigationStrip({
  currentId,
  currentTitle,
  related,
  recents,
  onOpen,
  onExpand,
}: NavigationStripProps) {
  const theme = useTheme();
  const t = useT();

  const chips: Chip[] = [
    { id: currentId, title: currentTitle.trim() || t('common.untitled'), icon: 'location', current: true },
  ];
  const seen = new Set<string>([currentId]);
  for (const r of related) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    chips.push({ id: r.id, title: r.title.trim() || t('common.untitled'), icon: r.direction === 'outgoing' ? 'arrow-forward' : 'arrow-back' });
  }
  for (const r of recents) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    chips.push({ id: r.id, title: r.title.trim() || t('common.untitled'), icon: 'time-outline' });
  }

  return (
    <View style={[styles.container, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.textMuted }]}>
          {t('editor.navigation.title').toUpperCase()}
        </Text>
        <IconButton
          name="expand-outline"
          size={18}
          onPress={onExpand}
          accessibilityLabel={t('editor.navigation.expand')}
          color={theme.colors.textMuted}
        />
      </View>
      {chips.length <= 1 ? (
        <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
          {t('editor.navigation.empty')}
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {chips.map((chip) => (
            <Pressable
              key={chip.id}
              onPress={() => (chip.current ? undefined : onOpen(chip.id))}
              disabled={chip.current}
              accessibilityRole="button"
              accessibilityLabel={chip.title}
              accessibilityState={{ selected: chip.current }}
              style={[
                styles.chip,
                {
                  backgroundColor: chip.current ? theme.colors.surfaceSelected : theme.colors.surfaceAlt,
                  borderColor: chip.current ? theme.colors.primary : theme.colors.border,
                },
              ]}
            >
              <Icon name={chip.icon} size={13} color={chip.current ? theme.colors.primary : theme.colors.textMuted} />
              <Text
                numberOfLines={1}
                style={[styles.chipText, { color: chip.current ? theme.colors.primary : theme.colors.text }]}
              >
                {chip.title}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6, paddingBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  title: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  empty: { fontSize: 13, paddingHorizontal: 12, paddingVertical: 8 },
  chips: { paddingHorizontal: 12, gap: 8, paddingVertical: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 180,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 13, fontWeight: '500', flexShrink: 1 },
});
