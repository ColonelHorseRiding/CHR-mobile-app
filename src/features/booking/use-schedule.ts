import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/features/auth/auth-provider';
import { todayIST } from '@/features/dashboard/dashboard-data';

import {
  BookingError,
  fetchClassDays,
  fetchDaySessions,
  fetchEligibility,
  fetchMyClassDays,
  type Eligibility,
  type SessionSlot,
} from './booking-api';
import { useBookingsVersion } from './booking-events';

type Overview = {
  userId: string | null;
  eligibility: Eligibility | null;
  /** Days with open sessions; null when that list couldn't be read (every day is then offered). */
  classDays: Set<string> | null;
  myDays: Set<string>;
  error: BookingError | null;
  loading: boolean;
};

type Day = {
  userId: string | null;
  date: string | null;
  sessions: SessionSlot[] | null;
  loadedAt: number | null;
  error: BookingError | null;
  loading: boolean;
};

/** Returning to the schedule re-reads availability when it is older than this. */
const FOCUS_REFRESH_MS = 15_000;

function asBookingError(error: unknown) {
  return error instanceof BookingError ? error : new BookingError('unknown', "The schedule couldn't be loaded.");
}

/**
 * The member's bookable range and the sessions on the chosen day, read from
 * the server. All state is tied to the signed-in user id and discarded when it
 * changes; responses that arrive for an older request or user are dropped.
 */
export function useSchedule() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const bookingsVersion = useBookingsVersion();

  const [overview, setOverview] = useState<Overview>({
    userId,
    eligibility: null,
    classDays: null,
    myDays: new Set(),
    error: null,
    loading: true,
  });
  const [selected, setSelected] = useState<{ userId: string | null; date: string | null }>({ userId, date: null });
  const [day, setDay] = useState<Day>({ userId, date: null, sessions: null, loadedAt: null, error: null, loading: false });

  const latestUser = useRef(userId);
  const overviewRequest = useRef(0);
  const dayRequest = useRef(0);
  const selectedRef = useRef(selected);
  /** True while the shown day was chosen by the app (not the member) and may be skipped if it is over. */
  const autoPicked = useRef(false);
  const range = useRef<{ classDays: Set<string> | null; maxDate: string | null }>({ classDays: null, maxDate: null });

  useEffect(() => {
    latestUser.current = userId;
  }, [userId]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const loadOverview = useCallback(async () => {
    if (!userId) return;
    const id = ++overviewRequest.current;
    setOverview((s) =>
      s.userId === userId
        ? { ...s, loading: true }
        : { userId, eligibility: null, classDays: null, myDays: new Set(), error: null, loading: true }
    );
    try {
      const eligibility = await fetchEligibility();
      let classDays: Set<string> | null = null;
      let myDays = new Set<string>();
      if (eligibility.hasActiveMembership && eligibility.minDate && eligibility.maxDate) {
        const [days, mine] = await Promise.allSettled([
          fetchClassDays(eligibility.minDate, eligibility.maxDate),
          fetchMyClassDays(userId, eligibility.minDate, eligibility.maxDate),
        ]);
        classDays = days.status === 'fulfilled' ? days.value : null;
        myDays = mine.status === 'fulfilled' ? mine.value : new Set();
      }
      if (id !== overviewRequest.current || latestUser.current !== userId) return;
      range.current = { classDays, maxDate: eligibility.maxDate };
      setOverview({ userId, eligibility, classDays, myDays, error: null, loading: false });
      const current = selectedRef.current;
      const keep =
        current.userId === userId &&
        !!current.date &&
        !!eligibility.minDate &&
        !!eligibility.maxDate &&
        current.date >= eligibility.minDate &&
        current.date <= eligibility.maxDate;
      if (!keep) {
        autoPicked.current = true;
        setSelected({ userId, date: firstClassDay(eligibility, classDays) });
      }
    } catch (error) {
      if (id !== overviewRequest.current || latestUser.current !== userId) return;
      setOverview((s) => ({ ...s, userId, error: asBookingError(error), loading: false }));
    }
  }, [userId]);

  const date = selected.userId === userId ? selected.date : null;

  const loadDay = useCallback(async () => {
    if (!userId || !date) return;
    const id = ++dayRequest.current;
    setDay((s) =>
      s.userId === userId && s.date === date
        ? { ...s, loading: true }
        : { userId, date, sessions: null, loadedAt: null, error: null, loading: true }
    );
    try {
      const sessions = await fetchDaySessions(date);
      if (id !== dayRequest.current || latestUser.current !== userId) return;
      // Opening late in the day: if every class today is over, show the next day with classes instead.
      if (autoPicked.current) {
        autoPicked.current = false;
        const over = date === todayIST() && !sessions.some((s) => s.isMine || (s.status === 'open' && s.isBookable));
        const next = over ? nextClassDay(date, range.current.classDays, range.current.maxDate) : null;
        if (next) {
          setSelected({ userId, date: next });
          return;
        }
      }
      setDay({ userId, date, sessions, loadedAt: Date.now(), error: null, loading: false });
    } catch (error) {
      if (id !== dayRequest.current || latestUser.current !== userId) return;
      // Earlier sessions for this day stay visible, flagged as possibly out of date.
      setDay((s) => ({ ...s, userId, date, error: asBookingError(error), loading: false }));
    }
  }, [userId, date]);

  // First load, a new account, and every confirmed booking.
  useEffect(() => {
    const timer = setTimeout(() => void loadOverview(), 0);
    return () => clearTimeout(timer);
  }, [loadOverview, bookingsVersion]);

  useEffect(() => {
    const timer = setTimeout(() => void loadDay(), 0);
    return () => clearTimeout(timer);
  }, [loadDay, bookingsVersion]);

  const dayLoadedAt = day.loadedAt;
  useFocusEffect(
    useCallback(() => {
      if (dayLoadedAt && Date.now() - dayLoadedAt > FOCUS_REFRESH_MS) {
        void loadOverview();
        void loadDay();
      }
    }, [dayLoadedAt, loadOverview, loadDay])
  );

  const refresh = useCallback(async () => {
    await Promise.all([loadOverview(), loadDay()]);
  }, [loadOverview, loadDay]);

  const selectDate = useCallback(
    (next: string) => {
      autoPicked.current = false;
      setSelected({ userId, date: next });
    },
    [userId]
  );

  const ownOverview = overview.userId === userId;
  const ownDay = day.userId === userId && day.date === date;
  return {
    eligibility: ownOverview ? overview.eligibility : null,
    classDays: ownOverview ? overview.classDays : null,
    myDays: ownOverview ? overview.myDays : new Set<string>(),
    overviewError: ownOverview ? overview.error : null,
    overviewLoading: ownOverview ? overview.loading : true,
    date,
    selectDate,
    sessions: ownDay ? day.sessions : null,
    dayError: ownDay ? day.error : null,
    dayLoading: ownDay ? day.loading : !!date,
    dayLoadedAt: ownDay ? day.loadedAt : null,
    refresh,
    retryDay: loadDay,
  };
}

function nextClassDay(after: string, classDays: Set<string> | null, maxDate: string | null) {
  if (!maxDate) return null;
  if (classDays) return [...classDays].filter((d) => d > after && d <= maxDate).sort()[0] ?? null;
  const next = new Date(Date.parse(`${after}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return next <= maxDate ? next : null;
}

function firstClassDay(e: Eligibility, classDays: Set<string> | null) {
  if (!e.minDate || !e.maxDate) return null;
  if (classDays && classDays.size > 0) {
    const first = [...classDays].filter((d) => d >= e.minDate! && d <= e.maxDate!).sort()[0];
    if (first) return first;
  }
  return e.minDate;
}
