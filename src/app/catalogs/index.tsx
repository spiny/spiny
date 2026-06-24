import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Catalogs, type CatalogWithCount } from '@/db';
import { useDatabase, useSettings, useT } from '@/state';
import {
  AppHeader,
  Badge,
  Card,
  EmptyState,
  IconButton,
  Screen,
  type IconName,
} from '@/ui/components';
import { Text } from 'react-native';
import { useTheme } from '@/state';

function goHome() {
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/');
}

export default function CatalogSelectorScreen() {
  const db = useDatabase();
  const t = useT();
  const theme = useTheme();
  const { activeCatalogId, setActiveCatalogId } = useSettings();
  const [catalogs, setCatalogs] = useState<CatalogWithCount[]>([]);

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

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader
        title={t('catalogs.title')}
        onBack={() => goHome()}
        backAccessibilityLabel={t('catalogs.backHome')}
        right={
          <IconButton
            name="add"
            onPress={() => router.push('/catalogs/new')}
            accessibilityLabel={t('catalogs.new')}
          />
        }
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
              onAction={() => router.push('/catalogs/new')}
            />
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16 },
  sep: { height: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  main: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 17, fontWeight: '700', flexShrink: 1 },
  desc: { fontSize: 13, lineHeight: 18 },
  count: { fontSize: 12 },
  emptyWrap: { paddingTop: 64 },
});
