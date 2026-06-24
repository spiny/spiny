import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/state';

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

/** Surface container used for list rows and grouped content. */
export function Card({
  children,
  onPress,
  onLongPress,
  selected = false,
  accessibilityLabel,
  accessibilityHint,
  style,
}: CardProps) {
  const theme = useTheme();
  const base: ViewStyle = {
    backgroundColor: selected ? theme.colors.surfaceSelected : theme.colors.surface,
    borderColor: selected ? theme.colors.primary : theme.colors.border,
    borderRadius: theme.radius.md,
  };

  if (!onPress && !onLongPress) {
    return <View style={[styles.card, base, style]}>{children}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.card, base, { opacity: pressed ? 0.85 : 1 }, style]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderWidth: StyleSheet.hairlineWidth },
});
