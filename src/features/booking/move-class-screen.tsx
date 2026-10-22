import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FormMessage } from '@/components/ui/form-message';
import { ClassDetailSkeleton, SlotsSkeleton } from '@/components/ui/screen-skeletons';
import { ScreenContainer } from '@/components/ui/screen-container';
import { SectionHeading } from '@/components/ui/section-heading';
import { useAuth } from '@/features/auth/auth-provider';
import { todayIST } from '@/features/dashboard/dashboard-data';
import { useTheme } from '@/hooks/use-theme';
import { Radii, Spacing } from '@/theme';

import { BookingError, fetchClassDays, fetchDaySessions, fetchMyClassDays, type SessionSlot } from './booking-api';
import { notifyBookingsChanged } from './booking-events';
import { moveState, reschedulesLeft } from './class-status';
import { DateStrip } from './components/date-strip';
import { DetailRow } from './components/detail-row';
import { SessionCard } from './components/session-card';
import {
  fetchBookingPolicy,
  fetchClassRecord,
  findMovedTo,
  rescheduleBooking,
  type ClassRecord,
} from './my-classes-api';
import { datesBetween, formatDayLong, formatDayShort, formatTimeRange, groupByPartOfDay, shortRef, slotState } from './schedule-format';

type Setup = {
  record: ClassRecord;
  minDate: string;
  maxDate: string;
  classDays: Set<string> | null;
  myDays: Set<string>;
};

type Phase =
  | { name: 'choose' }
  | { name: 'submitting' }
  /** The reply never arrived; re-reading the booking to find out. */
  | { name: 'checking' }
  | { name: 'unknown'; message: string }
  | { name: 'moved'; from: ClassRecord; to: ClassRecord };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function addDays(iso: string, days: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Move one booked class to another time with reschedule_booking(): one
 * server transaction that keeps the original booking unless the new place is
 * secured, uses one reschedule and no extra class. The move is shown as done
 * only once the server confirms it (or the moved booking is read back).
 */
export default function MoveClassScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const params = useLocalSearchParams<{ bookingId: string }>();
  const bookingId = typeof params.bookingId === 'string' ? params.bookingId : '';

  const [setup, setSetup] = useState<{ userId: string; value: Setup | null } | null>(null);
  const [setupError, setSetupError] = useState<BookingError | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [day, setDay] = useState<{ date: string; sessions: SessionSlot[] | null; error: BookingError | null; loading: boolean }>({
    date: '',
    sessions: null,
    error: null,
    loading: false,
  });
  const [selected, setSelected] = useState<SessionSlot | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: 'choose' });
  const [error, setError] = useState<BookingError | null>(null);

  const latestUser = useRef(userId);
  const dayRequest = useRef(0);
  const submitting = useRef(false);

  useEffect(() => {
    latestUser.current = userId;
  }, [userId]);

  const loadSetup = useCallback(async () => {
    if (!userId || !bookingId) return;
    setSetupError(null);
    try {
      const [record, policy] = await Promise.all([fetchClassRecord(userId, bookingId), fetchBookingPolicy()]);
      if (latestUser.current !== userId) return;
      if (!record) {
        setSetup({ userId, value: null });
        return;
      }
      // The same range reschedule_booking() accepts: today … min(booking window, the plan's end).
      const minDate = todayIST();
      const windowEnd = policy.bookingWindowDays !== null ? addDays(minDate, policy.bookingWindowDays) : null;
      const planEnd = record.membership?.endDate ?? null;
      const maxDate = [windowEnd, planEnd].filter((d): d is string => !!d).sort()[0] ?? addDays(minDate, 30);
      const [days, mine] = await Promise.allSettled([fetchClassDays(minDate, maxDate), fetchMyClassDays(userId, minDate, maxDate)]);
      if (latestUser.current !== userId) return;
      const classDays = days.status === 'fulfilled' ? days.value : null;
      setSetup({
        userId,
        value: { record, minDate, maxDate, classDays, myDays: mine.status === 'fulfilled' ? mine.value : new Set() },
      });
      setDate((current) => {
        if (current && current >= minDate && current <= maxDate) return current;
        return record.date >= minDate && record.date <= maxDate ? record.date : minDate;
      });
    } catch (e) {
      if (latestUser.current !== userId) return;
      setSetupError(e instanceof BookingError ? e : new BookingError('unknown', "This class couldn't be loaded."));
    }
  }, [userId, bookingId]);

  useEffect(() => {
    const timer = setTimeout(() => void loadSetup(), 0);
    return () => clearTimeout(timer);
  }, [loadSetup]);

  const loadDay = useCallback(async () => {
    if (!userId || !date) return;
    const id = ++dayRequest.current;
    setDay((d) => (d.date === date ? { ...d, loading: true } : { date, sessions: null, error: null, loading: true }));
    try {
      const sessions = await fetchDaySessions(date);
      if (id !== dayRequest.current || latestUser.current !== userId) return;
      setDay({ date, sessions, error: null, loading: false });
    } catch (e) {
      if (id !== dayRequest.current || latestUser.current !== userId) return;
      setDay((d) => ({ ...d, date, error: e instanceof BookingError ? e : new BookingError('unknown', "The classes couldn't be loaded."), loading: false }));
    }
  }, [userId, date]);

  useEffect(() => {
    const timer = setTimeout(() => void loadDay(), 0);
    return () => clearTimeout(timer);
  }, [loadDay]);

  const own = setup && setup.userId === userId ? setup.value : undefined;

  const finish = useCallback(
    async (from: ClassRecord, newBookingId: string | null) => {
      if (!userId) return;
      notifyBookingsChanged();
      // Re-read the moved booking for its authoritative details and the plan's allowance.
      const to = newBookingId ? await fetchClassRecord(userId, newBookingId).catch(() => null) : await findMovedTo(userId, from.id).catch(() => null);
      if (latestUser.current !== userId) return;
      if (to) setPhase({ name: 'moved', from, to });
      else setPhase({ name: 'unknown', message: 'The club confirmed the move, but we couldn’t load the new details. Open My classes to see your class.' });
    },
    [userId]
  );

  /** Settles a move whose reply was lost: the original is marked 'rescheduled' only if the move happened. */
  const reconcile = useCallback(
    async (from: ClassRecord) => {
      if (!userId) return;
      setPhase({ name: 'checking' });
      await wait(1500);
      try {
        const now = await fetchClassRecord(userId, from.id);
        if (latestUser.current !== userId) return;
        if (now?.status === 'rescheduled') {
          await finish(from, null);
          return;
        }
        if (now && (now.status === 'held' || now.status === 'confirmed')) {
          setPhase({
            name: 'unknown',
            message:
              'We couldn’t confirm the move. Your original class is still booked. Check again in a moment, or try again — a class can only be moved once, so it can never be moved twice by mistake.',
          });
        } else {
          // Cancelled, attended or gone in the meantime: nothing to move.
          setPhase({ name: 'choose' });
          setError(new BookingError('not-allowed', 'This class can no longer be moved.'));
        }
      } catch {
        if (latestUser.current !== userId) return;
        setPhase({ name: 'unknown', message: 'We couldn’t reach the club to confirm whether your class was moved. Check your connection, then check again.' });
      }
      notifyBookingsChanged();
    },
    [userId, finish]
  );

  async function submit() {
    if (submitting.current || !userId || !own || !selected) return;
    submitting.current = true;
    setError(null);
    setPhase({ name: 'submitting' });
    try {
      const newId = await rescheduleBooking(own.record.id, selected.id);
      if (latestUser.current !== userId) return;
      await finish(own.record, newId);
    } catch (e) {
      if (latestUser.current !== userId) return;
      const failure = e instanceof BookingError ? e : new BookingError('network', "We couldn't reach the club's servers.");
      // BOOKING_NOT_RESCHEDULABLE = the booking is no longer held/confirmed, e.g. an earlier attempt already moved it.
      if (failure.kind === 'network' || failure.code === 'BOOKING_NOT_RESCHEDULABLE') {
        // Possibly moved by an earlier attempt whose reply was lost — read the booking to be sure.
        await reconcile(own.record);
      } else {
        setError(failure);
        setPhase({ name: 'choose' });
        if (failure.kind === 'stale') {
          setSelected(null);
          void loadDay();
        }
        notifyBookingsChanged();
      }
    } finally {
      submitting.current = false;
    }
  }

  // ─── Moved ────────────────────────────────────────────────────────────────
  if (phase.name === 'moved') {
    const { from, to } = phase;
    const left = reschedulesLeft(to);
    return (
      <ScreenContainer>
        <View style={styles.successHead} accessible accessibilityRole="summary" accessibilityLiveRegion="polite">
          <View style={[styles.badge, { backgroundColor: theme.successSurface, borderColor: theme.success }]}>
            <ThemedText variant="title" style={{ color: theme.success }}>
              ✓
            </ThemedText>
          </View>
          <ThemedText variant="eyebrow" themeColor="accentText">
            Class moved
          </ThemedText>
          <ThemedText variant="display" style={styles.center}>
            You&apos;re all set
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            The club has moved your class. No extra class was used.
          </ThemedText>
        </View>
        <Card style={styles.card}>
          <DetailRow label="New time" value={`${formatDayShort(to.date)}, ${formatTimeRange(to.startTime, to.endTime)}`} />
          <DetailRow label="Was" value={`${formatDayShort(from.date)}, ${formatTimeRange(from.startTime, from.endTime)}`} />
          <DetailRow label="Horse" value="Assigned by your coach at the ground" />
          <DetailRow label="Booking reference" value={shortRef(to.id)} />
          {left !== null && to.membership?.reschedulesAllowed != null ? (
            <DetailRow label="Reschedules left" value={`${left} of ${to.membership.reschedulesAllowed}`} note="on this plan" />
          ) : null}
        </Card>
        <View style={styles.actions}>
          <PrimaryButton title="My classes" fullWidth onPress={() => router.dismissTo('/book/classes')} />
          <SecondaryButton title="Back to schedule" fullWidth onPress={() => router.dismissTo('/book')} />
        </View>
      </ScreenContainer>
    );
  }

  // ─── Loading / not found / not movable ────────────────────────────────────
  if (own === undefined) {
    return (
      <ScreenContainer>
        {setupError ? (
          <EmptyState
            title="We couldn't load this class"
            message={`${setupError.message} Check your connection and try again.`}
            action={<PrimaryButton title="Try again" onPress={() => void loadSetup()} />}
          />
        ) : (
          <ClassDetailSkeleton label="Loading your class" />
        )}
      </ScreenContainer>
    );
  }

  if (own === null) {
    return (
      <ScreenContainer>
        <EmptyState title="Class not found" message="This class isn't on your account." />
      </ScreenContainer>
    );
  }

  const { record } = own;
  const move = moveState(record, todayIST());
  const busy = phase.name === 'submitting' || phase.name === 'checking';

  if (!move.canMove && phase.name === 'choose') {
    return (
      <ScreenContainer>
        <SectionHeading eyebrow="Move class" title={formatDayLong(record.date)} />
        <FormMessage tone="info" title="This class can't be moved">
          {move.reason ?? 'Only booked classes can be moved.'}
        </FormMessage>
        <SecondaryButton title="Back" fullWidth onPress={() => router.back()} />
      </ScreenContainer>
    );
  }

  const left = move.canMove ? move.remaining : reschedulesLeft(record);
  const dates = datesBetween(own.minDate, own.maxDate);
  const groups = day.date === date && day.sessions ? groupByPartOfDay(day.sessions) : [];

  return (
    <ScreenContainer>
      <SectionHeading
        eyebrow="Move class"
        title="Choose a new time"
        description="Moving keeps your class — it uses one reschedule, not another class. A moved class can’t be moved again."
      />

      <Card style={styles.card}>
        <DetailRow label="Currently" value={`${formatDayShort(record.date)}, ${formatTimeRange(record.startTime, record.endTime)}`} />
        <DetailRow
          label="Reschedules left"
          value={left !== null && record.membership?.reschedulesAllowed != null ? `${left} of ${record.membership.reschedulesAllowed}` : 'Unavailable'}
          note="on this plan"
        />
      </Card>

      <DateStrip
        dates={dates}
        selected={date}
        today={own.minDate}
        classDays={own.classDays}
        myDays={own.myDays}
        onSelect={(next) => {
          setSelected(null);
          setError(null);
          setDate(next);
        }}
      />

      {date ? (
        <View style={styles.day}>
          <ThemedText variant="title" accessibilityRole="header">
            {formatDayLong(date)}
          </ThemedText>

          {day.date === date && day.error && day.sessions ? (
            <FormMessage tone="error" title="Couldn't refresh this day" action={<SecondaryButton title="Try again" loading={day.loading} onPress={() => void loadDay()} />}>
              {`${day.error.message} Places shown may have changed.`}
            </FormMessage>
          ) : null}
          {(day.date !== date || !day.sessions) && !day.error ? <SlotsSkeleton label="Loading classes" /> : null}
          {day.date === date && !day.sessions && day.error ? (
            <EmptyState
              title="Couldn't load the classes for this day"
              message={day.error.message}
              action={<PrimaryButton title="Try again" onPress={() => void loadDay()} />}
            />
          ) : null}
          {day.date === date && day.sessions && day.sessions.length === 0 ? (
            <EmptyState title="No classes scheduled for this day." message="Please choose another day." />
          ) : null}
          {day.date === date && day.sessions && day.sessions.length > 0 && !day.sessions.some((s) => slotState(s) === 'open') ? (
            <FormMessage tone="info">No other times are available on this day. Please choose another day.</FormMessage>
          ) : null}

          {groups.map(([label, sessions]) => (
            <View key={label} style={styles.group}>
              <ThemedText variant="eyebrow" themeColor="accentText">
                {label}
              </ThemedText>
              {sessions.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  actionLabel="Select"
                  selected={selected?.id === s.id}
                  currentSessionId={record.sessionId}
                  onPress={() => {
                    setError(null);
                    setSelected(s);
                  }}
                />
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {error ? (
        <FormMessage
          tone="error"
          title={error.kind === 'stale' ? 'That time just changed' : error.kind === 'limit' ? 'Limit reached' : "Couldn't move this class"}>
          {error.message}
        </FormMessage>
      ) : null}
      {phase.name === 'checking' ? (
        <FormMessage tone="info" title="Confirming the move">
          The connection dropped before the club replied. Checking your booking…
        </FormMessage>
      ) : null}
      {phase.name === 'unknown' ? (
        <FormMessage tone="error" title="Move not confirmed yet">
          {phase.message}
        </FormMessage>
      ) : null}

      {selected ? (
        <Card style={styles.card}>
          <ThemedText variant="eyebrow" themeColor="accentText">
            Review the change
          </ThemedText>
          <DetailRow label="From" value={`${formatDayShort(record.date)}, ${formatTimeRange(record.startTime, record.endTime)}`} />
          <DetailRow label="To" value={`${formatDayShort(selected.date)}, ${formatTimeRange(selected.startTime, selected.endTime)}`} />
          <DetailRow label="Uses" value="1 reschedule · no extra class" />
          <ThemedText variant="caption" themeColor="textSecondary">
            Your current class stays booked unless the club secures the new time.
          </ThemedText>
        </Card>
      ) : null}

      <View style={styles.actions}>
        {phase.name === 'unknown' ? (
          <>
            <PrimaryButton title="Check again" fullWidth onPress={() => void reconcile(record)} />
            {selected ? <SecondaryButton title="Try again" fullWidth onPress={() => void submit()} /> : null}
          </>
        ) : (
          <PrimaryButton
            title="Move class"
            loadingLabel={phase.name === 'checking' ? 'Checking your class' : 'Moving your class'}
            fullWidth
            loading={busy}
            disabled={!selected}
            accessibilityHint="Moves your class to the selected time"
            onPress={() => void submit()}
          />
        )}
        <SecondaryButton title="Keep current time" fullWidth disabled={busy} onPress={() => router.back()} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.lg,
  },
  day: {
    gap: Spacing.lg,
  },
  group: {
    gap: Spacing.md,
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
