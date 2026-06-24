import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT, useTheme } from '@/state';
import { IconButton } from './IconButton';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/** Bottom sheet modal used for pickers and dialogs (link insert, choosers). */
export function Sheet({ visible, onClose, title, children }: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable
          style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}
          onPress={onClose}
          accessibilityLabel={t('common.close')}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View style={styles.handleArea}>
            <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
          </View>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.text }]}>{title ?? ''}</Text>
            <IconButton name="close" onPress={onClose} accessibilityLabel={t('common.close')} />
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1 },
  sheet: {
    maxHeight: '82%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
  handleArea: { alignItems: 'center', paddingVertical: 8 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '700', flex: 1 },
});
