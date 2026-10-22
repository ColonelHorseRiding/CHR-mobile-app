import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { formatINR, spokenINR } from '@/features/store/format';
import { Spacing } from '@/theme';

import { fetchReceipt } from './receipt-api';
import { businessLines, type Receipt } from './receipt-logic';

/**
 * The member's payment receipt for a paid order, read through the owner-only my_receipt() RPC.
 * Shown only once the server has confirmed the payment. Shows nothing when there is no receipt
 * (for example an order paid before receipts existed) or while it can't be loaded: it never
 * blocks the order screen and never shows invented values.
 */
export function ReceiptCard({ orderId, formatDateTime }: { orderId: string; formatDateTime: (iso: string) => string }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchReceipt(orderId).then((result) => {
      if (!cancelled && result.kind === 'ok') setReceipt(result.receipt);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (!receipt) return null;
  // Amounts are formatted as rupees only for INR; another currency keeps its own code.
  const money = (n: number) => (receipt.currency === 'INR' ? formatINR(n) : `${receipt.currency} ${n.toFixed(2)}`);
  const spoken = (n: number) => (receipt.currency === 'INR' ? spokenINR(n) : `${n.toFixed(2)} ${receipt.currency}`);

  return (
    <Card style={styles.card} accessibilityLabel={`Payment receipt ${receipt.receiptNumber}`}>
      <ThemedText variant="eyebrow" themeColor="accentText" accessibilityRole="header">
        Payment receipt
      </ThemedText>
      <Line label="Receipt number" value={receipt.receiptNumber} selectable />
      <Line label="Paid on" value={formatDateTime(receipt.paidAt)} />
      {receipt.items.map((item, index) => (
        <Line
          key={`${item.name}-${index}`}
          label={`${item.name} × ${item.quantity}`}
          value={money(item.unitPrice * item.quantity)}
          spoken={`${item.quantity} ${item.name}, ${spoken(item.unitPrice * item.quantity)}`}
        />
      ))}
      <Line label="Amount paid" value={money(receipt.amount)} spoken={spoken(receipt.amount)} strong />
      {receipt.paymentReference ? <Line label="Payment reference" value={receipt.paymentReference} selectable /> : null}
      <Line label="Order reference" value={receipt.orderReference} selectable />
      <Line label="Status" value="Paid" />
      <View style={styles.foot}>
        {businessLines(receipt).map((line) => (
          <ThemedText key={line} variant="caption" themeColor="textSecondary">
            {line}
          </ThemedText>
        ))}
        <ThemedText variant="caption" themeColor="textSecondary">
          Payment receipt — not a tax invoice.
        </ThemedText>
      </View>
    </Card>
  );
}

function Line({ label, value, spoken, selectable, strong }: { label: string; value: string; spoken?: string; selectable?: boolean; strong?: boolean }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${spoken ?? value}`}>
      <ThemedText themeColor="textSecondary">{label}</ThemedText>
      <ThemedText variant="bodyStrong" style={[styles.value, strong ? styles.strong : null]} selectable={selectable}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: Spacing.md },
  value: { flexShrink: 1, textAlign: 'right' },
  strong: { fontSize: 17 },
  foot: { gap: 2, marginTop: Spacing.xs },
});
