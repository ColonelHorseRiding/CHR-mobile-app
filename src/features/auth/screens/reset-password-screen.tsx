import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { Button, PrimaryButton } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { TextField } from '@/components/ui/text-field';
import { supabase } from '@/services/supabase/client';

import { friendlyAuthError } from '../auth-errors';
import { useAuth } from '../auth-provider';
import { AuthLayout } from '../components/auth-layout';
import { hasErrors, MIN_PASSWORD_LENGTH, validateNewPassword, type FieldErrors } from '../validation';

/**
 * Reached only with the recovery session a password-reset link creates. The
 * customer must choose a new password (or cancel, which signs them out) before
 * the rest of the app opens.
 */
export default function ResetPasswordScreen() {
  const { endRecovery, signOut } = useAuth();
  const confirmRef = useRef<TextInput>(null);
  const inFlight = useRef(false);

  const [values, setValues] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState<FieldErrors<'password' | 'confirm'>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSave() {
    if (!supabase || inFlight.current) return;
    const nextErrors = validateNewPassword(values);
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;

    inFlight.current = true;
    setSubmitting(true);
    setFormError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: values.password });
      if (error) setFormError(friendlyAuthError(error, 'reset').message);
      else {
        setValues({ password: '', confirm: '' });
        setDone(true);
      }
    } catch (error) {
      setFormError(friendlyAuthError(error, 'reset').message);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <AuthLayout title="Password updated" subtitle="Your new password is saved. Use it next time you sign in.">
        <PrimaryButton title="Continue" fullWidth onPress={endRecovery} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="Your reset link worked. Set a new password to finish.">
      <View style={styles.fields}>
        <TextField
          label="New password"
          value={values.password}
          onChangeText={(value) => {
            setValues((v) => ({ ...v, password: value }));
            if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
          }}
          error={errors.password}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters, including a letter and a number.`}
          secureToggle
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => confirmRef.current?.focus()}
          editable={!submitting}
        />
        <TextField
          ref={confirmRef}
          label="Confirm new password"
          value={values.confirm}
          onChangeText={(value) => {
            setValues((v) => ({ ...v, confirm: value }));
            if (errors.confirm) setErrors((e) => ({ ...e, confirm: undefined }));
          }}
          error={errors.confirm}
          secureToggle
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={handleSave}
          editable={!submitting}
        />
      </View>
      {formError ? <FormMessage tone="error">{formError}</FormMessage> : null}
      <PrimaryButton title="Save new password" loadingLabel="Saving" fullWidth loading={submitting} onPress={handleSave} />
      <Button variant="ghost" title="Cancel and sign out" disabled={submitting} onPress={() => void signOut()} />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  fields: {
    gap: 20,
  },
});
