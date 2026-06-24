import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/state';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const theme = useTheme();

  const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: theme.colors.primary, fg: theme.colors.onPrimary, border: theme.colors.primary },
    secondary: { bg: theme.colors.surfaceAlt, fg: theme.colors.text, border: theme.colors.border },
    danger: { bg: theme.colors.danger, fg: theme.colors.onDanger, border: theme.colors.danger },
    ghost: { bg: 'transparent', fg: theme.colors.primary, border: 'transparent' },
  };
  const colors = palette[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          borderRadius: theme.radius.md,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={colors.fg} /> : null}
          <Text style={[styles.label, { color: colors.fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 15, fontWeight: '600' },
});
