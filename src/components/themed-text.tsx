import { Text, type TextProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { Typography, type ThemeColor, type TypographyVariant } from '@/theme';

export type ThemedTextProps = TextProps & {
  variant?: TypographyVariant;
  themeColor?: ThemeColor;
};

export function ThemedText({ style, variant = 'body', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return <Text style={[{ color: theme[themeColor ?? 'text'] }, Typography[variant], style]} {...rest} />;
}
