import type { ComponentProps } from 'react';
import type { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { Fonts } from '@/theme';

type StackScreenOptions = NonNullable<ComponentProps<typeof Stack>['screenOptions']>;

/** Shared header styling for every tab's Stack so titles and back buttons look consistent. */
export function useStackScreenOptions(): StackScreenOptions {
  const theme = useTheme();

  return {
    headerStyle: { backgroundColor: theme.background },
    headerTintColor: theme.primary,
    headerTitleStyle: { fontFamily: Fonts.serif, fontWeight: '700', color: theme.text },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal',
    contentStyle: { backgroundColor: theme.background },
  };
}
