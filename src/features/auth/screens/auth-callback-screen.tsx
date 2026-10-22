import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { PrimaryButton } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import { ScreenContainer } from '@/components/ui/screen-container';

import { AUTH_CALLBACK_PATH, completeAuthFromParams, paramsFromUrl, type CallbackResult } from '../auth-callback';
import { useAuth } from '../auth-provider';
import { AuthLayout } from '../components/auth-layout';

/**
 * Landing route for `auth/callback` deep links: Google sign-in returns, email
 * confirmation links and password-reset links. Exchanges the one-time code,
 * then sends the customer to a screen the auth guards allow.
 */
export default function AuthCallbackScreen() {
  const { status, recovery } = useAuth();
  const routeParams = useLocalSearchParams<Record<string, string>>();
  const linkingUrl = Linking.useLinkingURL();
  const [handled, setHandled] = useState<{ key: string; result: CallbackResult } | null>(null);

  // Router params cover the query string; error details can also arrive in the fragment.
  const fromUrl = linkingUrl?.includes(AUTH_CALLBACK_PATH) ? paramsFromUrl(linkingUrl) : {};
  const params: Record<string, string | undefined> = { ...fromUrl, ...routeParams };
  // A new link can be delivered to this screen while it is open; handle each one.
  const linkKey = [params.code, params.error, params.error_code].join('|');
  const result = handled?.key === linkKey ? handled.result : null;

  useEffect(() => {
    // A bare access_denied is Google's Cancel button; the sign-in screen reports it.
    // Expired email links also use access_denied, but carry an error_code.
    const cancelledGoogle = params.error === 'access_denied' && !params.error_code;
    const pending: Promise<CallbackResult> = cancelledGoogle
      ? Promise.resolve({ status: 'ignored' })
      : completeAuthFromParams(params);
    let live = true;
    pending.then((next) => live && setHandled({ key: linkKey, result: next }));
    return () => {
      live = false;
    };
    // Re-run only when a different link arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkKey]);

  useEffect(() => {
    if (!result || result.status === 'error') return;
    // Wait until the session has reached the auth state, so the guards route correctly.
    if (result.status === 'signed-in' && status !== 'authenticated') return;
    leave(status === 'authenticated', recovery);
  }, [result, status, recovery]);

  if (result?.status === 'error') {
    return (
      <AuthLayout title="Link problem" subtitle="We couldn't finish signing you in from that link.">
        <FormMessage tone="error">{result.error.message}</FormMessage>
        <PrimaryButton title="Continue" fullWidth onPress={() => leave(status === 'authenticated', recovery)} />
      </AuthLayout>
    );
  }

  return (
    <ScreenContainer scroll={false} contentStyle={{ justifyContent: 'center' }}>
      <LoadingIndicator label="Signing you in" fill />
    </ScreenContainer>
  );
}

/** Navigate to a route the auth guards allow; a guarded route would leave this screen stuck. */
function leave(signedIn: boolean, recovery: boolean) {
  if (!signedIn) router.replace('/sign-in');
  else router.replace(recovery ? '/reset-password' : '/');
}
