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

  it('renders the nine expected columns in order (transactionDocument is visible badge + type filter)', () => {
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
    assert.match(src, /key: 'outstandingAmount', column: 'OutstandingAmt'/);
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

  it('uses DOC_TYPE_BADGE with i18n label keys for the AP doc types', () => {
    assert.match(src, /label:\s*'invoicesTab'/);
    assert.match(src, /label:\s*'creditNotesTab'/);
    assert.match(src, /label:\s*'returnInvoiceTab'/);
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
