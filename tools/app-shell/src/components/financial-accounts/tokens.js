/**
 * Design tokens for the Cuentas (Financial Accounts) page.
 * Extracted from the Figma frame `3012:25602` in file `UqMboGO6t73CwmFhVnDmuB`.
 *
 * Tokens are exposed as Tailwind-friendly hex strings so call sites can use
 * arbitrary-value classes (e.g. `bg-[${COLORS.bgGray50}]`) when no named token
 * exists in the global theme.
 */

export const COLORS = {
  textPrimary: '#121217',
  textGray700: '#3f3f50',
  textSecondary: '#6c6c89',
  placeholder: '#8a8aa3',

  bgWhite: '#ffffff',
  bgGray50: '#f5f7f9',
  divider: '#e8eaef',
  outline: '#d1d4db',

  redStrong: '#d50b3e',
  redBright: '#f3164e',
  greenStrong: '#26a95f',
  greenText: '#17663a',
  greenSoftBg: '#eefbf4',
  yellow: '#faaf00',
  purple: '#7047eb',

  brand: '#ffd500',
  onBrand: '#3e3505',
};

export const SHADOWS = {
  xs: '0 1px 2px rgba(18, 18, 23, 0.05)',
};

export const RADII = {
  none: 0,
  md: 8,
  pill: 360,
};

/** Account type values stored in {@code FIN_Financial_Account.Type}. */
export const ACCOUNT_TYPE = {
  BANK: 'B',
  CASH: 'C',
  CARD: 'CA',
};

export const ACCOUNT_TYPE_ORDER = [ACCOUNT_TYPE.BANK, ACCOUNT_TYPE.CASH, ACCOUNT_TYPE.CARD];

// Movement payment statuses from Etendo backend reference list.
// Backend search_keys — do NOT rename these; they must match FIN_Payment.Status values.
// Follow-up: once /sws/neo/reference/payment-status exists, these can be fetched dynamically.
export const MOVEMENT_STATUS_FAMILY = {
  PENDING: 'pending',
  VOIDED: 'voided',
  CLEARED: 'cleared',
  IN_TRANSIT: 'inTransit',
  EXECUTED: 'executed',
  UNRECONCILED: 'unreconciled',
};

export const MOVEMENT_STATUS_TONE = {
  pending:      { bg: '#FFF7E0', text: '#7A5A00', border: '#FAAF00' },
  voided:       { bg: '#F5F7F9', text: '#6C6C89', border: '#D1D4DB' },
  cleared:      { bg: '#EEFBF4', text: '#17663A', border: '#26A95F' },
  inTransit:    { bg: '#FFF1D6', text: '#8C5A00', border: '#E68A00' },
  executed:     { bg: '#EFEAFE', text: '#3D2D8E', border: '#7047EB' },
  unreconciled: { bg: '#F5F7F9', text: '#6C6C89', border: '#D1D4DB' },
};
