import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FormMessage } from '@/components/ui/form-message';
import { ClassDetailSkeleton } from '@/components/ui/screen-skeletons';
import { ScreenContainer } from '@/components/ui/screen-container';
import { SectionHeading } from '@/components/ui/section-heading';
import { useAuth } from '@/features/auth/auth-provider';
import { formatDate } from '@/features/store/format';
import { useTheme } from '@/hooks/use-theme';
import { Radii, Spacing } from '@/theme';

import {
  BookingError,
  bookClass,
  fetchDaySessions,
  fetchEligibility,
  findMyBooking,
  type ConfirmedBooking,
  type Eligibility,
  type SessionSlot,
} from './booking-api';
import { notifyBookingsChanged } from './booking-events';
import { PlaceMarks } from './components/session-card';
import { formatDayLong, formatTimeRange, shortRef, slotLabel, slotState } from './schedule-format';

type Loaded = { session: SessionSlot | null; eligibility: Eligibility };

type Phase =
  | { name: 'review' }
  | { name: 'submitting' }
  /** The request's answer never arrived; reading the member's bookings to find out. */
  | { name: 'checking' }
  /** Still unknown whether the booking exists. Nothing is shown as booked. */
  | { name: 'unknown'; message: string }
  | { name: 'booked'; booking: ConfirmedBooking; already: boolean };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Review and confirm one class. Availability and the member's plan are re-read
 * when this opens; the booking is created only by book_class(), and "booked"
 * is shown only once the server has confirmed it (or the booking is read back).
 */
export default function BookSessionScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const params = useLocalSearchParams<{ sessionId: string; date: string }>();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const date = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : '';

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<BookingError | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>({ name: 'review' });
  const [error, setError] = useState<BookingError | null>(null);
  /** Classes left as re-read from the server after a confirmed booking. */
  const [after, setAfter] = useState<{ value: number | null; failed: boolean } | null>(null);

  const submitting = useRef(false);
  const latestUser = useRef(userId);
  useEffect(() => {
    latestUser.current = userId;
  }, [userId]);

  const load = useCallback(async () => {
    if (!userId || !sessionId || !date) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [sessions, eligibility] = await Promise.all([fetchDaySessions(date), fetchEligibility()]);
      if (latestUser.current !== userId) return;
      setLoaded({ session: sessions.find((s) => s.id === sessionId) ?? null, eligibility });
      setLoadError(null);
    } catch (e) {
      if (latestUser.current !== userId) return;
      setLoadError(e instanceof BookingError ? e : new BookingError('unknown', "This class couldn't be loaded."));
    } finally {
      if (latestUser.current === userId) setLoading(false);
    }
  }, [userId, sessionId, date]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const refreshBalance = useCallback(async () => {
    try {
      const e = await fetchEligibility();
      setAfter({ value: e.creditsRemaining, failed: false });
    } catch {
      setAfter({ value: null, failed: true });
    }
  }, []);

  const confirmed = useCallback(
    (booking: ConfirmedBooking, already: boolean) => {
      setPhase({ name: 'booked', booking, already });
      setError(null);
      notifyBookingsChanged();
      void refreshBalance();
    },
    [refreshBalance]
  );

  /** Reads the member's own bookings to settle an uncertain request. */
  const reconcile = useCallback(async () => {
    if (!userId) return;
    setPhase({ name: 'checking' });
    // Give a request that is still in flight on the server a moment to finish.
    await wait(1500);
    try {
      const existing = await findMyBooking(userId, sessionId);
      if (latestUser.current !== userId) return;
      if (existing) {
        confirmed(existing, false);
        return;
      }
      setPhase({
        name: 'unknown',
        message:
          "We couldn't find a booking for this class yet. It may still be processing. Check again in a moment, or try booking again — the club's system never books the same class twice.",
      });
    } catch {
      if (latestUser.current !== userId) return;
      setPhase({
        name: 'unknown',
        message:
          "We couldn't reach the club to confirm whether this class was booked. Please check your connection, then check again.",
      });
    }
    // The dashboard and schedule re-read either way, in case the booking did go through.
    notifyBookingsChanged();
  }, [userId, sessionId, confirmed]);

  async function submit() {
    if (submitting.current || !userId) return;
    submitting.current = true;
    setError(null);
    setPhase({ name: 'submitting' });
    try {
      const booking = await bookClass(sessionId);
      if (latestUser.current !== userId) return;
      confirmed(booking, false);
    } catch (e) {
      if (latestUser.current !== userId) return;
      const failure = e instanceof BookingError ? e : new BookingError('network', "We couldn't reach the club's servers.");
      if (failure.kind === 'network') {
        await reconcile();
      } else if (failure.kind === 'duplicate') {
        // Already holds this class — possibly from an earlier attempt whose answer was lost.
        const existing = await findMyBooking(userId, sessionId).catch(() => null);
        if (existing) confirmed(existing, true);
        else {
          setError(failure);
          setPhase({ name: 'review' });
        }
      } else {
        setError(failure);
        setPhase({ name: 'review' });
        if (failure.kind === 'stale' || failure.kind === 'ineligible' || failure.kind === 'limit') {
          notifyBookingsChanged();
          void load();
        }
      }
    } finally {
      submitting.current = false;
    }
  }

  const backToSchedule = () => (router.canGoBack() ? router.back() : router.replace('/book'));
  const toDashboard = () => router.navigate('/');
  const openStore = () => router.navigate('/store');

  // ─── Booked ───────────────────────────────────────────────────────────────
  if (phase.name === 'booked') {
    const s = loaded?.session;
    return (
      <ScreenContainer>
        <View style={styles.successHead} accessible accessibilityRole="summary" accessibilityLiveRegion="polite">
          <View style={[styles.badge, { backgroundColor: theme.successSurface, borderColor: theme.success }]}>
            <ThemedText variant="title" style={{ color: theme.success }}>
              ✓
            </ThemedText>
          </View>
          <ThemedText variant="eyebrow" themeColor="accentText">
            {phase.already ? 'Already booked' : 'Booking confirmed'}
          </ThemedText>
          <ThemedText variant="display" style={styles.center}>
            {phase.already ? "You're already booked" : "You're booked"}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            {phase.already
              ? 'This class is already on your schedule. Nothing more was taken from your plan.'
              : 'Your place is confirmed by the club. See you at the ground.'}
          </ThemedText>
        </View>

        <Card style={styles.summary}>
          {s ? <Row label="Date" value={formatDayLong(s.date)} /> : null}
          {s ? <Row label="Time" value={formatTimeRange(s.startTime, s.endTime)} /> : null}
          <Row label="Horse" value="Assigned by your coach at the ground" />
          <Row label="Booking reference" value={shortRef(phase.booking.bookingId)} />
          {after === null ? (
            <Row label="Classes left" value="Checking…" />
          ) : after.value !== null ? (
            <Row label="Classes left" value={String(after.value)} />
          ) : (
            <ThemedText variant="caption" themeColor="textSecondary">
              Your updated class balance will show on your dashboard.
            </ThemedText>
          )}
        </Card>

        <View style={styles.actions}>
          <PrimaryButton
            title="View class details"
            fullWidth
            onPress={() => router.replace({ pathname: '/book/classes/[bookingId]', params: { bookingId: phase.booking.bookingId } })}
          />
          <SecondaryButton title="Back to schedule" fullWidth onPress={backToSchedule} />
          <SecondaryButton title="View my classes" fullWidth onPress={() => router.replace('/book/classes')} />
          <SecondaryButton title="Go to dashboard" fullWidth onPress={toDashboard} />
        </View>
      </ScreenContainer>
    );
  }

  // ─── Loading / not found ──────────────────────────────────────────────────
  if (!loaded && loading) {
    return (
      <ScreenContainer>
        <ClassDetailSkeleton label="Checking this class" />
      </ScreenContainer>
    );
  }

  if (!loaded) {
    return (
      <ScreenContainer>
        <EmptyState
          title={sessionId && date ? "We couldn't load this class" : 'Class not found'}
          message={
            sessionId && date
              ? `${loadError?.message ?? ''} Check your connection and try again.`.trim()
              : 'Please choose a class from the schedule.'
          }
          action={
            sessionId && date ? (
              <PrimaryButton title="Try again" onPress={() => void load()} />
            ) : (
              <PrimaryButton title="Back to schedule" onPress={backToSchedule} />
            )
          }
        />
      </ScreenContainer>
    );
  }

  const { session, eligibility } = loaded;

  if (!session) {
    return (
      <ScreenContainer>
        <EmptyState
          title="This class is no longer on the schedule"
          message="It may have been changed by the club. Please choose another time."
          action={<PrimaryButton title="Back to schedule" onPress={backToSchedule} />}
        />
      </ScreenContainer>
    );
  }

  // ─── Review ───────────────────────────────────────────────────────────────
  const state = slotState(session);
  const left = eligibility.creditsRemaining;
  const hasPlan = eligibility.hasActiveMembership;
  const noClasses = hasPlan && left !== null && left <= 0;
  const outsidePlan = hasPlan && !!eligibility.maxDate && session.date > eligibility.maxDate;
  const busy = phase.name === 'submitting' || phase.name === 'checking';
  const canSubmit = state === 'open' && hasPlan && !noClasses && !outsidePlan && phase.name !== 'unknown';

  return (
    <ScreenContainer>
      <SectionHeading eyebrow="Review your booking" title={formatDayLong(session.date)} />

      <Card style={styles.summary}>
        <Row label="Time" value={formatTimeRange(session.startTime, session.endTime)} />
        <View style={styles.row}>
          <ThemedText themeColor="textSecondary">Places</ThemedText>
          <View style={styles.rowValue}>
            <PlaceMarks capacity={session.capacity} left={session.placesLeft} color={theme.text} />
            <ThemedText variant="bodyStrong" style={styles.right}>
              {slotLabel(session)}
            </ThemedText>
          </View>
        </View>
        <Row label="Horse" value="Assigned by your coach at the ground" />
        <Row label="Uses" value="1 class from your plan" />
        {hasPlan && left !== null ? (
          <Row
            label="Classes left now"
            value={String(left)}
            note={eligibility.membershipEndDate ? `plan valid until ${formatDate(eligibility.membershipEndDate)}` : undefined}
          />
        ) : null}
      </Card>

      {state === 'mine' ? (
        <FormMessage tone="success" title="You're booked into this class">
          It&apos;s already on your schedule.
        </FormMessage>
      ) : state === 'full' ? (
        <FormMessage tone="info" title="This class is full">
          Please choose another time.
        </FormMessage>
      ) : state === 'closed' ? (
        <FormMessage tone="info" title="Not open for booking">
          {session.status === 'cancelled'
            ? 'The club has cancelled this class. Please choose another time.'
            : 'This class has started, passed, or is outside the booking window. Please choose another time.'}
        </FormMessage>
      ) : null}

      {!hasPlan ? (
        <FormMessage tone="info" title="You need a plan to book" action={<SecondaryButton title="Visit the store" onPress={openStore} />}>
          Choose a membership or a single ride in the Store.
        </FormMessage>
      ) : noClasses ? (
        <FormMessage tone="info" title="No classes left" action={<SecondaryButton title="Visit the store" onPress={openStore} />}>
          You&apos;ve used every class on your plan.
        </FormMessage>
      ) : outsidePlan ? (
        <FormMessage tone="info" title="After your plan ends">
          This class falls after your plan ends. Please choose an earlier date.
        </FormMessage>
      ) : null}

      {error ? (
        <FormMessage
          tone="error"
          title={
            error.kind === 'stale'
              ? 'This class just changed'
              : error.kind === 'limit'
                ? 'Booking limit reached'
                : error.kind === 'ineligible'
                  ? "Can't book with your plan"
                  : error.kind === 'session'
                    ? 'Please sign in again'
                    : "Couldn't book this class"
          }
          action={
            error.kind === 'stale' ? (
              <SecondaryButton title="Choose another time" onPress={backToSchedule} />
            ) : error.kind === 'ineligible' ? (
              <SecondaryButton title="Visit the store" onPress={openStore} />
            ) : undefined
          }>
          {error.message}
        </FormMessage>
      ) : null}

      {phase.name === 'checking' ? (
        <FormMessage tone="info" title="Confirming your booking">
          The connection dropped before the club replied. Checking whether your class was booked…
        </FormMessage>
      ) : null}

      {phase.name === 'unknown' ? (
        <FormMessage tone="error" title="Booking not confirmed yet">
          {phase.message}
        </FormMessage>
      ) : null}

      <View style={styles.actions}>
        {phase.name === 'unknown' ? (
          <>
            <PrimaryButton title="Check again" fullWidth onPress={() => void reconcile()} />
            <SecondaryButton title="Try booking again" fullWidth onPress={() => void submit()} />
          </>
        ) : state === 'open' ? (
          <PrimaryButton
            title="Confirm booking"
            loadingLabel={phase.name === 'checking' ? 'Checking your booking' : 'Booking your class'}
            fullWidth
            loading={busy}
            disabled={!canSubmit}
            accessibilityHint="Books this class and uses 1 class from your plan"
            onPress={() => void submit()}
          />
        ) : null}
        <SecondaryButton title="Back to schedule" fullWidth disabled={busy} onPress={backToSchedule} />
      </View>

      {state === 'open' && phase.name === 'review' ? (
        <ThemedText variant="caption" themeColor="textSecondary" style={styles.center}>
          The club confirms your place when you book. If the class fills up first, you&apos;ll be asked to choose another
          time.
        </ThemedText>
      ) : null}
    </ScreenContainer>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}${note ? `, ${note}` : ''}`}>
      <ThemedText themeColor="textSecondary">{label}</ThemedText>
      <View style={styles.rowValue}>
        <ThemedText variant="bodyStrong" style={styles.right}>
          {value}
        </ThemedText>
        {note ? (
          <ThemedText variant="caption" themeColor="textSecondary" style={styles.right}>
            {note}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    gap: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.lg,
  },
  rowValue: {
    flexShrink: 1,
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  right: {
    textAlign: 'right',
  },
  actions: {
    gap: Spacing.md,
  },
  successHead: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.lg,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: Radii.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  center: {
    textAlign: 'center',
  },
});
