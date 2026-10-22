import { Stack } from 'expo-router';

import { useStackScreenOptions } from '@/navigation/use-stack-screen-options';

export const unstable_settings = {
  initialRouteName: 'sign-in',
};

export default function AuthStackLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={{ ...screenOptions, title: '' }}>
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="privacy" options={{ title: 'Privacy Notice' }} />
    </Stack>
  );
}
