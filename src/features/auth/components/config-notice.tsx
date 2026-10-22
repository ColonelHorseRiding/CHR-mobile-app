import { FormMessage } from '@/components/ui/form-message';

import { useAuth } from '../auth-provider';

/**
 * Shown on the auth screens when Supabase is not configured. Developers see
 * the exact reason; customers of a misconfigured build see a neutral message.
 */
export function ConfigNotice() {
  const { configured, configError } = useAuth();
  if (configured) return null;
  return (
    <FormMessage tone="error" title="Sign-in is unavailable">
      {__DEV__ && configError ? configError : 'The app cannot reach the club right now. Please try again later.'}
    </FormMessage>
  );
}
