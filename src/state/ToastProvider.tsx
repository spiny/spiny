import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from './ThemeProvider';

export type ToastVariant = 'info' | 'error' | 'success';

interface ToastMessage {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DISPLAY_MS = 3800;

/**
 * Lightweight transient notifications. Used for sync conflict notices
 * (technical/sync.md) and general feedback.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const hide = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setToast(null);
    });
  }, [opacity]);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      counter.current += 1;
      setToast({ id: counter.current, message, variant });
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(hide, DISPLAY_MS);
    },
    [hide, opacity]
  );

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  const background =
    toast?.variant === 'error'
      ? theme.colors.danger
      : toast?.variant === 'success'
        ? theme.colors.success
        : theme.colors.surfaceSelected;
  const color =
    toast?.variant === 'error'
      ? theme.colors.onDanger
      : toast?.variant === 'success'
        ? '#FFFFFF'
        : theme.colors.text;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.wrap, { bottom: insets.bottom + 16, opacity }]}
        >
          <Pressable
            onPress={hide}
            accessibilityRole="alert"
            accessibilityLabel={toast.message}
            style={[styles.toast, { backgroundColor: background, borderRadius: theme.radius.md }]}
          >
            <Text style={[styles.text, { color }]}>{toast.message}</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: { paddingHorizontal: 16, paddingVertical: 12, maxWidth: 560, width: '100%' },
  text: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
});
