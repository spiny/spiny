import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Catalogs, Documents, type Catalog, type DocumentListItem } from '@/db';
import { useDatabase, useSettings, useT, useTheme } from '@/state';
import {
  AppHeader,
  DocumentRow,
  EmptyState,
  Icon,
  IconButton,
  Screen,
  SectionHeader,
  Sheet,
  SyncStatusPill,
  type IconName,
} from '@/ui/components';

export default function HomeScreen() {
  const db = useDatabase();
  const t = useT();
  const theme = useTheme();
  const { activeCatalogId, setActiveCatalogId } = useSettings();

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [docs, setDocs] = useState<DocumentListItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    let activeId = activeCatalogId;
    const catalogs = await Catalogs.listCatalogs(db);
    if (!activeId && catalogs.length > 0) {
      activeId = catalogs[0].id;
      await setActiveCatalogId(activeId);
    }
    if (!activeId) {
      setCatalog(null);
      setDocs([]);
      return;
    }
    const cat = await Catalogs.getCatalog(db, activeId);
    setCatalog(cat);
    setDocs(cat ? await Documents.listRecentDocuments(db, cat.id) : []);
  }, [db, activeCatalogId, setActiveCatalogId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const hasProvider = !!catalog?.activeSyncConnectionId;
  const anyDirty = docs.some((d) => d.dirty);

  const openDocument = (id: string) => {
    router.push({ pathname: '/documents/[id]', params: { id, from: 'home' } });
  };
  const newDocument = () => router.push('/documents/new');
  const newCatalog = () => router.push('/catalogs/new');

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader
        title={catalog ? catalog.title : t('common.appName')}
        left={
          <IconButton
            name="albums-outline"
            onPress={() => router.push('/catalogs')}
            accessibilityLabel={t('a11y.selectCatalog')}
          />
        }
        right={
          <>
            {catalog ? (
              <IconButton
                name="search"
                onPress={() => router.push('/search')}
                accessibilityLabel={t('a11y.search')}
              />
            ) : null}
            <IconButton
              name="ellipsis-horizontal"
              onPress={() => setMenuOpen(true)}
              accessibilityLabel={t('a11y.menu')}
            />
          </>
        }
      />

      {!catalog ? (
        <EmptyState
          icon="library-outline"
          title={t('home.noCatalog.title')}
          body={t('home.noCatalog.body')}
          actionLabel={t('home.noCatalog.cta')}
          onAction={newCatalog}
        />
      ) : (
        <>
          <FlatList
            data={docs}
            keyExtractor={(item) => item.id}
            extraData={anyDirty}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View style={styles.statusRow}>
                <SectionHeader title={t('home.recent')} />
                <SyncStatusPill catalogId={catalog.id} hasProvider={hasProvider} dirty={anyDirty} />
              </View>
            }
            renderItem={({ item }) => (
              <DocumentRow
                title={item.title}
                topics={item.topics}
                updatedAt={item.updatedAt}
                dirty={hasProvider && item.dirty}
                onPress={() => openDocument(item.id)}
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <EmptyState
                  icon="document-text-outline"
                  title={t('home.empty.title')}
                  body={t('home.empty.body')}
                  actionLabel={t('home.action.newDocument')}
                  onAction={newDocument}
                />
              </View>
            }
          />

          <Pressable
            onPress={newDocument}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.newDocument')}
            style={({ pressed }) => [
              styles.fab,
              { backgroundColor: theme.colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Icon name="add" size={28} color={theme.colors.onPrimary} />
          </Pressable>
        </>
      )}

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={t('common.appName')}>
        {catalog ? (
          <MenuRow
            icon="settings-outline"
            label={t('home.action.catalogSettings')}
            onPress={() => {
              setMenuOpen(false);
              router.push({ pathname: '/catalogs/[id]/settings', params: { id: catalog.id } });
            }}
          />
        ) : null}
        <MenuRow
          icon="albums-outline"
          label={t('home.action.selectCatalog')}
          onPress={() => {
            setMenuOpen(false);
            router.push('/catalogs');
          }}
        />
        <MenuRow
          icon="options-outline"
          label={t('home.action.appSettings')}
          onPress={() => {
            setMenuOpen(false);
            router.push('/settings');
          }}
        />
        <MenuRow
          icon="sparkles-outline"
          label={t('assistant.title')}
          onPress={() => {
            setMenuOpen(false);
            router.push('/assistant');
          }}
        />
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
  listContent: { padding: 16, paddingBottom: 96 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sep: { height: 10 },
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
