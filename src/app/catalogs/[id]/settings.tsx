import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Catalogs, SyncConnections, type Catalog, type SyncConnection } from '@/db';
import type { ProviderType } from '@/db/types';
import type { MessageKey } from '@/i18n';
import { useDatabase, useSettings, useT, useTheme, useToast } from '@/state';
import { catalogSyncService } from '@/sync';
import {
  AppHeader,
  Button,
  Card,
  Icon,
  Screen,
  SectionHeader,
  Sheet,
  SyncStatusPill,
  TextField,
  type IconName,
} from '@/ui/components';

function goHome() {
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/');
}

const PROVIDER_ICON: Record<ProviderType, IconName> = {
  google_drive: 'logo-google',
  sftp: 'terminal-outline',
  ftp: 'server-outline',
};

function providerLabel(t: (k: MessageKey) => string, type: ProviderType): string {
  return t(`providers.${type}` as MessageKey);
}

export default function CatalogSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDatabase();
  const t = useT();
  const theme = useTheme();
  const { showToast } = useToast();
  const { activeCatalogId, setActiveCatalogId } = useSettings();

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [connections, setConnections] = useState<SyncConnection[]>([]);
  const [connectOpen, setConnectOpen] = useState(false);

  const load = useCallback(async () => {
    const cat = await Catalogs.getCatalog(db, id);
    setCatalog(cat);
    if (cat) {
      setTitle(cat.title);
      setDescription(cat.description);
    }
    setConnections(await SyncConnections.listConnections(db));
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const activeConnection = connections.find((c) => c.id === catalog?.activeSyncConnectionId) ?? null;
  const hasProvider = !!catalog?.activeSyncConnectionId;

  const save = async () => {
    if (title.trim().length === 0) return;
    await Catalogs.updateCatalogMetadata(db, id, { title, description });
    showToast(t('catalogSettings.saved'), 'success');
    await load();
  };

  const connect = async (connectionId: string) => {
    await Catalogs.setActiveSyncConnection(db, id, connectionId);
    setConnectOpen(false);
    await load();
    void catalogSyncService.syncCatalog(id); // auto-start sync (UC-11)
  };

  const disconnect = async () => {
    catalogSyncService.cancelCatalog(id);
    await Catalogs.setActiveSyncConnection(db, id, null);
    await load();
  };

  const onDelete = () => {
    Alert.alert(t('catalogSettings.deleteConfirm.title'), t('catalogSettings.deleteConfirm.body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await Catalogs.softDeleteCatalog(db, id);
          if (activeCatalogId === id) await setActiveCatalogId(null);
          goHome();
        },
      },
    ]);
  };

  if (!catalog) {
    return (
      <Screen edges={['top', 'left', 'right']}>
        <AppHeader title={t('catalogSettings.title')} onBack={() => router.back()} />
        <View style={styles.section}>
          <Text style={{ color: theme.colors.textMuted }}>{t('error.catalogNotFound')}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'left', 'right']} scroll contentStyle={styles.scroll}>
      <AppHeader
        title={t('catalogSettings.title')}
        onBack={() => router.back()}
        right={
          <Button label={t('common.save')} onPress={save} variant="ghost" />
        }
      />

      <View style={styles.section}>
        <SectionHeader title={t('catalogSettings.section.metadata')} />
        <TextField
          label={t('catalogs.field.title')}
          value={title}
          onChangeText={setTitle}
          placeholder={t('catalogs.field.titlePlaceholder')}
        />
        <View style={styles.gap} />
        <TextField
          label={t('catalogs.field.description')}
          value={description}
          onChangeText={setDescription}
          placeholder={t('catalogs.field.descriptionPlaceholder')}
          multiline
        />
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('catalogSettings.section.sync')} />
        <Card>
          <View style={styles.syncRow}>
            <View style={styles.syncInfo}>
              <Text style={[styles.syncLabel, { color: theme.colors.textMuted }]}>
                {t('catalogSettings.sync.provider')}
              </Text>
              <Text style={[styles.syncValue, { color: theme.colors.text }]}>
                {activeConnection
                  ? `${activeConnection.label} · ${providerLabel(t, activeConnection.providerType)}`
                  : t('catalogSettings.sync.none')}
              </Text>
            </View>
            <SyncStatusPill catalogId={catalog.id} hasProvider={hasProvider} />
          </View>

          <View style={styles.syncActions}>
            {hasProvider ? (
              <>
                <Button
                  label={t('catalogSettings.sync.startSync')}
                  onPress={() => catalogSyncService.syncCatalog(id)}
                  variant="secondary"
                  icon="sync"
                />
                <Button
                  label={t('catalogSettings.sync.disconnect')}
                  onPress={disconnect}
                  variant="ghost"
                />
              </>
            ) : (
              <Button
                label={t('catalogSettings.sync.connect')}
                onPress={() => setConnectOpen(true)}
                variant="secondary"
                icon="link-outline"
              />
            )}
          </View>
        </Card>
      </View>

      <View style={styles.section}>
        <Button
          label={t('catalogSettings.delete')}
          onPress={onDelete}
          variant="danger"
          icon="trash-outline"
          fullWidth
        />
      </View>

      <Sheet
        visible={connectOpen}
        onClose={() => setConnectOpen(false)}
        title={t('catalogSettings.sync.choose')}
      >
        {connections.length === 0 ? (
          <View style={styles.emptyConnections}>
            <Text style={[styles.note, { color: theme.colors.textMuted }]}>
              {t('catalogSettings.sync.noConnections')}
            </Text>
            <Button
              label={t('settings.storage.add')}
              onPress={() => {
                setConnectOpen(false);
                router.push('/settings');
              }}
              variant="secondary"
            />
          </View>
        ) : (
          connections.map((c) => (
            <Card key={c.id} onPress={() => connect(c.id)} accessibilityLabel={c.label}>
              <View style={styles.connRow}>
                <Icon name={PROVIDER_ICON[c.providerType]} size={22} color={theme.colors.text} />
                <View style={styles.connInfo}>
                  <Text style={[styles.connLabel, { color: theme.colors.text }]}>{c.label}</Text>
                  <Text style={[styles.connType, { color: theme.colors.textMuted }]}>
                    {providerLabel(t, c.providerType)}
                  </Text>
                </View>
              </View>
            </Card>
          ))
        )}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 0 },
  section: { paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  gap: { height: 12 },
  syncRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  syncInfo: { flex: 1, gap: 2 },
  syncLabel: { fontSize: 12 },
  syncValue: { fontSize: 15, fontWeight: '600' },
  syncActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  emptyConnections: { gap: 12, paddingBottom: 16 },
  note: { fontSize: 14, lineHeight: 20 },
  connRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  connInfo: { flex: 1 },
  connLabel: { fontSize: 15, fontWeight: '600' },
  connType: { fontSize: 12 },
});
