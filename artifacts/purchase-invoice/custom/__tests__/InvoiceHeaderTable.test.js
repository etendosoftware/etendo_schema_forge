import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'InvoiceHeaderTable.jsx'), 'utf8');

describe('Purchase InvoiceHeaderTable — columns', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function InvoiceHeaderTable/);
  });

  it('defines base columns with correct AD bindings', () => {
    assert.match(src, /key: 'invoiceDate',\s*column: 'DateInvoiced'/);
    assert.match(src, /key: 'orderReference',\s*column: 'POReference'/);
    assert.match(src, /key: 'businessPartner',\s*column: 'C_BPartner_ID'/);
    assert.match(src, /key: 'documentStatus',\s*column: 'DocStatus'/);
    assert.match(src, /key: 'grandTotalAmount',\s*column: 'GrandTotal'/);
    assert.match(src, /key: 'outstandingAmount',\s*column: 'OutstandingAmt'/);
  });

  it('renders delivery status as a percent progress bar', () => {
    assert.match(src, /key: 'eTGODeliveryStatus'[\s\S]*?type: 'percent'/);
  });
});

// ── ETP-4125: fiscal status read directly from row data ──────────────────────
// Risk: regression to batch GET hook would silently reintroduce the nginx URL
// length issue (403 on 53+ invoices). This file is used by the generated
// HeaderPage (detail view); the list view uses PurchaseInvoiceHeaderTable.

describe('Purchase InvoiceHeaderTable — fiscal status columns (ETP-4125)', () => {
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

  it('does not hold a token prop (no auth header needed for inline fields)', () => {
    assert.doesNotMatch(src, /const\s*\{[^}]*\btoken\b/,
      'token prop was removed when the batch fetch was eliminated');
  });
});

// ── ETP-5229 (corrected design): SII badge is gated on the EARLIEST-ever
// cutover for this org, not the currently-active config's own cutover ────────
// This is a currently-unrouted duplicate of the pipeline artifact (not wired
// into windowLoaders/customLoaders — see PurchaseInvoiceHeaderTable.jsx for the
// component actually served at runtime), kept in sync for consistency. A row
// genuinely sent under a PREVIOUS, since-superseded SII config must keep
// showing its real persisted status (see useFiscalStatus.js for the
// root-cause writeup), but a row dated before SII ever existed for this org
// must show a dash.
describe('Purchase InvoiceHeaderTable — SII badge gated on earliest-ever cutover (ETP-5229 corrected)', () => {
  it('imports isSifEligibleByDate', () => {
    assert.match(
      src,
      /import\s*\{\s*getInvoiceFiscalTargets,\s*isSifEligibleByDate\s*\}\s*from '@\/windows\/custom\/shared\/fiscalTargets\.js'/,
    );
  });

  it('destructures earliestSiiCutoverDate from useFiscalConfig, not siiRecord', () => {
    assert.match(
      src,
      /const\s*\{\s*profile,\s*earliestSiiCutoverDate\s*\}\s*=\s*useFiscalConfig\(orgId,\s*apiBaseUrl\)/,
    );
    assert.doesNotMatch(
      src,
      /const\s*\{\s*profile,\s*siiRecord/,
      'the SII adoption-date record is no longer needed to render the badge',
    );
  });

  it('gates the badge on isSifEligibleByDate(row.accountingDate, earliestSiiCutoverDate), falling back to null', () => {
    assert.match(
      src,
      /render:\s*\(row\)\s*=>\s*\(\s*<FiscalStatusBadge\s*\n\s*status=\{isSifEligibleByDate\(row\.accountingDate, earliestSiiCutoverDate\) \? \(row\.aeatsiiEstado \?\? null\) : null\}/,
    );
  });
});
