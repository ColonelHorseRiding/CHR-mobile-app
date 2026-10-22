import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/features/auth/auth-provider';
import { markRead } from '@/features/notifications/notifications-api';
import { notifyChanged } from '@/features/notifications/use-notifications';

import { Notifications } from './notifications-module';
import { hasAskedBefore, onTokenChange, registerThisDevice } from './push-device';
import { targetFor } from './push-payload';

/** Chosen once at load, so the hook order never changes between renders. */
const useLastResponse = Notifications ? Notifications.useLastNotificationResponse : () => undefined;

/**
 * Phone alerts for the signed-in area (mounted once, in (app)/_layout):
 * - registers this phone for the member — asking for permission only once,
 *   automatically, on the first signed-in launch; later only if it was granted
 *   (e.g. in system settings) — and again when the token rotates;
 * - refreshes the bell badge when an alert arrives while the app is open;
 * - opens the right screen when an alert is tapped, whether the app was in the
 *   foreground, in the background or closed — each tap handled once.
 */
export function usePush() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    void registerThisDevice({ prompt: !hasAskedBefore() });

    const token = onTokenChange(() => void registerThisDevice({ prompt: false }));
    // Permission may have been switched on in system settings while the app was away.
    let last = AppState.currentState;
    const appState = AppState.addEventListener('change', (next) => {
      if (last !== 'active' && next === 'active') void registerThisDevice({ prompt: false });
      last = next;
    });
    const received = Notifications?.addNotificationReceivedListener(() => notifyChanged());
    return () => {
      token.remove();
      appState.remove();
      received?.remove();
    };
  }, [userId]);

  const response = useLastResponse();
  const handled = useRef(new Set<string>());

  useEffect(() => {
    if (!Notifications || !userId || !response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const key = response.notification.request.identifier;
    if (handled.current.has(key)) return;
    handled.current.add(key);
    void Notifications.clearLastNotificationResponseAsync().catch(() => {});

    const target = targetFor(response.notification.request.content.data);
    if (!target) return;
    if (target.notificationId) {
      markRead([target.notificationId])
        .then(notifyChanged)
        .catch(() => {});
    }
    router.push(target.href);
  }, [response, userId]);
}
