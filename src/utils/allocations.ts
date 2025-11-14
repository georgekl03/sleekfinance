import { formatCurrency } from './format';

export const formatAllocationNativeSummary = (nativeAmounts: Record<string, number>) => {
  const entries = Object.entries(nativeAmounts);
  if (!entries.length) {
    return '—';
  }
  return entries
    .map(([currency, amount]) => `${formatCurrency(amount, currency)} ${currency}`)
    .join(' · ');
};
