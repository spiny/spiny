import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Documents } from '@/db';
import { useDatabase, useSettings } from '@/state';

function goHome() {
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/');
}

/**
 * Creates a new local draft in the active catalog and replaces into the editor
 * (UC-04 quick capture). A guard prevents duplicate creation under StrictMode.
 */
export default function NewDocumentScreen() {
  const db = useDatabase();
  const { activeCatalogId } = useSettings();
  const creating = useRef(false);

  useEffect(() => {
    if (creating.current) return;
    creating.current = true;
    (async () => {
      if (!activeCatalogId) {
        goHome();
        return;
      }
      const doc = await Documents.createDocument(db, { catalogId: activeCatalogId });
      router.replace({ pathname: '/documents/[id]', params: { id: doc.id, from: 'home', fresh: '1' } });
    })();
  }, [db, activeCatalogId]);

  return (
    <View style={styles.center}>
      <ActivityIndicator />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
