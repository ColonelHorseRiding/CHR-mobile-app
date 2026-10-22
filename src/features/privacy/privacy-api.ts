import { supabase } from '@/services/supabase/client';

import { friendlyPrivacyError, type Consents, type Notice, type RequestType } from './privacy-logic';

/**
 * The privacy calls (website repo: supabase/proposals/0030_privacy_foundation.sql). Each one runs as the signed-in
 * member: the server takes WHO from the session and WHEN from its own clock, so nothing sent from here can name
 * another member or backdate anything. The mobile app uses the same server functions as the website — there is no
 * separate privacy store for the app.
 */

const TIMEOUT_MS = 15_000;

export class PrivacyError extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
    super(message);
  }
}

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new PrivacyError('The app is not connected to the club.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { data, error } = await supabase.rpc(fn, args).abortSignal(controller.signal);
    if (error) throw new PrivacyError(friendlyPrivacyError(error), error.message?.trim());
    return data as T;
  } catch (e) {
    if (e instanceof PrivacyError) throw e;
    throw new PrivacyError(friendlyPrivacyError({ message: 'network' }));
  } finally {
    clearTimeout(timer);
  }
}

export type PublicConfig = {
  legal_entity_name: string | null;
  registered_address: string | null;
  privacy_contact_email: string | null;
  privacy_contact_phone: string | null;
  grievance_officer_name: string | null;
  grievance_officer_email: string | null;
  grievance_officer_phone: string | null;
  dpo_designation: string | null;
  complete: boolean;
};

export type PrivacyRequest = {
  id: string;
  request_type: RequestType;
  status: string;
  subject: string | null;
  submitted_at: string;
  due_at: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
};

// Public (signed-out is fine)
export const getNotice = () => call<Notice>('current_privacy_notice', { p_language: 'en' });
export const getPublicConfig = () => call<PublicConfig>('public_privacy_config');

// Member
export const getMyConsents = () => call<Consents>('my_consents');
export const recordConsent = (purpose: string, action: 'granted' | 'withdrawn' | 'notice_acknowledged', noticeVersion: string | null = null) =>
  call<{ recorded: boolean }>('record_consent', { p_purpose: purpose, p_action: action, p_notice_version: noticeVersion, p_source: 'mobile' });
export const submitRequest = (input: { type: RequestType; subject?: string; details?: string }) =>
  call<PrivacyRequest>('submit_privacy_request', { p_type: input.type, p_subject: input.subject?.trim() || null, p_details: input.details?.trim() || null });
export const getMyRequests = () => call<PrivacyRequest[]>('my_privacy_requests');
export const cancelRequest = (id: string) => call<null>('cancel_my_privacy_request', { p_id: id });
export const exportMyData = () => call<Record<string, unknown>>('export_my_data');
