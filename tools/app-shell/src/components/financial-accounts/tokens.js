/**
 * Design tokens for the Cuentas (Financial Accounts) page.
 * Extracted from the Figma frame `3012:25602` in file `UqMboGO6t73CwmFhVnDmuB`.
 *
 * Tokens are semantic CSS values supplied by the active app-shell theme.
 */

export const COLORS = {
  textPrimary: 'hsl(var(--foreground))',
  textGray700: 'hsl(var(--muted-foreground))',
  textSecondary: 'hsl(var(--muted-foreground))',
  placeholder: 'hsl(var(--text-disabled))',

  bgWhite: 'hsl(var(--card))',
  bgGray50: 'hsl(var(--muted))',
  divider: 'hsl(var(--border-subtle))',
  outline: 'hsl(var(--border-control))',

  redStrong: 'hsl(var(--destructive))',
  redBright: 'hsl(var(--destructive))',
  greenStrong: 'var(--status-success-fg)',
  greenText: 'var(--status-success-fg)',
  greenSoftBg: 'var(--status-success-bg)',
  yellow: 'var(--status-warning-fg)',
  purple: 'hsl(var(--primary))',

  brand: 'hsl(var(--primary))',
  onBrand: 'hsl(var(--primary-foreground))',
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
  pending:      { bg: 'var(--status-warning-bg)', text: 'var(--status-warning-fg)', border: 'var(--status-warning-border)' },
  voided:       { bg: 'hsl(var(--muted))', text: 'hsl(var(--muted-foreground))', border: 'hsl(var(--border-control))' },
  cleared:      { bg: 'var(--status-success-bg)', text: 'var(--status-success-fg)', border: 'var(--status-success-border)' },
  inTransit:    { bg: 'var(--status-warning-bg)', text: 'var(--status-warning-fg)', border: 'var(--status-warning-border)' },
  executed:     { bg: 'var(--status-info-bg)', text: 'var(--status-info-fg)', border: 'var(--status-info-border)' },
  unreconciled: { bg: 'hsl(var(--muted))', text: 'hsl(var(--muted-foreground))', border: 'hsl(var(--border-control))' },
};
