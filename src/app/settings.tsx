import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SyncConnections, type SyncConnection } from '@/db';
import type { ProviderType } from '@/db/types';
import type { LocaleSetting, MessageKey } from '@/i18n';
import {
  useDatabase,
  useSettings,
  useT,
  useTheme,
  useToast,
  type ThemeSetting,
} from '@/state';
import {
  authorizeGoogleDrive,
  createGoogleDriveFolder,
  createProvider,
  isGoogleDriveConfigured,
  listGoogleDriveFolders,
  type DriveFolder,
  type ProviderStatus,
} from '@/sync';
import {
  AppHeader,
  Badge,
  Button,
  Card,
  Icon,
  Screen,
  SectionHeader,
  SegmentedControl,
  Sheet,
  TextField,
  type BadgeTone,
  type IconName,
} from '@/ui/components';

const PROVIDER_ICON: Record<ProviderType, IconName> = {
  google_drive: 'logo-google',
  sftp: 'terminal-outline',
  ftp: 'server-outline',
};

const STATUS_TONE: Record<ProviderStatus, BadgeTone> = {
  ready: 'success',
  needs_setup: 'warning',
  unavailable: 'muted',
};
const STATUS_KEY: Record<ProviderStatus, MessageKey> = {
  ready: 'providers.status.configured',
  needs_setup: 'providers.status.notConfigured',
  unavailable: 'providers.status.comingSoon',
};

const AI_PROVIDERS: { key: string; labelKey: MessageKey; icon: IconName; tone: BadgeTone; statusKey: MessageKey }[] = [
  { key: 'copilot', labelKey: 'assistant.copilot', icon: 'logo-github', tone: 'muted', statusKey: 'assistant.status.unavailable' },
  { key: 'local', labelKey: 'assistant.localAgent', icon: 'hardware-chip-outline', tone: 'muted', statusKey: 'assistant.status.unavailable' },
  { key: 'openai', labelKey: 'assistant.openai', icon: 'sparkles-outline', tone: 'warning', statusKey: 'assistant.status.needsSetup' },
];

/** Read a non-secret string field from a stored connection config. */
function configString(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  return typeof value === 'string' ? value : '';
}

export default function SettingsScreen() {
  const db = useDatabase();
  const t = useT();
  const theme = useTheme();
  const { showToast } = useToast();
  const { theme: themeSetting, setTheme, locale, setLocale } = useSettings();

  const [connections, setConnections] = useState<SyncConnection[]>([]);
  const [statuses, setStatuses] = useState<Map<string, ProviderStatus>>(new Map());

  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<ProviderType | null>(null);
  const [label, setLabel] = useState('');
  const [host, setHost] = useState('');
  const [creating, setCreating] = useState(false);

  const [manage, setManage] = useState<SyncConnection | null>(null);
  const [browseConn, setBrowseConn] = useState<SyncConnection | null>(null);

  const load = useCallback(async () => {
    const conns = await SyncConnections.listConnections(db);
    setConnections(conns);
    const map = new Map<string, ProviderStatus>();
    for (const c of conns) {
      try {
        map.set(c.id, await createProvider(c).status());
      } catch {
        map.set(c.id, 'unavailable');
      }
    }
    setStatuses(map);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const resetAdd = () => {
    setAddType(null);
    setLabel('');
    setHost('');
  };

  const createConn = async () => {
    if (!addType) return;
    const finalLabel = label.trim() || t(`providers.${addType}` as MessageKey);

    if (addType === 'google_drive') {
      if (!isGoogleDriveConfigured()) {
        showToast(t('providers.googleDrive.notConfigured'), 'error');
        return;
      }
      setCreating(true);
      try {
        // Create the connection, then immediately run OAuth and let the user
        // pick a target folder (issue #4).
        const conn = await SyncConnections.createConnection(db, {
          providerType: 'google_drive',
          label: finalLabel,
          config: {},
        });
        setAddOpen(false);
        resetAdd();
        const ok = await authorizeGoogleDrive(conn.id);
        if (ok) {
          setBrowseConn(conn);
        } else {
          showToast(t('providers.googleDrive.authCancelled'), 'error');
          setManage(conn);
        }
      } catch {
        showToast(t('error.generic'), 'error');
      } finally {
        setCreating(false);
        await load();
      }
      return;
    }

    // SSH/SFTP and FTP: store metadata only (validation pending, C-06).
    await SyncConnections.createConnection(db, {
      providerType: addType,
      label: finalLabel,
      config: { host: host.trim() },
    });
    setAddOpen(false);
    resetAdd();
    await load();
  };

  const reconnectGoogle = async (conn: SyncConnection) => {
    if (!isGoogleDriveConfigured()) {
      showToast(t('providers.googleDrive.notConfigured'), 'error');
      return;
    }
    try {
      const ok = await authorizeGoogleDrive(conn.id);
      if (ok) {
        showToast(t('providers.googleDrive.connected'), 'success');
        await load();
      }
    } catch {
      showToast(t('error.generic'), 'error');
    }
  };

  const openFolderBrowser = (conn: SyncConnection) => {
    setManage(null);
    setBrowseConn(conn);
  };

  const saveTargetFolder = async (conn: SyncConnection, folder: DriveFolder, path: string) => {
    await SyncConnections.updateConnectionConfig(db, conn.id, {
      targetFolderId: folder.id,
      targetFolderName: folder.name,
      targetFolderPath: path,
    });
    setBrowseConn(null);
    showToast(t('providers.googleDrive.folderSaved'), 'success');
    await load();
  };

  const removeConn = (conn: SyncConnection) => {
    Alert.alert(t('providers.delete'), t('providers.delete.confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: async () => {
          await SyncConnections.deleteConnection(db, conn.id);
          setManage(null);
          await load();
        },
      },
    ]);
  };

  return (
    <Screen edges={['top', 'left', 'right']} scroll contentStyle={styles.scroll}>
      <AppHeader title={t('settings.title')} onBack={() => router.back()} />

      <View style={styles.section}>
        <SectionHeader title={t('settings.section.appearance')} />
        <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>{t('settings.theme')}</Text>
        <SegmentedControl<ThemeSetting>
          accessibilityLabel={t('settings.theme')}
          value={themeSetting}
          onChange={(v) => void setTheme(v)}
          options={[
            { value: 'system', label: t('settings.theme.system') },
            { value: 'light', label: t('settings.theme.light') },
            { value: 'dark', label: t('settings.theme.dark') },
          ]}
        />
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('settings.section.language')} />
        <SegmentedControl<LocaleSetting>
          accessibilityLabel={t('settings.section.language')}
          value={locale}
          onChange={(v) => void setLocale(v)}
          options={[
            { value: 'system', label: t('settings.language.system') },
            { value: 'en', label: t('settings.language.en') },
            { value: 'fr', label: t('settings.language.fr') },
          ]}
        />
      </View>

      <View style={styles.section}>
        <SectionHeader
          title={t('settings.section.storage')}
          right={
            <Button
              label={t('common.add')}
              onPress={() => {
                resetAdd();
                setAddOpen(true);
              }}
              variant="ghost"
              icon="add"
            />
          }
        />
        {connections.length === 0 ? (
          <Text style={[styles.note, { color: theme.colors.textMuted }]}>
            {t('settings.storage.empty')}
          </Text>
        ) : (
          <View style={styles.list}>
            {connections.map((c) => {
              const status = statuses.get(c.id) ?? 'unavailable';
              return (
                <Card key={c.id} onPress={() => setManage(c)} accessibilityLabel={c.label}>
                  <View style={styles.connRow}>
                    <Icon name={PROVIDER_ICON[c.providerType]} size={22} color={theme.colors.text} />
                    <View style={styles.connInfo}>
                      <Text style={[styles.connLabel, { color: theme.colors.text }]}>{c.label}</Text>
                      <Text style={[styles.connType, { color: theme.colors.textMuted }]}>
                        {t(`providers.${c.providerType}` as MessageKey)}
                      </Text>
                    </View>
                    <Badge label={t(STATUS_KEY[status])} tone={STATUS_TONE[status]} />
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('settings.section.ai')} />
        <View style={styles.list}>
          {AI_PROVIDERS.map((p, idx) => (
            <Card key={p.key} onPress={() => router.push('/assistant')} accessibilityLabel={t(p.labelKey)}>
              <View style={styles.connRow}>
                <Icon name={p.icon} size={22} color={theme.colors.text} />
                <View style={styles.connInfo}>
                  <Text style={[styles.connLabel, { color: theme.colors.text }]}>{t(p.labelKey)}</Text>
                  <Text style={[styles.connType, { color: theme.colors.textMuted }]}>
                    {t('assistant.priority', { n: idx + 1 })}
                  </Text>
                </View>
                <Badge label={t(p.statusKey)} tone={p.tone} />
              </View>
            </Card>
          ))}
          <Text style={[styles.note, { color: theme.colors.textMuted }]}>{t('settings.ai.note')}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title={t('settings.about')} />
        <Text style={[styles.note, { color: theme.colors.textMuted }]}>
          {t('settings.version', { version: Constants.expoConfig?.version ?? '1.0.0-dev' })}
        </Text>
      </View>

      {/* Add connection */}
      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title={t('providers.add.title')}>
        {!addType ? (
          <View style={styles.list}>
            {(['google_drive', 'sftp', 'ftp'] as ProviderType[]).map((type) => (
              <Card key={type} onPress={() => setAddType(type)} accessibilityLabel={t(`providers.${type}` as MessageKey)}>
                <View style={styles.connRow}>
                  <Icon name={PROVIDER_ICON[type]} size={22} color={theme.colors.text} />
                  <Text style={[styles.connLabel, { color: theme.colors.text, flex: 1 }]}>
                    {t(`providers.${type}` as MessageKey)}
                  </Text>
                  <Icon name="chevron-forward" size={18} color={theme.colors.textMuted} />
                </View>
              </Card>
            ))}
          </View>
        ) : (
          <View style={styles.form}>
            <TextField
              label={t('providers.add.label')}
              value={label}
              onChangeText={setLabel}
              placeholder={t('providers.add.labelPlaceholder')}
            />
            {addType === 'google_drive' ? (
              <Text
                style={[
                  styles.note,
                  { color: isGoogleDriveConfigured() ? theme.colors.textMuted : theme.colors.warning },
                ]}
              >
                {isGoogleDriveConfigured()
                  ? t('providers.googleDrive.addHint')
                  : t('providers.googleDrive.notConfigured')}
              </Text>
            ) : (
              <>
                <TextField label="Host" value={host} onChangeText={setHost} placeholder="host:port" autoCapitalize="none" />
                <Text style={[styles.note, { color: theme.colors.warning }]}>
                  {t(addType === 'sftp' ? 'providers.feasibility.sftp' : 'providers.feasibility.ftp')}
                </Text>
              </>
            )}
            <View style={styles.formActions}>
              <Button label={t('common.back')} onPress={() => setAddType(null)} variant="ghost" />
              <Button
                label={addType === 'google_drive' ? t('providers.googleDrive.createConnect') : t('common.create')}
                onPress={createConn}
                loading={creating}
              />
            </View>
          </View>
        )}
      </Sheet>

      {/* Manage connection */}
      <Sheet visible={!!manage} onClose={() => setManage(null)} title={manage?.label}>
        {manage ? (
          <View style={styles.form}>
            <Text style={[styles.connType, { color: theme.colors.textMuted }]}>
              {t(`providers.${manage.providerType}` as MessageKey)}
            </Text>
            {manage.providerType === 'google_drive' ? (
              <>
                <Text style={[styles.note, { color: theme.colors.textSecondary }]}>
                  {configString(manage.config, 'targetFolderId')
                    ? t('providers.googleDrive.targetFolder', {
                        folder:
                          configString(manage.config, 'targetFolderPath') ||
                          configString(manage.config, 'targetFolderName') ||
                          t('providers.googleDrive.myDrive'),
                      })
                    : t('providers.googleDrive.noFolder')}
                </Text>
                <Button
                  label={t('providers.googleDrive.connect')}
                  onPress={() => reconnectGoogle(manage)}
                  icon="logo-google"
                  variant="secondary"
                />
                <Button
                  label={t('providers.googleDrive.chooseFolderAction')}
                  onPress={() => openFolderBrowser(manage)}
                  icon="folder-outline"
                  variant="secondary"
                />
              </>
            ) : (
              <Text style={[styles.note, { color: theme.colors.warning }]}>
                {t(manage.providerType === 'sftp' ? 'providers.feasibility.sftp' : 'providers.feasibility.ftp')}
              </Text>
            )}
            <Button
              label={t('providers.delete')}
              onPress={() => removeConn(manage)}
              variant="danger"
              icon="trash-outline"
            />
          </View>
        ) : null}
      </Sheet>

      {/* Google Drive folder browser */}
      <Sheet
        visible={!!browseConn}
        onClose={() => setBrowseConn(null)}
        title={t('providers.googleDrive.folderTitle')}
      >
        {browseConn ? (
          <GoogleDriveFolderBrowser
            connection={browseConn}
            onClose={() => setBrowseConn(null)}
            onConfirm={(folder, path) => void saveTargetFolder(browseConn, folder, path)}
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}

/**
 * Drive folder navigator (issue #4): lists child folders under the current
 * parent, lets the user enter subfolders, go up, create a folder, and confirm
 * the current folder as the sync target. `root` represents My Drive.
 */
function GoogleDriveFolderBrowser({
  connection,
  onConfirm,
  onClose,
}: {
  connection: SyncConnection;
  onConfirm: (folder: DriveFolder, path: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const theme = useTheme();
  const { showToast } = useToast();

  const [stack, setStack] = useState<DriveFolder[]>([]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const rootName = t('providers.googleDrive.myDrive');
  const currentId = stack.length > 0 ? stack[stack.length - 1].id : 'root';
  const currentFolder: DriveFolder =
    stack.length > 0 ? stack[stack.length - 1] : { id: 'root', name: rootName };
  const pathLabel = [rootName, ...stack.map((s) => s.name)].join(' / ');

  // Navigation sets `loading` before changing the parent so the spinner shows.
  const enterFolder = (folder: DriveFolder) => {
    setLoading(true);
    setStack((s) => [...s, folder]);
  };
  const goUp = () => {
    setLoading(true);
    setStack((s) => s.slice(0, -1));
  };

  // Fetch folders for the current parent. The work is deferred into a scheduled
  // callback so no setState runs synchronously in the effect body
  // (react-hooks/set-state-in-effect); this mirrors the debounced-search effect.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const list = await listGoogleDriveFolders(connection, currentId);
        if (!cancelled) {
          setFolders(list);
          setError(false);
        }
      } catch {
        if (!cancelled) {
          setFolders([]);
          setError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [connection, currentId]);

  const createSub = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const created = await createGoogleDriveFolder(connection, currentId, name);
      setNewName('');
      setFolders((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      showToast(t('providers.googleDrive.createFolderError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.form}>
      <Text style={[styles.note, { color: theme.colors.textSecondary }]}>
        {t('providers.googleDrive.chooseFolder')}
      </Text>

      <View style={styles.browseBar}>
        <Button
          label={t('common.back')}
          onPress={goUp}
          variant="ghost"
          icon="arrow-up"
          disabled={stack.length === 0 || busy}
        />
        <Text style={[styles.browsePath, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {pathLabel}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.colors.primary} style={styles.browseLoading} />
      ) : (
        <ScrollView style={styles.browseList} keyboardShouldPersistTaps="handled">
          {error ? (
            <Text style={[styles.note, { color: theme.colors.danger }]}>
              {t('providers.googleDrive.browseError')}
            </Text>
          ) : folders.length === 0 ? (
            <Text style={[styles.note, { color: theme.colors.textMuted }]}>
              {t('providers.googleDrive.noSubfolders')}
            </Text>
          ) : (
            folders.map((f) => (
              <Card key={f.id} onPress={() => enterFolder(f)} accessibilityLabel={f.name}>
                <View style={styles.connRow}>
                  <Icon name="folder-outline" size={20} color={theme.colors.text} />
                  <Text style={[styles.connLabel, { color: theme.colors.text, flex: 1 }]} numberOfLines={1}>
                    {f.name}
                  </Text>
                  <Icon name="chevron-forward" size={18} color={theme.colors.textMuted} />
                </View>
              </Card>
            ))
          )}
        </ScrollView>
      )}

      <View style={styles.browseCreate}>
        <TextField
          containerStyle={styles.browseCreateField}
          value={newName}
          onChangeText={setNewName}
          placeholder={t('providers.googleDrive.newFolderPlaceholder')}
        />
        <Button
          label={t('common.add')}
          onPress={createSub}
          icon="add"
          variant="secondary"
          loading={busy}
        />
      </View>

      <View style={styles.formActions}>
        <Button label={t('common.cancel')} onPress={onClose} variant="ghost" />
        <Button
          label={t('providers.googleDrive.useFolder')}
          onPress={() => onConfirm(currentFolder, pathLabel)}
          icon="checkmark"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 0, paddingBottom: 32 },
  section: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600' },
  note: { fontSize: 13, lineHeight: 19 },
  list: { gap: 10 },
  connRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  connInfo: { flex: 1 },
  connLabel: { fontSize: 15, fontWeight: '600' },
  connType: { fontSize: 12 },
  form: { gap: 12, paddingBottom: 8 },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  browseBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  browsePath: { flex: 1, fontSize: 12 },
  browseList: { maxHeight: 260 },
  browseLoading: { paddingVertical: 24 },
  browseCreate: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  browseCreateField: { flex: 1 },
});
