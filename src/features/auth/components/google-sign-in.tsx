import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme';

import { isGoogleSignInEnabled } from '../google-auth';

/** Whether to offer Google sign-in: only once Supabase confirms the provider is enabled. */
export function useGoogleAvailable() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let live = true;
    isGoogleSignInEnabled().then((enabled) => live && setAvailable(enabled));
    return () => {
      live = false;
    };
  }, []);
  return available;
}

export function GoogleSignInButton({
  onPress,
  loading,
  disabled,
}: {
  onPress: () => void;
  loading: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="outline"
      title="Continue with Google"
      accessibilityHint="Opens Google to sign in or create your account"
      fullWidth
      loading={loading}
      loadingLabel="Opening Google"
      disabled={disabled}
      onPress={onPress}
      leading={
        <Image
          source={require('@/assets/images/auth/google-g.png')}
          style={styles.logo}
          accessibilityIgnoresInvertColors
        />
      }
    />
  );
}

export function OrDivider() {
  const theme = useTheme();
  return (
    <View style={styles.divider} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.line, { backgroundColor: theme.border }]} />
      <ThemedText variant="caption" themeColor="textSecondary">
        or
      </ThemedText>
      <View style={[styles.line, { backgroundColor: theme.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    width: 20,
    height: 20,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
});
