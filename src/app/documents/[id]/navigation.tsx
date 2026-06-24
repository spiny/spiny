import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import {
  Catalogs,
  Documents,
  Navigation,
  Relationships,
  type CatalogWithCount,
  type DocumentModel,
  type DocumentSummary,
  type RelationshipDirection,
} from '@/db';
import { useDatabase, useT, useTheme, useToast } from '@/state';
import {
  AppHeader,
  Button,
  Card,
  DocumentRow,
  EmptyState,
  Icon,
  Screen,
  SectionHeader,
  Sheet,
} from '@/ui/components';

interface NavNode {
  item: DocumentSummary;
  direction?: RelationshipDirection;
}

function goBackSafe() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function DocumentNavigationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDatabase();
  const t = useT();
  const theme = useTheme();
  const { showToast } = useToast();

  const [doc, setDoc] = useState<DocumentModel | null>(null);
  const [nodes, setNodes] = useState<NavNode[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [otherCatalogs, setOtherCatalogs] = useState<CatalogWithCount[]>([]);
  const [pickerAction, setPickerAction] = useState<'copy' | 'move' | null>(null);

  const load = useCallback(async () => {
    const d = await Documents.getDocument(db, id);
    if (!d) {
      goBackSafe();
      return;
    }
    setDoc(d);
    const [rel, recents, catalogRel, catalogs] = await Promise.all([
      Relationships.getRelationships(db, d.catalogId, d.id),
      Navigation.listRecentlyViewed(db, d.catalogId),
      Relationships.listRelatedDocumentsInCatalog(db, d.catalogId),
      Catalogs.listCatalogs(db),
    ]);
    const map = new Map<string, NavNode>();
    for (const r of rel) map.set(r.id, { item: r, direction: r.direction });
    for (const r of recents) if (r.id !== d.id && !map.has(r.id)) map.set(r.id, { item: r });
    for (const r of catalogRel) if (r.id !== d.id && !map.has(r.id)) map.set(r.id, { item: r });
    setNodes([...map.values()]);
    setOtherCatalogs(catalogs.filter((c) => c.id !== d.catalogId));
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const toggleSelect = (docId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const open = (targetId: string) => {
    router.push({ pathname: '/documents/[id]', params: { id: targetId, from: 'navigation_surface', fromDoc: id } });
  };

  const runAction = async (targetCatalogId: string) => {
    const ids = [...selected];
    const action = pickerAction;
    setPickerAction(null);
    if (!action || ids.length === 0) return;
    for (const docId of ids) {
      if (action === 'copy') await Documents.copyDocumentToCatalog(db, docId, targetCatalogId);
      else await Documents.moveDocumentToCatalog(db, docId, targetCatalogId);
    }
    showToast(
      action === 'copy' ? t('mindmap.copied', { count: ids.length }) : t('mindmap.moved', { count: ids.length }),
      'success'
    );
    exitSelect();
    if (action === 'move' && doc && ids.includes(doc.id)) {
      goBackSafe();
      return;
    }
    await load();
  };

  const canAct = selected.size > 0 && otherCatalogs.length > 0;

  if (!doc) {
    return (
      <Screen edges={['top', 'left', 'right']}>
        <AppHeader title={t('mindmap.title')} onBack={goBackSafe} />
      </Screen>
    );
  }

  const currentNode: NavNode = {
    item: { id: doc.id, title: doc.title, topics: doc.topics, updatedAt: doc.updatedAt },
  };
  const allNodes = [currentNode, ...nodes];

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <AppHeader
        title={t('mindmap.title')}
        onBack={goBackSafe}
        right={
          <Button
            label={selectMode ? t('common.cancel') : t('mindmap.select')}
            onPress={() => (selectMode ? exitSelect() : setSelectMode(true))}
            variant="ghost"
          />
        }
      />

      <FlatList
        data={allNodes}
        keyExtractor={(n) => n.item.id}
        extraData={selected}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListHeaderComponent={
          <View style={styles.headerInfo}>
            <SectionHeader title={t('mindmap.relationships')} />
            {selectMode ? (
              <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
                {otherCatalogs.length === 0 ? t('mindmap.noOtherCatalogs') : t('mindmap.noSelection')}
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item: node }) => {
          const isCurrent = node.item.id === doc.id;
          const directionLabel =
            node.direction === 'outgoing'
              ? t('editor.navigation.outgoing')
              : node.direction === 'incoming'
                ? t('editor.navigation.backlinks')
                : undefined;
          return (
            <DocumentRow
              title={node.item.title}
              topics={node.item.topics}
              updatedAt={node.item.updatedAt}
              current={isCurrent && !selectMode}
              selectable={selectMode}
              selected={selected.has(node.item.id)}
              directionLabel={directionLabel}
              onPress={() => (selectMode ? toggleSelect(node.item.id) : isCurrent ? undefined : open(node.item.id))}
            />
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <EmptyState icon="git-network-outline" title={t('editor.navigation.empty')} />
          </View>
        }
      />

      {selectMode ? (
        <View style={[styles.actionBar, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.count, { color: theme.colors.textSecondary }]}>
            {t('mindmap.selected', { count: selected.size })}
          </Text>
          <View style={styles.actions}>
            <Button
              label={t('mindmap.copy')}
              icon="copy-outline"
              variant="secondary"
              disabled={!canAct}
              onPress={() => setPickerAction('copy')}
            />
            <Button
              label={t('mindmap.move')}
              icon="arrow-redo-outline"
              disabled={!canAct}
              onPress={() => setPickerAction('move')}
            />
          </View>
        </View>
      ) : null}

      <Sheet
        visible={pickerAction !== null}
        onClose={() => setPickerAction(null)}
        title={t('mindmap.chooseCatalog')}
      >
        {otherCatalogs.map((c) => (
          <Card key={c.id} onPress={() => runAction(c.id)} accessibilityLabel={c.title}>
            <View style={styles.catalogRow}>
              <Icon name="albums-outline" size={20} color={theme.colors.text} />
              <Text style={[styles.catalogTitle, { color: theme.colors.text }]}>{c.title}</Text>
            </View>
          </Card>
        ))}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 96 },
  headerInfo: { marginBottom: 8, gap: 4 },
  hint: { fontSize: 13 },
  sep: { height: 10 },
  emptyWrap: { paddingTop: 48 },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  count: { fontSize: 14, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8 },
  catalogRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  catalogTitle: { fontSize: 15, fontWeight: '600' },
});
