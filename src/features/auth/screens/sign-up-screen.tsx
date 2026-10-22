import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { CheckboxRow } from '@/components/ui/checkbox-row';
import { TextField } from '@/components/ui/text-field';
import { usePrivacyNotice } from '@/features/privacy/use-privacy-notice';
import { registrationNotice, rememberPendingAcknowledgement } from '@/features/privacy/privacy-logic';
import { supabase } from '@/services/supabase/client';
import { authStorage } from '@/services/supabase/storage';

import { authRedirectUrl } from '../auth-callback';
import { friendlyAuthError } from '../auth-errors';
import { useAuth } from '../auth-provider';
import { AuthLayout } from '../components/auth-layout';
import { ConfigNotice } from '../components/config-notice';
import { GoogleSignInButton, OrDivider, useGoogleAvailable } from '../components/google-sign-in';
import { signInWithGoogle } from '../google-auth';
import { hasErrors, MIN_PASSWORD_LENGTH, normalizeEmail, validateSignUp, type FieldErrors } from '../validation';

type Field = 'fullName' | 'email' | 'password' | 'confirm';
const RESEND_COOLDOWN_SECONDS = 60;

function backToSignIn() {
  if (router.canGoBack()) router.back();
  else router.replace('/sign-in');
}

export default function SignUpScreen() {
  const { configured } = useAuth();
  const googleAvailable = useGoogleAvailable();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const inFlight = useRef(false);

  const [values, setValues] = useState({ fullName: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  /** Set once Supabase has accepted the registration and is waiting for email confirmation. */
  const [sentTo, setSentTo] = useState<string | null>(null);

  const busy = submitting || googleBusy;

  // The privacy notice. A failed or unpublished notice never blocks registration; only a PUBLISHED one is ticked.
  const privacy = usePrivacyNotice();
  const reg = registrationNotice(privacy.notice);
  const [ack, setAck] = useState(false);
  const [ackError, setAckError] = useState<string | undefined>();

  function update(field: Field) {
    return (value: string) => {
      setValues((v) => ({ ...v, [field]: value }));
      if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
    };
  }

  async function handleSignUp() {
    if (!supabase || inFlight.current) return;
    const nextErrors = validateSignUp(values);
    setErrors(nextErrors);
    const needsTick = reg.mustAcknowledge && !ack;
    setAckError(needsTick ? 'Please confirm that you have read the Privacy Notice.' : undefined);
    if (hasErrors(nextErrors) || needsTick) return;

    inFlight.current = true;
    setSubmitting(true);
    setFormError(null);
    setInfo(null);
    const email = normalizeEmail(values.email);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: values.password,
        options: {
          // Read by the database's handle_new_user() trigger to create the profile.
          data: { full_name: values.fullName.trim() },
          emailRedirectTo: authRedirectUrl(),
        },
      });
      if (error) {
        setFormError(friendlyAuthError(error, 'sign-up').message);
        return;
      }
      setValues((v) => ({ ...v, password: '', confirm: '' }));
      // Remember which notice version was ticked; the server records it once there is a session.
      if (reg.mustAcknowledge && ack) rememberPendingAcknowledgement(authStorage, reg.version);
      // With email confirmation off, Supabase signs the customer in straight away
      // and the auth guard moves them into the app. Otherwise there is no session
      // until they confirm. An address that is already registered also comes back
      // without a session; the same neutral screen is shown so this form cannot be
      // used to discover who has an account.
      if (!data.session) setSentTo(email);
    } catch (error) {
      setFormError(friendlyAuthError(error, 'sign-up').message);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    if (busy) return;
    setFormError(null);
    setInfo(null);
    setGoogleBusy(true);
    const result = await signInWithGoogle();
    setGoogleBusy(false);
    if (result.status === 'cancelled') setInfo('Google sign-up was cancelled. You can try again or use the form.');
    else if (result.status === 'error') setFormError(result.error.message);
  }

  if (sentTo) {
    return <CheckEmail email={sentTo} onUseDifferentEmail={() => setSentTo(null)} />;
  }

  return (
    <AuthLayout
      title="Join the club"
      subtitle="Create your account to manage your riding with Colonel Horse Riding Club."
      footer={
        <>
          <ThemedText themeColor="textSecondary">Already have an account?</ThemedText>
          <Button variant="ghost" title="Sign in" onPress={backToSignIn} />
        </>
      }>
      <ConfigNotice />

      <View style={styles.fields}>
        <TextField
          label="Full name"
          value={values.fullName}
          onChangeText={update('fullName')}
          error={errors.fullName}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => emailRef.current?.focus()}
          editable={!busy}
          maxLength={100}
        />
        <TextField
          ref={emailRef}
          label="Email"
          value={values.email}
          onChangeText={update('email')}
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
        <TextField
          ref={passwordRef}
          label="Password"
          value={values.password}
          onChangeText={update('password')}
          error={errors.password}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters, including a letter and a number.`}
          secureToggle
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          passwordRules={`minlength: ${MIN_PASSWORD_LENGTH}; required: lower; required: digit;`}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => confirmRef.current?.focus()}
          editable={!busy}
        />
        <TextField
          ref={confirmRef}
          label="Confirm password"
          value={values.confirm}
          onChangeText={update('confirm')}
          error={errors.confirm}
          secureToggle
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={handleSignUp}
          editable={!busy}
        />
      </View>

      {reg.mustAcknowledge ? (
        <CheckboxRow checked={ack} onChange={setAck} error={ackError} disabled={busy} accessibilityLabel={`I have read the Privacy Notice, version ${reg.version}`}>
          <ThemedText>
            I have read the{' '}
            <ThemedText accessibilityRole="link" themeColor="accentText" style={styles.link} onPress={() => router.push('/privacy')}>
              Privacy Notice
            </ThemedText>{' '}
            (version {reg.version}).
          </ThemedText>
        </CheckboxRow>
      ) : (
        <ThemedText variant="caption" themeColor="textSecondary">
          See how we handle your data in our{' '}
          <ThemedText variant="caption" accessibilityRole="link" themeColor="accentText" style={styles.link} onPress={() => router.push('/privacy')}>
            Privacy Notice{reg.state === 'draft' ? ' (draft)' : ''}
          </ThemedText>
          .
        </ThemedText>
      )}

      {formError ? <FormMessage tone="error">{formError}</FormMessage> : null}
      {info ? <FormMessage tone="info">{info}</FormMessage> : null}

      <PrimaryButton
        title="Create account"
        loadingLabel="Creating account"
        fullWidth
        loading={submitting}
        disabled={!configured || googleBusy}
        onPress={handleSignUp}
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

function CheckEmail({ email, onUseDifferentEmail }: { email: string; onUseDifferentEmail: () => void }) {
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function resend() {
    if (!supabase || sending || cooldown > 0) return;
    setSending(true);
    setResult(null);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: authRedirectUrl() },
      });
      setResult(
        error
          ? { tone: 'error', text: friendlyAuthError(error, 'resend').message }
          : { tone: 'success', text: 'If the address needs confirming, a new link is on its way.' }
      );
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      setResult({ tone: 'error', text: friendlyAuthError(error, 'resend').message });
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthLayout title="Check your email" subtitle={`We've sent a confirmation link to ${email}.`}>
      <FormMessage tone="info" title="One more step">
        Open the link on this phone to confirm your address and finish signing in. If you already have an account
        with this email, sign in instead, or reset your password.
      </FormMessage>
      {result ? <FormMessage tone={result.tone}>{result.text}</FormMessage> : null}
      <PrimaryButton title="Back to sign in" fullWidth onPress={backToSignIn} />
      <SecondaryButton
        title={cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend confirmation email'}
        fullWidth
        loading={sending}
        disabled={cooldown > 0}
        onPress={resend}
      />
      <Button variant="ghost" title="Use a different email" onPress={onUseDifferentEmail} />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  fields: {
    gap: 20,
  },
  link: {
    textDecorationLine: 'underline',
  },
});
