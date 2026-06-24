import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/state';

interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.container, { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md }]}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={opt.label}
            style={[
              styles.segment,
              {
                backgroundColor: selected ? theme.colors.primary : 'transparent',
                borderRadius: theme.radius.md - 2,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: selected ? theme.colors.onPrimary : theme.colors.textSecondary },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', padding: 3, gap: 3 },
  segment: { flex: 1, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, fontWeight: '600' },
});
