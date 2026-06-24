import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useCatalogSyncState, useSync, useT, useTheme } from '@/state';
import { Icon, type IconName } from './Icon';

interface SyncStatusPillProps {
  catalogId: string | null;
  hasProvider: boolean;
  dirty?: boolean;
}

/**
 * Compact sync indicator (technical/sync.md subscription requirements). Shows
 * running/synced/stale/dirty/failed state and offers manual retry on failure.
 */
export function SyncStatusPill({ catalogId, hasProvider, dirty = false }: SyncStatusPillProps) {
  const theme = useTheme();
  const t = useT();
  const { retryNow } = useSync();
  const state = useCatalogSyncState(catalogId);

  let icon: IconName = 'cloud-outline';
  let label = t('sync.notConfigured');
  let color = theme.colors.textMuted;
  let canRetry = false;

  if (hasProvider) {
    const permanentlyFailed = (state?.permanentlyFailedDocumentIds?.length ?? 0) > 0;
    if (state?.status === 'running') {
      icon = 'sync';
      label = t('sync.status.running');
      color = theme.colors.primary;
    } else if (permanentlyFailed) {
      icon = 'alert-circle-outline';
      label = t('sync.permanentFailure');
      color = theme.colors.danger;
      canRetry = true;
    } else if (state?.status === 'failed' || state?.offline) {
      icon = 'cloud-offline-outline';
      label = t('sync.status.stale');
      color = theme.colors.warning;
      canRetry = true;
    } else if (dirty) {
      icon = 'cloud-upload-outline';
      label = t('sync.dirty');
      color = theme.colors.warning;
      canRetry = true;
    } else if (state?.status === 'completed') {
      icon = 'cloud-done-outline';
      label = t('sync.status.completed');
      color = theme.colors.success;
    } else {
      icon = 'cloud-outline';
      label = t('sync.status.idle');
      color = theme.colors.textMuted;
    }
  }

  const content = (
    <View style={styles.pill}>
      <Icon name={icon} size={15} color={color} />
      <Text style={[styles.text, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  if (canRetry && catalogId) {
    return (
      <Pressable
        onPress={() => retryNow(catalogId)}
        accessibilityRole="button"
        accessibilityLabel={`${t('a11y.syncStatus')}: ${label}. ${t('sync.retry')}`}
        hitSlop={6}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View accessibilityLabel={`${t('a11y.syncStatus')}: ${label}`}>{content}</View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 180 },
  text: { fontSize: 12, fontWeight: '500' },
});
