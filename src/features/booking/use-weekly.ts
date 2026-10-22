import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/features/auth/auth-provider';
import { todayIST } from '@/features/dashboard/dashboard-data';

import { BookingError, fetchEligibility, type SessionSlot } from './booking-api';
import { notifyBookingsChanged, useBookingsVersion } from './booking-events';
import {
  bookReplacement,
  confirmSchedule,
  endSchedule,
  fetchMySchedule,
  fetchRecurringPlan,
  fetchWeekSessions,
  type ConfirmResult,
  type MySchedule,
  type RecurringPlan,
} from './recurring-api';
import { addDays, dayOfWeek, slotKey, weekStart, type Occurrence, type WeeklySlot } from './recurring-presentation';

type Overview = {
  userId: string | null;
  supported: boolean;
  plan: RecurringPlan;
  schedule: MySchedule | null;
  creditsRemaining: number | null;
  loading: boolean;
  error: BookingError | null;
};

const asError = (e: unknown, fallback: string) => (e instanceof BookingError ? e : new BookingError('unknown', fallback));
const slotOf = (s: SessionSlot): WeeklySlot => ({ dayOfWeek: dayOfWeek(s.date), startTime: s.startTime, endTime: s.endTime });

/**
 * State for the weekly-schedule screen: the member's plan and schedule, the
 * visible week of classes, and the pattern being built. Everything is tied to
 * the signed-in user and late replies are dropped. Nothing is "booked" here —
 * the server does that when confirmSchedule resolves.
 */
export function useWeekly() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const bookingsVersion = useBookingsVersion();
  const today = todayIST();

  const [overview, setOverview] = useState<Overview>({
    userId, supported: true, plan: null, schedule: null, creditsRemaining: null, loading: true, error: null,
  });
  const [week, setWeek] = useState(() => weekStart(today));
  const [sessions, setSessions] = useState<{ week: string; items: SessionSlot[] } | null>(null);
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekError, setWeekError] = useState<BookingError | null>(null);
  const [selection, setSelection] = useState<Map<string, WeeklySlot>>(new Map());
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<BookingError | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const latestUser = useRef(userId);
  const overviewReq = useRef(0);
  const weekReq = useRef(0);
  useEffect(() => {
    latestUser.current = userId;
  }, [userId]);

  const loadOverview = useCallback(async () => {
    if (!userId) return;
    const id = ++overviewReq.current;
    setOverview((s) => (s.userId === userId ? { ...s, loading: true } : { userId, supported: true, plan: null, schedule: null, creditsRemaining: null, loading: true, error: null }));
    try {
      const [planR, mineR, eligR] = await Promise.allSettled([fetchRecurringPlan(userId, todayIST()), fetchMySchedule(), fetchEligibility()]);
      if (id !== overviewReq.current || latestUser.current !== userId) return;
      if (planR.status === 'rejected') throw planR.reason;
      const supported = planR.value.supported && (mineR.status !== 'fulfilled' || mineR.value.supported);
      setOverview({
        userId,
        supported,
        plan: planR.value.plan,
        schedule: mineR.status === 'fulfilled' ? mineR.value.schedule : null,
        creditsRemaining: eligR.status === 'fulfilled' ? eligR.value.creditsRemaining : null,
        loading: false,
        error: mineR.status === 'rejected' ? asError(mineR.reason, "Your weekly schedule couldn't be loaded.") : null,
      });
    } catch (e) {
      if (id !== overviewReq.current || latestUser.current !== userId) return;
      setOverview((s) => ({ ...s, userId, loading: false, error: asError(e, "Your plan couldn't be loaded.") }));
    }
  }, [userId]);

  const loadWeek = useCallback(
    async (start: string) => {
      if (!userId) return;
      const id = ++weekReq.current;
      setWeekLoading(true);
      try {
        const items = await fetchWeekSessions(start);
        if (id !== weekReq.current || latestUser.current !== userId) return;
        setSessions({ week: start, items });
        setWeekError(null);
      } catch (e) {
        if (id !== weekReq.current || latestUser.current !== userId) return;
        setWeekError(asError(e, "This week's classes couldn't be loaded."));
      } finally {
        if (id === weekReq.current) setWeekLoading(false);
      }
    },
    [userId]
  );

  // Another account starts clean.
  useEffect(() => {
    setSessions(null);
    setSelection(new Map());
    setSeededFor(null);
    setResult(null);
    setActionError(null);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void loadOverview();
      void loadWeek(week);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadOverview, loadWeek, bookingsVersion])
  );

  useEffect(() => {
    void loadWeek(week);
  }, [week, loadWeek]);

  // Start editing from the saved pattern (once per schedule).
  const scheduleId = overview.schedule?.scheduleId ?? null;
  useEffect(() => {
    if (scheduleId && seededFor !== scheduleId && overview.schedule) {
      setSelection(new Map(overview.schedule.slots.map((s) => [slotKey(s), s])));
      setSeededFor(scheduleId);
    }
  }, [scheduleId, seededFor, overview.schedule]);

  const limit = overview.plan?.slotsPerWeek ?? overview.schedule?.slotsPerWeek ?? 0;
  const lastWeek = weekStart(overview.plan?.validUntil ?? overview.schedule?.validUntil ?? today);
  const canPrev = week > weekStart(today);
  const canNext = week < lastWeek;

  const goPrev = () => canPrev && setWeek((w) => addDays(w, -7));
  const goNext = () => canNext && setWeek((w) => addDays(w, 7));

  /** Adds or removes a weekly slot. Returns a message when the plan's weekly limit blocks it. */
  const toggle = (s: SessionSlot) => {
    const slot = slotOf(s);
    const key = slotKey(slot);
    setActionError(null);
    setResult(null);
    if (selection.has(key)) {
      const next = new Map(selection);
      next.delete(key);
      setSelection(next);
      return null;
    }
    if (selection.size >= limit) {
      return `${overview.plan?.planName ?? 'Your plan'} allows up to ${limit} classes a week.`;
    }
    setSelection(new Map(selection).set(key, slot));
    return null;
  };

  const savedKeys = (overview.schedule?.slots ?? []).map(slotKey).sort().join(',');
  const dirty = [...selection.keys()].sort().join(',') !== savedKeys;

  const run = async <T,>(task: () => Promise<T>, fallback: string): Promise<T | null> => {
    if (busy) return null;
    setBusy(true);
    setActionError(null);
    try {
      return await task();
    } catch (e) {
      setActionError(asError(e, fallback));
      return null;
    } finally {
      setBusy(false);
      // A failed or unanswered request may still have booked: re-read the truth.
      notifyBookingsChanged();
      void loadOverview();
      void loadWeek(week);
    }
  };

  const confirm = async (): Promise<ConfirmResult | null> => {
    if (selection.size === 0) return null;
    setResult(null);
    return run(() => confirmSchedule([...selection.values()]), "We couldn't set up your weekly schedule.");
  };

  const stop = async () => {
    const ok = await run(async () => {
      await endSchedule();
      return true;
    }, "We couldn't stop your weekly schedule.");
    if (ok) {
      setSelection(new Map());
      setSeededFor(null);
      setResult('Your weekly schedule has stopped. Classes already booked stay as they are.');
    }
    return ok;
  };

  const replace = async (o: Occurrence, session: SessionSlot) => {
    if (!o.bookingId) return null;
    const bookingId = o.bookingId;
    return run(() => bookReplacement(bookingId, session.id), "We couldn't book the replacement.");
  };

  return {
    today, overview, week, sessions, weekLoading, weekError, selection, dirty, limit, canPrev, canNext, busy,
    actionError, result, setResult, goPrev, goNext, toggle, confirm, stop, replace,
    reload: () => Promise.all([loadOverview(), loadWeek(week)]),
  };
}
