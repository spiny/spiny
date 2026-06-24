import { useMemo } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { parseDocumentUri } from '@/domain/markdown';
import { useTheme } from '@/state';
import { parseBlocks, parseInline, type Block, type InlineNode } from './parser';

interface MarkdownPreviewProps {
  markdown: string;
  onPressDocumentLink?: (documentId: string) => void;
}

/**
 * Read-only Markdown preview (technical/editor.md). Renders the documented
 * feature set with React Native primitives; document links use the app URI and
 * invoke `onPressDocumentLink`, external links open via `Linking`.
 */
export function MarkdownPreview({ markdown, onPressDocumentLink }: MarkdownPreviewProps) {
  const theme = useTheme();
  const blocks = useMemo(() => parseBlocks(markdown), [markdown]);

  const handleLink = (target: string) => {
    const documentId = parseDocumentUri(target);
    if (documentId) {
      onPressDocumentLink?.(documentId);
      return;
    }
    Linking.openURL(target).catch(() => undefined);
  };

  const renderInline = (nodes: InlineNode[], keyPrefix: string): React.ReactNode[] =>
    nodes.map((node, idx) => {
      const key = `${keyPrefix}.${idx}`;
      switch (node.type) {
        case 'text':
          return <Text key={key}>{node.value}</Text>;
        case 'bold':
          return (
            <Text key={key} style={styles.bold}>
              {renderInline(node.children, key)}
            </Text>
          );
        case 'italic':
          return (
            <Text key={key} style={styles.italic}>
              {renderInline(node.children, key)}
            </Text>
          );
        case 'code':
          return (
            <Text
              key={key}
              style={[styles.inlineCode, { backgroundColor: theme.colors.codeBackground }]}
            >
              {node.value}
            </Text>
          );
        case 'link':
          return (
            <Text
              key={key}
              style={[styles.link, { color: theme.colors.link }]}
              onPress={() => handleLink(node.target)}
              accessibilityRole="link"
            >
              {renderInline(node.children, key)}
            </Text>
          );
        default:
          return null;
      }
    });

  const renderBlock = (block: Block, idx: number): React.ReactNode => {
    const key = `b${idx}`;
    switch (block.type) {
      case 'heading': {
        const sizes = [theme.fontSize.title, theme.fontSize.xxl, theme.fontSize.xl, theme.fontSize.lg, theme.fontSize.md, theme.fontSize.sm];
        const size = sizes[Math.min(block.level - 1, sizes.length - 1)];
        return (
          <Text
            key={key}
            accessibilityRole="header"
            style={[styles.block, styles.heading, { fontSize: size, color: theme.colors.text }]}
          >
            {renderInline(parseInline(block.text), key)}
          </Text>
        );
      }
      case 'paragraph':
        return (
          <Text key={key} style={[styles.block, styles.paragraph, { color: theme.colors.text }]}>
            {renderInline(parseInline(block.text), key)}
          </Text>
        );
      case 'code':
        return (
          <View
            key={key}
            style={[styles.block, styles.codeBlock, { backgroundColor: theme.colors.codeBackground, borderColor: theme.colors.border }]}
          >
            <Text style={[styles.codeText, { color: theme.colors.text }]}>{block.text}</Text>
          </View>
        );
      case 'hr':
        return <View key={key} style={[styles.hr, { backgroundColor: theme.colors.border }]} />;
      case 'quote':
        return (
          <View key={key} style={[styles.block, styles.quote, { borderLeftColor: theme.colors.primary }]}>
            {block.lines.map((line, li) => (
              <Text key={`${key}.${li}`} style={[styles.paragraph, { color: theme.colors.textSecondary }]}>
                {renderInline(parseInline(line), `${key}.${li}`)}
              </Text>
            ))}
          </View>
        );
      case 'list':
        return (
          <View key={key} style={styles.block}>
            {block.items.map((item, li) => (
              <View key={`${key}.${li}`} style={styles.listItem}>
                <Text style={[styles.listMarker, { color: theme.colors.textSecondary }]}>
                  {block.ordered ? `${li + 1}.` : '•'}
                </Text>
                <Text style={[styles.listText, styles.paragraph, { color: theme.colors.text }]}>
                  {renderInline(parseInline(item), `${key}.${li}`)}
                </Text>
              </View>
            ))}
          </View>
        );
      default:
        return null;
    }
  };

  return <View>{blocks.map(renderBlock)}</View>;
}

const styles = StyleSheet.create({
  block: { marginBottom: 12 },
  heading: { fontWeight: '700' },
  paragraph: { fontSize: 16, lineHeight: 24 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  inlineCode: { fontFamily: 'monospace', paddingHorizontal: 4, borderRadius: 4 },
  link: { textDecorationLine: 'underline' },
  codeBlock: { padding: 12, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  codeText: { fontFamily: 'monospace', fontSize: 14, lineHeight: 20 },
  hr: { height: StyleSheet.hairlineWidth, marginVertical: 16 },
  quote: { borderLeftWidth: 3, paddingLeft: 12 },
  listItem: { flexDirection: 'row', marginBottom: 4, paddingRight: 8 },
  listMarker: { width: 24, fontSize: 16, lineHeight: 24 },
  listText: { flex: 1 },
});
