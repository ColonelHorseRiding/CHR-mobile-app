import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FormMessage } from '@/components/ui/form-message';
import { ScheduleSkeleton, SlotsSkeleton } from '@/components/ui/screen-skeletons';
import { usePullRefresh } from '@/components/ui/pull-refresh';
import { ScreenContainer } from '@/components/ui/screen-container';
import { SectionHeading } from '@/components/ui/section-heading';
import { formatDate, plural } from '@/features/store/format';
import { useTheme } from '@/hooks/use-theme';
import { Radii, Spacing } from '@/theme';

import type { SessionSlot } from './booking-api';
import { PlaceMarks } from './components/session-card';
import {
  canToggle,
  cellLabel,
  cellState,
  clock12,
  dayOfWeek,
  slotKey,
  summaryLines,
  occurrenceStatus,
  resultMessage,
  timeRangeLabel,
  weekDays,
  weekLabel,
  type CellState,
  type Occurrence,
  type Tone,
} from './recurring-presentation';
import { formatDayShort } from './schedule-format';
import { useWeekly } from './use-weekly';

/**
 * Weekly schedule: choose the days and times you ride, review them, confirm.
 * The calendar (days, times, places left) is read from the server. Confirming
 * asks the server to book the matching classes through the normal credit and
 * capacity rules; what comes back — booked, full, out of classes — is what is shown.
 */
export default function WeeklyScheduleScreen() {
  const w = useWeekly();
  const { overview } = w;
  const [replacing, setReplacing] = useState<Occurrence | null>(null);
  const [limitNote, setLimitNote] = useState<string | null>(null);

  const refreshControl = usePullRefresh(w.reload);
  const heading = (
    <SectionHeading
      eyebrow="Weekly schedule"
      title="Plan your week"
      description="Choose the days and times you ride. We book each one every week until your plan ends."
    />
  );

  if (overview.loading && !overview.plan && !overview.schedule) {
    return (
      <ScreenContainer>
        {heading}
        <ScheduleSkeleton />
      </ScreenContainer>
    );
  }
  if (!overview.supported) {
    return (
      <ScreenContainer refreshControl={refreshControl}>
        {heading}
        <EmptyState title="Weekly scheduling isn't available yet" message="You can still book classes one at a time from the Book tab." />
      </ScreenContainer>
    );
  }
  if (!overview.plan && !overview.schedule) {
    return (
      <ScreenContainer refreshControl={refreshControl}>
        {heading}
        {overview.error ? (
          <EmptyState title="We couldn't load your plan" message={`${overview.error.message} Pull down to try again.`} />
        ) : (
          <EmptyState
            title="Your plan doesn't include a weekly schedule"
            message="Gold and Platinum memberships can book the same times every week. You can still book classes one at a time."
            action={<PrimaryButton title="Visit the store" onPress={() => router.navigate('/store')} />}
          />
        )}
      </ScreenContainer>
    );
  }

  const schedule = overview.schedule;
  const credits = schedule?.creditsRemaining ?? overview.creditsRemaining;
  const validUntil = schedule?.validUntil ?? overview.plan?.validUntil ?? null;
  const planName = schedule?.planName ?? overview.plan?.planName ?? 'Your plan';
  const exhausted = credits !== null && credits <= 0;
  const selected = [...w.selection.values()];
  const days = weekDays(w.week);
  const items = w.sessions && w.sessions.week === w.week ? w.sessions.items : null;
  const upcoming = (schedule?.occurrences ?? []).filter((o) => o.sessionDate >= w.today);
  const canConfirm = selected.length > 0 && (!schedule ? !exhausted : w.dirty);

  function onSlot(s: SessionSlot) {
    if (replacing) {
      Alert.alert(
        'Book this replacement?',
        `${formatDayShort(s.date)}, ${timeRangeLabel(s.startTime, s.endTime)} replaces your excused class on ${formatDayShort(replacing.sessionDate)}. It uses the credit the club restored.`,
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Book replacement',
            onPress: async () => {
              const id = await w.replace(replacing, s);
              if (id) {
                setReplacing(null);
                w.setResult(`Replacement booked for ${formatDayShort(s.date)}, ${timeRangeLabel(s.startTime, s.endTime)}.`);
              }
            },
          },
        ]
      );
      return;
    }
    setLimitNote(w.toggle(s));
  }

  async function onConfirm() {
    const r = await w.confirm();
    if (r) w.setResult(resultMessage(r));
  }

  function onStop() {
    Alert.alert('Stop your weekly schedule?', 'Classes already booked stay as they are. We will stop booking new ones.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Stop schedule', style: 'destructive', onPress: () => void w.stop() },
    ]);
  }

  return (
    <ScreenContainer refreshControl={refreshControl}>
      {heading}

      <Card style={styles.plan}>
        <View style={styles.planRow}>
          <View style={styles.flex}>
            <ThemedText variant="eyebrow" themeColor="accentText">
              {planName}
            </ThemedText>
            <ThemedText variant="bodyStrong">
              {credits !== null ? `${plural(credits, 'class', 'classes')} left` : 'Classes left unavailable'}
            </ThemedText>
          </View>
          {validUntil ? (
            <View style={styles.end}>
              <ThemedText variant="caption" themeColor="textSecondary">
                Valid until
              </ThemedText>
              <ThemedText variant="bodyStrong">{formatDate(validUntil)}</ThemedText>
            </View>
          ) : null}
        </View>
        <ThemedText variant="caption" themeColor="textSecondary">
          {`Choose up to ${plural(w.limit, 'time', 'times')} a week.`}
        </ThemedText>
      </Card>

      {exhausted && !schedule ? (
        <FormMessage tone="info" title="Membership credits exhausted" action={<SecondaryButton title="Visit the store" onPress={() => router.navigate('/store')} />}>
          You&apos;ve used every class on your plan, so a weekly schedule can&apos;t be started. Choose a new plan to continue.
        </FormMessage>
      ) : null}

      {overview.error ? (
        <FormMessage tone="error" title="Couldn't refresh your schedule">
          {`${overview.error.message} Pull down to try again.`}
        </FormMessage>
      ) : null}

      {w.result ? (
        <FormMessage tone="success" title="Done">
          {w.result}
        </FormMessage>
      ) : null}
      {w.actionError ? (
        <FormMessage tone="error" title={w.actionError.kind === 'network' ? 'We may not have heard back' : "That didn't work"}>
          {w.actionError.kind === 'network'
            ? `${w.actionError.message} We've re-checked your schedule below — it shows what the club has recorded.`
            : w.actionError.message}
        </FormMessage>
      ) : null}

      {replacing ? (
        <FormMessage
          tone="info"
          title="Choose a replacement class"
          action={<SecondaryButton title="Cancel" onPress={() => setReplacing(null)} />}>
          {`The club excused your class on ${formatDayShort(replacing.sessionDate)}. Pick any open class below to use the credit that was restored. This doesn't use one of your reschedules.`}
        </FormMessage>
      ) : null}

      {/* Week navigation */}
      <View style={styles.weekBar}>
        <SecondaryButton title="‹ Previous" disabled={!w.canPrev} onPress={w.goPrev} accessibilityLabel="Previous week" />
        <ThemedText variant="bodyStrong" accessibilityRole="header">
          {weekLabel(w.week)}
        </ThemedText>
        <SecondaryButton title="Next ›" disabled={!w.canNext} onPress={w.goNext} accessibilityLabel="Next week" />
      </View>

      {limitNote ? (
        <FormMessage tone="info" title="Weekly limit reached">
          {limitNote}
        </FormMessage>
      ) : null}

      {w.weekError && !items ? (
        <EmptyState
          title="Couldn't load this week"
          message={w.weekError.message}
          action={<PrimaryButton title="Try again" onPress={w.reload} />}
        />
      ) : null}
      {!items && w.weekLoading ? <SlotsSkeleton label="Loading classes" /> : null}

      {items
        ? days.map((day) => {
            const list = items.filter((s) => s.date === day);
            return (
              <View key={day} style={styles.day}>
                <ThemedText variant="eyebrow" themeColor="accentText">
                  {day === w.today ? `${formatDayShort(day)} · Today` : formatDayShort(day)}
                </ThemedText>
                {list.length === 0 ? (
                  <ThemedText variant="caption" themeColor="textMuted">
                    No classes
                  </ThemedText>
                ) : (
                  list.map((s) => (
                    <SlotRow
                      key={s.id}
                      session={s}
                      isSelected={!replacing && w.selection.has(slotKey({ dayOfWeek: dayOfWeek(s.date), startTime: s.startTime }))}
                      replacing={!!replacing}
                      onPress={() => onSlot(s)}
                    />
                  ))
                )}
              </View>
            );
          })
        : null}

      {/* Review and confirm */}
      <Card style={styles.summary}>
        <ThemedText variant="eyebrow" themeColor="accentText">
          MY WEEKLY SCHEDULE
        </ThemedText>
        {selected.length === 0 ? (
          <ThemedText themeColor="textSecondary">Tap the times above to build your weekly schedule.</ThemedText>
        ) : (
          summaryLines(selected).map((line) => (
            <ThemedText key={line} variant="bodyStrong">
              {line}
            </ThemedText>
          ))
        )}
        {selected.length > 0 ? (
          <ThemedText variant="caption" themeColor="textSecondary">
            {schedule
              ? 'Saving changes your weekly pattern from now on. Classes already booked stay as they are; cancel any you no longer want from My classes.'
              : `We'll book these times every week${validUntil ? ` until ${formatDate(validUntil)}` : ''}, as long as places are free. Each class uses one of your ${credits ?? ''} remaining classes, and we stop when they're used up.`}
          </ThemedText>
        ) : null}
        <PrimaryButton
          title={schedule ? 'Save changes' : 'Confirm weekly schedule'}
          fullWidth
          loading={w.busy}
          loadingLabel={schedule ? 'Saving' : 'Booking your classes'}
          disabled={!canConfirm || !!replacing}
          onPress={() => void onConfirm()}
        />
        {schedule ? <SecondaryButton title="Stop weekly schedule" fullWidth disabled={w.busy} onPress={onStop} /> : null}
      </Card>

      {/* What the schedule has booked */}
      {upcoming.length > 0 ? (
        <View style={styles.day}>
          <ThemedText variant="eyebrow" themeColor="accentText">
            UPCOMING CLASSES FROM YOUR SCHEDULE
          </ThemedText>
          {upcoming.map((o) => (
            <OccurrenceRow
              key={o.occurrenceId}
              o={o}
              onOpen={() => o.bookingId && router.push({ pathname: '/book/classes/[bookingId]', params: { bookingId: o.bookingId } })}
              onReplace={() => {
                setReplacing(o);
                w.setResult(null);
              }}
            />
          ))}
        </View>
      ) : null}
    </ScreenContainer>
  );
}

function SlotRow({ session, isSelected, replacing, onPress }: { session: SessionSlot; isSelected: boolean; replacing: boolean; onPress: () => void }) {
  const theme = useTheme();
  const state: CellState = cellState(session);
  const enabled = replacing ? state === 'available' || state === 'limited' : canToggle(state, isSelected);
  const label = cellLabel(state, session);
  const tone = isSelected
    ? { bg: theme.primary, border: theme.primary, text: theme.onPrimary }
    : state === 'mine'
      ? { bg: theme.successSurface, border: theme.success, text: theme.success }
      : enabled
        ? { bg: theme.surface, border: theme.border, text: theme.text }
        : { bg: theme.slotUnavailable, border: theme.border, text: theme.textMuted };
  const time = timeRangeLabel(session.startTime, session.endTime);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${time}. ${label}${isSelected ? '. Selected for your weekly schedule' : ''}`}
      accessibilityState={{ disabled: !enabled, selected: isSelected }}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => [styles.slot, { backgroundColor: pressed && !isSelected ? theme.surfaceMuted : tone.bg, borderColor: tone.border }]}>
      <View style={styles.flex}>
        <ThemedText variant="bodyStrong" style={{ color: tone.text }}>
          {time}
        </ThemedText>
        <View style={styles.meta}>
          <PlaceMarks capacity={session.capacity} left={session.placesLeft} color={tone.text} />
          <ThemedText variant="caption" style={[styles.flex, { color: isSelected ? theme.onPrimary : enabled ? theme.textSecondary : theme.textMuted }]}>
            {label}
          </ThemedText>
        </View>
      </View>
      {isSelected ? (
        <ThemedText variant="label" style={{ color: tone.text }}>
          Selected
        </ThemedText>
      ) : enabled ? (
        <ThemedText variant="label" themeColor="accentText">
          {replacing ? 'Choose' : 'Add'}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

function OccurrenceRow({ o, onOpen, onReplace }: { o: Occurrence; onOpen: () => void; onReplace: () => void }) {
  const theme = useTheme();
  const { label, tone } = occurrenceStatus(o);
  const colour: Record<Tone, string> = { ok: theme.success, info: theme.accentText, warn: theme.warning, muted: theme.textMuted };
  const body = (
    <View style={styles.flex}>
      <ThemedText variant="bodyStrong">{`${formatDayShort(o.sessionDate)} · ${clock12(o.startTime)}`}</ThemedText>
      <ThemedText variant="caption" style={{ color: colour[tone] }}>
        {label}
      </ThemedText>
    </View>
  );
  return (
    <Card style={styles.occ}>
      {o.bookingId && o.status === 'booked' ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${formatDayShort(o.sessionDate)}, ${label}. Opens the class`} onPress={onOpen} style={styles.occMain}>
          {body}
        </Pressable>
      ) : (
        <View style={styles.occMain}>{body}</View>
      )}
      {o.canReplace ? <PrimaryButton title="Book replacement" onPress={onReplace} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  plan: { gap: Spacing.sm, paddingVertical: Spacing.lg },
  planRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.md },
  end: { alignItems: 'flex-end' },
  weekBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  day: { gap: Spacing.sm },
  slot: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: Radii.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, minHeight: 56 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  summary: { gap: Spacing.sm },
  occ: { gap: Spacing.sm, paddingVertical: Spacing.md },
  occMain: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
});
