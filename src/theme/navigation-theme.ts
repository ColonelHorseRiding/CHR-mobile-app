import { DarkTheme, DefaultTheme, type Theme } from 'expo-router/react-navigation';

import { Colors, type ColorScheme } from './colors';

/** React Navigation theme derived from CHR tokens so headers and screen backgrounds match. */
export function getNavigationTheme(scheme: ColorScheme): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const colors = Colors[scheme];

  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
      notification: colors.secondary,
    },
  };
}
