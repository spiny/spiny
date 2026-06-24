import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/state';
import { Icon, type IconName } from './Icon';

interface IconButtonProps {
  name: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  color?: string;
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Accessible icon-only button (technical/platform.md accessibility). */
export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  color,
  size = 22,
  disabled = false,
  style,
}: IconButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 },
        style,
      ]}
    >
      <Icon name={name} size={size} color={color ?? theme.colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { padding: 8, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
