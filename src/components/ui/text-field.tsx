import { SymbolView } from 'expo-symbols';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useRevealInput } from '@/components/ui/keyboard-aware-scroll-view';
import { useTheme } from '@/hooks/use-theme';
import { Layout, Radii, Spacing, Typography } from '@/theme';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string;
  hint?: string;
  /** Renders a show/hide control and masks the value until revealed. */
  secureToggle?: boolean;
};

/**
 * Labelled text input with inline error text. The label, error and hint are
 * announced together by screen readers; the error is also marked as a live region.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, secureToggle = false, editable = true, onFocus, onBlur, ...rest },
  ref
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const revealInput = useRevealInput();
  useImperativeHandle(ref, () => inputRef.current as TextInput);

  const borderColor = error ? theme.danger : focused ? theme.primary : theme.borderStrong;
  const description = [error, hint].filter(Boolean).join('. ');

  return (
    <View style={styles.container}>
      <ThemedText variant="bodyStrong" style={styles.label} nativeID={`${label}-label`}>
        {label}
      </ThemedText>
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: theme.inputBackground,
            borderColor,
            borderWidth: focused || error ? 1.5 : 1,
          },
          !editable && styles.disabled,
        ]}>
        <TextInput
          ref={inputRef}
          accessibilityLabel={label}
          accessibilityHint={description || undefined}
          accessibilityState={{ disabled: !editable }}
          aria-invalid={!!error}
          editable={editable}
          placeholderTextColor={theme.textSecondary}
          selectionColor={theme.primary}
          cursorColor={theme.primary}
          secureTextEntry={secureToggle && !revealed}
          style={[styles.input, Typography.body, { color: theme.text }]}
          onFocus={(event) => {
            setFocused(true);
            // Keep the field above the keyboard when focus moves while it is open.
            revealInput?.(inputRef.current);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          {...rest}
        />
        {secureToggle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            onPress={() => setRevealed((value) => !value)}
            hitSlop={8}
            style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
            <SymbolView
              name={
                revealed
                  ? { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' }
                  : { ios: 'eye', android: 'visibility', web: 'visibility' }
              }
              size={22}
              tintColor={theme.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <ThemedText variant="caption" themeColor="danger" accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : hint ? (
        <ThemedText variant="caption" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
  },
  label: {
    fontSize: 15,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: Layout.minTouchTarget + 4,
    borderRadius: Radii.md,
  },
  input: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  toggle: {
    width: Layout.minTouchTarget,
    height: Layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.55,
  },
});
