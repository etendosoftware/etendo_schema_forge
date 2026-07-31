import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'InvoiceHeaderTable.jsx'), 'utf8');

// Extract the columns array literal so order-sensitive assertions don't have
// to fight the surrounding JSX or render closures.
const columnsBlock =
  src.match(/const columns = useMemo\(\(\) => \{[\s\S]*?return \[([\s\S]*?)\];\s*\}/) ||
  src.match(/const columns = useMemo\(\(\) => \[([\s\S]*?)\], \[/);

const expectedKeysInOrder = [
  'invoiceDate',
  'transactionDocument',
  'documentNo',
  'eTGODueDate',
  'businessPartner',
  'documentStatus',
  'posted',
  'grandTotalAmount',
  'outstandingAmount',
  'eTGODeliveryStatus',
];

describe('Sales InvoiceHeaderTable — columns', () => {
  it('declares the columns array', () => {
    assert.ok(columnsBlock, 'expected `const columns = useMemo(() => [...], [])` block');
  });

  it('renders the ten expected columns in order', () => {
    const block = columnsBlock[1];
    const keys = [...block.matchAll(/key:\s*'([^']+)'/g)].map(m => m[1]);
    assert.deepEqual(keys, expectedKeysInOrder);
  });

  it('binds each column to the right AD column name', () => {
    assert.match(src, /key: 'invoiceDate', column: 'DateInvoiced'/);
    assert.match(src, /key: 'documentNo', column: 'DocumentNo'/);
    assert.match(src, /key: 'eTGODueDate', column: 'EM_Etgo_Due_Date'/);
    assert.match(src, /key: 'businessPartner', column: 'C_BPartner_ID'/);
    assert.match(src, /key: 'documentStatus', column: 'DocStatus'/);
    assert.match(src, /key: 'grandTotalAmount', column: 'GrandTotal'/);
    assert.match(src, /key: 'outstandingAmount',[\s\S]{0,30}column: 'OutstandingAmt'/);
    assert.match(src, /key: 'eTGODeliveryStatus', column: 'em_etgo_delivery_status'/);
  });

  it('renders delivery status as a percent progress bar', () => {
    assert.match(
      src,
      /key: 'eTGODeliveryStatus'.*type: 'percent'/,
      'eTGODeliveryStatus must use type: "percent" so DataTable renders the progress bar',
    );
  });

  it('renders doc-type badge on transactionDocument column via getArSubtype', () => {
    assert.match(src, /getArSubtype\(row\)/, 'transactionDocument column must call getArSubtype to detect NC/DEV subtypes');
    assert.match(src, /creditNotesTab/, 'NC badge must use the creditNotesTab i18n key');
    assert.match(src, /returnsTab/, 'DEV badge must use the returnsTab i18n key');
  });
});

describe('Sales InvoiceHeaderTable — due date column', () => {
  it('reads eTGODueDate from the row (no payment-plan fetch)', () => {
    assert.match(src, /const d = row\.eTGODueDate/);
    assert.doesNotMatch(src, /paymentPlan\?parentId/, 'payment-plan fetch was retired in ETP-3873');
  });

  it('feeds outstandingAmount into the due-date state', () => {
    assert.match(src, /getDueDateState\(d, row\.outstandingAmount\)/);
  });

  it('formats the date with the active locale, not a hardcoded region', () => {
    assert.match(src, /useLocaleSwitch/);
    assert.match(src, /formatCalendarDate\(d, locale\)/);
  });
});

describe('Sales InvoiceHeaderTable — type filter (ETP-4035 rework)', () => {
  it('delegates type filtering to ListView subsetFilters (no local TYPE_OPTIONS)', () => {
    assert.doesNotMatch(src, /TYPE_OPTIONS/,
      'Type filter pills were moved to ListView subsetFilters; InvoiceHeaderTable must not maintain them');
  });

  it('declares a FILTERS array for the DataTable search bar', () => {
    assert.match(src, /const FILTERS\s*=/, 'FILTERS constant must be declared for DataTable');
    assert.match(src, /'documentNo'/, 'documentNo must be in FILTERS');
    assert.match(src, /'invoiceDate'/, 'invoiceDate must be in FILTERS');
    assert.match(src, /'businessPartner'/, 'businessPartner must be in FILTERS');
  });

  it('renders DataTable with FILTERS (no wrapping div with custom toolbar)', () => {
    assert.match(src, /<DataTable columns=\{columns\} filters=\{FILTERS\}/,
      'Component must render DataTable directly without a custom filter wrapper');
  });
});

// ── ETP-4125: fiscal status read directly from row data ──────────────────────
// Risk: regression to batch GET hook would silently reintroduce the nginx URL
// length issue (403 on 53+ invoices) and add a stale-loading state.

describe('Sales InvoiceHeaderTable — fiscal status columns (ETP-4125)', () => {
  it('does NOT import useInvoiceListFiscalStatus (batch hook eliminated)', () => {
    assert.doesNotMatch(src, /useInvoiceListFiscalStatus/,
      'The batch-fetch hook was removed in ETP-4125 to fix nginx URL-length errors');
  });

  it('reads SII status directly from row.aeatsiiEstado', () => {
    assert.match(src, /row\.aeatsiiEstado/,
      'SII status must come from the row field, not a separate fetch');
  });

  it('reads TBAI status directly from row.tbaiSyncEstado', () => {
    assert.match(src, /row\.tbaiSyncEstado/,
      'TBAI status is injected server-side into the row by TbaiSyncStatusInjector');
  });

  it('reads Verifactu status directly from row.etvfacInvoiceStatus', () => {
    assert.match(src, /row\.etvfacInvoiceStatus/,
      'Verifactu status must come from the row field, not a separate fetch');
  });

  it('does not maintain a statusMap or fiscalLoading variable', () => {
    assert.doesNotMatch(src, /statusMap/,
      'statusMap was part of the removed batch-fetch hook');
    assert.doesNotMatch(src, /fiscalLoading/,
      'fiscalLoading was part of the removed batch-fetch hook');
  });
});

// ── ETP-4331: list must refresh after adding a payment from the list badge ────
// Risk: ListView (the parent) only ever passes `onDataMutated` to this component's
// slot, never `onRefresh`. Wiring onPaymentAdded to `props.onRefresh` is a silent
// no-op that leaves the outstanding-amount badge stale until a manual reload.

describe('Sales InvoiceHeaderTable — payment-added refresh wiring (ETP-4331)', () => {
  it('calls props.onDataMutated when the payment modal reports a new payment', () => {
    assert.match(
      src,
      /onPaymentAdded=\{\(\)\s*=>\s*\{\s*setPaymentRow\(null\);\s*props\.onDataMutated\?\.\(\);\s*\}\}/,
      'onPaymentAdded must close the modal and call props.onDataMutated (the prop ListView actually passes)',
    );
  });

  it('never references the stale props.onRefresh prop', () => {
    assert.doesNotMatch(
      src,
      /props\.onRefresh/,
      'ListView never passes onRefresh — using it here silently no-ops and leaves the list stale (ETP-4331 bug)',
    );
  });
});

// ── ETP-4681: custom-rendered columns must declare their filter semantics ─────
// Risk: `type: 'custom'` tells the filter layer nothing about the underlying
// data type, so resolveFilterMode falls back to 'text'. A text-mode operator
// set has no greaterThan / before / after, which makes the Dashboard's
// `?filter=overdue` preload render an empty operator select.

describe('Sales InvoiceHeaderTable — custom column filter modes (ETP-4681)', () => {
  it('declares filterMode numeric on the outstandingAmount column', () => {
    assert.match(
      src,
      /key: 'outstandingAmount',[\s\S]{0,600}?filterMode: 'numeric'/,
      'outstandingAmount renders status pills (type: custom) but filters as an amount',
    );
  });

  it('declares filterMode date on the eTGODueDate column', () => {
    assert.match(
      src,
      /key: 'eTGODueDate',[\s\S]{0,600}?filterMode: 'date'/,
      'eTGODueDate renders a coloured dot (type: custom) but filters as a date',
    );
  });

  it('keeps both columns on type custom (the rich cell renderers stay)', () => {
    assert.match(src, /key: 'outstandingAmount',\s+column: 'OutstandingAmt',\s+type: 'custom'/);
    assert.match(src, /key: 'eTGODueDate', column: 'EM_Etgo_Due_Date', type: 'custom'/);
  });

  it('leaves grandTotalAmount on type amount (no explicit filterMode needed)', () => {
    assert.match(
      src,
      /key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount'/,
      'type amount already infers numeric — only custom columns need filterMode',
    );
  });

  it('declares exactly one filterMode per custom column (no duplicates)', () => {
    const modes = [...src.matchAll(/filterMode: '([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(modes.filter((m) => m === 'numeric').length, 1);
    assert.deepEqual(modes.filter((m) => m === 'date').length, 1);
  });
});
