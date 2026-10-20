// Re-export shim: the implementation moved to `components/currency-summary/` (ETP-5778) so the
// Receipts / Payments list sidebar can share it with Cuentas.
export {
  APPROXIMATE_PREFIX,
  BALANCE_TYPOGRAPHY,
  buildBalanceDisplay,
} from '@/components/currency-summary/balanceDisplay.js';
