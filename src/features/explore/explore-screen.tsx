import { router } from 'expo-router';

import { SecondaryButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ScreenContainer } from '@/components/ui/screen-container';
import { SectionHeading } from '@/components/ui/section-heading';

export default function ExploreScreen() {
  return (
    <ScreenContainer>
      <SectionHeading
        eyebrow="Explore"
        title="Discover the club"
        description="Everything CHR offers will be gathered here."
      />

      <EmptyState
        title="More is on the way"
        message="Book classes in the Book tab. Memberships, single rides and the Tack Shop are in the Store, along with your orders."
        action={
          <SecondaryButton
            title="Back to home"
            accessibilityHint="Opens the Home tab"
            onPress={() => router.navigate('/')}
          />
        }
      />
    </ScreenContainer>
  );
}
