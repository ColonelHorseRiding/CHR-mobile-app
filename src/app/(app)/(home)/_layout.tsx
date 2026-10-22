import { Stack } from 'expo-router';

import { useStackScreenOptions } from '@/navigation/use-stack-screen-options';

export default function HomeStackLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      {/* The Home screen draws its own club header instead of a title bar. */}
      <Stack.Screen name="index" options={{ title: 'Home', headerShown: false }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="activity" options={{ title: 'Activity' }} />
      {/* Opened from Home (activity, notifications) so Back returns there instead of switching tabs. */}
      <Stack.Screen name="order/[orderId]" options={{ title: 'Order status' }} />
      <Stack.Screen name="class/[bookingId]" options={{ title: 'Class details' }} />
    </Stack>
  );
}
