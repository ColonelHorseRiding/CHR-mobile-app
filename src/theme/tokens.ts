import { Platform, type TextStyle } from 'react-native';

import type { ThemeColor } from './colors';

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
} as const;

export const Radii = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    mono: 'ui-monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    mono: 'var(--font-mono)',
  },
  default: {
    sans: 'sans-serif',
    serif: 'serif',
    mono: 'monospace',
  },
});

/**
 * Serif display faces for headings, clean sans-serif for body copy.
 * Uses platform fonts so no font files are bundled until approved brand fonts exist.
 */
export const Typography = {
  display: { fontFamily: Fonts.serif, fontSize: 32, lineHeight: 40, fontWeight: '700' },
  title: { fontFamily: Fonts.serif, fontSize: 26, lineHeight: 32, fontWeight: '700' },
  heading: { fontFamily: Fonts.serif, fontSize: 20, lineHeight: 26, fontWeight: '700' },
  eyebrow: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  body: { fontFamily: Fonts.sans, fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontFamily: Fonts.sans, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  caption: { fontFamily: Fonts.sans, fontSize: 14, lineHeight: 20, fontWeight: '400' },
  label: { fontFamily: Fonts.sans, fontSize: 16, lineHeight: 20, fontWeight: '600', letterSpacing: 0.3 },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof Typography;

/** Cross-platform shadows (`boxShadow` is supported on the New Architecture). */
export const Shadows = {
  none: undefined,
  sm: '0px 1px 2px rgba(20, 33, 26, 0.06), 0px 2px 6px rgba(20, 33, 26, 0.05)',
  md: '0px 2px 4px rgba(20, 33, 26, 0.06), 0px 8px 20px rgba(20, 33, 26, 0.08)',
} as const;

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline';

export const ButtonVariants: Record<
  ButtonVariant,
  { background: ThemeColor | null; pressed: ThemeColor; text: ThemeColor; border: ThemeColor | null }
> = {
  primary: { background: 'primary', pressed: 'primaryPressed', text: 'onPrimary', border: null },
  secondary: { background: null, pressed: 'surfaceMuted', text: 'primary', border: 'buttonSecondaryBorder' },
  ghost: { background: null, pressed: 'surfaceMuted', text: 'primary', border: null },
  /** Neutral surface button, e.g. third-party sign-in. */
  outline: { background: 'surface', pressed: 'surfaceMuted', text: 'text', border: 'borderStrong' },
};

export const Layout = {
  /** Horizontal page gutter. */
  gutter: Spacing.xl,
  /** Readable content width on tablets and web. */
  maxContentWidth: 640,
  /** Minimum interactive size (Android Material 48dp, iOS HIG 44pt). */
  minTouchTarget: 48,
} as const;
