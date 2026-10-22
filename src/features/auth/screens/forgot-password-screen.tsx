import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';

import { PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { TextField } from '@/components/ui/text-field';
import { supabase } from '@/services/supabase/client';

import { authRedirectUrl } from '../auth-callback';
import { friendlyAuthError } from '../auth-errors';
import { useAuth } from '../auth-provider';
import { AuthLayout } from '../components/auth-layout';
import { ConfigNotice } from '../components/config-notice';
import { emailError, normalizeEmail } from '../validation';

export default function ForgotPasswordScreen() {
  const { configured } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const inFlight = useRef(false);

  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit() {
    if (!supabase || inFlight.current) return;
    const problem = emailError(email);
    setError(problem);
    if (problem) return;

    inFlight.current = true;
    setSubmitting(true);
    setFormError(null);
    const address = normalizeEmail(email);
    try {
      const { error: requestError } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: authRedirectUrl(),
      });
      // Only failures that say nothing about the account are surfaced; anything
      // else gets the same neutral confirmation as a success.
      const friendly = requestError ? friendlyAuthError(requestError, 'forgot') : null;
      if (friendly && (friendly.kind === 'network' || friendly.kind === 'rate-limit')) {
        setFormError(friendly.message);
      } else {
        setSentTo(address);
      }
    } catch (caught) {
      setFormError(friendlyAuthError(caught, 'forgot').message);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" subtitle={`If an account exists for ${sentTo}, we've sent a link to reset its password.`}>
        <FormMessage tone="info">
          Open the link on this phone to choose a new password. It can take a few minutes to arrive; check your spam
          folder if you don&apos;t see it.
        </FormMessage>
        <PrimaryButton title="Back to sign in" fullWidth onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))} />
        <SecondaryButton title="Try a different email" fullWidth onPress={() => setSentTo(null)} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset your password" subtitle="Enter the email you use for your club account and we'll send you a reset link.">
      <ConfigNotice />
      <TextField
        label="Email"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          if (error) setError(undefined);
        }}
        error={error}
        placeholder="name@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
        returnKeyType="send"
        onSubmitEditing={handleSubmit}
        editable={!submitting}
      />
      {formError ? <FormMessage tone="error">{formError}</FormMessage> : null}
      <PrimaryButton
        title="Send reset link"
        loadingLabel="Sending"
        fullWidth
        loading={submitting}
        disabled={!configured}
        onPress={handleSubmit}
      />
    </AuthLayout>
  );
}
