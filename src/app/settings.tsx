import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { SyncConnections, type SyncConnection } from '@/db';
import type { ProviderType } from '@/db/types';
import type { MessageKey } from '@/i18n';
import type { LocaleSetting } from '@/i18n';
import {
  useDatabase,
  useSettings,
  useT,
  useTheme,
  useToast,
  type ThemeSetting,
} from '@/state';
import { authorizeGoogleDrive, createProvider, type ProviderStatus } from '@/sync';
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
  const [clientId, setClientId] = useState('');
  const [host, setHost] = useState('');

  const [manage, setManage] = useState<SyncConnection | null>(null);

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
    setClientId('');
    setHost('');
  };

  const createConn = async () => {
    if (!addType) return;
    const finalLabel = label.trim() || t(`providers.${addType}` as MessageKey);
    const config =
      addType === 'google_drive'
        ? { clientId: clientId.trim() }
        : { host: host.trim() };
    const conn = await SyncConnections.createConnection(db, {
      providerType: addType,
      label: finalLabel,
      config,
    });
    setAddOpen(false);
    resetAdd();
    await load();
    if (addType === 'google_drive') setManage(conn);
  };

  const connectGoogle = async (conn: SyncConnection) => {
    const cid = typeof conn.config.clientId === 'string' ? conn.config.clientId : '';
    if (!cid) {
      showToast(t('providers.googleDrive.help'), 'error');
      return;
    }
    try {
      const ok = await authorizeGoogleDrive(conn.id, cid);
      if (ok) {
        showToast(t('providers.googleDrive.connected'), 'success');
        await load();
        setManage(null);
      }
    } catch {
      showToast(t('error.generic'), 'error');
    }
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
          {t('settings.version', { version: Constants.expoConfig?.version ?? '1.0.0' })}
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
              <>
                <TextField
                  label={t('providers.googleDrive.clientId')}
                  value={clientId}
                  onChangeText={setClientId}
                  placeholder={t('providers.googleDrive.clientIdPlaceholder')}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={[styles.note, { color: theme.colors.textMuted }]}>
                  {t('providers.googleDrive.help')}
                </Text>
              </>
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
              <Button label={t('common.create')} onPress={createConn} />
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
              <Button
                label={t('providers.googleDrive.connect')}
                onPress={() => connectGoogle(manage)}
                icon="logo-google"
                variant="secondary"
              />
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
    </Screen>
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
});
