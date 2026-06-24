import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import type { MessageKey } from '@/i18n';
import { useT, useTheme } from '@/state';
import {
  AppHeader,
  Badge,
  Card,
  Icon,
  Screen,
  SectionHeader,
  TextField,
  type BadgeTone,
  type IconName,
} from '@/ui/components';

type AssistantStatus = 'unavailable' | 'needs_setup' | 'ready';

interface ProviderEntry {
  key: string;
  labelKey: MessageKey;
  icon: IconName;
  status: AssistantStatus;
}

// Provider list ordered by usage priority (technical/ai-assistant.md). All
// providers are non-functional in v1; Copilot has no supported mobile path yet.
const PROVIDERS: ProviderEntry[] = [
  { key: 'copilot', labelKey: 'assistant.copilot', icon: 'logo-github', status: 'unavailable' },
  { key: 'local_agent', labelKey: 'assistant.localAgent', icon: 'hardware-chip-outline', status: 'unavailable' },
  { key: 'openai', labelKey: 'assistant.openai', icon: 'sparkles-outline', status: 'needs_setup' },
];

const STATUS_TONE: Record<AssistantStatus, BadgeTone> = {
  unavailable: 'muted',
  needs_setup: 'warning',
  ready: 'success',
};
const STATUS_KEY: Record<AssistantStatus, MessageKey> = {
  unavailable: 'assistant.status.unavailable',
  needs_setup: 'assistant.status.needsSetup',
  ready: 'assistant.status.ready',
};

export default function AssistantScreen() {
  const t = useT();
  const theme = useTheme();

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title={t('assistant.title')} onBack={() => router.back()} />

      <View style={styles.body}>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
          {t('assistant.subtitle')}
        </Text>

        <View style={[styles.notice, { backgroundColor: theme.colors.warningSurface }]}>
          <Icon name="information-circle-outline" size={20} color={theme.colors.warning} />
          <Text style={[styles.noticeText, { color: theme.colors.warning }]}>
            {t('assistant.disabled')}
          </Text>
        </View>

        <View style={styles.section}>
          <SectionHeader title={t('assistant.providers')} />
          <View style={styles.providerList}>
            {PROVIDERS.map((p, idx) => (
              <Card key={p.key}>
                <View style={styles.providerRow}>
                  <Icon name={p.icon} size={24} color={theme.colors.text} />
                  <View style={styles.providerInfo}>
                    <Text style={[styles.providerLabel, { color: theme.colors.text }]}>
                      {t(p.labelKey)}
                    </Text>
                    <Text style={[styles.priority, { color: theme.colors.textMuted }]}>
                      {t('assistant.priority', { n: idx + 1 })}
                    </Text>
                  </View>
                  <Badge label={t(STATUS_KEY[p.status])} tone={STATUS_TONE[p.status]} />
                </View>
              </Card>
            ))}
          </View>
        </View>
      </View>

      <View style={[styles.composer, { borderTopColor: theme.colors.border }]}>
        <View style={styles.composerInput}>
          <TextField
            value=""
            editable={false}
            onChangeText={() => undefined}
            placeholder={t('assistant.inputPlaceholder')}
          />
        </View>
        <View
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          accessibilityLabel={t('assistant.send')}
          style={[styles.sendButton, { backgroundColor: theme.colors.surfaceAlt }]}
        >
          <Icon name="send" size={18} color={theme.colors.textMuted} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: 16, gap: 16 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10 },
  noticeText: { flex: 1, fontSize: 13, fontWeight: '500' },
  section: { gap: 4 },
  providerList: { gap: 10 },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  providerInfo: { flex: 1 },
  providerLabel: { fontSize: 15, fontWeight: '600' },
  priority: { fontSize: 12 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  composerInput: { flex: 1, opacity: 0.6 },
  sendButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
