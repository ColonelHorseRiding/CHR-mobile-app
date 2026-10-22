/**
 * Digital receipt, as the server returns it from my_receipt(p_order_id).
 * The server copies these values from the verified payment row; the app only displays them.
 * It is always a PAYMENT RECEIPT: the server never produces tax amounts or a tax-invoice number,
 * and the app never adds any.
 */
export type Receipt = {
  receiptNumber: string;
  paidAt: string;
  amount: number;
  currency: string;
  paymentReference: string | null;
  orderReference: string;
  items: { name: string; quantity: number; unitPrice: number }[];
  business: {
    name: string;
    address: string | null;
    gstin: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
};

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Validates the server's JSON. Anything that is not a complete payment receipt is rejected (null). */
export function parseReceipt(raw: unknown): Receipt | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  if (r.document_type !== 'payment_receipt') return null;
  const amount = Number(r.amount);
  const receiptNumber = text(r.receipt_number);
  const paidAt = text(r.paid_at);
  const currency = text(r.currency);
  const orderReference = text(r.order_reference);
  if (!receiptNumber || !paidAt || !currency || !orderReference || !Number.isFinite(amount) || amount <= 0) return null;
  const biz = (r.business ?? {}) as Record<string, unknown>;
  return {
    receiptNumber,
    paidAt,
    amount,
    currency,
    paymentReference: text(r.payment_reference),
    orderReference,
    items: (Array.isArray(r.items) ? r.items : []).map((i: Record<string, unknown>) => ({
      name: String(i.name ?? ''),
      quantity: Number(i.quantity) || 1,
      unitPrice: Number(i.unit_price) || 0,
    })),
    business: {
      name: text(biz.name) ?? 'Colonel Horse Riding Club',
      address: text(biz.address),
      gstin: text(biz.gstin),
      contactEmail: text(biz.contact_email),
      contactPhone: text(biz.contact_phone),
    },
  };
}

/** Business lines for the foot of the receipt. Only what the club has actually configured. */
export function businessLines(r: Receipt): string[] {
  const b = r.business;
  return [b.name, b.address, b.gstin ? `GSTIN ${b.gstin}` : null, b.contactEmail, b.contactPhone].filter((l): l is string => !!l);
}
