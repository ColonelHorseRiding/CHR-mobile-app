import { router } from 'expo-router';

import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FormMessage } from '@/components/ui/form-message';
import { ScheduleSkeleton, SlotsSkeleton } from '@/components/ui/screen-skeletons';
import { usePullRefresh } from '@/components/ui/pull-refresh';
import { ScreenContainer } from '@/components/ui/screen-container';
import { SectionHeading } from '@/components/ui/section-heading';
import { todayIST } from '@/features/dashboard/dashboard-data';
import { formatDate, plural } from '@/features/store/format';
import { Spacing } from '@/theme';

import type { Eligibility } from './booking-api';
import { DateStrip } from './components/date-strip';
import { SessionCard } from './components/session-card';
import { datesBetween, formatDayLong, groupByPartOfDay } from './schedule-format';
import { useSchedule } from './use-schedule';

function clockIST(ms: number) {
  const ist = new Date(ms + 330 * 60_000);
  const h = ist.getUTCHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(ist.getUTCMinutes()).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
}

/**
 * Class schedule: pick a day in the member's bookable range, then a time.
 * Everything shown — days, times, places left — comes from the server; the
 * booking itself is decided by book_class() on the next screen.
 */
export default function ScheduleScreen() {
  const schedule = useSchedule();
  const { eligibility, date } = schedule;
  const today = todayIST();
  const openStore = () => router.navigate('/store');

  const refreshControl = usePullRefresh(schedule.refresh);

  const heading = (
    <SectionHeading
      eyebrow="Book a class"
      title="Class schedule"
      description="Each class is one hour. Your coach assigns your horse at the ground."
    />
  );
  const openMyClasses = () => router.push('/book/classes');

  if (!eligibility && schedule.overviewLoading) {
    return (
      <ScreenContainer>
        {heading}
        <ScheduleSkeleton />
      </ScreenContainer>
    );
  }

  if (!eligibility) {
    return (
      <ScreenContainer refreshControl={refreshControl}>
        {heading}
        <EmptyState
          title="We couldn't load the schedule"
          message={`${schedule.overviewError?.message ?? ''} Check your connection and try again.`.trim()}
          action={<PrimaryButton title="Try again" onPress={() => void schedule.refresh()} />}
        />
      </ScreenContainer>
    );
  }

  if (!eligibility.hasActiveMembership || !eligibility.minDate || !eligibility.maxDate) {
    return (
      <ScreenContainer refreshControl={refreshControl}>
        {heading}
        <EmptyState
          title="You need a plan to book classes"
          message="Choose a membership or a single ride in the Store. Once your payment is confirmed you can book here."
          action={<PrimaryButton title="Visit the store" onPress={openStore} />}
        />
        <SecondaryButton title="My classes" fullWidth onPress={openMyClasses} />
      </ScreenContainer>
    );
  }

  const noClassesLeft = eligibility.creditsRemaining !== null && eligibility.creditsRemaining <= 0;
  const dates = datesBetween(eligibility.minDate, eligibility.maxDate);
  const groups = schedule.sessions ? groupByPartOfDay(schedule.sessions) : [];

  return (
    <ScreenContainer refreshControl={refreshControl}>
      {heading}

      <PlanSummary eligibility={eligibility} />

      <SecondaryButton
        title="Weekly schedule"
        fullWidth
        accessibilityHint="Choose the days and times you ride every week"
        onPress={() => router.push('/book/weekly')}
      />
      <SecondaryButton title="My classes" fullWidth accessibilityHint="Your booked, past and cancelled classes" onPress={openMyClasses} />

      {noClassesLeft ? (
        <FormMessage
          tone="info"
          title="No classes left"
          action={<SecondaryButton title="Visit the store" onPress={openStore} />}>
          You&apos;ve used every class on your plan. You can still look at the schedule; choose a new plan to book.
        </FormMessage>
      ) : null}

      {schedule.overviewError ? (
        <FormMessage tone="error" title="Couldn't refresh your details">
          {`${schedule.overviewError.message} Pull down to try again.`}
        </FormMessage>
      ) : null}

      <DateStrip
        dates={dates}
        selected={date}
        today={today}
        classDays={schedule.classDays}
        myDays={schedule.myDays}
        onSelect={schedule.selectDate}
      />

      {date ? (
        <View style={styles.day}>
          <View style={styles.dayHeader}>
            <ThemedText variant="title" accessibilityRole="header">
              {formatDayLong(date)}
            </ThemedText>
            {date === today ? (
              <ThemedText variant="eyebrow" themeColor="accentText">
                Today
              </ThemedText>
            ) : null}
          </View>

          {schedule.dayError && schedule.sessions ? (
            <FormMessage
              tone="error"
              title="Couldn't refresh this day"
              action={<SecondaryButton title="Try again" loading={schedule.dayLoading} onPress={() => void schedule.retryDay()} />}>
              {`${schedule.dayError.message} Places shown were last checked at ${
                schedule.dayLoadedAt ? clockIST(schedule.dayLoadedAt) : 'an earlier time'
              } and may have changed.`}
            </FormMessage>
          ) : null}

          {!schedule.sessions && schedule.dayLoading ? <SlotsSkeleton label="Loading classes" /> : null}

          {!schedule.sessions && !schedule.dayLoading && schedule.dayError ? (
            <EmptyState
              title="Couldn't load the classes for this day"
              message={schedule.dayError.message}
              action={<PrimaryButton title="Try again" onPress={() => void schedule.retryDay()} />}
            />
          ) : null}

          {schedule.sessions && schedule.sessions.length === 0 ? (
            <EmptyState
              title="No classes scheduled for this day."
              message="There are no classes scheduled for this date. Please choose another day."
            />
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
                  onPress={() => router.push({ pathname: '/book/[sessionId]', params: { sessionId: s.id, date: s.date } })}
                />
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </ScreenContainer>
  );
}

/** The plan line: classes left, validity and this week's usage, as reported by the server. */
function PlanSummary({ eligibility: e }: { eligibility: Eligibility }) {
  const left = e.creditsRemaining;
  return (
    <Card style={styles.plan}>
      <View style={styles.planRow}>
        <View style={styles.flex}>
          <ThemedText variant="eyebrow" themeColor="accentText">
            Your plan
          </ThemedText>
          <ThemedText variant="bodyStrong">
            {left !== null ? `${plural(left, 'class', 'classes')} left` : 'Classes left unavailable'}
          </ThemedText>
        </View>
        {e.membershipEndDate ? (
          <View style={styles.planEnd}>
            <ThemedText variant="caption" themeColor="textSecondary">
              Valid until
            </ThemedText>
            <ThemedText variant="bodyStrong">{formatDate(e.membershipEndDate)}</ThemedText>
          </View>
        ) : null}
      </View>
      {e.blockLimit !== null && e.blockUsed !== null && e.blockEnd ? (
        <ThemedText variant="caption" themeColor="textSecondary">
          {`This week: ${e.blockUsed} of ${plural(e.blockLimit, 'class', 'classes')} booked (until ${formatDate(e.blockEnd)}).`}
        </ThemedText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  day: {
    gap: Spacing.lg,
  },
  dayHeader: {
    gap: Spacing.xxs,
  },
  group: {
    gap: Spacing.md,
  },
  plan: {
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.md,
  },
  planEnd: {
    alignItems: 'flex-end',
  },
  flex: {
    flex: 1,
  },
  center: {
    textAlign: 'center',
  },
});
