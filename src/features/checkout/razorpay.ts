import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';

/**
 * Thin wrapper over Razorpay's official React Native SDK (react-native-razorpay,
 * a native module: it needs a development or release build, not Expo Go).
 *
 * The SDK result is NOT proof of payment. A "success" only carries identifiers
 * and a signature that the server verifies; every other outcome is followed by
 * a server status check before anything is shown as final.
 */
export type CheckoutOptions = {
  keyId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  description: string;
  prefill: { name?: string; email?: string };
  themeColor: string;
};

export type CheckoutOutcome =
  | { kind: 'completed'; razorpayPaymentId: string; razorpayOrderId: string; razorpaySignature: string }
  | { kind: 'cancelled' }
  | { kind: 'network' }
  | { kind: 'failed'; reason: string }
  | { kind: 'unavailable' };

// Android SDK error codes (com.razorpay.Checkout).
const PAYMENT_CANCELED = 0;
const NETWORK_ERROR = 2;

export function isRazorpayAvailable() {
  if (Platform.OS === 'web') return false;
  // New Architecture registers a TurboModule; the SDK falls back to the legacy name.
  return TurboModuleRegistry.get('RNRazorpayCheckout') != null || NativeModules.RNRazorpayCheckout != null;
}

export async function openRazorpayCheckout(options: CheckoutOptions): Promise<CheckoutOutcome> {
  if (!isRazorpayAvailable()) return { kind: 'unavailable' };

  // Loaded lazily so the JS bundle still runs where the native module is absent.
  const RazorpayCheckout = (await import('react-native-razorpay')).default;
  try {
    const data = (await RazorpayCheckout.open({
      key: options.keyId,
      order_id: options.razorpayOrderId,
      amount: options.amountPaise,
      currency: options.currency,
      name: 'Colonel Horse Riding Club',
      description: options.description,
      prefill: options.prefill,
      theme: { color: options.themeColor },
    })) as { razorpay_payment_id?: string; razorpay_order_id?: string; razorpay_signature?: string };

    if (!data?.razorpay_payment_id || !data.razorpay_signature) {
      return { kind: 'failed', reason: 'The payment window closed without a result.' };
    }
    return {
      kind: 'completed',
      razorpayPaymentId: data.razorpay_payment_id,
      razorpayOrderId: data.razorpay_order_id ?? options.razorpayOrderId,
      razorpaySignature: data.razorpay_signature,
    };
  } catch (error) {
    const code = (error as { code?: number })?.code;
    if (code === PAYMENT_CANCELED) return { kind: 'cancelled' };
    if (code === NETWORK_ERROR) return { kind: 'network' };
    return { kind: 'failed', reason: describeError(error) };
  }
}

/** Razorpay's description is a JSON string on Android; only its plain reason is shown. */
function describeError(error: unknown) {
  const raw = (error as { description?: string })?.description;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as { error?: { description?: string } };
      if (parsed?.error?.description) return parsed.error.description;
    } catch {
      if (raw.length < 160) return raw;
    }
  }
  return 'The payment did not go through.';
}
