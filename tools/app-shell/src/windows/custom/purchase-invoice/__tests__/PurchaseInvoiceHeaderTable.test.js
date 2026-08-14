import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'PurchaseInvoiceHeaderTable.jsx'), 'utf8');

// Matches both arrow-expression form useMemo(() => [...], []) and block-body form
// useMemo(() => { ... return [...]; }, [...]) — the source was refactored to the latter.
const columnsBlock =
  src.match(/const columns = useMemo\(\(\) => \{[\s\S]*?return \[([\s\S]*?)\];\s*\}/) ||
  src.match(/const columns = useMemo\(\(\) => \[([\s\S]*?)\], \[/);

const expectedKeysInOrder = [
  'invoiceDate',
  'transactionDocument',
  'orderReference',
  'eTGODueDate',
  'businessPartner',
  'documentStatus',
  'posted',
  'grandTotalAmount',
  'outstandingAmount',
  'eTGODeliveryStatus',
];

describe('PurchaseInvoiceHeaderTable — columns', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function PurchaseInvoiceHeaderTable/);
  });

  it('declares the columns array', () => {
    assert.ok(columnsBlock, 'expected `const columns = useMemo(() => [...], [])` block');
  });

  it('renders the ten expected columns in order (transactionDocument is visible badge + type filter)', () => {
    const block = columnsBlock[1];
    const keys = [...block.matchAll(/key:\s*'([^']+)'/g)].map(m => m[1]);
    assert.deepEqual(keys, expectedKeysInOrder);
  });

  it('binds each column to the right AD column name', () => {
    assert.match(src, /key: 'invoiceDate', column: 'DateInvoiced'/);
    assert.match(src, /key: 'orderReference', column: 'POReference'/);
    assert.match(src, /key: 'eTGODueDate', column: 'EM_Etgo_Due_Date'/);
    assert.match(src, /key: 'businessPartner', column: 'C_BPartner_ID'/);
    assert.match(src, /key: 'documentStatus', column: 'DocStatus'/);
    assert.match(src, /key: 'grandTotalAmount', column: 'GrandTotal'/);
    assert.match(src, /key: 'outstandingAmount',\s+column: 'OutstandingAmt'/);
    assert.match(src, /key: 'eTGODeliveryStatus', column: 'em_etgo_delivery_status'/);
  });

  it('renders delivery status as a percent progress bar', () => {
    assert.match(
      src,
      /key: 'eTGODeliveryStatus'.*type: 'percent'/,
      'eTGODeliveryStatus must use type: "percent" so DataTable renders the progress bar',
    );
  });

  it('does NOT use isTypeFilter — type filtering is handled by subsetFilters in index.jsx', () => {
    assert.doesNotMatch(src, /isTypeFilter:\s*true/,
      'isTypeFilter was replaced by subsetFilters pills in the window index (ETP-4036)');
    assert.doesNotMatch(src, /backendFilterKey:\s*'transactionDocument\$_identifier'/);
  });

  // ETP-4737: SUBTYPE_BADGE is keyed by the unified subtype (FAC/RECTIFICATIVA)
  // resolved via getApSubtype — purchases collapse credit-memo AND return/reversal
  // doc types into a single RECTIFICATIVA badge (there is no separate returnInvoiceTab
  // badge on the purchase side, unlike sales-invoice which does distinguish returns).
  it('uses SUBTYPE_BADGE with i18n label keys for the AP doc subtypes', () => {
    assert.match(src, /label:\s*'invoicesTab'/);
    assert.match(src, /label:\s*'rectificativeInvoicesTab'/);
  });

  it('resolves the badge subtype via getApSubtype, not a hardcoded doc-type name', () => {
    assert.match(src, /import \{ getApSubtype \} from '@generated\/purchase-invoice\/custom\/purchaseInvoiceSubtype\.js'/);
    assert.match(src, /SUBTYPE_BADGE\[getApSubtype\(row\)\]/);
  });
});

// ── ETP-4125: fiscal status read directly from row data ──────────────────────
// Risk: regression to batch GET hook would silently reintroduce the nginx URL
// length issue (403 on 53+ invoices).

describe('PurchaseInvoiceHeaderTable — fiscal status columns (ETP-4125)', () => {
  it('does NOT import useInvoiceListFiscalStatus (batch hook eliminated)', () => {
    assert.doesNotMatch(src, /useInvoiceListFiscalStatus/,
      'The batch-fetch hook was removed in ETP-4125 to fix nginx URL-length errors');
  });

  it('reads SII status directly from row.aeatsiiEstado', () => {
    assert.match(src, /row\.aeatsiiEstado/,
      'SII status must come from the row field, not a separate fetch');
  });

  it('does not render a Verifactu column (purchase invoices only have SII)', () => {
    assert.doesNotMatch(src, /row\.etvfacInvoiceStatus/,
      'Verifactu is sales-only — purchase invoices must not render an etvfacInvoiceStatus column');
  });

  it('does not maintain a statusMap or fiscalLoading variable', () => {
    assert.doesNotMatch(src, /statusMap/);
    assert.doesNotMatch(src, /fiscalLoading/);
  });
});

describe('PurchaseInvoiceHeaderTable — due date column', () => {
  it('reads eTGODueDate from the row (no payment-plan fetch)', () => {
    assert.match(src, /const d = row\.eTGODueDate/);
    assert.doesNotMatch(src, /paymentPlan\?parentId/, 'payment-plan fetch was retired in ETP-3873');
  });

  it('shows POReference as the list document number column', () => {
    assert.match(src, /key: 'orderReference', column: 'POReference'/);
  });

  it('feeds outstandingAmount into the due-date state', () => {
    assert.match(src, /getDueDateState\(d, row\.outstandingAmount\)/);
  });

  it('shows a dash when no due date is available', () => {
    assert.match(src, /text-muted-foreground/);
  });

  it('uses the dueDate generic label key', () => {
    assert.match(src, /t\('dueDate'\)/);
  });

  it('formats the date with the active locale, not a hardcoded region', () => {
    assert.match(src, /useLocaleSwitch/);
    assert.match(src, /formatCalendarDate\(d, locale\)/);
  });
});

// ── ETP-4681: custom-rendered columns must declare their filter semantics ─────
// Risk: `type: 'custom'` tells the filter layer nothing about the underlying
// data type, so resolveFilterMode falls back to 'text'. A text-mode operator
// set has no greaterThan / before / after, which makes the Dashboard's
// `?filter=overdue` preload render an empty operator select.

describe('PurchaseInvoiceHeaderTable — custom column filter modes (ETP-4681)', () => {
  it('declares filterMode numeric on the outstandingAmount column', () => {
    assert.match(
      src,
      /key: 'outstandingAmount',[\s\S]{0,600}?filterMode: 'numeric'/,
      'outstandingAmount renders status pills (type: custom) but filters as an amount',
    );
  });

  // ETP-4841 dropped the custom renderer on grandTotalAmount (it sign-flipped
  // every rectificativa), so the column is a plain `type: 'amount'` again and
  // needs no filterMode hint — resolveFilterMode infers numeric from the type.
  it('leaves grandTotalAmount on type amount (no explicit filterMode needed)', () => {
    assert.match(
      src,
      /key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount'/,
      'type amount already infers numeric — only custom columns need filterMode',
    );
    assert.doesNotMatch(
      src,
      /key: 'grandTotalAmount',[\s\S]{0,600}?filterMode:/,
      'a plain amount column must not carry a redundant filterMode hint',
    );
  });

  it('declares filterMode date on the eTGODueDate column', () => {
    assert.match(
      src,
      /key: 'eTGODueDate',[\s\S]{0,600}?filterMode: 'date'/,
      'eTGODueDate renders a coloured dot (type: custom) but filters as a date',
    );
  });

  it('keeps the two rich-render columns on type custom (the cell renderers stay)', () => {
    assert.match(src, /key: 'outstandingAmount',\s+column: 'OutstandingAmt',\s+type: 'custom'/);
    assert.match(src, /key: 'eTGODueDate', column: 'EM_Etgo_Due_Date', type: 'custom'/);
  });

  it('declares exactly one filterMode per custom column (no duplicates)', () => {
    const modes = [...src.matchAll(/filterMode: '([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(modes.filter((m) => m === 'numeric').length, 1);
    assert.deepEqual(modes.filter((m) => m === 'date').length, 1);
  });
});

// ── ETP-4841: payment state follows the SIGN of the total ────────────────────
// Two defects shipped from keying the credit branch on the document type:
//   * a Factura Rectificativa with a POSITIVE total rendered as "Saldo a favor"
//     AND had its amount sign-flipped to negative by the grandTotalAmount cell;
//   * an ordinary Factura with a NEGATIVE total rendered as "Pagada".
// Both are now decided by resolveInvoicePaymentBadge; getApSubtype survives only
// as the doc-type badge's input.

describe('PurchaseInvoiceHeaderTable — sign-driven payment badge (ETP-4841)', () => {
  it('imports the shared resolveInvoicePaymentBadge helper', () => {
    assert.match(
      src,
      /import \{ resolveInvoicePaymentBadge \} from '@\/windows\/custom\/shared\/invoicePaymentBadge\.js'/,
      'the badge state must come from the single shared source of truth',
    );
  });

  it('no longer declares a local isNcOrReturn document-type predicate', () => {
    assert.doesNotMatch(
      src,
      /isNcOrReturn/,
      'the local doc-type predicate was replaced by resolveInvoicePaymentBadge (ETP-4841)',
    );
  });

  it('never sign-flips an amount', () => {
    // Strip `//` comments first: the source explains the removed `-Math.abs(...)`
    // in a comment, and that explanation must not satisfy the assertion.
    const code = src.replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(
      code,
      /-Math\.abs\(/,
      'the stored sign is the truth — `-Math.abs(...)` rendered a POSITIVE Factura Rectificativa as negative',
    );
  });

  it('drives the outstanding cell off badge.kind, not getApSubtype', () => {
    const cell = src.match(/key: 'outstandingAmount',[\s\S]*?key: 'eTGODeliveryStatus'/);
    assert.ok(cell, 'expected the outstandingAmount column block');
    assert.match(cell[0], /const badge = resolveInvoicePaymentBadge\(row\)/);
    assert.match(cell[0], /badge\.kind === 'draft'/);
    assert.match(cell[0], /badge\.kind === 'credit-applied'/);
    assert.match(cell[0], /badge\.kind === 'credit-available'/);
    assert.match(cell[0], /badge\.kind === 'paid'/);
    assert.doesNotMatch(cell[0], /getApSubtype/);
  });

  it('drives the due-date cell off badge.isCredit, not getApSubtype', () => {
    const cell = src.match(/key: 'eTGODueDate',[\s\S]*?key: 'businessPartner'/);
    assert.ok(cell, 'expected the eTGODueDate column block');
    assert.match(cell[0], /resolveInvoicePaymentBadge\(row\)\.isCredit/);
    assert.doesNotMatch(cell[0], /getApSubtype/);
  });

  it('keeps getApSubtype for the document-type badge only', () => {
    assert.match(src, /SUBTYPE_BADGE\[getApSubtype\(row\)\]/);
    const occurrences = [...src.matchAll(/getApSubtype\(/g)].length;
    assert.equal(occurrences, 1, 'getApSubtype must be called exactly once — by the doc-type badge cell');
  });

  it('renders the credit labels through i18n, not hardcoded Spanish literals', () => {
    assert.match(src, /ui\('cpFavorBadge'\)/);
    assert.match(src, /ui\('cpCreditFullyApplied'\)/);
    // Strip `//` comments: the source still *describes* the badge as
    // "Saldo a favor" in prose, which must not fail this assertion.
    const code = src.replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /Saldo a favor/, 'the badge label must come from ui(), not a literal');
    assert.doesNotMatch(code, />Aplicada/, 'the applied pill label must come from ui(), not a literal');
  });
});
