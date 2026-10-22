import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';
import { Radii, Spacing } from '@/theme';

import { pushPermission, registerThisDevice, type PushStatus } from './push-device';

const COPY: Record<PushStatus, { title: string; body: string }> = {
  registered: {
    title: 'Phone alerts are on',
    body: 'Bookings, class reminders, membership and order updates also arrive as alerts on this phone.',
  },
  undetermined: {
    title: 'Phone alerts are off',
    body: 'Turn them on to get booking, reminder and order updates on this phone.',
  },
  denied: {
    title: 'Phone alerts are off',
    body: 'Turn them on to get booking, reminder and order updates on this phone.',
  },
  withdrawn: {
    title: 'Phone alerts are off',
    body: 'You turned them off in Privacy & data. Turn them back on there to get alerts again.',
  },
  unavailable: {
    title: 'Phone alerts aren’t available here',
    body: 'Updates will still appear in your notification centre.',
  },
  failed: {
    title: 'Phone alerts couldn’t be set up',
    body: 'Check your connection and try again. Updates will still appear in your notification centre.',
  },
};

/**
 * The profile's phone-alerts status. It reflects the phone's real permission
 * and the outcome of the last registration; the button asks the system (or
 * opens system settings once Android no longer allows asking).
 */
export function PhoneAlertsRow() {
  const theme = useTheme();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [canAsk, setCanAsk] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const p = await pushPermission();
    setCanAsk(p.canAsk);
    // Permission granted: confirm the registration actually reached the club.
    setStatus(p.status === 'registered' ? await registerThisDevice({ prompt: false }) : p.status);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      const sub = AppState.addEventListener('change', (s) => s === 'active' && void refresh());
      return () => sub.remove();
    }, [refresh])
  );

  const turnOn = async () => {
    if (status === 'withdrawn') {
      router.push('/profile/privacy');
      return;
    }
    if (!canAsk && status === 'denied') {
      void Linking.openSettings();
      return;
    }
    setBusy(true);
    setStatus(await registerThisDevice({ prompt: true }));
    setCanAsk((await pushPermission()).canAsk);
    setBusy(false);
  };

  if (!status) return null;
  const copy = COPY[status];
  const on = status === 'registered';
  const action =
    status === 'withdrawn' ? 'Open privacy choices' : status === 'failed' ? 'Try again' : status === 'denied' && !canAsk ? 'Open phone settings' : status === 'undetermined' || status === 'denied' ? 'Turn on phone alerts' : null;

  return (
    <View style={[styles.notice, { backgroundColor: theme.surfaceMuted }]} accessible={!action} accessibilityLabel={`${copy.title}. ${copy.body}`}>
      <SymbolView
        name={on ? { ios: 'bell.badge', android: 'notifications_active', web: 'notifications_active' } : { ios: 'bell.slash', android: 'notifications_off', web: 'notifications_off' }}
        size={18}
        tintColor={theme.accentText}
        resizeMode="scaleAspectFit"
        style={styles.icon}
      />
      <View style={styles.flex}>
        <ThemedText variant="bodyStrong">{copy.title}</ThemedText>
        <ThemedText variant="caption" themeColor="textSecondary">
          {copy.body}
        </ThemedText>
        {action ? <Button variant="secondary" title={action} loadingLabel="Turning on" loading={busy} onPress={turnOn} style={styles.button} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, borderRadius: Radii.md, padding: Spacing.md },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  icon: { width: 20, height: 20 },
  button: { alignSelf: 'flex-start', marginTop: Spacing.sm },
});
