// react-native-razorpay ships no TypeScript declarations; only the API this app uses is typed.
declare module 'react-native-razorpay' {
  type RazorpayOpenOptions = {
    key: string;
    order_id: string;
    amount: number;
    currency: string;
    name?: string;
    description?: string;
    image?: string;
    prefill?: { name?: string; email?: string; contact?: string };
    theme?: { color?: string };
  };

  const RazorpayCheckout: {
    /** Resolves with { razorpay_payment_id, razorpay_order_id, razorpay_signature }; rejects with { code, description }. */
    open(options: RazorpayOpenOptions): Promise<unknown>;
  };
  export default RazorpayCheckout;
}
