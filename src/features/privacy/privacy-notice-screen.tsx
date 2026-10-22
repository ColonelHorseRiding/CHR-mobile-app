import { Linking, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FormMessage } from '@/components/ui/form-message';
import { ScreenContainer } from '@/components/ui/screen-container';
import { SectionHeading } from '@/components/ui/section-heading';
import { Skeleton, SkeletonRegion, SkeletonText } from '@/components/ui/skeleton';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/theme';

import type { PublicConfig } from './privacy-api';
import { noticeState, parseNotice, splitMarks } from './privacy-logic';
import { usePrivacyNotice } from './use-privacy-notice';

/** A line of notice text; any "[not yet provided]" mark is highlighted so a gap is never overlooked. */
function Line({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <ThemedText>
      {splitMarks(text).map((p, i) =>
        p.mark ? (
          <ThemedText key={i} style={{ color: theme.warning, backgroundColor: theme.warningSurface }}>
            {p.text}
          </ThemedText>
        ) : (
          p.text
        )
      )}
    </ThemedText>
  );
}

/**
 * The privacy notice, from the server, for signed-in and signed-out visitors. A notice that is not yet
 * published is shown clearly marked as a draft that is not in effect.
 */
export default function PrivacyNoticeScreen() {
  const n = usePrivacyNotice();
  const kind = noticeState(n.notice);

  return (
    <ScreenContainer>
      <SectionHeading eyebrow="Your data" title="Privacy Notice" />

      {n.state === 'loading' ? (
        <SkeletonRegion label="Loading the privacy notice">
          <Skeleton width="50%" height={22} />
          <SkeletonText lines={4} />
          <Skeleton width="40%" height={22} />
          <SkeletonText lines={4} />
        </SkeletonRegion>
      ) : null}

      {n.state === 'error' ? (
        <EmptyState
          title="We couldn't load the notice"
          message={`${n.error} Check your connection and try again.`}
          action={<PrimaryButton title="Try again" onPress={() => void n.reload()} />}
        />
      ) : null}

      {n.state === 'ready' && kind === 'none' ? (
        <EmptyState title="Not published yet" message="The club's privacy notice is being prepared and has not been published yet." />
      ) : null}

      {n.state === 'ready' && kind !== 'none' ? (
        <>
          {kind === 'draft' ? (
            <FormMessage tone="info" title="Draft — not yet in effect">
              This notice is still being finalised, and details marked [not yet provided] have not been supplied. It will be replaced by the published version.
            </FormMessage>
          ) : (
            <ThemedText variant="caption" themeColor="textSecondary">
              {`Version ${n.notice.version}${n.notice.effective_date ? ` · in effect from ${new Date(n.notice.effective_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}`}
            </ThemedText>
          )}

          <View style={styles.body}>
            {parseNotice(n.notice.body).map((b, i) =>
              b.type === 'h2' ? (
                <ThemedText key={i} variant="heading" accessibilityRole="header" style={styles.h2}>
                  {b.text}
                </ThemedText>
              ) : b.type === 'ul' ? (
                <View key={i} style={styles.list}>
                  {b.items.map((it, j) => (
                    <View key={j} style={styles.item}>
                      <ThemedText themeColor="accentText">•</ThemedText>
                      <View style={styles.itemText}>
                        <Line text={it} />
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Line key={i} text={b.text} />
              )
            )}
          </View>

          <ContactCard config={n.config} />
        </>
      ) : null}
    </ScreenContainer>
  );
}

/** The club's privacy and complaints contacts — only the ones the club has supplied. */
export function ContactCard({ config }: { config: PublicConfig | null }) {
  const has = (...v: (string | null | undefined)[]) => v.some(Boolean);
  const privacy = has(config?.privacy_contact_email, config?.privacy_contact_phone);
  const grievance = has(config?.grievance_officer_name, config?.grievance_officer_email, config?.grievance_officer_phone);

  if (!privacy && !grievance) {
    return (
      <FormMessage tone="info" title="Contact details">
        The club&apos;s privacy and complaints contact details are still being finalised.
      </FormMessage>
    );
  }
  return (
    <>
      {privacy ? (
        <Card>
          <ThemedText variant="eyebrow" themeColor="accentText">
            Privacy questions
          </ThemedText>
          {config?.legal_entity_name ? <ThemedText variant="bodyStrong">{config.legal_entity_name}</ThemedText> : null}
          {config?.privacy_contact_email ? (
            <ThemedText accessibilityRole="link" onPress={() => void Linking.openURL(`mailto:${config.privacy_contact_email}`)}>
              {config.privacy_contact_email}
            </ThemedText>
          ) : null}
          {config?.privacy_contact_phone ? <ThemedText>{config.privacy_contact_phone}</ThemedText> : null}
        </Card>
      ) : null}
      {grievance ? (
        <Card>
          <ThemedText variant="eyebrow" themeColor="accentText">
            Complaints
          </ThemedText>
          {config?.grievance_officer_name ? <ThemedText variant="bodyStrong">{config.grievance_officer_name}</ThemedText> : null}
          {config?.dpo_designation ? <ThemedText themeColor="textSecondary">{config.dpo_designation}</ThemedText> : null}
          {config?.grievance_officer_email ? (
            <ThemedText accessibilityRole="link" onPress={() => void Linking.openURL(`mailto:${config.grievance_officer_email}`)}>
              {config.grievance_officer_email}
            </ThemedText>
          ) : null}
          {config?.grievance_officer_phone ? <ThemedText>{config.grievance_officer_phone}</ThemedText> : null}
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md },
  h2: { marginTop: Spacing.lg },
  list: { gap: Spacing.sm },
  item: { flexDirection: 'row', gap: Spacing.sm },
  itemText: { flex: 1 },
});
