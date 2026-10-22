/**
 * Client-side checks that catch obvious mistakes before a network call.
 * Supabase Auth remains the authority on what it accepts.
 */

/** Trims, lower-cases and strips invisible characters that ride along when an address is pasted. */
export function normalizeEmail(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[\s ​-‍⁠﻿]/g, '')
    .toLowerCase();
}

// local@domain.tld: at least one dot in the domain, no empty labels, TLD of 2+ characters.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;

export function isValidEmail(value: string) {
  return EMAIL_RE.test(normalizeEmail(value));
}

export const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72; // bcrypt limit used by Supabase Auth

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export function emailError(email: string): string | undefined {
  if (!normalizeEmail(email)) return 'Enter your email address.';
  if (!isValidEmail(email)) return 'Enter a valid email address, like name@example.com.';
  return undefined;
}

/** Rules for a password being created (registration or reset), not for signing in. */
export function newPasswordError(password: string): string | undefined {
  if (!password) return 'Choose a password.';
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Use no more than ${MAX_PASSWORD_LENGTH} characters.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Include at least one letter and one number.';
  return undefined;
}

export function validateSignIn(values: { email: string; password: string }) {
  const errors: FieldErrors<'email' | 'password'> = {};
  errors.email = emailError(values.email);
  if (!values.password) errors.password = 'Enter your password.';
  return compact(errors);
}

export function validateSignUp(values: { fullName: string; email: string; password: string; confirm: string }) {
  const errors: FieldErrors<'fullName' | 'email' | 'password' | 'confirm'> = {};
  if (!values.fullName.trim()) errors.fullName = 'Enter your full name.';
  else if (values.fullName.trim().length > 100) errors.fullName = 'Use 100 characters or fewer.';
  errors.email = emailError(values.email);
  errors.password = newPasswordError(values.password);
  if (!errors.password && values.confirm !== values.password) errors.confirm = "The passwords don't match.";
  return compact(errors);
}

export function validateNewPassword(values: { password: string; confirm: string }) {
  const errors: FieldErrors<'password' | 'confirm'> = {};
  errors.password = newPasswordError(values.password);
  if (!errors.password && values.confirm !== values.password) errors.confirm = "The passwords don't match.";
  return compact(errors);
}

function compact<T extends Record<string, string | undefined>>(errors: T) {
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v)) as T;
}

export function hasErrors(errors: object) {
  return Object.keys(errors).length > 0;
}
