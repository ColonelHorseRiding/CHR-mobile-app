import { PrimaryButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { StoreSkeleton } from '@/components/ui/screen-skeletons';

import type { CatalogError } from '../catalog';

export function CatalogLoading() {
  return <StoreSkeleton />;
}

export function CatalogErrorState({
  error,
  onRetry,
  retrying,
}: {
  error: CatalogError;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <EmptyState
      title="The store didn't load"
      message={
        error.kind === 'network'
          ? `${error.message} Check your connection and try again.`
          : `${error.message} Please try again in a moment.`
      }
      action={<PrimaryButton title="Try again" loading={retrying} onPress={onRetry} />}
    />
  );
}

export function CatalogEmpty({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <EmptyState
      title="Nothing on sale right now"
      message="Memberships and rides aren't available in the app at the moment. Please check back soon."
      action={<PrimaryButton title="Refresh" loading={retrying} onPress={onRetry} />}
    />
  );
}
