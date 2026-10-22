import { Image } from 'expo-image';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { formatDate, plural } from '@/features/store/format';
import { useColorSchemeName, useTheme } from '@/hooks/use-theme';
import { palette, Radii, Spacing } from '@/theme';

import { creditFigures, daysBetween, reschedulesLeft, todayIST, type DashboardMembership } from '../dashboard-data';

/** Days left at which an "ending soon" reminder appears (a reminder, not a rule). */
const ENDING_SOON_DAYS = 7;

const GOLD = palette.gold300;
const ON_DARK = palette.ivory50;
const MUTED_ON_DARK = 'rgba(247, 243, 234, 0.72)';

function statusLabel(m: DashboardMembership, lapsed: boolean) {
  if (!lapsed) return 'ACTIVE';
  if (m.status === 'cancelled') return 'CANCELLED';
  if (m.status === 'suspended') return 'SUSPENDED';
  return 'EXPIRED';
}

/**
 * The member's plan as a dark forest-green card. Every figure comes from the
 * server-maintained membership record (via useDashboard): classes remaining and
 * included, reschedules left, and the validity dates. "ACTIVE" is shown only for
 * a plan the server still treats as current; an ended plan is labelled as such.
 */
export function HomeMembershipCard({ membership, lapsed = false }: { membership: DashboardMembership; lapsed?: boolean }) {
  const theme = useTheme();
  const scheme = useColorSchemeName();
  const { width } = useWindowDimensions();
  const narrow = width < 380;
  const single = membership.kind === 'one_time_ride';
  const unit = (n: number) => (single ? plural(n, 'riding session', 'riding sessions') : plural(n, 'class', 'classes'));
  const { total, remaining, used } = creditFigures(membership);
  const resLeft = reschedulesLeft(membership);
  const daysLeft = membership.endDate ? daysBetween(todayIST(), membership.endDate) : null;
  const name = membership.planName ?? (single ? 'One-Time Ride' : 'Your plan');
  const progress = total !== null && used !== null && total > 0 ? Math.min(Math.max(used / total, 0), 1) : null;
  const status = statusLabel(membership, lapsed);
  const statusColor = lapsed ? MUTED_ON_DARK : theme.membershipActive;
  const word = single ? (remaining === 1 ? 'riding session' : 'riding sessions') : remaining === 1 ? 'class' : 'classes';

  return (
    <View
      style={[
        styles.card,
        { padding: narrow ? Spacing.lg : Spacing.xl },
        { backgroundColor: theme.membershipCard, borderColor: theme.membershipCardBorder },
        // Light mode keeps its forest gradient; dark mode uses the flat approved surface.
        scheme === 'light' ? { experimental_backgroundImage: `linear-gradient(160deg, ${palette.forest600} 0%, ${palette.forest700} 100%)` } : null,
      ]}>
      {/* The club crest, very faint, as the card's watermark. */}
      <Image
        source={require('@/assets/images/brand/chr-logo.png')}
        style={styles.watermark}
        contentFit="contain"
        accessible={false}
        accessibilityIgnoresInvertColors
      />

      <ThemedText variant="eyebrow" style={styles.label}>
        {lapsed ? 'YOUR LAST MEMBERSHIP' : 'YOUR MEMBERSHIP'}
      </ThemedText>

      <View style={styles.titleRow}>
        <ThemedText variant="display" accessibilityRole="header" style={[styles.title, narrow && styles.titleNarrow]}>
          {name}
        </ThemedText>
        <View style={[styles.badge, { borderColor: statusColor, backgroundColor: lapsed ? 'transparent' : theme.membershipActiveSurface }]} accessible accessibilityLabel={`Status: ${status.toLowerCase()}`}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <ThemedText variant="caption" style={[styles.badgeText, { color: statusColor }]}>
            {status}
          </ThemedText>
        </View>
      </View>

      {lapsed ? (
        <ThemedText style={styles.muted}>
          {membership.endDate ? `This plan ended on ${formatDate(membership.endDate)}.` : 'This plan has ended.'}
        </ThemedText>
      ) : remaining !== null ? (
        <View
          style={styles.credits}
          accessible
          accessibilityLabel={`${unit(remaining)} remaining${used !== null && total !== null ? `, ${used} used of ${total} included` : ''}`}>
          <View style={styles.creditLine}>
            <ThemedText variant="display" style={[styles.creditNumber, narrow && styles.creditNumberNarrow]}>
              {String(remaining)}
            </ThemedText>
            <ThemedText style={styles.creditWord}>{`${word} remaining`}</ThemedText>
          </View>
          {progress !== null ? (
            <View style={[styles.track, { backgroundColor: theme.membershipTrack }]}>
              <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
          ) : null}
          {used !== null && total !== null ? <ThemedText style={styles.muted}>{`${used} used of ${total} included`}</ThemedText> : null}
        </View>
      ) : (
        <ThemedText style={styles.muted}>Your balance isn&apos;t available right now. Pull down to refresh.</ThemedText>
      )}

      {!lapsed && remaining === 0 ? (
        <ThemedText style={styles.note}>{single ? 'Your riding session has been used.' : 'You have used every class on this plan.'}</ThemedText>
      ) : !lapsed && daysLeft !== null && daysLeft <= ENDING_SOON_DAYS && remaining ? (
        <ThemedText style={styles.note}>
          {daysLeft <= 0 ? 'This plan ends today.' : `Ends in ${plural(daysLeft, 'day', 'days')} — ${unit(remaining)} still to use.`}
        </ThemedText>
      ) : null}

      <View style={styles.divider} />

      <View style={styles.details}>
        <Detail
          icon={{ ios: 'calendar', android: 'event', web: 'event' }}
          label={lapsed ? 'ENDED' : 'VALID UNTIL'}
          value={membership.endDate ? formatDate(membership.endDate) : '—'}
        />
        {lapsed ? null : (
          <Detail
            icon={{ ios: 'arrow.triangle.2.circlepath', android: 'autorenew', web: 'autorenew' }}
            label="RESCHEDULES"
            value={
              resLeft !== null && membership.reschedulesAllowed !== null
                ? `${resLeft} of ${membership.reschedulesAllowed} left`
                : membership.reschedulesAllowed !== null
                  ? `${membership.reschedulesAllowed} included`
                  : '—'
            }
          />
        )}
        <Detail
          icon={{ ios: 'checkmark.circle', android: 'check_circle', web: 'check_circle' }}
          label="STARTED"
          value={membership.startDate ? formatDate(membership.startDate) : '—'}
        />
      </View>
    </View>
  );
}

function Detail({ icon, label, value }: { icon: { ios: SFSymbol; android: string; web: string }; label: string; value: string }) {
  return (
    <View style={styles.detail} accessible accessibilityLabel={`${label.toLowerCase()}: ${value}`}>
      <SymbolView name={icon as never} size={20} tintColor={GOLD} resizeMode="scaleAspectFit" style={styles.detailIcon} />
      <ThemedText variant="eyebrow" style={styles.detailLabel} numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText variant="bodyStrong" style={styles.detailValue}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
    gap: Spacing.md,
  },
  watermark: {
    position: 'absolute',
    top: -20,
    right: -34,
    width: 220,
    height: 220,
    opacity: 0.07,
  },
  label: {
    color: GOLD,
    letterSpacing: 2.4,
  },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.md,
  },
  title: {
    color: ON_DARK,
    fontSize: 32,
    lineHeight: 38,
  },
  titleNarrow: {
    fontSize: 27,
    lineHeight: 33,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  credits: {
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  creditLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  creditNumber: {
    color: ON_DARK,
    fontSize: 64,
    lineHeight: 70,
  },
  creditNumberNarrow: {
    fontSize: 52,
    lineHeight: 58,
  },
  creditWord: {
    color: ON_DARK,
    fontSize: 18,
    lineHeight: 24,
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: GOLD,
  },
  muted: {
    color: MUTED_ON_DARK,
    fontSize: 14,
    lineHeight: 20,
  },
  note: {
    color: GOLD,
    fontSize: 14,
    lineHeight: 20,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(201, 168, 106, 0.45)',
    marginTop: Spacing.xs,
  },
  details: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  detail: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xs,
  },
  detailIcon: {
    width: 20,
    height: 20,
  },
  detailLabel: {
    color: GOLD,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.4,
  },
  detailValue: {
    color: ON_DARK,
    fontSize: 15,
    lineHeight: 20,
  },
});
