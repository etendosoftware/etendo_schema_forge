import { formatGroupedNumber } from '@/lib/formatCurrency';

/**
 * Formats a stock quantity with the instance separators and up to 2 decimals
 * (12.5 kg -> "12,5", 1080 -> "1.080"). Shared by the product sidebar and the
 * movements tab so both agree.
 */
export const formatStockQuantity = (n) => formatGroupedNumber(n, { maximumFractionDigits: 2 });
