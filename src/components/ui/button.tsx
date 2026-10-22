import { useRef, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useColorSchemeName, useTheme } from '@/hooks/use-theme';
import { ButtonVariants, DarkDisabled, Layout, Radii, Spacing, type ButtonVariant } from '@/theme';

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  /** Shown next to the spinner while loading ("Booking…"); defaults to the title so the button keeps its width. */
  loadingLabel?: string;
  fullWidth?: boolean;
  /** Optional icon shown before the title (e.g. a provider logo). */
  leading?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  title,
  variant = 'primary',
  loading = false,
  loadingLabel,
  fullWidth = false,
  leading,
  disabled,
  style,
  accessibilityLabel,
  onPress,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const scheme = useColorSchemeName();
  const spec = ButtonVariants[variant];
  const isDisabled = disabled || loading;
  // Dark mode shows a disabled control in solid muted colours (fading alone reads poorly on dark surfaces).
  const solidDisabled = scheme === 'dark' && !!disabled && !loading;
  // Closes the gap before React re-renders: a second tap while an async handler is still running is ignored.
  const pending = useRef(false);
  const handlePress: ButtonProps['onPress'] = (event) => {
    if (pending.current || isDisabled) return;
    const result = onPress?.(event) as unknown;
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      pending.current = true;
      const release = () => {
        pending.current = false;
      };
      (result as Promise<unknown>).then(release, release);
    }
  };
  const textColor = solidDisabled ? DarkDisabled.text : theme[spec.text];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={loading ? `${loadingLabel ?? title}, in progress` : (accessibilityLabel ?? title)}
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      accessibilityLiveRegion={loading ? 'polite' : 'none'}
      disabled={isDisabled}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        {
          backgroundColor: solidDisabled
            ? spec.background ? DarkDisabled.background : 'transparent'
            : pressed ? theme[spec.pressed] : spec.background ? theme[spec.background] : 'transparent',
          borderColor: solidDisabled ? (spec.border || spec.background ? DarkDisabled.border : 'transparent') : spec.border ? theme[spec.border] : 'transparent',
        },
        isDisabled && !solidDisabled && styles.disabled,
        style,
      ]}
      {...rest}>
      {loading ? (
        <View style={styles.content}>
          <ActivityIndicator color={textColor} />
          <ThemedText variant="label" style={[styles.label, { color: textColor }]} numberOfLines={2}>
            {loadingLabel ?? title}
          </ThemedText>
        </View>
      ) : (
        <View style={styles.content}>
          {leading}
          <ThemedText variant="label" style={[styles.label, { color: textColor }]} numberOfLines={2}>
            {title}
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

export function PrimaryButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="primary" />;
}

export function SecondaryButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="secondary" />;
}

const styles = StyleSheet.create({
  base: {
    minHeight: Layout.minTouchTarget,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radii.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  label: {
    textAlign: 'center',
    flexShrink: 1,
  },
  disabled: {
    opacity: 0.45,
  },
});

/** The shared button for any asynchronous action: spinner plus contextual label while it runs. */
export const LoadingButton = Button;
