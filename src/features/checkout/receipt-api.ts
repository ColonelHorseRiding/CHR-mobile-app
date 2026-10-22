import { supabase } from '@/services/supabase/client';

import { parseReceipt, type Receipt } from './receipt-logic';

/**
 * my_receipt(p_order_id): returns the receipt for one of the signed-in member's own paid orders.
 * The server checks ownership (staff aside); anyone else gets the same "not found" as for an order
 * with no receipt, so this can't be used to probe other members' orders. Read-only.
 */
const TIMEOUT_MS = 15_000;

export type ReceiptResult = { kind: 'ok'; receipt: Receipt } | { kind: 'none' } | { kind: 'error' };

export async function fetchReceipt(orderId: string): Promise<ReceiptResult> {
  if (!supabase) return { kind: 'error' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { data, error } = await supabase.rpc('my_receipt', { p_order_id: orderId }).abortSignal(controller.signal);
    if (error) return /RECEIPT_NOT_FOUND/.test(error.message) ? { kind: 'none' } : { kind: 'error' };
    const receipt = parseReceipt(data);
    return receipt ? { kind: 'ok', receipt } : { kind: 'none' };
  } catch {
    return { kind: 'error' };
  } finally {
    clearTimeout(timer);
  }
}
