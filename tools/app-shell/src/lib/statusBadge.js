/**
 * Canonical business-flow ordering for document/payment status codes,
 * independent of data-source arrival order (in-memory rows vs. backend
 * distinct-values fetch). Buckets follow: Temporary -> Draft -> In process ->
 * Awaiting -> Completed -> Re-opened -> Closed -> Voided -> Unknown.
 * Codes not listed here are unknown to this catalog and are sorted
 * alphabetically after all known codes (see compareStatusCodes).
 *
 * ETP-4913 added the remaining real docstatus codes (TMP/TEMP, NC, AE, ME, WP,
 * RE, NA and the '??' sentinel), which previously fell into the alphabetical
 * tail — the "??, NA, RE, TEMP, WP" clump the user saw as an illogical order.
 *
 * Kept byte-identical to the core copy
 * (@etendosoftware/app-shell-core/lib/statusBadge.js), which the advanced
 * filter's value picker uses; statusBadge.coreParity.test.js fails the build if
 * the two drift apart, so the "All statuses" pill and that picker can never
 * disagree for the same column.
 */
export const STATUS_ORDER = [
  // Temporary / pre-draft
  'TMP', 'TEMP',
  // Draft / not started
  'DR', 'DRAFT', 'FALSE', 'N', 'NC',
  // In process / under evaluation
  'IP', 'M', 'UE', 'AE', 'ME', 'RPAE',
  // Awaiting
  'RPAP', 'WP',
  // Completed
  'CO', 'CA', 'ETGO_CI', 'TRUE', 'Y', 'YES', 'PROCESSED',
  'RPR', 'RPPC', 'PPM', 'PWNC', 'RDNC',
  // Re-opened after completion (back in the flow, before terminal Closed)
  'RE',
  // Closed
  'CL', 'PA',
  // Rejected / voided
  'NA', 'CJ', 'VO', 'RPVOID', 'ETGOERR', 'P',
  // Unknown sentinel — always last among the known codes
  '??',
];

/**
 * Deterministic comparator for status codes, used to keep the "All
 * statuses" dropdown order fixed across re-renders — regardless of whether
 * codes came first from in-memory rows or from the (uncached) backend
 * distinct-values fetch resolving later. Known codes follow STATUS_ORDER;
 * unknown codes are pushed to the end, sorted alphabetically so they are
 * still stable relative to each other.
 */
export function compareStatusCodes(a, b) {
  const normalize = (c) => String(c ?? '').toUpperCase();
  const na = normalize(a);
  const nb = normalize(b);
  const ia = STATUS_ORDER.indexOf(na);
  const ib = STATUS_ORDER.indexOf(nb);
  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  if (na < nb) return -1;
  if (na > nb) return 1;
  return 0;
}

/**
 * Map a status code to one of the 4 Figma semantic tones.
 * Used by StatusTag (grid). Does NOT affect DetailView.
 */
export function getStatusTone(status) {
  const s = String(status ?? '').toLowerCase();
  if (
    s === 'co' || s === 'ca' || s === 'etgo_ci' || s === 'pa' || s === 'rppc' ||
    s === 'pwnc' || s === 'rdnc' || s === 'o' ||
    s === 'completed' || s === 'complete' || s === 'confirmed' || s === 'booked' ||
    s === 'paid' || s === 'true' || s === 'processed' || s === 'y' || s === 'yes'
  ) return 'success';
  if (s === 'rpr' || s === 'rpae') return 'success';
  // PPM ("Payment Made") is confirmed but NOT withdrawn from the account, so it is amber, not
  // green: for a PIS transfer it is the state between the bank authorizing and the money moving.
  // See STATUS_PAYMENT_MADE in windows/custom/shared/paymentStatuses.js (ETP-4895).
  if (
    s === 'ip' || s === 'ue' || s === 'm' || s === 'ppm' ||
    s === 'in process' || s === 'under evaluation'
  ) return 'warning';
  if (s === 'rpap') return 'neutral';
  if (
    s === 'vo' || s === 'cj' || s === 'rpvoid' || s === 'rpvd' || s === 'p' ||
    s === 'etgoerr' ||
    s === 'voided' || s === 'cancelled' || s === 'void' || s === 'rejected'
  ) return 'destructive';
  return 'neutral';
}

/**
 * Map a document status string to Badge component props.
 * Shared between DataTable and DetailView.
 */
export function getStatusBadgeProps(status) {
  const s = String(status ?? '').toLowerCase();
  if (s === 'true' || s === 'processed') {
    // Explicit hover override — Badge's variant="default" bakes in
    // hover:bg-primary/80, which otherwise wins on :hover since nothing
    // else in this className competes with that hover modifier (ETP-4856).
    return { variant: 'default', className: 'border-status-success-border bg-status-success text-status-success-foreground hover:bg-status-success' };
  }
  if (s === 'false' || s === 'not processed') {
    return { variant: 'secondary' };
  }
  if (s === 'draft' || s === 'dr') {
    return { variant: 'secondary' };
  }
  if (s === 'completed' || s === 'complete' || s === 'booked' || s === 'co' || s === 'ca' || s === 'etgo_ci' || s === 'rppc' || s === 'pwnc' || s === 'rdnc') {
    // Same hover fix as above — this is the "Cerrado - Pedido creado" (CA) case.
    return { variant: 'default', className: 'border-status-success-border bg-status-success text-status-success-foreground hover:bg-status-success' };
  }
  if (s === 'closed' || s === 'cl' || s === 'paid' || s === 'pa') {
    return { variant: 'default', className: 'border-status-info-border bg-status-info text-status-info-foreground' };
  }
  if (s === 'voided' || s === 'cancelled' || s === 'void' || s === 'vo' || s === 'cj' || s === 'rejected' || s === 'rpvoid' || s === 'etgoerr') {
    return { variant: 'destructive' };
  }
  if (s === 'in process' || s === 'ip' || s === 'ppm' || s === 'rpae' || s === 'rpr' || s === 'under evaluation' || s === 'ue') {
    return { variant: 'outline', className: 'border-status-warning-border bg-status-warning text-status-warning-foreground' };
  }
  if (s === 'rpap') {
    return { variant: 'outline', className: 'border-border-subtle bg-muted text-muted-foreground' };
  }
  return { variant: 'outline' };
}

export function getStatusDotColor(status) {
  const s = String(status ?? '').toLowerCase();
  if (s === 'true' || s === 'processed') return 'bg-status-success-foreground';
  if (s === 'false' || s === 'not processed') return 'bg-status-neutral-foreground';
  if (s === 'draft' || s === 'dr') return 'bg-status-neutral-foreground';
  if (s === 'completed' || s === 'complete' || s === 'booked' || s === 'co' || s === 'ca' || s === 'etgo_ci' || s === 'rppc' || s === 'pwnc' || s === 'rdnc') return 'bg-status-success-foreground';
  if (s === 'closed' || s === 'cl' || s === 'paid' || s === 'pa') return 'bg-status-info-foreground';
  if (s === 'voided' || s === 'cancelled' || s === 'void' || s === 'vo' || s === 'cj' || s === 'rejected' || s === 'rpvoid' || s === 'etgoerr') return 'bg-destructive';
  if (s === 'in process' || s === 'ip' || s === 'ppm' || s === 'rpae' || s === 'rpr' || s === 'under evaluation' || s === 'ue') return 'bg-status-warning-foreground';
  if (s === 'rpap') return 'bg-status-neutral-foreground';
  return 'bg-status-neutral-foreground';
}

export function getStatusPillClass(status) {
  const s = String(status ?? '').toLowerCase();
  if (s === 'true' || s === 'processed') return 'bg-status-success text-status-success-foreground';
  if (s === 'false' || s === 'not processed') return 'bg-muted text-foreground';
  if (s === 'draft' || s === 'dr') return 'bg-muted text-foreground';
  if (s === 'completed' || s === 'complete' || s === 'confirmed' || s === 'booked' || s === 'co' || s === 'ca' || s === 'etgo_ci' || s === 'rppc' || s === 'pwnc' || s === 'rdnc') return 'bg-status-success text-status-success-foreground';
  if (s === 'closed' || s === 'cl' || s === 'paid' || s === 'pa') return 'bg-status-info text-status-info-foreground';
  if (s === 'voided' || s === 'cancelled' || s === 'void' || s === 'vo' || s === 'cj' || s === 'rejected' || s === 'rpvoid' || s === 'etgoerr') return 'bg-destructive/10 text-destructive';
  if (s === 'in process' || s === 'ip' || s === 'ppm' || s === 'rpae' || s === 'rpr') return 'bg-status-warning text-status-warning-foreground';
  if (s === 'rpap') return 'bg-muted text-foreground';
  if (s === 'under evaluation' || s === 'ue') return 'bg-status-info text-status-info-foreground';
  return 'bg-muted text-foreground';
}

export function getStatusGridPillClass(status) {
  const s = String(status ?? '').toLowerCase();
  if (s === 'true' || s === 'processed') return 'bg-status-success text-status-success-foreground';
  if (s === 'false' || s === 'not processed') return 'bg-muted text-foreground';
  if (s === 'draft' || s === 'dr') return 'bg-muted text-muted-foreground border border-border-control';
  if (s === 'completed' || s === 'complete' || s === 'confirmed' || s === 'booked' || s === 'co' || s === 'ca' || s === 'etgo_ci' || s === 'rppc' || s === 'pwnc' || s === 'rdnc') return 'bg-status-success text-status-success-foreground';
  if (s === 'closed' || s === 'cl' || s === 'paid' || s === 'pa') return 'bg-status-info text-status-info-foreground';
  if (s === 'voided' || s === 'cancelled' || s === 'void' || s === 'vo' || s === 'cj' || s === 'rejected' || s === 'rpvoid' || s === 'etgoerr') return 'bg-destructive text-destructive-foreground';
  if (s === 'in process' || s === 'ip' || s === 'ppm' || s === 'rpae' || s === 'rpr') return 'bg-status-warning text-status-warning-foreground';
  if (s === 'rpap') return 'bg-muted text-muted-foreground border border-border-control';
  if (s === 'under evaluation' || s === 'ue') return 'bg-status-info text-status-info-foreground';
  return 'bg-muted text-muted-foreground border border-border-control';
}

/**
 * Resolves a column-declared enumLabels entry as an i18n key.
 * Returns the localized string when the declared value resolves via genericLabels or translate;
 * returns null when it does not resolve (literal label — must fall through to the MAP path).
 * Keeping this logic here avoids +2 decision points inside statusLabel.
 */
function resolveEnumLabel(status, dictionary, translate, enumLabels) {
  if (!enumLabels) return null;
  const declared = enumLabels[status];
  if (declared == null) return null;
  // Resolve the declared value as an i18n key. If it does NOT resolve (it is a
  // literal AD label, not a key), return null so the caller falls through to the
  // dictionary/MAP logic. Only i18n-key enumLabels (e.g. statusProcessed/statusDraft)
  // short-circuit here.
  if (dictionary?.genericLabels?.[declared]) return dictionary.genericLabels[declared];
  if (translate) {
    const translated = translate(declared);
    if (translated && translated !== declared) return translated;
  }
  return null;
}

export function statusLabel(status, dictionary, translate, enumLabels) {
  // 0. Column-declared enumLabels win (i18n-key values only — literals fall through).
  const fromEnum = resolveEnumLabel(status, dictionary, translate, enumLabels);
  if (fromEnum != null) return fromEnum;

  // 1. DB-sourced translation from AD_Ref_List_Trl (via extract-labels.js)
  if (dictionary?.statuses?.[status]?.label) return dictionary.statuses[status].label;

  // 2. Manually authored genericLabels fallback
  const MAP = {
    // Boolean processed fields
    true: 'Processed', false: 'Not Processed',
    Y: 'statusProcessed', N: 'statusDraft',
    // Document statuses
    DR: 'statusDraft', CO: 'statusComplete', VO: 'statusVoid', IP: 'statusInProcess',
    CL: 'statusClosed', PA: 'statusPaid', UE: 'statusUnderEvaluation', CA: 'statusOrderCreated',
    CJ: 'statusRejected', ETGO_CI: 'statusInvoiceCreated',
    // Payment statuses
    RPR: 'statusPaymentReceived', RPAE: 'statusAwaitingExecution', RPAP: 'statusAwaitingPayment',
    RPPC: 'statusPaymentCleared', RPVOID: 'statusVoid', ETGOERR: 'cpPaymentStateError',
    PPM: 'statusPaymentMade', PWNC: 'statusWithdrawnNotCleared', RDNC: 'statusDepositedNotCleared',
  };
  const key = MAP[status];
  if (!key) return status;
  if (dictionary?.genericLabels?.[key]) return dictionary.genericLabels[key];

  // 3. i18n translate function (e.g. ui() from useUI hook)
  if (translate) {
    const translated = translate(key);
    if (translated && translated !== key) return translated;
  }

  // 4. Last resort: humanize the key name
  return key.replace('status', '').replace(/([A-Z])/g, ' $1').trim();
}
