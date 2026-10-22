import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/theme';

import { Skeleton, SkeletonCard, SkeletonCircle, SkeletonRegion, SkeletonText } from './skeleton';

/**
 * Section-level placeholders, one per kind of content. Each is sized like what
 * it stands in for so the page does not jump when the real content arrives,
 * and shows only shapes — never invented numbers, dates, prices or statuses.
 */

/** Home: the membership card, the main action and the recent-activity rows. */
export function HomeSkeleton() {
  return (
    <SkeletonRegion label="Loading your membership">
      <SkeletonCard style={styles.membership}>
        <Skeleton width="35%" height={12} />
        <Skeleton width="60%" height={30} />
        <Skeleton width="45%" height={56} radius={8} />
        <Skeleton height={8} radius={4} />
        <View style={styles.row}>
          <Skeleton width="30%" height={34} />
          <Skeleton width="30%" height={34} />
          <Skeleton width="30%" height={34} />
        </View>
      </SkeletonCard>
      <Skeleton height={64} radius={16} />
    </SkeletonRegion>
  );
}

/** Rows with an icon, two lines and a time: Recent activity and Notifications. */
export function ActivityRowsSkeleton({ rows = 4, label = 'Loading your activity' }: { rows?: number; label?: string }) {
  return (
    <SkeletonRegion label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonCard key={i} style={styles.activityRow}>
          <SkeletonCircle size={40} />
          <View style={styles.flex}>
            <Skeleton width="55%" height={14} />
            <Skeleton width="80%" height={12} />
          </View>
          <Skeleton width={44} height={12} />
        </SkeletonCard>
      ))}
    </SkeletonRegion>
  );
}

/** Class cards: My classes (upcoming and history) and a day's class list. */
export function ClassCardsSkeleton({ cards = 3, label = 'Loading your classes' }: { cards?: number; label?: string }) {
  return (
    <SkeletonRegion label={label}>
      {Array.from({ length: cards }, (_, i) => (
        <SkeletonCard key={i}>
          <View style={styles.between}>
            <Skeleton width="50%" height={16} />
            <Skeleton width={72} height={24} radius={12} />
          </View>
          <Skeleton width="35%" height={13} />
          <Skeleton width="25%" height={13} />
        </SkeletonCard>
      ))}
    </SkeletonRegion>
  );
}

/** Order cards: reference, amount and status. */
export function OrderCardsSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <SkeletonRegion label="Loading your orders">
      {Array.from({ length: cards }, (_, i) => (
        <SkeletonCard key={i}>
          <View style={styles.between}>
            <Skeleton width="45%" height={14} />
            <Skeleton width={76} height={24} radius={12} />
          </View>
          <Skeleton width="70%" height={13} />
          <View style={styles.between}>
            <Skeleton width="30%" height={13} />
            <Skeleton width="22%" height={16} />
          </View>
        </SkeletonCard>
      ))}
    </SkeletonRegion>
  );
}

/** Store: product cards with a picture, a name, a price and the action. */
export function StoreSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <SkeletonRegion label="Loading the store">
      {Array.from({ length: cards }, (_, i) => (
        <SkeletonCard key={i}>
          <Skeleton height={140} radius={12} />
          <Skeleton width="60%" height={18} />
          <SkeletonText lines={2} />
          <View style={styles.between}>
            <Skeleton width="28%" height={22} />
            <Skeleton width="38%" height={44} radius={22} />
          </View>
        </SkeletonCard>
      ))}
    </SkeletonRegion>
  );
}

/** Profile: the details form. */
export function ProfileSkeleton() {
  return (
    <SkeletonRegion label="Loading your details">
      <Skeleton width="40%" height={18} />
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.field}>
          <Skeleton width="25%" height={12} />
          <Skeleton height={48} radius={12} />
        </View>
      ))}
      <Skeleton height={48} radius={24} />
    </SkeletonRegion>
  );
}

/** Class details: the heading and the date, time, status and booking rows. */
export function ClassDetailSkeleton({ label = 'Loading this class' }: { label?: string }) {
  return (
    <SkeletonRegion label={label}>
      <Skeleton width="30%" height={12} />
      <Skeleton width="70%" height={28} />
      <SkeletonCard>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.between}>
            <Skeleton width="28%" height={14} />
            <Skeleton width="38%" height={14} />
          </View>
        ))}
      </SkeletonCard>
    </SkeletonRegion>
  );
}

/** Book: the plan summary, the week of days and the class slots. */
export function ScheduleSkeleton() {
  return (
    <SkeletonRegion label="Loading the schedule">
      <SkeletonCard style={styles.summary}>
        <View style={styles.between}>
          <View style={styles.flex}>
            <Skeleton width="25%" height={12} />
            <Skeleton width="45%" height={16} />
          </View>
          <Skeleton width="25%" height={30} />
        </View>
      </SkeletonCard>
      <Skeleton height={48} radius={24} />
      <WeekSkeleton />
      <SlotsSkeleton />
    </SkeletonRegion>
  );
}

/** The week calendar: arrows, label and seven days. */
export function WeekSkeleton() {
  return (
    <View style={styles.week}>
      <View style={styles.between}>
        <SkeletonCircle size={48} />
        <Skeleton width={96} height={16} />
        <SkeletonCircle size={48} />
      </View>
      <View style={styles.row}>
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} width={0} style={styles.day} height={76} radius={16} />
        ))}
      </View>
    </View>
  );
}

/** The class slots of one day. */
export function SlotsSkeleton({ slots = 4, label }: { slots?: number; label?: string }) {
  const body = Array.from({ length: slots }, (_, i) => <Skeleton key={i} height={64} radius={16} />);
  return label ? <SkeletonRegion label={label}>{body}</SkeletonRegion> : <View style={styles.slots}>{body}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: Spacing.sm },
  row: { flexDirection: 'row', gap: Spacing.xs, justifyContent: 'space-between' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  membership: { gap: Spacing.lg, paddingVertical: Spacing.xl, minHeight: 250 },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  field: { gap: Spacing.sm },
  summary: { paddingVertical: Spacing.lg },
  week: { gap: Spacing.md },
  day: { flex: 1 },
  slots: { gap: Spacing.md },
});
