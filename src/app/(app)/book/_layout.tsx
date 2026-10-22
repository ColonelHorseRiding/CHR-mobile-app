import { Stack } from 'expo-router';

import { useStackScreenOptions } from '@/navigation/use-stack-screen-options';

export default function BookStackLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Book' }} />
      <Stack.Screen name="[sessionId]" options={{ title: 'Book a class' }} />
      <Stack.Screen name="weekly" options={{ title: 'Weekly schedule' }} />
      <Stack.Screen name="classes/index" options={{ title: 'My classes' }} />
      <Stack.Screen name="classes/[bookingId]" options={{ title: 'Class details' }} />
      <Stack.Screen name="move/[bookingId]" options={{ title: 'Move class' }} />
    </Stack>
  );
}
