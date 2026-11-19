import { formatGroupedNumber } from '@/lib/formatCurrency.js';

/** Rates are shown with 4 decimals everywhere in this window (story ETP-6365). */
export const RATE_DIGITS = { minimumFractionDigits: 4, maximumFractionDigits: 4 };

/** A rate as displayed: grouped with the instance separators, 4 decimals. */
export function formatRate(value) {
  return formatGroupedNumber(value, RATE_DIGITS);
}
