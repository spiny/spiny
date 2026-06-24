import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Catalogs } from '@/db';
import { useDatabase, useSettings, useT } from '@/state';
import { AppHeader, Button, Screen, TextField } from '@/ui/components';

function goHome() {
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/');
}

export default function NewCatalogScreen() {
  const db = useDatabase();
  const t = useT();
  const { setActiveCatalogId } = useSettings();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (title.trim().length === 0) {
      setError(t('catalogs.error.titleRequired'));
      return;
    }
    setSaving(true);
    try {
      const catalog = await Catalogs.createCatalog(db, { title, description });
      await setActiveCatalogId(catalog.id);
      goHome();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title={t('catalogs.new')} onBack={() => router.back()} />
      <View style={styles.form}>
        <TextField
          label={t('catalogs.field.title')}
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            if (error) setError(undefined);
          }}
          placeholder={t('catalogs.field.titlePlaceholder')}
          error={error}
          autoFocus
          returnKeyType="next"
        />
        <TextField
          label={t('catalogs.field.description')}
          value={description}
          onChangeText={setDescription}
          placeholder={t('catalogs.field.descriptionPlaceholder')}
          multiline
        />
        <Button
          label={t('catalogs.create')}
          onPress={create}
          loading={saving}
          fullWidth
          icon="add"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { padding: 16, gap: 16 },
});
