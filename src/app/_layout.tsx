import { Stack } from 'expo-router';
import { ThemeProvider } from 'expo-router/react-navigation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrandSplash } from '@/components/brand/brand-splash';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import { AuthProvider, useAuth } from '@/features/auth/auth-provider';
import { useColorSchemeName } from '@/hooks/use-theme';
import { Colors, getNavigationTheme } from '@/theme';

// Keep the native splash up until the saved session has been restored, so no
// screen is shown for the wrong signed-in state.
SplashScreen.preventAutoHideAsync().catch(() => {});

/** Upper bound on holding the native splash if session restore is slow (e.g. offline token refresh). */
const MAX_SPLASH_MS = 5000;
/** The launch screen stays at least this long once drawn, so a fast session restore does not just flash it. */
const MIN_SPLASH_MS = 900;

export default function RootLayout() {
  const scheme = useColorSchemeName();

  // Root view colour shows behind screens during transitions and behind the
  // transparent Android navigation bar (edge-to-edge); keep it on-theme.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(Colors[scheme].background).catch(() => {});
  }, [scheme]);

  return (
    <AuthProvider>
      <ThemeProvider value={getNavigationTheme(scheme)}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <RootNavigator />
      </ThemeProvider>
    </AuthProvider>
  );
}

/**
 * Auth-aware routing with Expo Router protected routes:
 * - (app): the Phase 1 tabs, only when signed in.
 * - (auth): sign-in, registration and forgot-password, only when signed out.
 * - reset-password: only for the recovery session a reset link creates.
 * - auth/callback: always reachable, so deep links can complete sign-in.
 * When a guard flips (sign-in, sign-out, session expiry) Expo Router moves the
 * customer to the first screen they are allowed to see.
 */
function RootNavigator() {
  const { status, recovery } = useAuth();
  const signedIn = status === 'authenticated';
  const loading = status === 'loading';
  const [splashTimedOut, setSplashTimedOut] = useState(false);
  const [splashDrawn, setSplashDrawn] = useState(false);
  const [splashMinElapsed, setSplashMinElapsed] = useState(false);
  // Shown while the session is restored, and for a short minimum once drawn; never beyond MAX_SPLASH_MS.
  const showSplash = !splashTimedOut && (loading || !splashMinElapsed);

  useEffect(() => {
    if (!splashDrawn) return;
    const timer = setTimeout(() => setSplashMinElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, [splashDrawn]);

  // Hide once auth is resolved, after the first frame has been drawn: hiding
  // during the very first effect (e.g. when Supabase is not configured and auth
  // resolves synchronously) can be lost, leaving the splash up indefinitely.
  useEffect(() => {
    if (loading) return;
    const frame = requestAnimationFrame(() => SplashScreen.hide());
    return () => cancelAnimationFrame(frame);
  }, [loading]);

  // Safety net on every launch: the native splash never outlives MAX_SPLASH_MS.
  useEffect(() => {
    const timeout = setTimeout(() => {
      SplashScreen.hide();
      setSplashTimedOut(true);
    }, MAX_SPLASH_MS);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <>
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Protected guard={signedIn && !recovery}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && recovery}>
          <Stack.Screen name="reset-password" />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" />
      </Stack>
      {loading && splashTimedOut ? <BootScreen /> : null}
      <BrandSplash
        visible={showSplash}
        onShown={() => {
          // The launch screen is on screen: the native one can go.
          SplashScreen.hide();
          setSplashDrawn(true);
        }}
      />
    </>
  );
}

/** Covers the navigator while a slow session restore finishes after the native splash has gone. */
function BootScreen() {
  const scheme = useColorSchemeName();
  return (
    <View style={[StyleSheet.absoluteFill, styles.boot, { backgroundColor: Colors[scheme].background }]}>
      <LoadingIndicator label="Opening your club account" fill />
    </View>
  );
}

const styles = StyleSheet.create({
  boot: {
    zIndex: 1000,
  },
});
