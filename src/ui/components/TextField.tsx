import { forwardRef } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/state';

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * Labeled text input (technical/platform.md text-input requirements). Multiline
 * inputs top-align on Android; font scaling is kept enabled for accessibility.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, containerStyle, multiline, style, ...rest },
  ref
) {
  const theme = useTheme();
  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={[styles.label, { color: theme.colors.textSecondary }]}>{label}</Text> : null}
      <TextInput
        ref={ref}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        placeholderTextColor={theme.colors.textMuted}
        accessibilityLabel={label ?? rest.placeholder}
        style={[
          styles.input,
          {
            color: theme.colors.text,
            backgroundColor: theme.colors.inputBackground,
            borderColor: error ? theme.colors.danger : theme.colors.inputBorder,
            borderRadius: theme.radius.md,
          },
          multiline && styles.multiline,
          style,
        ]}
        {...rest}
      />
      {error ? <Text style={[styles.error, { color: theme.colors.danger }]}>{error}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600' },
  input: {
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  multiline: { minHeight: 120 },
  error: { fontSize: 12 },
});
