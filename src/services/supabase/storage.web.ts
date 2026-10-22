/**
 * On web the browser's own localStorage is used (undefined during static
 * rendering, where supabase-js falls back to memory).
 */
export const authStorage = typeof window === 'undefined' ? undefined : window.localStorage;
