import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FormMessage } from '@/components/ui/form-message';
import { ClassDetailSkeleton } from '@/components/ui/screen-skeletons';
import { ScreenContainer } from '@/components/ui/screen-container';
import { plural } from '@/features/store/format';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/features/auth/auth-provider';
import { todayIST } from '@/features/dashboard/dashboard-data';
import { Radii, Spacing } from '@/theme';

import { BookingError } from './booking-api';
import { notifyBookingsChanged, useBookingsVersion } from './booking-events';
import {
  attendanceLabel,
  canCancel,
  cancellationEffect,
  classTiming,
  describeClass,
  moveState,
  reschedulesLeft,
} from './class-status';
import { StatusBadge } from './components/status-badge';
import { cancelBooking, fetchBookingPolicy, fetchClassRecord, type BookingPolicy, type ClassRecord } from './my-classes-api';
import { formatDayLong, formatDayShort, formatTimeRange, shortRef } from './schedule-format';

type Cancel =
  | { name: 'idle' }
  | { name: 'working' }
  /** The reply never arrived; re-reading the booking to find out. */
  | { name: 'checking' }
  | { name: 'unknown'; message: string }
  | { name: 'done' }
  | { name: 'failed'; error: BookingError };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One of the member's classes, as the server records it, with the actions
 * the server allows: move it (reschedule_booking) or cancel it
 * (cancel_booking). Nothing here changes a record directly.
 */
export default function ClassDetailScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const params = useLocalSearchParams<{ bookingId: string }>();
  const bookingId = typeof params.bookingId === 'string' ? params.bookingId : '';
  const bookingsVersion = useBookingsVersion();

  const [record, setRecord] = useState<{ userId: string; value: ClassRecord | null } | null>(null);
  const [policy, setPolicy] = useState<BookingPolicy | null>(null);
  const [loadError, setLoadError] = useState<BookingError | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancel, setCancel] = useState<Cancel>({ name: 'idle' });
  const working = useRef(false);
  const latestUser = useRef(userId);

  useEffect(() => {
    latestUser.current = userId;
  }, [userId]);

  const load = useCallback(async () => {
    if (!userId || !bookingId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [value, p] = await Promise.all([fetchClassRecord(userId, bookingId), fetchBookingPolicy()]);
      if (latestUser.current !== userId) return;
      setRecord({ userId, value });
      setPolicy(p);
      setLoadError(null);
    } catch (e) {
      if (latestUser.current !== userId) return;
      setLoadError(e instanceof BookingError ? e : new BookingError('unknown', "This class couldn't be loaded."));
    } finally {
      if (latestUser.current === userId) setLoading(false);
    }
  }, [userId, bookingId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load, bookingsVersion]);

  /** Settles a cancellation whose reply was lost by re-reading the booking. */
  const reconcile = useCallback(async () => {
    if (!userId) return;
    setCancel({ name: 'checking' });
    await wait(1500);
    try {
      const value = await fetchClassRecord(userId, bookingId);
      if (latestUser.current !== userId) return;
      setRecord({ userId, value });
      if (value?.status === 'cancelled') {
        setCancel({ name: 'done' });
      } else {
        setCancel({
          name: 'unknown',
          message: 'We couldn’t confirm the cancellation. Your class still shows as booked — check again in a moment.',
        });
      }
    } catch {
      if (latestUser.current !== userId) return;
      setCancel({ name: 'unknown', message: 'We couldn’t reach the club to confirm whether the class was cancelled. Check your connection, then check again.' });
    }
    notifyBookingsChanged();
  }, [userId, bookingId]);

  const doCancel = useCallback(async () => {
    if (working.current || !userId) return;
    working.current = true;
    setCancel({ name: 'working' });
    try {
      await cancelBooking(bookingId);
      if (latestUser.current !== userId) return;
      setCancel({ name: 'done' });
      notifyBookingsChanged();
    } catch (e) {
      if (latestUser.current !== userId) return;
      const error = e instanceof BookingError ? e : new BookingError('network', "We couldn't reach the club's servers.");
      if (error.kind === 'network') await reconcile();
      else {
        setCancel({ name: 'failed', error });
        notifyBookingsChanged();
      }
    } finally {
      working.current = false;
    }
  }, [userId, bookingId, reconcile]);

  const own = record && record.userId === userId ? record.value : undefined;

  if (own === undefined) {
    return (
      <ScreenContainer>
        {loading ? (
          <ClassDetailSkeleton />
        ) : (
          <EmptyState
            title="We couldn't load this class"
            message={`${loadError?.message ?? ''} Check your connection and try again.`.trim()}
            action={<PrimaryButton title="Try again" onPress={() => void load()} />}
          />
        )}
      </ScreenContainer>
    );
  }

  if (own === null) {
    return (
      <ScreenContainer>
        <EmptyState
          title="Class not found"
          message="This class isn't on your account."
          action={<PrimaryButton title="My classes" onPress={() => router.replace('/book/classes')} />}
        />
      </ScreenContainer>
    );
  }

  const r = own;
  const status = describeClass(r);
  const timing = classTiming(r);
  const attendance = attendanceLabel(r);
  const move = moveState(r, todayIST());
  const cancellable = canCancel(r);
  const effect = cancellationEffect(policy, r);
  const left = reschedulesLeft(r);
  const busy = cancel.name === 'working' || cancel.name === 'checking';

  function confirmCancel() {
    Alert.alert(
      'Cancel this class?',
      [
        `${formatDayLong(r.date)}, ${formatTimeRange(r.startTime, r.endTime)}.`,
        effect.text,
        'Cancelling doesn’t use a reschedule, and it can’t be undone.',
        move.canMove ? 'To keep the class, move it to another time instead.' : null,
      ]
        .filter(Boolean)
        .join('\n\n'),
      [
        { text: 'Keep class', style: 'cancel' },
        { text: 'Cancel class', style: 'destructive', onPress: () => void doCancel() },
      ]
    );
  }

  const active = r.status === 'held' || r.status === 'confirmed';
  const minutes = durationMinutes(r.startTime, r.endTime);
  const attendanceText = attendance ?? (timing === 'after' ? 'Not recorded yet' : 'Recorded after the class');

  return (
    <ScreenContainer>
      <View style={styles.hero}>
        <ThemedText variant="eyebrow" themeColor="accentText">
          Your class
        </ThemedText>
        <ThemedText variant="display" accessibilityRole="header">
          {formatDayLong(r.date)}
        </ThemedText>
        <View style={[styles.rule, { backgroundColor: theme.secondary }]} />
      </View>

      <Card style={styles.card}>
        {/* Time first, then the status the club has recorded. */}
        <View style={styles.lead}>
          <Icon name={{ ios: 'clock', android: 'schedule', web: 'schedule' }} />
          <View style={styles.flex}>
            <ThemedText variant="eyebrow" themeColor="accentText">
              Time
            </ThemedText>
            <ThemedText variant="title" style={styles.time}>
              {formatTimeRange(r.startTime, r.endTime)}
            </ThemedText>
            {minutes ? (
              <ThemedText variant="caption" themeColor="textSecondary">
                {minutes % 60 === 0 ? plural(minutes / 60, 'hour', 'hours') : `${minutes} minutes`}
              </ThemedText>
            ) : null}
          </View>
        </View>

        <View style={status.note ? [styles.statusBox, { backgroundColor: theme.surfaceMuted }] : undefined}>
          <StatusBadge label={status.label} tone={status.tone} />
          {status.note ? (
            <ThemedText variant="caption" themeColor="textSecondary">
              {status.note}
            </ThemedText>
          ) : null}
        </View>

        <View style={styles.rows}>
          <InfoRow
            icon={{ ios: 'checkmark.circle', android: 'how_to_reg', web: 'how_to_reg' }}
            label="Attendance"
            value={attendanceText}
          />
          <InfoRow icon={{ ios: 'figure.equestrian.sports', android: 'pets', web: 'pets' }} label="Horse" value="Assigned by your coach at the ground" />
          {r.movedFrom ? (
            <InfoRow
              icon={{ ios: 'calendar.badge.clock', android: 'update', web: 'update' }}
              label="Moved from"
              value={`${formatDayShort(r.movedFrom.date)}, ${formatTimeRange(r.movedFrom.startTime, r.movedFrom.endTime)}`}
            />
          ) : null}
          {active && left !== null ? (
            <InfoRow
              icon={{ ios: 'arrow.triangle.2.circlepath', android: 'autorenew', web: 'autorenew' }}
              label="Reschedules"
              value={left > 0 ? `${left} remaining` : 'No reschedules remaining'}
              note="on this plan"
            />
          ) : null}
          <InfoRow icon={{ ios: 'number', android: 'tag', web: 'tag' }} label="Booking reference" value={shortRef(r.id)} subtle />
        </View>
      </Card>

      {/* One notice: either how to move it, or the single reason it can't be moved. */}
      {active && cancel.name !== 'done' ? (
        move.canMove ? (
          <Notice icon={{ ios: 'info.circle', android: 'info', web: 'info' }}>
            Need to change your plans? You can move this class to another time.
          </Notice>
        ) : move.reason ? (
          <Notice icon={{ ios: 'exclamationmark.circle', android: 'error_outline', web: 'error_outline' }}>{move.reason}</Notice>
        ) : null
      ) : null}

      {cancel.name === 'done' ? (
        <FormMessage tone="success" title="Class cancelled">
          {r.status !== 'cancelled'
            ? 'Updating your class…'
            : r.ledger.some((l) => l.type === 'cancellation' && l.amount > 0)
              ? 'The club returned this class to your plan.'
              : 'The club has cancelled this class. It was not returned to your plan.'}
        </FormMessage>
      ) : null}
      {cancel.name === 'checking' ? (
        <FormMessage tone="info" title="Confirming the cancellation">
          The connection dropped before the club replied. Checking your booking…
        </FormMessage>
      ) : null}
      {cancel.name === 'unknown' ? (
        <FormMessage
          tone="error"
          title="Cancellation not confirmed"
          action={<SecondaryButton title="Check again" onPress={() => void reconcile()} />}>
          {cancel.message}
        </FormMessage>
      ) : null}
      {cancel.name === 'failed' ? (
        <FormMessage tone="error" title="Couldn't cancel this class">
          {cancel.error.message}
        </FormMessage>
      ) : null}

      {active ? (
        <View style={styles.actions}>
          {move.canMove ? (
            <PrimaryButton
              title="Reschedule class"
              fullWidth
              disabled={busy}
              accessibilityHint="Choose another time for this class"
              onPress={() => router.push({ pathname: '/book/move/[bookingId]', params: { bookingId: r.id } })}
            />
          ) : null}
          {cancellable ? (
            <>
              <Button title="Cancel class" loadingLabel="Cancelling" variant="ghost" fullWidth loading={busy} onPress={confirmCancel} />
              <ThemedText variant="caption" themeColor="textSecondary" style={styles.center}>
                {effect.text}
              </ThemedText>
            </>
          ) : null}
        </View>
      ) : null}

      <SecondaryButton title="My classes" fullWidth onPress={() => (router.canGoBack() ? router.back() : router.replace('/book/classes'))} />
    </ScreenContainer>
  );
}

function durationMinutes(start: string, end: string) {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const d = toMin(end) - toMin(start);
  return Number.isFinite(d) && d > 0 ? d : null;
}

type IconName = { ios: SFSymbol; android: AndroidSymbol; web: AndroidSymbol };

function Icon({ name }: { name: IconName }) {
  const theme = useTheme();
  return (
    <View style={[styles.iconWrap, { backgroundColor: theme.surfaceMuted }]} importantForAccessibility="no-hide-descendants">
      <SymbolView name={name} size={18} tintColor={theme.accentText} resizeMode="scaleAspectFit" style={styles.icon} />
    </View>
  );
}

function InfoRow({ icon, label, value, note, subtle }: { icon: IconName; label: string; value: string; note?: string; subtle?: boolean }) {
  return (
    <View style={styles.infoRow} accessible accessibilityLabel={`${label}: ${value}${note ? `, ${note}` : ''}`}>
      <Icon name={icon} />
      <View style={styles.flex}>
        <ThemedText variant="caption" themeColor="textSecondary">
          {label}
        </ThemedText>
        <ThemedText variant={subtle ? 'body' : 'bodyStrong'} selectable={subtle}>
          {value}
          {note ? (
            <ThemedText variant="caption" themeColor="textSecondary">
              {`  ${note}`}
            </ThemedText>
          ) : null}
        </ThemedText>
      </View>
    </View>
  );
}

function Notice({ icon, children }: { icon: IconName; children: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.notice, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]} accessible accessibilityRole="text">
      <SymbolView name={icon} size={20} tintColor={theme.accentText} resizeMode="scaleAspectFit" style={styles.icon} />
      <ThemedText variant="caption" style={styles.flex}>
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: Spacing.xs,
  },
  rule: {
    width: 44,
    height: 3,
    borderRadius: 2,
    marginTop: Spacing.sm,
  },
  card: {
    gap: Spacing.lg,
  },
  lead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  time: {
    fontSize: 24,
    lineHeight: 30,
  },
  statusBox: {
    borderRadius: Radii.md,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  rows: {
    gap: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 20,
    height: 20,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.md,
    padding: Spacing.md,
  },
  actions: {
    gap: Spacing.md,
  },
  center: {
    textAlign: 'center',
  },
});
