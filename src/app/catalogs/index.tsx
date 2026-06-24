import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Catalogs, type CatalogWithCount } from '@/db';
import { importCatalogArchive } from '@/export';
import { useDatabase, useSettings, useT, useTheme, useToast } from '@/state';
import {
  AppHeader,
  Badge,
  Card,
  EmptyState,
  Icon,
  IconButton,
  Screen,
  Sheet,
  type IconName,
} from '@/ui/components';

function goHome() {
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/');
}

export default function CatalogSelectorScreen() {
  const db = useDatabase();
  const t = useT();
  const theme = useTheme();
  const { showToast } = useToast();
  const { activeCatalogId, setActiveCatalogId } = useSettings();
  const [catalogs, setCatalogs] = useState<CatalogWithCount[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setCatalogs(await Catalogs.listCatalogs(db));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const select = async (id: string) => {
    await setActiveCatalogId(id);
    goHome();
  };

  const onCreate = () => {
    setMenuOpen(false);
    router.push('/catalogs/new');
  };

  const onImport = async () => {
    setMenuOpen(false);
    setImporting(true);
    try {
      const result = await importCatalogArchive(db);
      if (result.status === 'canceled') return;
      await setActiveCatalogId(result.catalogId);
      await load();
      showToast(
        t('catalogs.import.success', {
          title: result.title || t('common.untitled'),
          count: result.documentCount,
        }),
        'success'
      );
    } catch {
      showToast(t('catalogs.import.failed'), 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader
        title={t('catalogs.title')}
        onBack={() => goHome()}
        backAccessibilityLabel={t('catalogs.backHome')}
      />
      <FlatList
        data={catalogs}
        keyExtractor={(item) => item.id}
        extraData={activeCatalogId}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => {
          const count =
            item.documentCount === 1
              ? t('catalogs.documentCountOne')
              : t('catalogs.documentCount', { count: item.documentCount });
          const isActive = item.id === activeCatalogId;
          return (
            <Card
              onPress={() => select(item.id)}
              selected={isActive}
              accessibilityLabel={item.title}
              accessibilityHint={isActive ? t('catalogs.active') : t('catalogs.select')}
            >
              <View style={styles.row}>
                <View style={styles.main}>
                  <View style={styles.titleRow}>
                    <Text numberOfLines={1} style={[styles.title, { color: theme.colors.text }]}>
                      {item.title}
                    </Text>
                    {isActive ? <Badge label={t('catalogs.active')} tone="primary" /> : null}
                  </View>
                  {item.description ? (
                    <Text numberOfLines={2} style={[styles.desc, { color: theme.colors.textMuted }]}>
                      {item.description}
                    </Text>
                  ) : null}
                  <Text style={[styles.count, { color: theme.colors.textMuted }]}>{count}</Text>
                </View>
                <IconButton
                  name="settings-outline"
                  onPress={() =>
                    router.push({ pathname: '/catalogs/[id]/settings', params: { id: item.id } })
                  }
                  accessibilityLabel={t('a11y.catalogSettings')}
                  color={theme.colors.textMuted}
                />
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <EmptyState
              icon={'library-outline' as IconName}
              title={t('catalogs.empty')}
              actionLabel={t('catalogs.new')}
              onAction={onCreate}
            />
          </View>
        }
      />

      <Pressable
        onPress={() => setMenuOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('catalogs.actions')}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: theme.colors.primary, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        {importing ? (
          <ActivityIndicator color={theme.colors.onPrimary} />
        ) : (
          <Icon name="add" size={28} color={theme.colors.onPrimary} />
        )}
      </Pressable>

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={t('catalogs.actions')}>
        <MenuRow icon="add" label={t('catalogs.create')} onPress={onCreate} />
        <MenuRow icon="cloud-download-outline" label={t('catalogs.import')} onPress={onImport} />
      </Sheet>
    </Screen>
  );
}

function MenuRow({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.menuRow, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Icon name={icon} size={22} color={theme.colors.text} />
      <Text style={[styles.menuLabel, { color: theme.colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 96 },
  sep: { height: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  main: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 17, fontWeight: '700', flexShrink: 1 },
  desc: { fontSize: 13, lineHeight: 18 },
  count: { fontSize: 12 },
  emptyWrap: { paddingTop: 64 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  menuLabel: { fontSize: 16, fontWeight: '500' },
});
