import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, PrimaryButton } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { TextField } from '@/components/ui/text-field';
import { supabase } from '@/services/supabase/client';

import { authRedirectUrl } from '../auth-callback';
import { friendlyAuthError, type FriendlyAuthError } from '../auth-errors';
import { useAuth } from '../auth-provider';
import { AuthLayout } from '../components/auth-layout';
import { ConfigNotice } from '../components/config-notice';
import { GoogleSignInButton, OrDivider, useGoogleAvailable } from '../components/google-sign-in';
import { signInWithGoogle } from '../google-auth';
import { hasErrors, normalizeEmail, validateSignIn, type FieldErrors } from '../validation';

type Message = { tone: 'error' | 'success' | 'info'; text: string; kind?: FriendlyAuthError['kind'] };

export default function SignInScreen() {
  const { configured, notice, clearNotice } = useAuth();
  const googleAvailable = useGoogleAvailable();
  const passwordRef = useRef<TextInput>(null);
  const inFlight = useRef(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<'email' | 'password'>>({});
  const [message, setMessage] = useState<Message | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [resending, setResending] = useState(false);

  const busy = submitting || googleBusy;

  async function handleSignIn() {
    if (!supabase || inFlight.current) return;
    clearNotice();
    const nextErrors = validateSignIn({ email, password });
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;

    inFlight.current = true;
    setSubmitting(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: normalizeEmail(email), password });
      if (error) {
        const friendly = friendlyAuthError(error, 'sign-in');
        setMessage({ tone: 'error', text: friendly.message, kind: friendly.kind });
        setPassword('');
      }
      // On success the auth guard moves the customer into the app.
    } catch (error) {
      setMessage({ tone: 'error', text: friendlyAuthError(error, 'sign-in').message });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  async function handleResendConfirmation() {
    if (!supabase || resending) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: normalizeEmail(email),
        options: { emailRedirectTo: authRedirectUrl() },
      });
      setMessage(
        error
          ? { tone: 'error', text: friendlyAuthError(error, 'resend').message }
          : { tone: 'success', text: 'We sent a new confirmation link. Open it on this phone, then sign in.' }
      );
    } catch (error) {
      setMessage({ tone: 'error', text: friendlyAuthError(error, 'resend').message });
    } finally {
      setResending(false);
    }
  }

  async function handleGoogle() {
    if (busy) return;
    clearNotice();
    setMessage(null);
    setGoogleBusy(true);
    const result = await signInWithGoogle();
    setGoogleBusy(false);
    if (result.status === 'cancelled') {
      setMessage({ tone: 'info', text: 'Google sign-in was cancelled. You can try again or use your email.' });
    } else if (result.status === 'error') {
      setMessage({ tone: 'error', text: result.error.message });
    }
  }

  return (
    <AuthLayout
      hero="brand"
      title="Welcome back"
      subtitle="Sign in to your club account."
      footer={
        <>
          <ThemedText themeColor="textSecondary">New to the club?</ThemedText>
          <Button variant="secondary" title="Create an account" fullWidth onPress={() => router.push('/sign-up')} />
        </>
      }>
      <ConfigNotice />
      {notice ? <FormMessage tone="info">{notice}</FormMessage> : null}

      <View style={styles.fields}>
        <TextField
          label="Email"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
          }}
          error={errors.email}
          placeholder="name@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="username"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          editable={!busy}
        />
        <View style={styles.passwordBlock}>
          <TextField
            ref={passwordRef}
            label="Password"
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
            }}
            error={errors.password}
            secureToggle
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={handleSignIn}
            editable={!busy}
          />
          <Button
            variant="ghost"
            title="Forgot password?"
            style={styles.forgot}
            onPress={() => router.push({ pathname: '/forgot-password', params: { email: normalizeEmail(email) } })}
          />
        </View>
      </View>

      {message ? (
        <FormMessage
          tone={message.tone}
          action={
            message.kind === 'email-not-confirmed' ? (
              <Button
                variant="ghost"
                title="Resend confirmation email"
                loading={resending}
                onPress={handleResendConfirmation}
              />
            ) : undefined
          }>
          {message.text}
        </FormMessage>
      ) : null}

      <PrimaryButton
        title="Sign in"
        loadingLabel="Signing in"
        fullWidth
        loading={submitting}
        disabled={!configured || googleBusy}
        onPress={handleSignIn}
      />

      {googleAvailable ? (
        <>
          <OrDivider />
          <GoogleSignInButton onPress={handleGoogle} loading={googleBusy} disabled={submitting} />
        </>
      ) : null}
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  fields: {
    gap: 20,
  },
  passwordBlock: {
    gap: 4,
  },
  forgot: {
    alignSelf: 'flex-end',
    paddingHorizontal: 8,
  },
});
