import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { unregisterThisDevice } from '@/features/push/push-device';
import { supabase, supabaseConfigError, supabaseConfigured } from '@/services/supabase/client';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  /** False when the Supabase environment variables are missing or invalid. */
  configured: boolean;
  /** Developer-facing reason Supabase is unavailable, or null. */
  configError: string | null;
  /** True after a password-reset link signed the customer in, until a new password is saved. */
  recovery: boolean;
  endRecovery: () => void;
  /** One-off message for the sign-in screen, e.g. after a session expired. */
  notice: string | null;
  clearNotice: () => void;
  signOut: () => Promise<{ error: string | null }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * The single source of authentication state. One `onAuthStateChange`
 * subscription for the whole app: its INITIAL_SESSION event restores the
 * persisted session on launch (refreshing it if needed), and later events keep
 * routing in step with sign-in, sign-out, token refresh and password recovery.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(supabaseConfigured ? 'loading' : 'unauthenticated');
  const [session, setSession] = useState<Session | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const signingOut = useRef(false);
  const hadSession = useRef(false);

  useEffect(() => {
    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Keep this callback synchronous: awaiting Supabase calls here can deadlock the client.
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);

      if (event === 'SIGNED_OUT') {
        // Not requested by the customer: the refresh token was revoked or expired.
        if (!signingOut.current && hadSession.current) {
          setNotice('Your session has ended. Please sign in again.');
        }
        signingOut.current = false;
        setRecovery(false);
      }

      hadSession.current = Boolean(nextSession);
      setSession(nextSession);
      setStatus(nextSession ? 'authenticated' : 'unauthenticated');
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return { error: null };
    signingOut.current = true;
    // Stop phone alerts for this member on this phone (other phones keep theirs). Never blocks sign-out for long.
    await Promise.race([unregisterThisDevice(), new Promise((resolve) => setTimeout(resolve, 4000))]);
    const { error } = await supabase.auth.signOut();
    if (error) {
      // Offline or the server refused: still end the session on this device.
      await supabase.auth.signOut({ scope: 'local' });
    }
    return { error: null };
  }, []);

  const endRecovery = useCallback(() => setRecovery(false), []);
  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      configured: supabaseConfigured,
      configError: supabaseConfigError,
      recovery,
      endRecovery,
      notice,
      clearNotice,
      signOut,
    }),
    [status, session, recovery, endRecovery, notice, clearNotice, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}

/** Display name for the signed-in customer: their name if known, otherwise their email. */
export function displayName(user: User | null) {
  const name = user?.user_metadata?.full_name ?? user?.user_metadata?.name;
  return typeof name === 'string' && name.trim() ? name.trim() : (user?.email ?? '');
}
