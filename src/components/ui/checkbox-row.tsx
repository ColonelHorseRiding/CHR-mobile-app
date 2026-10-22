import { SymbolView } from 'expo-symbols';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Layout, Spacing } from '@/theme';

export type CheckboxRowProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** The label; may contain inline links. */
  children: ReactNode;
  /** Spoken label (the visible one can hold links). */
  accessibilityLabel: string;
  error?: string;
  disabled?: boolean;
};

/** A labelled checkbox with a full-width touch target, an inline error and screen-reader state. */
export function CheckboxRow({ checked, onChange, children, accessibilityLabel, error, disabled = false }: CheckboxRowProps) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ checked, disabled }}
        disabled={disabled}
        onPress={() => onChange(!checked)}
        style={styles.row}>
        <View
          style={[
            styles.box,
            { borderColor: error ? theme.danger : checked ? theme.primary : theme.borderStrong, backgroundColor: checked ? theme.primary : theme.inputBackground },
          ]}>
          {checked ? (
            <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={16} tintColor={theme.onPrimary} resizeMode="scaleAspectFit" style={styles.tick} />
          ) : null}
        </View>
        <View style={styles.label}>{children}</View>
      </Pressable>
      {error ? (
        <ThemedText variant="caption" style={{ color: theme.danger }} accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, minHeight: Layout.minTouchTarget, paddingVertical: Spacing.xs },
  box: { width: 26, height: 26, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  tick: { width: 16, height: 16 },
  label: { flex: 1, minWidth: 0 },
});
