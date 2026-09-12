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
    assert.match(src, /getArSubtype\(row\)/, 'transactionDocument column must call getArSubtype to detect the RECTIFICATIVA subtype');
    assert.match(src, /rectificativeInvoicesTab/, 'RECTIFICATIVA badge must use the rectificativeInvoicesTab i18n key (ETP-4737: replaces the former creditNotesTab/returnsTab split)');
  });
});

// ── ETP-5216: TicketBAI status is a real stored computed AD column ───────────
// Was `{ key: '_tbaiStatus', type: 'custom' }` with no `column` — dropped
// silently from the advanced filter by isFilterableColumn (no error, no
// warning), and the criteria fieldName would have been the synthetic key
// `_tbaiStatus`, which does not exist in the DAL. See
// docs/plans/2026-09-08-tbai-status-computed-column-migration.md §1, §8 Step 19.

describe('Sales InvoiceHeaderTable — TBAI column is a real AD column (ETP-5216)', () => {
  it('binds the TBAI column to the real AD column em_etgo_tbai_status', () => {
    assert.match(
      src,
      /key: 'eTGOTbaiStatus', column: 'em_etgo_tbai_status', type: 'custom',/,
      'the column must carry `column` so isFilterableColumn does not drop it',
    );
  });

  it('declares filterMode text on the TBAI column', () => {
    assert.match(
      src,
      /key: 'eTGOTbaiStatus', column: 'em_etgo_tbai_status', type: 'custom',\s*\n\s*filterMode: 'text'/,
    );
  });

  it('does not fall back to a client-side isSent/tbaiIssent boolean (sales side never had that fallback)', () => {
    const cell = src.match(/if \(targets\.showTbai\) \{[\s\S]*?\}\)\;\s*\}/);
    assert.ok(cell, 'expected the showTbai column-push block');
    assert.match(cell[0], /row\.eTGOTbaiStatus \?\? 'Pendiente'/);
  });
});

// ── ETP-5216: the adoption-date gate MOVED from the cell into the DB ─────────
// The cell used to call `isSifEligibleByDate(row.invoiceDate,
// tbaiRecord?.tbaisystemdate)` and draw a dash for an invoice predating
// adoption. That decision was invisible to the backend (so filtering the now
// filterable column by "Pendiente" returned rows the grid drew as a dash) and
// it compared EVERY row against the SELECTED organization's adoption date
// rather than the invoice's own. `ETGO_GET_TBAI_STATUS` now answers the literal
// 'NoAplica' per invoice, against the invoice's OWN organization, and the cell
// only translates that value to a dash.

describe('Sales InvoiceHeaderTable — TBAI cell renders a dash only for "NoAplica" (ETP-5216)', () => {
  const tbaiCell = src.match(/if \(targets\.showTbai\) \{[\s\S]*?\}\)\;\s*\}/);
  // The block's own comments narrate the migration (they name 'NoAplica' and
  // isSifEligibleByDate on purpose), so the "must not appear" assertions below
  // read the CODE only — otherwise the documentation would fail the test.
  const tbaiCode = tbaiCell[0].replace(/^\s*\/\/.*$/gm, '');

  it('imports the shared isTbaiStatusNotApplicable helper (no inline literal comparison)', () => {
    assert.match(
      src,
      /import \{[^}]*isTbaiStatusNotApplicable[^}]*\} from '@\/windows\/custom\/shared\/fiscalTargets\.js'/,
      'the NoAplica literal lives in fiscalTargets.js — the cell must not re-declare it',
    );
    assert.doesNotMatch(
      tbaiCode,
      /'NoAplica'/,
      'the cell must go through the helper, never compare the literal itself',
    );
  });

  it('renders the muted dash when the stored status does not apply', () => {
    assert.match(
      tbaiCell[0],
      /isTbaiStatusNotApplicable\(row\.eTGOTbaiStatus\)\s*\n\s*\? <span className="text-muted-foreground">—<\/span>/,
      'a NoAplica invoice must render the dash, not a badge',
    );
  });

  it('renders the FiscalStatusBadge on the other branch', () => {
    assert.match(
      tbaiCell[0],
      /: <FiscalStatusBadge status=\{row\.eTGOTbaiStatus \?\? 'Pendiente'\} \/>/,
      'any status other than NoAplica must still render the badge',
    );
  });

  it('no longer gates the TBAI cell on invoiceDate vs. the selected org adoption date', () => {
    assert.doesNotMatch(
      tbaiCode,
      /isSifEligibleByDate|tbaisystemdate/,
      'the adoption-date gate moved into the stored computed column (ETP-5216)',
    );
  });

  it('keeps the browser-side date gates for SII and VERI*FACTU (they are NOT stored columns)', () => {
    // ETP-5229 (corrected design): SII gates on earliestSiiCutoverDate — the
    // EARLIEST cutover across ALL of the org's SII config rows, active or not
    // — not the currently active config's own record (`siiRecord?.fechaAcogidaSII`,
    // an earlier design this file never actually shipped with).
    assert.match(src, /isSifEligibleByDate\(row\.accountingDate, earliestSiiCutoverDate\)/);
    assert.match(src, /isVerifactuEligibleByDate\(/);
  });
});

// ── ETP-4841: payment state follows the SIGN of the total ────────────────────
// The grid used to call `isRectificativa(row)` (getArSubtype === 'RECTIFICATIVA')
// to pick the credit branch. That mislabelled a POSITIVE Factura Rectificativa
// as "Saldo a favor" and a NEGATIVE ordinary Factura as "Cobrada". getArSubtype
// survives only as the input to the document-type badge column.

describe('Sales InvoiceHeaderTable — sign-driven payment badge (ETP-4841)', () => {
  it('imports the shared resolveInvoicePaymentBadge helper', () => {
    assert.match(
      src,
      /import \{ resolveInvoicePaymentBadge \} from '@\/windows\/custom\/shared\/invoicePaymentBadge\.js'/,
      'the badge state must come from the single shared source of truth',
    );
  });

  it('no longer declares a local isRectificativa document-type predicate', () => {
    assert.doesNotMatch(
      src,
      /isRectificativa/,
      'the local doc-type predicate was replaced by resolveInvoicePaymentBadge (ETP-4841)',
    );
  });

  it('drives the outstanding cell off badge.kind, not getArSubtype', () => {
    const cell = src.match(/key: 'outstandingAmount',[\s\S]*?key: 'eTGODeliveryStatus'/);
    assert.ok(cell, 'expected the outstandingAmount column block');
    assert.match(cell[0], /const badge = resolveInvoicePaymentBadge\(row\)/);
    assert.match(cell[0], /badge\.kind === 'draft'/);
    assert.match(cell[0], /badge\.kind === 'credit-applied'/);
    assert.match(cell[0], /badge\.kind === 'credit-available'/);
    assert.match(cell[0], /badge\.kind === 'paid'/);
    assert.doesNotMatch(cell[0], /getArSubtype/);
  });

  it('renders the pending and credit amounts from badge.amount (always non-negative)', () => {
    const cell = src.match(/key: 'outstandingAmount',[\s\S]*?key: 'eTGODeliveryStatus'/);
    assert.match(cell[0], /fmtAmt\(badge\.amount, currency\)/);
    assert.doesNotMatch(
      cell[0],
      /Math\.abs\(outstanding\)/,
      'the absolute value is computed inside resolveInvoicePaymentBadge, not here',
    );
  });

  it('drives the due-date cell off badge.isCredit, not getArSubtype', () => {
    const cell = src.match(/key: 'eTGODueDate',[\s\S]*?key: 'businessPartner'/);
    assert.ok(cell, 'expected the eTGODueDate column block');
    assert.match(cell[0], /resolveInvoicePaymentBadge\(row\)\.isCredit/);
    assert.doesNotMatch(cell[0], /getArSubtype/);
  });

  it('keeps getArSubtype for the document-type badge only', () => {
    assert.match(src, /const sub = getArSubtype\(row\)/);
    const occurrences = [...src.matchAll(/getArSubtype\(/g)].length;
    assert.equal(occurrences, 1, 'getArSubtype must be called exactly once — by the doc-type badge cell');
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

  it('still resolves the collected pill through the cobrada generic label', () => {
    assert.match(src, /t\('cobrada'\)/, 'the paid branch keeps the AR-specific "cobrada" label');
  });
});

describe('Sales InvoiceHeaderTable — payment-state color roles (ETP-4767)', () => {
  it('uses semantic success and warning background, border, and foreground roles', () => {
    assert.match(src, /background:'var\(--status-success-bg\)',color:'var\(--status-success-fg\)'/);
    assert.match(src, /background:'var\(--status-warning-bg\)',border:'1px solid var\(--status-warning-border\)',color:'var\(--status-warning-fg\)'/);
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

  it('reads TBAI status directly from row.eTGOTbaiStatus (ETP-5216: real stored computed column)', () => {
    assert.match(src, /row\.eTGOTbaiStatus/,
      'TBAI status must be read from the real AD column em_etgo_tbai_status, not a synthetic injected field');
    assert.doesNotMatch(
      src,
      /tbaiSyncEstado/,
      'tbaiSyncEstado was the synthetic field fed by the now-deleted TbaiSyncStatusInjector (ETP-5216)',
    );
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

// ── ETP-4833: badge/button renderers must not wrap onto two lines when the
// grid's column width shrinks (column-width recalculation on scroll). QA
// (Emilio Polliotti, 2026-08-20) confirmed the purchase-invoice fix but
// reproduced the same "Factura Rectificativa" wrap here, because it was never
// applied to sales-invoice — mirrors PurchaseInvoiceHeaderTable.jsx's
// equivalent NOWRAP_FLEX assertions.
// ── ETP-5229 (corrected design): fiscal status VALUE is date-independent, but
// per-row ELIGIBILITY is gated on the EARLIEST-ever cutover for that system ──
// A row genuinely sent/processed under a PREVIOUS, since-superseded fiscal
// config must keep showing its real persisted status — comparing the row's own
// date against the org's CURRENTLY ACTIVE config's cutover date would silently
// hide it. But an invoice dated before the system EVER existed for this org
// (no config, active or not, ever adopted before it) must show a dash, not a
// stray DB value. Both are true at once: each column's render gates on
// isSifEligibleByDate/isVerifactuEligibleByDate against the EARLIEST cutover
// across ALL of the org's rows (active or inactive) — never the active
// config's own (possibly later) cutover.
describe('Sales InvoiceHeaderTable — fiscal status badges gated on earliest-ever cutover (ETP-5229 corrected)', () => {
  it('imports isSifEligibleByDate, isVerifactuEligibleByDate and isTbaiStatusNotApplicable', () => {
    assert.match(
      src,
      /import\s*\{\s*getInvoiceFiscalTargets,\s*isSifEligibleByDate,\s*isVerifactuEligibleByDate,\s*isTbaiStatusNotApplicable\s*\}\s*from '@\/windows\/custom\/shared\/fiscalTargets\.js'/,
      'the per-row earliest-cutover gate (SII/Verifactu) and the TBAI NoAplica helper must both come from fiscalTargets.js',
    );
  });

  it('destructures earliestSiiCutoverDate/earliestVerifactuCutoverDate from useFiscalConfig (TBAI has no client-side cutover — ETP-5216/ETP-5229)', () => {
    const destructure = src.match(/const\s*\{\s*\n?\s*profile,[\s\S]*?\}\s*=\s*useFiscalConfig\(orgId,\s*apiBaseUrl\)/);
    assert.ok(destructure, 'expected the useFiscalConfig destructure block');
    assert.match(
      destructure[0],
      /const\s*\{\s*\n?\s*profile,\s*\n?\s*earliestSiiCutoverDate,\s*earliestVerifactuCutoverDate,?\s*\n?\s*\}/,
      'the earliest-ever cutover for SII/Verifactu must be pulled from useFiscalConfig to gate each badge',
    );
    assert.doesNotMatch(
      destructure[0],
      /earliestTbaiCutoverDate/,
      'TBAI no longer reads a client-side cutover date — its gate moved into the stored DB column',
    );
  });

  it('does NOT destructure siiRecord/tbaiRecord/verifactuRecord (the active-only records) anymore', () => {
    assert.doesNotMatch(
      src,
      /const\s*\{\s*profile,\s*(siiRecord|tbaiRecord|verifactuRecord)/,
      'the badge gate uses the earliest-ever cutover, not the active config\'s own adoption-date record',
    );
  });

  it('gates the SII badge on isSifEligibleByDate(row.accountingDate, earliestSiiCutoverDate)', () => {
    const cell = src.match(/if \(targets\.showSii\) \{[\s\S]*?\}\)?;\s*\}/);
    assert.ok(cell, 'expected the showSii column-push block');
    assert.match(cell[0], /isSifEligibleByDate\(row\.accountingDate, earliestSiiCutoverDate\)/);
    // ETP-5229 item #17: eligible-but-empty falls back to the 'PE' pending
    // marker, not a fabricated null — not-eligible (outside this expression)
    // is what still yields the dash.
    assert.match(cell[0], /row\.aeatsiiEstado \?\? 'PE'/);
  });

  it('the TBAI badge reads eTGOTbaiStatus directly, with no client-side date gate (ETP-5216/ETP-5229)', () => {
    const cell = src.match(/if \(targets\.showTbai\) \{[\s\S]*?\}\)?;\s*\}/);
    assert.ok(cell, 'expected the showTbai column-push block');
    // Strip comments first: the block's own prose narrates the migration (it
    // names isSifEligibleByDate/earliestTbaiCutoverDate on purpose to explain
    // WHERE the gate moved), so a raw-text match would fail on the documentation
    // rather than the code it describes.
    const code = cell[0].replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /isSifEligibleByDate/,
      'TBAI eligibility now lives inside the stored function backing eTGOTbaiStatus, not here');
    assert.match(cell[0], /key: 'eTGOTbaiStatus', column: 'em_etgo_tbai_status', type: 'custom'/);
    assert.match(cell[0], /isTbaiStatusNotApplicable\(row\.eTGOTbaiStatus\)/);
    assert.match(cell[0], /row\.eTGOTbaiStatus \?\? 'Pendiente'/);
  });

  it('gates the Verifactu badge on isVerifactuEligibleByDate(row.created, earliestVerifactuCutoverDate)', () => {
    const cell = src.match(/if \(targets\.showVerifactu\) \{[\s\S]*?\}\)?;\s*\}/);
    assert.ok(cell, 'expected the showVerifactu column-push block');
    assert.match(cell[0], /isVerifactuEligibleByDate\(row\.created, earliestVerifactuCutoverDate\)/);
    // ETP-5229 item #17: eligible-but-empty falls back to the raw 'PE' code
    // (resolves through normalizeVerifactuStatus -> 'vf_pending'), not null.
    assert.match(cell[0], /normalizeVerifactuStatus\(row\.etvfacInvoiceStatus \?\? 'PE'\)/);
  });

  it('renders a null status (dash) when the eligibility check fails, for SII and VERI*FACTU', () => {
    for (const key of ['showSii', 'showVerifactu']) {
      const cell = src.match(new RegExp(`if \\(targets\\.${key}\\) \\{[\\s\\S]*?\\}\\)?;\\s*\\}`));
      assert.ok(cell, `expected the ${key} column-push block`);
      assert.match(cell[0], /\? .*? : null/, `${key} branch must fall back to null (dash) when ineligible`);
    }
  });

  // TBAI is the ONE system with no eligibility ternary in this file — its dash
  // comes from `isTbaiStatusNotApplicable(row.eTGOTbaiStatus)` reading the DB's
  // 'NoAplica' literal, not a `? ... : null` client-side date check.
  it('renders the TBAI dash via isTbaiStatusNotApplicable, not a `? ... : null` eligibility ternary', () => {
    const cell = src.match(/if \(targets\.showTbai\) \{[\s\S]*?\}\)?;\s*\}/);
    assert.ok(cell, 'expected the showTbai column-push block');
    assert.match(cell[0], /isTbaiStatusNotApplicable\(row\.eTGOTbaiStatus\)\s*\n\s*\?\s*<span className="text-muted-foreground">—<\/span>/);
  });

  // ETP-5229 item #17: eligible-but-empty must resolve to a distinct pending
  // marker per system, never the same dash used for genuine ineligibility.
  it('falls back to a pending marker (not null) for SII and Verifactu when eligible but the persisted status is empty', () => {
    const siiCell = src.match(/if \(targets\.showSii\) \{[\s\S]*?\}\)?;\s*\}/);
    assert.match(siiCell[0], /row\.aeatsiiEstado \?\? 'PE'/, 'SII pending marker is the raw PE code');

    const vfCell = src.match(/if \(targets\.showVerifactu\) \{[\s\S]*?\}\)?;\s*\}/);
    assert.match(vfCell[0], /row\.etvfacInvoiceStatus \?\? 'PE'/, 'Verifactu pending marker is the raw PE code before normalizeVerifactuStatus');
  });

  // TBAI's pending marker: the DB answers 'Pendiente' for "no resolved
  // submission" (never 'NoAplica'), so the `??` here only guards a row fetched
  // before the column was backfilled.
  it('falls back to the "Pendiente" marker for TBAI when eTGOTbaiStatus is absent', () => {
    const tbaiCell = src.match(/if \(targets\.showTbai\) \{[\s\S]*?\}\)?;\s*\}/);
    assert.match(tbaiCell[0], /row\.eTGOTbaiStatus \?\? 'Pendiente'/, 'TBAI pending marker is the synthetic Pendiente label');
  });
});

describe('Sales InvoiceHeaderTable — badge/button nowrap styling (ETP-4833)', () => {
  it('declares a shared NOWRAP_FLEX style with whiteSpace nowrap and flexShrink 0', () => {
    assert.match(
      src,
      /const NOWRAP_FLEX = \{ whiteSpace: 'nowrap', flexShrink: 0 \}/,
      'a shared nowrap/flexShrink constant keeps the four flex-based renderers consistent',
    );
  });

  it('doc-type badge (two-word "Factura Rectificativa") declares whiteSpace nowrap', () => {
    const cell = src.match(/key: 'transactionDocument',[\s\S]*?key: 'documentNo'/);
    assert.ok(cell, 'expected the transactionDocument column block');
    assert.match(
      cell[0],
      /style=\{\{ color: cfg\.color, backgroundColor: cfg\.bg, whiteSpace: 'nowrap' \}\}/,
      'inline-block alone does not stop a two-word label from wrapping once the column narrows',
    );
  });

  it('applies NOWRAP_FLEX to all four flex-based badge/button renderers in the outstandingAmount cell', () => {
    const cell = src.match(/key: 'outstandingAmount',[\s\S]*?key: 'eTGODeliveryStatus'/);
    assert.ok(cell, 'expected the outstandingAmount column block');
    const occurrences = [...cell[0].matchAll(/\{\.\.\.NOWRAP_FLEX,display:'inline-flex'/g)].length;
    assert.equal(
      occurrences,
      4,
      'credit-applied, credit-available, paid, and pending-payment must all spread NOWRAP_FLEX',
    );
  });
});
