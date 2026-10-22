import { Stack } from 'expo-router';

import { useStackScreenOptions } from '@/navigation/use-stack-screen-options';

/** Store tab. The catalog and cart providers live in the signed-in layout above. */
export default function StoreStackLayout() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Store' }} />
      <Stack.Screen name="[sku]" options={{ title: '' }} />
      <Stack.Screen name="tack/[sku]" options={{ title: '' }} />
      <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
      <Stack.Screen name="cart" options={{ title: 'Your order' }} />
      <Stack.Screen name="orders" options={{ title: 'My orders' }} />
      <Stack.Screen name="order/[orderId]" options={{ title: 'Order status' }} />
    </Stack>
  );
}
