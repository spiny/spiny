import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/state';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, body, actionLabel, onAction }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      {icon ? <Icon name={icon} size={42} color={theme.colors.textMuted} /> : null}
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {body ? <Text style={[styles.body, { color: theme.colors.textMuted }]}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <View>
          <Button label={actionLabel} onPress={onAction} icon="add" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
