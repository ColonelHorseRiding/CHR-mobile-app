import { router } from 'expo-router';

import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FormMessage } from '@/components/ui/form-message';
import { ActivityRowsSkeleton, HomeSkeleton } from '@/components/ui/screen-skeletons';
import { usePullRefresh } from '@/components/ui/pull-refresh';
import { ScreenContainer } from '@/components/ui/screen-container';
import { SectionHeading } from '@/components/ui/section-heading';
import { PrivacyNoticeCard } from '@/features/privacy/privacy-notice-card';
import { PendingCheckoutBanner } from '@/features/checkout/pending-checkout-banner';
import { useUnreadCount } from '@/features/notifications/use-notifications';
import { Spacing } from '@/theme';

import { ActivityList } from './components/activity-list';
import { ClubHeader } from './components/club-header';
import { GoldButton } from './components/gold-button';
import { GreetingHero } from './components/greeting-hero';
import { HomeMembershipCard } from './components/home-membership-card';
import { classifyMemberships, creditFigures, hourIST } from './dashboard-data';
import { useDashboard } from './use-dashboard';

/** How many recent events Home previews. */
const RECENT_ACTIVITY_SHOWN = 3;

function greeting() {
  const hour = hourIST();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function clockIST(ms: number) {
  const ist = new Date(ms + 330 * 60_000);
  const h = ist.getUTCHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(ist.getUTCMinutes()).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
}

/**
 * Member home: club header with the notification bell, a greeting, the member's
 * membership card and the booking button — all read from the server for the
 * signed-in member only. Read-only: it never creates or changes records.
 */
export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { data, error, loading, loadedAt, refresh } = useDashboard();
  const unread = useUnreadCount();
  const refreshControl = usePullRefresh(refresh);

  const view = data ? classifyMemberships(data.memberships) : null;
  const openStore = () => router.navigate('/store');
  const allUsed = view?.kind === 'active' && view.current.every((m) => creditFigures(m).remaining === 0);


  return (
    <ScreenContainer
      // No native title bar on Home, so the status-bar inset is applied here.
      contentStyle={{ paddingTop: insets.top }}
      refreshControl={refreshControl}>
      <ClubHeader unread={unread} />

      <GreetingHero greeting={greeting()} name={data?.fullName ?? 'Welcome back'} />

      <PendingCheckoutBanner from="home" />

      <PrivacyNoticeCard />

      {error && data ? (
        <FormMessage
          tone="error"
          title="Couldn't refresh"
          action={<SecondaryButton title="Try again" loading={loading} onPress={() => void refresh()} />}>
          {`${error.message} Showing details last confirmed at ${loadedAt ? clockIST(loadedAt) : 'an earlier time'} — they may have changed.`}
        </FormMessage>
      ) : null}

      {!data && loading ? <>
          <HomeSkeleton />
          <ActivityRowsSkeleton rows={3} label="Loading recent activity" />
        </> : null}

      {!data && !loading && error ? (
        <EmptyState
          title="We couldn't load your membership"
          message={`${error.message} Check your connection and try again.`}
          action={<PrimaryButton title="Try again" onPress={() => void refresh()} />}
        />
      ) : null}

      {view?.kind === 'active' ? (
        <>
          {view.current.map((membership) => (
            <HomeMembershipCard key={membership.id} membership={membership} />
          ))}
          {allUsed ? (
            <GoldButton
              title="Visit the store"
              hint="Choose a new plan"
              icon={{ ios: 'bag', android: 'storefront', web: 'storefront' }}
              onPress={openStore}
            />
          ) : (
            <GoldButton title="Book a class" hint="Opens the class schedule" onPress={() => router.navigate('/book')} />
          )}
        </>
      ) : null}

      {view?.kind === 'lapsed' ? (
        <>
          <HomeMembershipCard membership={view.latest} lapsed />
          <GoldButton
            title="Choose a plan"
            hint="Opens the store"
            icon={{ ios: 'bag', android: 'storefront', web: 'storefront' }}
            onPress={openStore}
          />
        </>
      ) : null}

      {view?.kind === 'none' ? (
        <EmptyState
          title="Start riding with us"
          message="You don't have a riding plan yet. Memberships and single rides are available in the Store."
          action={<PrimaryButton title="Visit the store" onPress={openStore} />}
        />
      ) : null}

      {data ? (
        <View style={styles.section}>
          <SectionHeading eyebrow="Account" title="Recent activity" />
          {/* A preview: the full history stays on the server (and in My classes / My orders). */}
          <ActivityList items={data.activity.slice(0, RECENT_ACTIVITY_SHOWN)} />
          {/* Older events move to "See all" as new ones arrive. */}
          {data.activity.length > RECENT_ACTIVITY_SHOWN ? (
            <Button
              variant="ghost"
              title="See all activity"
              accessibilityHint="Opens your full activity history"
              onPress={() => router.push('/activity')}
            />
          ) : null}
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.lg,
  },
});
