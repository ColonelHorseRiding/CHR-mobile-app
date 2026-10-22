/**
 * CHR colour palette.
 *
 * PROVISIONAL: no approved CHR palette exists in the project yet. These values follow the
 * Phase 1 direction (deep forest green, warm ivory, muted gold). Replace the raw values in
 * `palette` once the approved brand guide is available; semantic tokens below should not change.
 */

export const palette = {
  forest900: '#0F1A15',
  forest800: '#14211A',
  forest700: '#162B22',
  forest600: '#1F3A2E',
  forest500: '#17241D',
  forest400: '#1E2E26',
  forest300: '#2A3B32',
  forest200: '#3A4D43',
  ivory50: '#FFFDF8',
  ivory100: '#F7F3EA',
  ivory200: '#EFE9DC',
  ivory300: '#E3DBCA',
  ivory400: '#CFC4AD',
  gold300: '#C9A86A',
  gold400: '#B8975A',
  gold500: '#B08D57',
  gold700: '#8A6A35',
  ink900: '#1C2620',
  ink600: '#5C655E',
  stone200: '#F3EEE3',
  stone400: '#B5B0A3',
  white: '#FFFFFF',
  red700: '#9B2C2C',
  red50: '#F8E9E6',
  red300: '#F2A59B',
  red900: '#3A1F1C',
  green700: '#2F5D3A',
  green50: '#E7EFE6',
  green300: '#A8CFA6',
  green900: '#1D3324',
} as const;

// Contrast notes (WCAG): text on background ≥ 14:1, textSecondary ≥ 5.4:1,
// accentText ≥ 4.5:1 (light) / 7:1 (dark), onPrimary on primary ≥ 7:1,
// danger/success text on their own surfaces ≥ 6.3:1.
/** The approved dark-mode values, exactly as specified. */
const dark = {
  background: '#0B1410',
  surface: '#14221B',
  surfaceElevated: '#1A2B22',
  surfaceSecondary: '#20352A',
  brandGreen: '#234735',
  border: '#304238',
  borderStrong: '#405246',
  divider: '#29392F',
  textPrimary: '#F6F3EA',
  textSecondary: '#C1C9C0',
  textMuted: '#929D94',
  textDisabled: '#78837A',
  gold: '#D1B06F',
  goldSecondary: '#B99555',
  goldHighlight: '#E5CA91',
  successBackground: '#173C2D',
  successText: '#A6D8B4',
  warningBackground: '#3B301C',
  warningText: '#E8CB8B',
  errorBackground: '#402421',
  errorText: '#F0AAA0',
  disabledBackground: '#202923',
  disabledText: '#78837A',
  tabBarBackground: '#101A14',
  tabBarActiveBackground: '#20352A',
  tabBarActive: '#D1B06F',
  tabBarInactive: '#AAB5AC',
  notificationBadge: '#B94A43',
  notificationBadgeText: '#FFFFFF',
  inputBackground: '#101B15',
  slotUnavailable: '#17211B',
} as const;

/*
 * Semantic roles added for the dark theme. The light values reproduce exactly
 * what light mode already rendered, so light mode is unchanged.
 */
const lightExtra = {
  surfaceElevated: palette.ivory50,
  textMuted: palette.ink600,
  divider: palette.ivory300,
  warning: palette.gold700,
  warningSurface: palette.ivory200,
  inputBackground: palette.ivory50,
  slotUnavailable: palette.ivory200,
  buttonSecondaryBorder: palette.forest600,
  tabBarBackground: palette.ivory50,
  tabBarActiveBackground: palette.ivory200,
  tabBarActive: palette.forest600,
  tabBarInactive: palette.ink600,
  notificationBadge: palette.red700,
  notificationBadgeText: palette.white,
  ctaBackground: palette.gold500,
  ctaText: palette.white,
  membershipCard: palette.forest600,
  membershipCardBorder: 'rgba(201, 168, 106, 0.65)',
  membershipTrack: 'rgba(247, 243, 234, 0.16)',
  membershipActive: palette.green300,
  membershipActiveSurface: 'transparent',
  // Loading placeholders: the shape tint and the brighter beat of its pulse.
  skeletonBase: palette.ivory200,
  skeletonHighlight: palette.ivory300,
} as const;

const darkExtra = {
  surfaceElevated: dark.surfaceElevated,
  textMuted: dark.textMuted,
  divider: dark.divider,
  warning: dark.warningText,
  warningSurface: dark.warningBackground,
  inputBackground: dark.inputBackground,
  slotUnavailable: dark.slotUnavailable,
  buttonSecondaryBorder: dark.goldSecondary,
  tabBarBackground: dark.tabBarBackground,
  tabBarActiveBackground: dark.tabBarActiveBackground,
  tabBarActive: dark.tabBarActive,
  tabBarInactive: dark.tabBarInactive,
  notificationBadge: dark.notificationBadge,
  notificationBadgeText: dark.notificationBadgeText,
  ctaBackground: dark.gold,
  ctaText: dark.surface,
  membershipCard: dark.surface,
  membershipCardBorder: dark.goldSecondary,
  membershipTrack: dark.border,
  membershipActive: dark.successText,
  membershipActiveSurface: dark.successBackground,
  skeletonBase: dark.surfaceElevated,
  skeletonHighlight: dark.surfaceSecondary,
} as const;

/** Disabled controls in dark mode use solid colours rather than fading. */
export const DarkDisabled = { background: dark.disabledBackground, text: dark.disabledText, border: dark.border } as const;

export const Colors = {
  light: {
    primary: palette.forest600,
    primaryPressed: palette.forest700,
    onPrimary: palette.ivory50,
    secondary: palette.gold500,
    accentText: palette.gold700,
    background: palette.ivory100,
    surface: palette.ivory50,
    surfaceMuted: palette.ivory200,
    border: palette.ivory300,
    borderStrong: palette.ivory400,
    text: palette.ink900,
    textSecondary: palette.ink600,
    brand: palette.forest600,
    onBrand: palette.ivory100,
    brandAccent: palette.gold300,
    danger: palette.red700,
    dangerSurface: palette.red50,
    success: palette.green700,
    successSurface: palette.green50,
    ...lightExtra,
  },
  // CHR Luxury Equestrian Dark Theme (approved palette): deep green-black page,
  // layered forest surfaces, warm ivory text and champagne gold used sparingly.
  dark: {
    primary: dark.gold,
    primaryPressed: dark.goldSecondary,
    onPrimary: dark.surface,
    secondary: dark.gold,
    accentText: dark.gold,
    background: dark.background,
    surface: dark.surface,
    surfaceMuted: dark.surfaceSecondary,
    border: dark.border,
    borderStrong: dark.borderStrong,
    text: dark.textPrimary,
    textSecondary: dark.textSecondary,
    brand: dark.brandGreen,
    onBrand: dark.textPrimary,
    brandAccent: dark.gold,
    danger: dark.errorText,
    dangerSurface: dark.errorBackground,
    success: dark.successText,
    successSurface: dark.successBackground,
    ...darkExtra,
  },
} as const;

/** The launch screen is always dark: the approved forest green, warm ivory and champagne gold. */
export const SplashColors = { background: dark.background, ivory: dark.textPrimary, gold: dark.gold } as const;

export type ColorScheme = keyof typeof Colors;
export type ThemeColors = { [K in keyof typeof Colors.light]: string };
export type ThemeColor = keyof ThemeColors;

/** Brand green used by the native splash, the animated splash overlay and the app icon. */
export const SplashBackground = palette.forest600;
