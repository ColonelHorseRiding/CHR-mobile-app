import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Share, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/form-message';
import { usePullRefresh } from '@/components/ui/pull-refresh';
import { ScreenContainer } from '@/components/ui/screen-container';
import { SectionHeading } from '@/components/ui/section-heading';
import { Skeleton, SkeletonRegion, SkeletonText } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { registerThisDevice, unregisterThisDevice } from '@/features/push/push-device';
import { formatDate } from '@/features/store/format';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme';

import { cancelRequest, exportMyData, getMyConsents, getMyRequests, PrivacyError, recordConsent, submitRequest, type PrivacyRequest } from './privacy-api';
import { ContactCard } from './privacy-notice-screen';
import {
  canCancel,
  dueText,
  isOpen,
  MAX_DETAILS,
  MAX_SUBJECT,
  purposeView,
  REQUEST_TYPES,
  STATUS_LABEL,
  TYPE_LABEL,
  validateRequest,
  type Consents,
  type PurposeRow,
  type RequestType,
} from './privacy-logic';
import { usePrivacyNotice } from './use-privacy-notice';

const msg = (e: unknown) => (e instanceof PrivacyError ? e.message : 'Something went wrong. Please try again.');

/**
 * Privacy & data: the notice, the member's optional choices, a copy of their data, requests and complaints, and
 * closing the account. Every control calls a server function that checks who is asking and records what
 * happened; nothing is decided or stored on the phone.
 */
export default function PrivacyScreen() {
  const { config } = usePrivacyNotice();
  const [consents, setConsents] = useState<Consents | null>(null);
  const [consentsError, setConsentsError] = useState<string | null>(null);
  const [requests, setRequests] = useState<PrivacyRequest[] | null>(null);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadConsents = useCallback(async () => {
    try {
      setConsents(await getMyConsents());
      setConsentsError(null);
    } catch (e) {
      setConsentsError(msg(e));
    }
  }, []);
  const loadRequests = useCallback(async () => {
    try {
      setRequests(await getMyRequests());
      setRequestsError(null);
    } catch (e) {
      setRequestsError(msg(e));
    }
  }, []);
  const reload = useCallback(() => Promise.all([loadConsents(), loadRequests()]), [loadConsents, loadRequests]);
  const refreshControl = usePullRefresh(reload);

  // Read on arrival and again whenever the screen comes back into view.
  useFocusEffect(
    useCallback(() => {
      void loadConsents();
      void loadRequests();
    }, [loadConsents, loadRequests])
  );

  const openErasure = (requests ?? []).find((r) => r.request_type === 'erasure' && isOpen(r.status));

  return (
    <ScreenContainer refreshControl={refreshControl}>
      <SectionHeading eyebrow="Your data" title="Privacy & data" description="How your data is used, the choices you have, and how to ask us about it." />
      {notice ? <FormMessage tone="success" title="Done">{notice}</FormMessage> : null}

      <NoticeCard consents={consents} error={consentsError} onChanged={loadConsents} onDone={setNotice} />
      <ChoicesCard consents={consents} error={consentsError} onChanged={loadConsents} onDone={setNotice} />
      <DataCard onSubmitted={loadRequests} onDone={setNotice} />
      <RequestsCard requests={requests} error={requestsError} onChanged={loadRequests} onDone={setNotice} retry={loadRequests} />
      <CloseAccountCard openRequest={openErasure} loaded={requests !== null} onChanged={loadRequests} onDone={setNotice} />
      <ContactCard config={config} />
    </ScreenContainer>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <SkeletonRegion label={label}>
      <Skeleton width="45%" height={16} />
      <SkeletonText lines={2} />
    </SkeletonRegion>
  );
}

// ─── Notice ─────────────────────────────────────────────────────────────────

function NoticeCard({ consents, error, onChanged, onDone }: { consents: Consents | null; error: string | null; onChanged: () => void; onDone: (m: string) => void }) {
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function acknowledge() {
    if (busy.current || !consents?.current_notice_version) return;
    busy.current = true;
    setSaving(true);
    setErr(null);
    try {
      await recordConsent('membership_service', 'granted', consents.current_notice_version);
      onDone('Thank you. We have recorded that you read the notice.');
      onChanged();
    } catch (e) {
      setErr(msg(e));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <Card>
      <ThemedText variant="heading">Privacy Notice</ThemedText>
      {!consents && !error ? <Loading label="Loading your privacy details" /> : null}
      {error ? <FormMessage tone="error" title="Couldn't load this">{error}</FormMessage> : null}
      {consents ? (
        <>
          <ThemedText themeColor="textSecondary">
            {!consents.current_notice_version
              ? "The club's notice is still being finalised. You can read the draft, which is not yet in effect."
              : consents.needs_acknowledgement
                ? `Version ${consents.current_notice_version} is in effect. You have not told us you have read it.`
                : `You have read version ${consents.acknowledged_notice_version}, the current notice.`}
          </ThemedText>
          {consents.current_notice_version && consents.needs_acknowledgement ? (
            <PrimaryButton title="I have read it" loadingLabel="Saving" loading={saving} fullWidth onPress={acknowledge} />
          ) : null}
          {err ? <FormMessage tone="error">{err}</FormMessage> : null}
        </>
      ) : null}
      <SecondaryButton title="Read the notice" fullWidth onPress={() => router.push('/profile/notice')} />
    </Card>
  );
}

// ─── Choices ────────────────────────────────────────────────────────────────

function ChoicesCard({ consents, error, onChanged, onDone }: { consents: Consents | null; error: string | null; onChanged: () => void; onDone: (m: string) => void }) {
  const theme = useTheme();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function toggle(p: PurposeRow) {
    if (inFlight.current) return;
    inFlight.current = true;
    const turningOff = purposeView(p).on;
    setBusy(p.purpose);
    setErr(null);
    try {
      if (turningOff) {
        await recordConsent(p.purpose, 'withdrawn');
        // The server has removed this phone's alert code; clear the app's own copy too.
        if (p.purpose === 'push_notifications') await unregisterThisDevice();
      } else {
        await recordConsent(p.purpose, 'granted', consents?.current_notice_version ?? null);
        if (p.purpose === 'push_notifications') await registerThisDevice({ prompt: true });
      }
      onDone(turningOff ? `${p.title} turned off.` : `${p.title} turned on.`);
      onChanged();
    } catch (e) {
      setErr(msg(e));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  return (
    <Card>
      <ThemedText variant="heading">Your choices</ThemedText>
      <ThemedText variant="caption" themeColor="textSecondary">
        Changing an optional choice never affects your membership or bookings.
      </ThemedText>
      {!consents && !error ? <Loading label="Loading your choices" /> : null}
      {consents?.purposes.map((p) => {
        const v = purposeView(p);
        return (
          <View key={p.purpose} style={styles.choice}>
            <View style={styles.flex}>
              <ThemedText variant="bodyStrong">{p.title}</ThemedText>
              <ThemedText variant="caption" themeColor="textSecondary">
                {p.description}
              </ThemedText>
            </View>
            {v.kind === 'required' ? (
              <ThemedText variant="caption" themeColor="textSecondary" style={styles.required}>
                {v.label}
              </ThemedText>
            ) : (
              <Switch
                value={v.on}
                disabled={busy === p.purpose}
                onValueChange={() => void toggle(p)}
                accessibilityLabel={`${p.title}: ${v.label}`}
                trackColor={{ false: theme.borderStrong, true: theme.primary }}
                thumbColor={theme.surface}
              />
            )}
          </View>
        );
      })}
      {err ? <FormMessage tone="error">{err}</FormMessage> : null}
    </Card>
  );
}

// ─── Your data ──────────────────────────────────────────────────────────────

function DataCard({ onSubmitted, onDone }: { onSubmitted: () => void; onDone: (m: string) => void }) {
  const exporting = useRef(false);
  const sending = useRef(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [type, setType] = useState<RequestType>('correction');
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [errors, setErrors] = useState<{ type?: string; subject?: string; details?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const meta = REQUEST_TYPES.find((t) => t.value === type);

  async function download() {
    if (exporting.current) return;
    exporting.current = true;
    setDownloading(true);
    setDownloadError(null);
    try {
      const data = await exportMyData();
      // Hands the copy to the phone's share sheet (save to Files, Drive, email…).
      await Share.share({ title: 'My data from Colonel Horse Riding Club', message: JSON.stringify(data, null, 2) });
    } catch (e) {
      setDownloadError(msg(e));
    } finally {
      exporting.current = false;
      setDownloading(false);
    }
  }

  async function send() {
    if (sending.current) return;
    const found = validateRequest({ type, subject, details });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    sending.current = true;
    setSubmitting(true);
    setSendError(null);
    try {
      await submitRequest({ type, subject, details });
      setSubject('');
      setDetails('');
      onDone('We received your request.');
      onSubmitted();
    } catch (e) {
      setSendError(msg(e));
    } finally {
      sending.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <ThemedText variant="heading">Your data</ThemedText>
      <ThemedText variant="bodyStrong">Get a copy of your data</ThemedText>
      <ThemedText variant="caption" themeColor="textSecondary">
        Your profile, memberships, bookings, payments, orders and choices, as a file you can save or send. It leaves out staff notes, security records and anything held by our service providers.
      </ThemedText>
      <SecondaryButton title="Get my data" loadingLabel="Preparing your data" loading={downloading} fullWidth onPress={download} />
      {downloadError ? <FormMessage tone="error">{downloadError}</FormMessage> : null}

      <ThemedText variant="bodyStrong" style={styles.gap}>
        Make a request
      </ThemedText>
      <View style={styles.types}>
        {REQUEST_TYPES.map((t) => (
          <Button
            key={t.value}
            variant={t.value === type ? 'primary' : 'secondary'}
            title={t.label}
            fullWidth
            accessibilityState={{ selected: t.value === type }}
            onPress={() => setType(t.value)}
          />
        ))}
      </View>
      {meta ? (
        <ThemedText variant="caption" themeColor="textSecondary">
          {meta.hint}
        </ThemedText>
      ) : null}
      <TextField label="Title (optional)" value={subject} onChangeText={setSubject} maxLength={MAX_SUBJECT} error={errors.subject} editable={!submitting} />
      <TextField
        label={meta?.needsDetails ? 'Details' : 'Details (optional)'}
        value={details}
        onChangeText={setDetails}
        maxLength={MAX_DETAILS}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        error={errors.details}
        hint={`${details.length}/${MAX_DETAILS}`}
        editable={!submitting}
      />
      {sendError ? <FormMessage tone="error">{sendError}</FormMessage> : null}
      <PrimaryButton title="Send request" loadingLabel="Sending" loading={submitting} fullWidth onPress={send} />
    </Card>
  );
}

// ─── Requests ───────────────────────────────────────────────────────────────

function RequestsCard({
  requests,
  error,
  onChanged,
  onDone,
  retry,
}: {
  requests: PrivacyRequest[] | null;
  error: string | null;
  onChanged: () => void;
  onDone: (m: string) => void;
  retry: () => void;
}) {
  const inFlight = useRef(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function cancel(id: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setCancelling(id);
    setErr(null);
    try {
      await cancelRequest(id);
      onDone('Request withdrawn.');
      onChanged();
    } catch (e) {
      setErr(msg(e));
    } finally {
      inFlight.current = false;
      setCancelling(null);
    }
  }

  return (
    <Card>
      <ThemedText variant="heading">Your requests</ThemedText>
      {!requests && !error ? <Loading label="Loading your requests" /> : null}
      {error ? (
        <FormMessage tone="error" title="We couldn't load your requests" action={<SecondaryButton title="Try again" onPress={retry} />}>
          {error}
        </FormMessage>
      ) : null}
      {requests && requests.length === 0 ? (
        <ThemedText themeColor="textSecondary">No requests yet. Requests you make will appear here with their progress.</ThemedText>
      ) : null}
      {requests?.map((r) => (
        <View key={r.id} style={styles.request}>
          <ThemedText variant="bodyStrong">{r.subject || TYPE_LABEL[r.request_type] || 'Request'}</ThemedText>
          <ThemedText variant="caption" themeColor="textSecondary">
            {`${STATUS_LABEL[r.status] ?? r.status} · ${TYPE_LABEL[r.request_type]} · sent ${formatDate(r.submitted_at.slice(0, 10))}`}
          </ThemedText>
          {dueText(r, (iso) => formatDate(iso.slice(0, 10))) ? (
            <ThemedText variant="caption" themeColor="textSecondary">
              {dueText(r, (iso) => formatDate(iso.slice(0, 10)))}
            </ThemedText>
          ) : null}
          {r.resolution_note ? <ThemedText>{r.resolution_note}</ThemedText> : null}
          {canCancel(r.status) ? (
            <Button variant="ghost" title="Withdraw this request" loadingLabel="Withdrawing" loading={cancelling === r.id} onPress={() => void cancel(r.id)} />
          ) : null}
        </View>
      ))}
      {err ? <FormMessage tone="error">{err}</FormMessage> : null}
    </Card>
  );
}

// ─── Close account ──────────────────────────────────────────────────────────

function CloseAccountCard({
  openRequest,
  loaded,
  onChanged,
  onDone,
}: {
  openRequest: PrivacyRequest | undefined;
  loaded: boolean;
  onChanged: () => void;
  onDone: (m: string) => void;
}) {
  const theme = useTheme();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function request() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setErr(null);
    try {
      await submitRequest({ type: 'erasure' });
      onDone('We received your request to close your account.');
      onChanged();
    } catch (e) {
      setErr(msg(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function confirm() {
    Alert.alert(
      'Close your account?',
      'You will not be able to sign in once this is finished, and it cannot be undone. We will check first whether anything needs settling, such as an active membership or upcoming classes, and let you know.',
      [
        { text: 'Keep my account', style: 'cancel' },
        { text: 'Close my account', style: 'destructive', onPress: () => void request() },
      ]
    );
  }

  return (
    <Card>
      <ThemedText variant="heading">Close my account</ThemedText>
      <ThemedText themeColor="textSecondary">
        This asks the club to remove your name, contact details and date of birth, delete your alert codes, notifications and schedules, and stop your sign-in. Records the club must keep, such as payments, orders, memberships and attendance history, stay without your identifying details where possible. It cannot be undone. If you have an active membership, upcoming bookings or an unpaid order, we will tell you what needs to happen first.
      </ThemedText>
      {openRequest ? (
        <FormMessage tone="info" title="Your request is open">
          {`Status: ${STATUS_LABEL[openRequest.status] ?? openRequest.status}. You can follow it under Your requests.`}
        </FormMessage>
      ) : (
        <Button
          variant="ghost"
          title="Close my account"
          loadingLabel="Sending your request"
          loading={busy}
          disabled={!loaded}
          fullWidth
          style={[styles.danger, { borderColor: theme.danger }]}
          onPress={confirm}
        />
      )}
      {err ? <FormMessage tone="error">{err}</FormMessage> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  required: { maxWidth: 110, textAlign: 'right' },
  gap: { marginTop: Spacing.md },
  types: { gap: Spacing.sm },
  request: { gap: Spacing.xs, paddingVertical: Spacing.sm },
  danger: { borderWidth: 1 },
});
