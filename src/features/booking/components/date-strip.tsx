import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Radii, Spacing } from '@/theme';

import { addDays, weekDays, weekLabel, weekStart } from '../recurring-presentation';
import { dayChip, formatDayLong } from '../schedule-format';

export type DateStripProps = {
  /** The member's bookable range, first to last day. */
  dates: string[];
  selected: string | null;
  today: string;
  /** Days with open classes; null when unknown (every day is then offered). */
  classDays: Set<string> | null;
  myDays: Set<string>;
  onSelect: (date: string) => void;
};

/**
 * A calendar of one week (Monday to Sunday) with arrows to the previous and
 * next week. Days outside the member's bookable range, or without classes,
 * are shown but can't be chosen. Moving to another week selects its first day
 * with classes so the list below always matches the week on screen.
 */
export function DateStrip({ dates, selected, today, classDays, myDays, onSelect }: DateStripProps) {
  const theme = useTheme();
  const min = dates[0] ?? today;
  const max = dates[dates.length - 1] ?? today;
  const [week, setWeek] = useState(() => weekStart(selected ?? min));

  // A selection made elsewhere (first load, "today") brings its week into view.
  const [seen, setSeen] = useState(selected);
  if (selected !== seen) {
    setSeen(selected);
    if (selected) setWeek(weekStart(selected));
  }

  const canPrev = week > weekStart(min);
  const canNext = week < weekStart(max);
  const selectable = (iso: string) => iso >= min && iso <= max && (classDays === null || classDays.has(iso));

  function go(delta: 1 | -1) {
    const next = addDays(week, 7 * delta);
    setWeek(next);
    const first = weekDays(next).find(selectable);
    if (first) onSelect(first);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <Arrow label="Previous week" glyph="‹" enabled={canPrev} onPress={() => go(-1)} />
        <ThemedText variant="bodyStrong" accessibilityRole="header">
          {weekLabel(week)}
        </ThemedText>
        <Arrow label="Next week" glyph="›" enabled={canNext} onPress={() => go(1)} />
      </View>

      <View style={styles.row}>
        {weekDays(week).map((iso) => {
          const chip = dayChip(iso);
          const hasClasses = selectable(iso);
          const isSelected = iso === selected;
          const mine = myDays.has(iso);
          return (
            <Pressable
              key={iso}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled: !hasClasses }}
              accessibilityLabel={`${formatDayLong(iso)}${iso === today ? ', today' : ''}${mine ? ', you have a class' : ''}${
                hasClasses ? '' : ', no classes'
              }`}
              disabled={!hasClasses}
              onPress={() => onSelect(iso)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: isSelected ? theme.primary : pressed ? theme.surfaceMuted : theme.surface,
                  borderColor: isSelected ? theme.primary : iso === today ? theme.secondary : theme.border,
                  opacity: hasClasses ? 1 : 0.4,
                },
              ]}>
              <ThemedText variant="caption" style={{ color: isSelected ? theme.onPrimary : theme.textSecondary }}>
                {chip.weekday.toUpperCase()}
              </ThemedText>
              <ThemedText variant="heading" style={{ color: isSelected ? theme.onPrimary : theme.text }}>
                {chip.day}
              </ThemedText>
              <View style={[styles.dot, { backgroundColor: mine ? (isSelected ? theme.onPrimary : theme.secondary) : 'transparent' }]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Arrow({ label, glyph, enabled, onPress }: { label: string; glyph: string; enabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.arrow, { borderColor: theme.border, backgroundColor: pressed ? theme.surfaceMuted : theme.surface, opacity: enabled ? 1 : 0.35 }]}>
      <ThemedText variant="heading" style={{ color: theme.text }}>
        {glyph}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.md },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  // Seven equal columns: the whole week fits the screen, nothing scrolls sideways.
  row: { flexDirection: 'row', gap: Spacing.xs },
  chip: {
    flex: 1,
    minHeight: 76,
    borderRadius: Radii.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
  },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: Spacing.xs },
});
