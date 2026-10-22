import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { SecondaryButton, PrimaryButton } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { useAuth } from '@/features/auth/auth-provider';
import { authStorage } from '@/services/supabase/storage';

import { getMyConsents, recordConsent } from './privacy-api';
import { takePendingAcknowledgement, type Consents } from './privacy-logic';

/** Which notice version was dismissed during this app session ("Not now" never records anything). */
let dismissedFor: string | null = null;

/**
 * On Home. Two jobs, neither of which blocks anything:
 *  1. If this person ticked the notice when they registered, ask the server to record that once they have a
 *     session. The server stamps the time and person and re-checks the version; only the version they saw is sent.
 *  2. If a published notice is waiting for them to read, say so, with a way to read it and a way to say "I have
 *     read it". Existing members are never recorded as having agreed to anything they did not act on.
 */
export function PrivacyNoticeCard() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [consents, setConsents] = useState<Consents | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    (async () => {
      try {
        let c = await getMyConsents();
        if (c.needs_acknowledgement) {
          const version = takePendingAcknowledgement(authStorage, c.current_notice_version);
          if (version) {
            await recordConsent('membership_service', 'granted', version);
            c = await getMyConsents();
          }
        }
        if (live) setConsents(c);
      } catch {
        // Not shown as an error: this card is a courtesy, and the Privacy screen reports problems itself.
      }
    })();
    return () => {
      live = false;
    };
  }, [userId]);

  if (hidden || !consents?.needs_acknowledgement || !consents.current_notice_version) return null;
  if (dismissedFor === consents.current_notice_version) return null;
  const version = consents.current_notice_version;

  async function acknowledge() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      await recordConsent('membership_service', 'granted', version);
      setHidden(true);
    } catch {
      setError("We couldn't record that. Please try again from Profile → Privacy & data.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <FormMessage
      tone="info"
      title="Our privacy notice"
      action={
        <>
          <PrimaryButton title="I have read it" loadingLabel="Saving" loading={saving} onPress={acknowledge} />
          <SecondaryButton title="Read the notice" onPress={() => router.push('/profile/notice')} />
          <SecondaryButton
            title="Not now"
            onPress={() => {
              dismissedFor = version;
              setHidden(true);
            }}
          />
        </>
      }>
      {error ?? `Version ${version} explains how we use your data.`}
    </FormMessage>
  );
}
