/**
 * Privacy features: the rules the screens follow, free of React and the network so they can be tested
 * on their own. The SERVER (website repo: supabase/proposals/0030–0031) decides everything that matters —
 * what is recorded, when and for whom. Nothing here records or grants anything.
 */

/** Marker the server leaves where a required club detail has not been supplied yet. */
export const NOT_PROVIDED = '[not yet provided]';

// ─── The notice text ────────────────────────────────────────────────────────

export type NoticeBlock = { type: 'h2'; text: string } | { type: 'p'; text: string } | { type: 'ul'; items: string[] };

/** "## " headings, "- " list items (consecutive ones form one list) and paragraphs, as data — never markup. */
export function parseNotice(body: string | null | undefined): NoticeBlock[] {
  const blocks: NoticeBlock[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (list) blocks.push({ type: 'ul', items: list });
    list = null;
  };
  for (const raw of String(body ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) flush();
    else if (line.startsWith('## ')) {
      flush();
      blocks.push({ type: 'h2', text: line.slice(3).trim() });
    } else if (line.startsWith('- ')) {
      (list ??= []).push(line.slice(2).trim());
    } else {
      flush();
      blocks.push({ type: 'p', text: line });
    }
  }
  flush();
  return blocks;
}

/** Splits a line so any "[not yet provided]" mark can be highlighted. */
export function splitMarks(text: string): { text: string; mark: boolean }[] {
  const parts = String(text ?? '').split(NOT_PROVIDED);
  const out: { text: string; mark: boolean }[] = [];
  parts.forEach((part, i) => {
    if (part) out.push({ text: part, mark: false });
    if (i < parts.length - 1) out.push({ text: NOT_PROVIDED, mark: true });
  });
  return out;
}

export type Notice = {
  published: boolean;
  version: string | null;
  title?: string;
  body?: string;
  effective_date?: string | null;
  missing?: string[];
};

/** 'published' (in effect), 'draft' (shown, clearly marked, not in effect) or 'none'. */
export function noticeState(notice: Notice | null | undefined): 'published' | 'draft' | 'none' {
  if (!notice) return 'none';
  if (notice.published === true) return 'published';
  return notice.body ? 'draft' : 'none';
}

/**
 * What registration asks. Only a notice that is actually published can be acknowledged; until then the form
 * links to the draft and registration carries on as before — nothing is recorded against a draft.
 */
export function registrationNotice(notice: Notice | null | undefined) {
  const state = noticeState(notice);
  return { state, mustAcknowledge: state === 'published', version: state === 'published' ? (notice?.version ?? null) : null };
}

// ─── Remembering the registration tick until there is a session ─────────────

const PENDING_KEY = 'chr.privacy.pending';

type KeyValueStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } | null | undefined;

/** Remembers WHICH notice version was ticked. The server stamps the time and person and re-checks the version. */
export function rememberPendingAcknowledgement(storage: KeyValueStorage, version: string | null) {
  try {
    if (version) storage?.setItem(PENDING_KEY, JSON.stringify({ version }));
  } catch {
    // Without storage the person sees the in-app notice card instead.
  }
}

/** The remembered version if it is still the current one (and forgets it either way). */
export function takePendingAcknowledgement(storage: KeyValueStorage, currentVersion: string | null): string | null {
  try {
    const raw = storage?.getItem(PENDING_KEY);
    if (!raw) return null;
    storage?.removeItem(PENDING_KEY);
    const { version } = JSON.parse(raw) as { version?: string };
    return version && version === currentVersion ? version : null;
  } catch {
    return null;
  }
}

// ─── Choices ────────────────────────────────────────────────────────────────

export type PurposeRow = {
  purpose: string;
  title: string;
  description: string;
  is_mandatory: boolean;
  status: 'none' | 'granted' | 'withdrawn' | 'acknowledged';
  notice_version: string | null;
};

export type Consents = {
  current_notice_version: string | null;
  acknowledged_notice_version: string | null;
  needs_acknowledgement: boolean;
  purposes: PurposeRow[];
};

/** Essential purposes are information; optional ones are a switch that is on until the member withdraws it. */
export function purposeView(p: Pick<PurposeRow, 'is_mandatory' | 'status'>) {
  if (p.is_mandatory) return { kind: 'required' as const, on: true, label: 'Needed to run your account' };
  const withdrawn = p.status === 'withdrawn';
  return { kind: 'switch' as const, on: !withdrawn, label: withdrawn ? 'Off' : 'On' };
}

// ─── Requests ───────────────────────────────────────────────────────────────

export type RequestType = 'access' | 'correction' | 'erasure' | 'consent_withdrawal' | 'grievance' | 'nomination' | 'other';

export const REQUEST_TYPES: { value: RequestType; label: string; needsDetails: boolean; hint: string }[] = [
  { value: 'access', label: 'Ask what else you hold about me', needsDetails: false, hint: 'The copy of your data covers your member records. Ask here about anything else, such as staff notes.' },
  { value: 'correction', label: 'Correct or update my data', needsDetails: true, hint: 'Tell us what is wrong and what it should say. You can also edit your name and phone in Profile.' },
  { value: 'grievance', label: 'Raise a concern or complaint', needsDetails: true, hint: 'Tell us what happened. We will answer you in writing.' },
  { value: 'nomination', label: 'Nominate someone to act for me', needsDetails: true, hint: "Give the person's name and how we can reach them." },
  { value: 'other', label: 'Something else about my data', needsDetails: true, hint: 'Any other question about how we handle your data.' },
];

export const STATUS_LABEL: Record<string, string> = {
  submitted: 'Received',
  in_progress: 'Being handled',
  awaiting_requester: 'We need something from you',
  completed: 'Done',
  rejected: 'Declined',
  cancelled: 'Cancelled',
};

export const TYPE_LABEL: Record<string, string> = {
  access: 'Other data we hold',
  correction: 'Correction',
  erasure: 'Close my account',
  consent_withdrawal: 'Withdraw consent',
  grievance: 'Complaint',
  nomination: 'Nomination',
  other: 'Other',
};

const OPEN = new Set(['submitted', 'in_progress', 'awaiting_requester']);
export const isOpen = (status: string) => OPEN.has(status);
/** A member may withdraw a request only before anyone has started on it. */
export const canCancel = (status: string) => status === 'submitted' || status === 'awaiting_requester';

export const MAX_SUBJECT = 120;
export const MAX_DETAILS = 2000;

export function validateRequest(input: { type: string; subject?: string; details?: string }) {
  const errors: { type?: string; subject?: string; details?: string } = {};
  const subject = input.subject ?? '';
  const details = input.details ?? '';
  const meta = REQUEST_TYPES.find((t) => t.value === input.type);
  if (!meta) errors.type = 'Choose what you need.';
  if (subject.trim().length > MAX_SUBJECT) errors.subject = `Keep the title under ${MAX_SUBJECT} characters.`;
  if (details.trim().length > MAX_DETAILS) errors.details = `Keep this under ${MAX_DETAILS} characters.`;
  if (meta?.needsDetails && !details.trim()) errors.details = 'Please tell us a little about this.';
  return errors;
}

/** "We aim to answer by …": only when the club set its own target and the request is open; never an invented deadline. */
export function dueText(r: { due_at: string | null; status: string }, fmt: (iso: string) => string) {
  return r.due_at && isOpen(r.status) ? `We aim to answer by ${fmt(r.due_at)}.` : null;
}

// ─── Plain-language errors ──────────────────────────────────────────────────

const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'Please sign in again.',
  NOTICE_NOT_PUBLISHED: 'The privacy notice has not been published yet, so this cannot be recorded.',
  NOTICE_VERSION_MISMATCH: 'The notice has changed since you opened it. Please read the current one and try again.',
  MANDATORY_PURPOSE: 'This is needed to run your account. To stop it, ask to close your account instead.',
  ALREADY_REQUESTED: 'You already have an open request of this kind. You can follow it under "Your requests".',
  PRIVILEGED_ACCOUNT: 'Staff and admin accounts are closed by the club administrator.',
  TOO_MANY_OPEN_REQUESTS: 'You have several open requests. Please wait until some are finished.',
  DETAILS_REQUIRED: 'Please tell us a little about this.',
  TEXT_TOO_LONG: 'That is too long. Please shorten it.',
  NOT_CANCELLABLE: 'This request is already being handled, so it can no longer be withdrawn.',
  REQUEST_NOT_FOUND: 'We could not find that request.',
};

export function friendlyPrivacyError(error: { message?: string } | null | undefined) {
  const code = String(error?.message ?? '').trim();
  if (MESSAGES[code]) return MESSAGES[code];
  if (/network|fetch|timed? ?out|abort/i.test(code)) return "We couldn't reach the club's servers. Please check your connection and try again.";
  return 'Something went wrong. Please try again.';
}
