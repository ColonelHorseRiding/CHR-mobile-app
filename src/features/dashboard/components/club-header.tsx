import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChrLogo } from '@/components/brand/chr-logo';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme';

/**
 * Club branding row: crest, wordmark, and the notification bell — the only
 * way into notifications from Home. `unread` is the server's count, or null
 * while unknown (then no badge is drawn rather than a guessed one).
 */
export function ClubHeader({ unread }: { unread: number | null }) {
  const theme = useTheme();
  const count = unread && unread > 0 ? unread : 0;

  return (
    <View style={styles.row}>
      <ChrLogo size={52} onLight />
      <View style={styles.wordmark} accessible accessibilityRole="header" accessibilityLabel="Colonel Horse Riding Club">
        <ThemedText variant="title" style={[styles.colonel, { color: theme.text }]}>
          COLONEL
        </ThemedText>
        <ThemedText variant="eyebrow" style={[styles.club, { color: theme.accentText }]}>
          Horse Riding Club
        </ThemedText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={count ? `Notifications, ${count} unread` : 'Notifications'}
        onPress={() => router.push('/notifications')}
        hitSlop={6}
        style={({ pressed }) => [
          styles.bell,
          { borderColor: theme.borderStrong, backgroundColor: pressed ? theme.surfaceMuted : theme.surface },
        ]}>
        <SymbolView
          name={{ ios: 'bell', android: 'notifications', web: 'notifications' }}
          size={24}
          tintColor={theme.primary}
          resizeMode="scaleAspectFit"
        />
        {count > 0 ? (
          <View style={[styles.badge, { backgroundColor: theme.notificationBadge }]} importantForAccessibility="no-hide-descendants">
            <ThemedText variant="caption" style={[styles.badgeText, { color: theme.notificationBadgeText }]}>
              {count > 9 ? '9+' : String(count)}
            </ThemedText>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  wordmark: {
    flex: 1,
    gap: 2,
  },
  colonel: {
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: 3,
  },
  club: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 2.4,
  },
  bell: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
});
