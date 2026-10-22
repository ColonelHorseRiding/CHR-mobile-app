import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useColorSchemeName, useTheme } from '@/hooks/use-theme';
import { Radii, Shadows, Spacing } from '@/theme';

import type { SessionSlot } from '../booking-api';
import { formatTimeRange, slotLabel, slotState } from '../schedule-format';

/** One mark per place: filled = taken, hollow = free. Never names who is riding. */
export function PlaceMarks({ capacity, left, color }: { capacity: number; left: number; color: string }) {
  const total = Math.min(Math.max(capacity, 0), 8);
  const taken = Math.max(total - Math.max(left, 0), 0);
  return (
    <View style={styles.marks} importantForAccessibility="no-hide-descendants">
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[styles.mark, { borderColor: color, backgroundColor: i < taken ? color : 'transparent', opacity: 0.7 }]}
        />
      ))}
    </View>
  );
}

export type SessionCardProps = {
  session: SessionSlot;
  onPress: () => void;
  /** Text shown on open sessions ("Book" on the schedule, "Select" when moving a class). */
  actionLabel?: string;
  selected?: boolean;
  /** When moving a class: the session it is currently booked into. */
  currentSessionId?: string;
};

export function SessionCard({ session, onPress, actionLabel = 'Book', selected = false, currentSessionId }: SessionCardProps) {
  const theme = useTheme();
  const scheme = useColorSchemeName();
  const state = slotState(session);
  const open = state === 'open';
  const label = session.id === currentSessionId ? 'Your current time' : slotLabel(session);
  const time = formatTimeRange(session.startTime, session.endTime);
  const tone = selected
    ? { bg: theme.primary, border: theme.primary, text: theme.onPrimary }
    : state === 'mine'
      ? { bg: theme.successSurface, border: theme.success, text: theme.success }
      : open
        ? { bg: theme.surface, border: theme.border, text: theme.text }
        : { bg: theme.slotUnavailable, border: theme.border, text: theme.textMuted };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${time}, ${label}`}
      accessibilityHint={open ? (actionLabel === 'Book' ? 'Opens the booking details' : `${actionLabel}s this time`) : undefined}
      accessibilityState={{ disabled: !open, selected }}
      disabled={!open}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed && !selected ? theme.surfaceMuted : tone.bg,
          borderColor: tone.border,
          boxShadow: open && scheme === 'light' ? Shadows.sm : Shadows.none,
        },
      ]}>
      <View style={styles.main}>
        <ThemedText variant="heading" style={{ color: tone.text }}>
          {time}
        </ThemedText>
        <View style={styles.meta}>
          <PlaceMarks capacity={session.capacity} left={session.placesLeft} color={tone.text} />
          <ThemedText variant="caption" style={{ color: open && !selected ? theme.textSecondary : tone.text }}>
            {label}
          </ThemedText>
        </View>
      </View>
      {open ? (
        <View style={[styles.action, { backgroundColor: selected ? theme.onPrimary : theme.primary }]}>
          <ThemedText variant="label" style={{ color: selected ? theme.primary : theme.onPrimary }}>
            {selected ? 'Selected' : actionLabel}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderRadius: Radii.lg,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    minHeight: 72,
  },
  main: {
    flex: 1,
    gap: Spacing.xs,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  marks: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  mark: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
});
