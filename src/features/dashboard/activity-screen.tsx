import { useCallback, useEffect, useRef, useState } from 'react';
import {  } from 'react-native';

import { PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FormMessage } from '@/components/ui/form-message';
import { ActivityRowsSkeleton } from '@/components/ui/screen-skeletons';
import { usePullRefresh } from '@/components/ui/pull-refresh';
import { ScreenContainer } from '@/components/ui/screen-container';
import { SectionHeading } from '@/components/ui/section-heading';
import { useAuth } from '@/features/auth/auth-provider';

import { ActivityList } from './components/activity-list';
import { DashboardError, fetchActivity, type ActivityItem } from './dashboard-data';

const PAGE = 20;

/**
 * All of the member's activity (the Home card previews the newest 3).
 * Same records and wording as Home; tied to the signed-in user, so another
 * account never sees this list and late replies are dropped.
 */
export default function ActivityScreen() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<{ userId: string | null; items: ActivityItem[] | null; hasMore: boolean }>({
    userId,
    items: null,
    hasMore: false,
  });
  const [limit, setLimit] = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DashboardError | null>(null);
  const request = useRef(0);

  const load = useCallback(async () => {
    if (!userId) return;
    const id = ++request.current;
    setLoading(true);
    try {
      const result = await fetchActivity(userId, limit);
      if (id !== request.current) return;
      setState({ userId, ...result });
      setError(null);
    } catch (e) {
      if (id !== request.current) return;
      setError(e instanceof DashboardError ? e : new DashboardError('unknown', "Your activity couldn't be loaded."));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [userId, limit]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const refreshControl = usePullRefresh(load);
  const items = state.userId === userId ? state.items : null;

  return (
    <ScreenContainer
      refreshControl={refreshControl}>
      <SectionHeading eyebrow="Account" title="All activity" description="Your bookings, membership updates and payments." />

      {error && items ? (
        <FormMessage tone="error" title="Couldn't refresh" action={<SecondaryButton title="Try again" loading={loading} onPress={() => void load()} />}>
          {`${error.message} The list below may be out of date.`}
        </FormMessage>
      ) : null}

      {!items && loading ? <ActivityRowsSkeleton /> : null}
      {!items && !loading && error ? (
        <EmptyState
          title="We couldn't load your activity"
          message={`${error.message} Check your connection and try again.`}
          action={<PrimaryButton title="Try again" onPress={() => void load()} />}
        />
      ) : null}

      {items ? <ActivityList items={items} /> : null}

      {items && state.hasMore ? (
        <SecondaryButton title="Show more" fullWidth loading={loading} onPress={() => setLimit((l) => l + PAGE)} />
      ) : null}
    </ScreenContainer>
  );
}
