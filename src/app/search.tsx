import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Search, type DocumentSummary } from '@/db';
import { useDatabase, useSettings, useT, useTheme } from '@/state';
import { AppHeader, DocumentRow, Screen, TextField } from '@/ui/components';

export default function SearchScreen() {
  const db = useDatabase();
  const t = useT();
  const theme = useTheme();
  const { activeCatalogId } = useSettings();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DocumentSummary[]>([]);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!activeCatalogId || query.trim().length === 0) {
      setResults([]);
      setSearched(false);
      return;
    }
    timer.current = setTimeout(async () => {
      const rows = await Search.searchDocuments(db, activeCatalogId, query);
      setResults(rows);
      setSearched(true);
    }, 180);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [db, activeCatalogId, query]);

  const open = (id: string) => {
    router.push({ pathname: '/documents/[id]', params: { id, from: 'search' } });
  };

  const countLabel =
    results.length === 1
      ? t('search.resultCountOne')
      : t('search.resultCount', { count: results.length });

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title={t('search.title')} onBack={() => router.back()} />
      <View style={styles.searchBox}>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder={t('search.placeholder')}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={t('search.placeholder')}
        />
      </View>
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          searched && results.length > 0 ? (
            <Text style={[styles.count, { color: theme.colors.textMuted }]}>{countLabel}</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <DocumentRow
            title={item.title}
            topics={item.topics}
            updatedAt={item.updatedAt}
            onPress={() => open(item.id)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
              {searched ? t('search.empty') : t('search.prompt')}
            </Text>
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBox: { padding: 16, paddingBottom: 8 },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  sep: { height: 10 },
  count: { fontSize: 12, marginBottom: 10 },
  emptyWrap: { paddingTop: 48, alignItems: 'center' },
  empty: { fontSize: 14, textAlign: 'center' },
});
