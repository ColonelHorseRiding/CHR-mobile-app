/**
 * Formats an amount in Indian rupees with Indian digit grouping, e.g.
 * 15000 → "₹15,000", 125000 → "₹1,25,000", 2000.5 → "₹2,000.50".
 * Implemented directly rather than via Intl, whose en-IN support varies across
 * Hermes builds.
 */
export function formatINR(amount: number) {
  const negative = amount < 0;
  const fixed = Math.abs(amount).toFixed(2);
  const [whole, paise] = fixed.split('.');
  const lastThree = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}` : lastThree;
  return `${negative ? '-' : ''}₹${grouped}${paise === '00' ? '' : `.${paise}`}`;
}

/** Spoken form for screen readers, e.g. "15,000 rupees". */
export function spokenINR(amount: number) {
  return `${formatINR(amount).replace('₹', '')} rupees`;
}

export function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** "14 Nov 2026" for an ISO date (YYYY-MM-DD), without timezone shifts. */
export function formatDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (!year || !month || !day) return isoDate;
  return `${day} ${months[month - 1]} ${year}`;
}
