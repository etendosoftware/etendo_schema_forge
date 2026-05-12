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
  'documentNo',
  'eTGODueDate',
  'businessPartner',
  'documentStatus',
  'grandTotalAmount',
  'outstandingAmount',
  'eTGODeliveryStatus',
];

describe('Sales InvoiceHeaderTable — columns', () => {
  it('declares the columns array', () => {
    assert.ok(columnsBlock, 'expected `const columns = useMemo(() => [...], [])` block');
  });

  it('renders the eight expected columns in order', () => {
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

  it('keeps the credit-note pill on documentNo', () => {
    assert.match(src, /pill:\s*\{[\s\S]*?when:\s*\(row\)\s*=>\s*isCreditNote\(row\)/);
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

describe('Sales InvoiceHeaderTable — type/payment filters', () => {
  it('exposes invoice / credit-note tabs and an all-payments dropdown', () => {
    assert.match(src, /value: 'all',\s*label: t\('allTab'\)/);
    assert.match(src, /value: 'invoices',\s*label: t\('invoicesTab'\)/);
    assert.match(src, /value: 'credit-notes',\s*label: t\('creditNotesTab'\)/);
    assert.match(src, /value: 'all',\s*label: t\('allPayments'\)/);
  });
});
