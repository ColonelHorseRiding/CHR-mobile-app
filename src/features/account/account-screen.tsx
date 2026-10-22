import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, PrimaryButton, SecondaryButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FormMessage } from '@/components/ui/form-message';
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view';
import { ProfileSkeleton } from '@/components/ui/screen-skeletons';
import { SectionHeading } from '@/components/ui/section-heading';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-provider';
import { classifyMemberships } from '@/features/dashboard/dashboard-data';
import { useDashboard } from '@/features/dashboard/use-dashboard';
import { friendlyAuthError } from '@/features/auth/auth-errors';
import { hasErrors, validateNewPassword } from '@/features/auth/validation';
import { useUnreadCount } from '@/features/notifications/use-notifications';
import { PhoneAlertsRow } from '@/features/push/phone-alerts-row';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/services/supabase/client';
import { Layout, palette, Radii, Spacing } from '@/theme';

import { fetchProfile, ProfileError, profileErrors, updateProfile, type Profile } from './profile-api';

/**
 * Account settings: the member's own name and phone (saved through the same
 * profile update the website uses), password change through Supabase Auth for
 * the current session, the notification centre, and sign out.
 */
export default function AccountScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const userId = user?.id ?? null;
  const unread = useUnreadCount();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={[
        styles.scroll,
        { paddingLeft: Layout.gutter + insets.left, paddingRight: Layout.gutter + insets.right },
      ]}
      keyboardShouldPersistTaps="handled">
      <View style={styles.content}>
        {userId ? <MemberCard key={`member:${userId}`} email={user?.email ?? null} /> : null}

        <SectionHeading eyebrow="Account" title="Your account" />

        {/* Keyed by account so another member's details or half-typed values never carry over. */}
        {userId ? <ProfileCard key={`profile:${userId}`} userId={userId} authEmail={user?.email ?? null} /> : null}

        <Card style={styles.card}>
          <CardTitle
            icon={{ ios: 'bell', android: 'notifications', web: 'notifications' }}
            title="Notifications"
            subtitle="Stay updated with your bookings, payments, orders and membership activity."
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={unread ? `Open notifications, ${unread} unread` : 'Open notifications'}
            onPress={() => router.push('/notifications')}
            style={({ pressed }) => [styles.linkRow, { borderColor: theme.border, backgroundColor: pressed ? theme.surfaceMuted : theme.surface }]}>
            <ThemedText variant="bodyStrong" style={styles.flex}>
              Open notifications
            </ThemedText>
            {unread ? (
              <View style={[styles.pill, { backgroundColor: theme.surfaceMuted }]}>
                <ThemedText variant="caption" themeColor="accentText" style={styles.pillText}>
                  {`${unread} unread`}
                </ThemedText>
              </View>
            ) : null}
            <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={20} tintColor={theme.textSecondary} resizeMode="scaleAspectFit" style={styles.icon20} />
          </Pressable>
          <PhoneAlertsRow />
        </Card>

        {userId ? <PasswordCard key={`password:${userId}`} /> : null}

        <Card style={styles.card}>
          <CardTitle
            icon={{ ios: 'lock', android: 'lock', web: 'lock' }}
            title="Privacy & data"
            subtitle="Read the privacy notice, manage your choices, get a copy of your data, or close your account."
          />
          <SecondaryButton title="Open privacy & data" fullWidth onPress={() => router.push('/profile/privacy')} />
        </Card>

        <Card style={styles.card}>
          <CardTitle
            icon={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' }}
            title="Sign out"
            subtitle="Signing out removes your account from this phone. Your bookings and orders stay with the club."
          />
          <Button
            variant="ghost"
            title="Sign out"
            fullWidth
            loading={signingOut}
            loadingLabel="Signing out"
            style={[styles.signOut, { borderColor: theme.danger }]}
            onPress={async () => {
              setSigningOut(true);
              await signOut();
            }}
          />
        </Card>
      </View>
    </KeyboardAwareScrollView>
  );
}

function ProfileCard({ userId, authEmail }: { userId: string; authEmail: string | null }) {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<ProfileError | null>(null);
  const [values, setValues] = useState({ fullName: '', phone: '' });
  const [errors, setErrors] = useState<{ fullName?: string; phone?: string }>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const inFlight = useRef(false);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const p = await fetchProfile(userId);
      if (!live.current) return;
      setProfile(p);
      setValues({ fullName: p?.fullName ?? '', phone: p?.phone ?? '' });
    } catch (e) {
      if (live.current) setLoadError(e instanceof ProfileError ? e : new ProfileError('unknown', "Your details couldn't be loaded."));
    }
  }, [userId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (profile === undefined) {
    return (
      <Card style={styles.card}>
        {loadError ? (
          <EmptyState
            title="We couldn't load your details"
            message={loadError.message}
            action={<PrimaryButton title="Try again" onPress={() => void load()} />}
          />
        ) : (
          <ProfileSkeleton />
        )}
      </Card>
    );
  }

  const saved = { fullName: profile?.fullName ?? '', phone: profile?.phone ?? '' };
  const dirty = values.fullName.trim() !== saved.fullName || values.phone.trim() !== saved.phone;

  async function save() {
    if (inFlight.current) return;
    const found = profileErrors(values);
    setErrors(found);
    setResult(null);
    if (Object.keys(found).length > 0) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const next = await updateProfile(userId, { fullName: values.fullName.trim(), phone: values.phone.trim() || null });
      if (!live.current) return;
      setProfile(next);
      setValues({ fullName: next.fullName ?? '', phone: next.phone ?? '' });
      setResult({ tone: 'success', message: 'Your details are saved.' });
    } catch (e) {
      if (!live.current) return;
      const error = e instanceof ProfileError ? e : new ProfileError('unknown', "Your details weren't saved.");
      setResult({ tone: 'error', message: `${error.message} Your saved details haven't changed.` });
    } finally {
      inFlight.current = false;
      if (live.current) setSaving(false);
    }
  }

  return (
    <Card style={styles.card}>
      <CardTitle icon={{ ios: 'person', android: 'person', web: 'person' }} title="Your details" subtitle="Keep your information up to date." />
      <TextField
        label="Full name"
        value={values.fullName}
        onChangeText={(fullName) => {
          setValues((v) => ({ ...v, fullName }));
          setErrors((e) => ({ ...e, fullName: undefined }));
        }}
        autoComplete="name"
        textContentType="name"
        autoCapitalize="words"
        maxLength={100}
        error={errors.fullName}
        editable={!saving}
      />
      <TextField
        label="Phone (optional)"
        value={values.phone}
        onChangeText={(phone) => {
          setValues((v) => ({ ...v, phone }));
          setErrors((e) => ({ ...e, phone: undefined }));
        }}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        maxLength={20}
        error={errors.phone}
        editable={!saving}
      />
      <TextField
        label="Email"
        value={authEmail ?? profile?.email ?? ''}
        editable={false}
        hint="This is your sign-in email. It can't be changed in the app."
      />
      {result ? <FormMessage tone={result.tone}>{result.message}</FormMessage> : null}
      <PrimaryButton title="Save details" loadingLabel="Saving" fullWidth loading={saving} disabled={!dirty} onPress={() => void save()} />
    </Card>
  );
}

function PasswordCard() {
  const [values, setValues] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const inFlight = useRef(false);

  async function save() {
    if (inFlight.current || !supabase) return;
    const found = validateNewPassword(values);
    setErrors(found);
    setResult(null);
    if (hasErrors(found)) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: values.password });
      if (error) setResult({ tone: 'error', message: friendlyAuthError(error, 'reset').message });
      else {
        setValues({ password: '', confirm: '' });
        setResult({ tone: 'success', message: 'Your password has been changed. Use it next time you sign in.' });
      }
    } catch (error) {
      setResult({ tone: 'error', message: friendlyAuthError(error, 'reset').message });
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <Card style={styles.card}>
      <CardTitle
        icon={{ ios: 'lock', android: 'lock', web: 'lock' }}
        title="Password"
        subtitle="Update your password to keep your account secure. Forgot it? Sign out and use “Forgot password?”."
      />
      <TextField
        label="New password"
        value={values.password}
        onChangeText={(password) => setValues((v) => ({ ...v, password }))}
        secureToggle
        autoComplete="new-password"
        textContentType="newPassword"
        hint="At least 8 characters, with a letter and a number."
        error={errors.password}
        editable={!saving}
      />
      <TextField
        label="Confirm new password"
        value={values.confirm}
        onChangeText={(confirm) => setValues((v) => ({ ...v, confirm }))}
        secureToggle
        autoComplete="new-password"
        textContentType="newPassword"
        error={errors.confirm}
        editable={!saving}
      />
      {result ? <FormMessage tone={result.tone}>{result.message}</FormMessage> : null}
      <PrimaryButton title="Change password" loadingLabel="Changing password" fullWidth loading={saving} disabled={!values.password || !values.confirm} onPress={() => void save()} />
    </Card>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  content: {
    width: '100%',
    maxWidth: Layout.maxContentWidth,
    alignSelf: 'center',
    gap: Spacing.xl,
  },
  card: {
    gap: Spacing.md,
  },
  flex: { flex: 1, minWidth: 0 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radii.md, paddingHorizontal: Spacing.lg, minHeight: 52 },
  pill: { borderRadius: Radii.pill, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  pillText: { fontWeight: '600' },
  icon20: { width: 20, height: 20 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, borderRadius: Radii.md, padding: Spacing.md },
  signOut: { borderWidth: 1 },
});

type IconName = { ios: SFSymbol; android: AndroidSymbol; web: AndroidSymbol };

function CardTitle({ icon, title, subtitle }: { icon: IconName; title: string; subtitle: string }) {
  const theme = useTheme();
  return (
    <View style={extra.titleRow}>
      <View style={[extra.iconWrap, { backgroundColor: theme.surfaceMuted }]} importantForAccessibility="no-hide-descendants">
        <SymbolView name={icon} size={18} tintColor={theme.accentText} resizeMode="scaleAspectFit" style={extra.icon18} />
      </View>
      <View style={extra.flex}>
        <ThemedText variant="heading" accessibilityRole="header">
          {title}
        </ThemedText>
        <ThemedText variant="caption" themeColor="textSecondary">
          {subtitle}
        </ThemedText>
      </View>
    </View>
  );
}

function initials(name: string | null, email: string | null) {
  const source = name?.trim() || email?.split('@')[0] || '';
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2);
  return letters.toUpperCase() || '?';
}

/**
 * The member at a glance: initials, name, email and — only when the server
 * shows a current plan — a small plan badge. Read from the same dashboard data
 * as Home; nothing is guessed while it loads.
 */
function MemberCard({ email }: { email: string | null }) {
  const theme = useTheme();
  const { data } = useDashboard();
  const view = data ? classifyMemberships(data.memberships) : null;
  const plan = view?.kind === 'active' ? view.current[0] : null;
  const badge = plan ? (plan.kind === 'one_time_ride' ? plan.planName ?? 'Single ride' : (plan.planName ?? 'Member').replace(/ Membership$/, ' Member')) : null;
  const name = data?.fullName ?? null;

  return (
    <Card style={extra.member} accessible accessibilityLabel={[name, email, badge].filter(Boolean).join(', ')}>
      <View style={[extra.avatar, { backgroundColor: palette.forest600, borderColor: palette.gold300 }]}>
        <ThemedText variant="heading" style={{ color: palette.ivory100 }}>
          {initials(name, email)}
        </ThemedText>
      </View>
      <View style={extra.flex}>
        {name ? (
          <ThemedText variant="heading" numberOfLines={1}>
            {name}
          </ThemedText>
        ) : null}
        {email ? (
          <ThemedText variant="caption" themeColor="textSecondary" numberOfLines={1}>
            {email}
          </ThemedText>
        ) : null}
        {badge ? (
          <View style={[extra.badge, { borderColor: theme.secondary }]}>
            <ThemedText variant="caption" themeColor="accentText" style={extra.badgeText}>
              {badge}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const extra = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  icon18: { width: 18, height: 18 },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  member: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  avatar: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: Radii.pill, paddingHorizontal: Spacing.sm, paddingVertical: 1, marginTop: Spacing.xs },
  badgeText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
});
