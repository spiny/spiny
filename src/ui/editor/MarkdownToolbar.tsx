import { ScrollView, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Pressable } from 'react-native';

import { useT, useTheme } from '@/state';
import { Icon, type IconName } from '@/ui/components';

interface ToolbarProps {
  onBold: () => void;
  onItalic: () => void;
  onHeading: (level: number) => void;
  onHorizontalRule: () => void;
  onDocumentLink: () => void;
  onExternalLink: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Markdown helper toolbar (technical/editor.md required actions). */
export function MarkdownToolbar({
  onBold,
  onItalic,
  onHeading,
  onHorizontalRule,
  onDocumentLink,
  onExternalLink,
  style,
}: ToolbarProps) {
  const theme = useTheme();
  const t = useT();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      contentContainerStyle={styles.content}
      style={[styles.bar, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }, style]}
    >
      <TextTool label="B" bold onPress={onBold} accessibilityLabel={t('toolbar.bold')} />
      <TextTool label="I" italic onPress={onItalic} accessibilityLabel={t('toolbar.italic')} />
      {[1, 2, 3, 4, 5].map((level) => (
        <TextTool
          key={level}
          label={`H${level}`}
          onPress={() => onHeading(level)}
          accessibilityLabel={t(`toolbar.h${level}` as 'toolbar.h1')}
        />
      ))}
      <IconTool name="remove" onPress={onHorizontalRule} accessibilityLabel={t('toolbar.hr')} />
      <IconTool name="document-text-outline" onPress={onDocumentLink} accessibilityLabel={t('toolbar.documentLink')} />
      <IconTool name="link-outline" onPress={onExternalLink} accessibilityLabel={t('toolbar.externalLink')} />
    </ScrollView>
  );
}

function TextTool({
  label,
  bold,
  italic,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  bold?: boolean;
  italic?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      style={({ pressed }) => [
        styles.tool,
        { backgroundColor: theme.colors.surfaceAlt, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Text
        style={[
          styles.toolText,
          { color: theme.colors.text },
          bold && styles.bold,
          italic && styles.italic,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function IconTool({
  name,
  onPress,
  accessibilityLabel,
}: {
  name: IconName;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      style={({ pressed }) => [
        styles.tool,
        { backgroundColor: theme.colors.surfaceAlt, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name={name} size={18} color={theme.colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, maxHeight: 48 },
  content: { alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6 },
  tool: {
    minWidth: 38,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolText: { fontSize: 15, fontWeight: '600' },
  bold: { fontWeight: '800' },
  italic: { fontStyle: 'italic' },
});
