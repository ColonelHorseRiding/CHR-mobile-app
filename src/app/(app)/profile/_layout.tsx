import { Stack } from 'expo-router';

import { useStackScreenOptions } from '@/navigation/use-stack-screen-options';

export default function ProfileStackLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Profile' }} />
      <Stack.Screen name="privacy" options={{ title: 'Privacy & data' }} />
      <Stack.Screen name="notice" options={{ title: 'Privacy Notice' }} />
    </Stack>
  );
}
