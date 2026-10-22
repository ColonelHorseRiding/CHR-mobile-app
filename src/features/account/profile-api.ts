import { useSyncExternalStore } from 'react';

import { supabase } from '@/services/supabase/client';

/**
 * The member's own profile row, as the CHR website's Account page uses it:
 * read through "Members read own profile" and updated through "Members update
 * own profile" (RLS: id = auth.uid()). Only full_name and phone are ever sent
 * — role/status are additionally guarded by the prevent_privilege_escalation
 * trigger, and the sign-in email is managed by Supabase Auth, not here.
 */

const TIMEOUT_MS = 15_000;

export type Profile = { fullName: string | null; phone: string | null; email: string | null };

export class ProfileError extends Error {
  constructor(
    readonly kind: 'network' | 'session' | 'unknown',
    message: string
  ) {
    super(message);
  }
}

async function timed<T>(run: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ProfileError('network', "We couldn't reach the club's servers."));
    }, TIMEOUT_MS);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } catch (error) {
    if (error instanceof ProfileError) throw error;
    throw new ProfileError('network', "We couldn't reach the club's servers.");
  } finally {
    clearTimeout(timer);
  }
}

function toError(error: { message: string; code?: string }, fallback: string) {
  if (error.code === 'PGRST301' || /jwt|not authenticated/i.test(error.message)) {
    return new ProfileError('session', 'Your session has expired. Please sign in again.');
  }
  if (/network|fetch|abort|timed? ?out/i.test(error.message)) return new ProfileError('network', "We couldn't reach the club's servers.");
  return new ProfileError('unknown', fallback);
}

function client() {
  if (!supabase) throw new ProfileError('unknown', 'The app is not connected to the club.');
  return supabase;
}

type Row = { full_name: string | null; phone: string | null; email: string | null };
const toProfile = (r: Row): Profile => ({ fullName: r.full_name, phone: r.phone, email: r.email });

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const db = client();
  const { data, error } = await timed((signal) =>
    db.from('profiles').select('full_name, phone, email').eq('id', userId).abortSignal(signal).maybeSingle()
  );
  if (error) throw toError(error, "Your details couldn't be loaded.");
  return data ? toProfile(data as Row) : null;
}

/** Saves name and phone, and returns the row as the server stored it. */
export async function updateProfile(userId: string, values: { fullName: string; phone: string | null }): Promise<Profile> {
  const db = client();
  const { data, error } = await timed((signal) =>
    db
      .from('profiles')
      .update({ full_name: values.fullName, phone: values.phone })
      .eq('id', userId)
      .select('full_name, phone, email')
      .abortSignal(signal)
      .maybeSingle()
  );
  if (error) throw toError(error, "Your details weren't saved. Please try again.");
  // No row back means the update matched nothing for this session: never report it as saved.
  if (!data) throw new ProfileError('unknown', "Your details weren't saved. Please try again.");
  notifyProfileChanged();
  return toProfile(data as Row);
}

// Phone is optional; when given: digits with optional +, spaces, dashes or brackets, 7–15 digits.
export function profileErrors(values: { fullName: string; phone: string }) {
  const errors: { fullName?: string; phone?: string } = {};
  const name = values.fullName.trim();
  if (!name) errors.fullName = 'Enter your name.';
  else if (name.length > 100) errors.fullName = 'Use 100 characters or fewer.';
  const phone = values.phone.trim();
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    if (!/^\+?[\d\s()-]+$/.test(phone) || digits.length < 7 || digits.length > 15) {
      errors.phone = 'Enter a valid phone number, like +91 98765 43210.';
    }
  }
  return errors;
}

// ─── A change signal so the dashboard greeting re-reads after a save ────────
let version = 0;
const listeners = new Set<() => void>();
function notifyProfileChanged() {
  version += 1;
  listeners.forEach((l) => l());
}
export function useProfileVersion() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => version
  );
}
