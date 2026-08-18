import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'InvoiceTopbarExtra.jsx'), 'utf8');

describe('InvoiceTopbarExtra', () => {

  // ── Exports ────────────────────────────────────────────────────────────────

  it('exports a default function component', () => {
    assert.match(src, /export default function InvoiceTopbarExtra/);
  });

  it('accepts data, recordId, token, apiBaseUrl, and api props', () => {
    assert.match(src, /\{\s*data.*recordId.*token.*apiBaseUrl.*api\s*\}/);
  });

  // ── Data fetching ──────────────────────────────────────────────────────────

  it('fetches installments from the paymentPlan endpoint with parentId', () => {
    assert.match(src, /paymentPlan\?parentId=\$\{recordId\}/);
  });

  it('sets installments loading state and clears it after fetch', () => {
    assert.match(src, /setInstallmentsLoading/);
  });

  // ── Draft handling ─────────────────────────────────────────────────────────

  it('detects draft status from documentStatus field', () => {
    assert.match(src, /documentStatus.*===.*'DR'/);
  });

  it('shows only the send button for draft invoices', () => {
    assert.match(src, /isDraft/);
    assert.match(src, /SendDocumentButton/);
  });

  // ── Installment classification ─────────────────────────────────────────────

  it('defines a classifyInstallment function', () => {
    assert.match(src, /function classifyInstallment/);
  });

  it('classifies as paid when outstandingAmount is 0', () => {
    assert.match(src, /outstanding\s*<=\s*0.*return\s*'paid'/s);
  });

  it('classifies as overdue when daysOverdue > 0 and outstanding > 0', () => {
    assert.match(src, /overdue\s*>\s*0.*outstanding\s*>\s*0.*return\s*'overdue'/s);
  });

  it('classifies as partial when paid > 0 and outstanding > 0', () => {
    assert.match(src, /paid\s*>\s*0.*outstanding\s*>\s*0.*return\s*'partial'/s);
  });

  it('classifies as pending when no payment has been made', () => {
    assert.match(src, /return\s*'pending'/);
  });

  // ── Badge derivation ───────────────────────────────────────────────────────

  it('derives an overall badge from all installments', () => {
    assert.match(src, /badgeInfo/);
    assert.match(src, /BADGE_STYLES/);
  });

  it('computes sumPaid and sumOutstanding across all installments', () => {
    assert.match(src, /sumPaid/);
    assert.match(src, /sumOutstanding/);
  });

  it('signals allPaid when every installment is paid', () => {
    assert.match(src, /allPaid/);
    assert.match(src, /\.every\(/);
  });

  it('signals anyOverdue when at least one installment is overdue', () => {
    assert.match(src, /anyOverdue/);
    assert.match(src, /\.some\(/);
  });

  // ── Percentage removed ─────────────────────────────────────────────────────

  it('does not compute or render a percentage of total in the payment modal', () => {
    assert.doesNotMatch(src, /Math\.round\(instAmount\s*\/\s*\(/);
  });

  // ── Payment modal ──────────────────────────────────────────────────────────

  it('renders the shared InvoicePaymentHistoryModal for the payments modal', () => {
    assert.match(src, /InvoicePaymentHistoryModal/);
  });

  it('passes specName="sales-invoice" to InvoicePaymentHistoryModal', () => {
    assert.match(src, /specName="sales-invoice"/);
  });

  it('passes onPaymentAdded={fetchInstallments} to InvoicePaymentHistoryModal', () => {
    assert.match(src, /onPaymentAdded=\{fetchInstallments\}/);
  });

  it('opens the payments modal on badge click via showPaymentsModal state', () => {
    assert.match(src, /showPaymentsModal/);
    assert.match(src, /setShowPaymentsModal/);
  });

  it('shows a fallback badge using header-level outstanding when no installments are found', () => {
    assert.match(src, /fallbackStyle/);
    assert.match(src, /fallbackLabel/);
  });

  // ── Credit instrument detection (ETP-4841) ─────────────────────────────────
  // The topbar used to enter its credit branch when getArSubtype(data) resolved
  // to 'RECTIFICATIVA'. It now asks the shared helper, which reads the SIGN of
  // the total — so a POSITIVE Factura Rectificativa falls through to the normal
  // payable branches and a NEGATIVE ordinary Factura enters the credit branch.

  describe('credit branch keyed on the sign of the total (ETP-4841)', () => {
    it('imports the shared resolveInvoicePaymentBadge helper', () => {
      assert.match(
        src,
        /import \{ resolveInvoicePaymentBadge \} from '@\/windows\/custom\/shared\/invoicePaymentBadge\.js'/,
      );
    });

    it('derives isCreditInstrument from badge.isCredit, not from the document subtype', () => {
      assert.match(src, /const isCreditInstrument = resolveInvoicePaymentBadge\(data\)\.isCredit/);
    });

    it('no longer compares getArSubtype against RECTIFICATIVA to pick the credit branch', () => {
      assert.doesNotMatch(
        src,
        /getArSubtype\(data\)/,
        'the document type must not decide the payment badge any more (ETP-4841)',
      );
      assert.doesNotMatch(src, /const arSubtype =/);
    });

    it('gates the credit branch on the completed status as well', () => {
      assert.match(src, /if \(isCompleted && isCreditInstrument\)/);
    });

    it('renders the credit labels through i18n, not hardcoded Spanish literals', () => {
      assert.match(src, /ui\('cpFavorBadge'\)/);
      assert.match(src, /ui\('cpCreditFullyApplied'\)/);
      // Strip `//` comments: the source still *describes* the badge as
      // "Saldo a favor" in prose, which must not fail this assertion.
      const code = src.replace(/^\s*\/\/.*$/gm, '');
      assert.doesNotMatch(code, /Saldo a favor/);
      assert.doesNotMatch(code, />Aplicada/);
    });
  });

  // ── Send modal ─────────────────────────────────────────────────────────────

  it('integrates a SendDocumentModal for email delivery', () => {
    assert.match(src, /SendDocumentModal/);
    assert.match(src, /showSendModal/);
  });

  it('auto-opens the send modal after a Confirm action via sessionStorage', () => {
    assert.match(src, /sessionStorage/);
    assert.match(src, /invoice:sendAfterConfirm/);
  });

  // ── SendToSifButton integration ────────────────────────────────────────────

  it('imports SendToSifButton from the custom directory', () => {
    assert.match(src, /import SendToSifButton from ['"]\.\/SendToSifButton['"]/);
  });

  it('renders SendToSifButton with data, recordId, token, apiBaseUrl, and status props', () => {
    assert.match(src, /<SendToSifButton/);
    assert.match(src, /recordId=\{recordId\}/);
    assert.match(src, /token=\{token\}/);
    assert.match(src, /apiBaseUrl=\{apiBaseUrl\}/);
  });

  // ETP-4717 (Pair 2 — P2): the Send button must NOT be available while the
  // invoice is still Draft (DR) — only once it is Completed (CO). The current
  // early-return `if (isDraft) { ... }` block renders a SendDocumentButton,
  // which is the bug.
  describe('Send button visibility gated by document status (ETP-4717)', () => {
    it('does NOT render the Send button in the Draft (isDraft) early-return block', () => {
      const draftBlockMatch = src.match(/if\s*\(isDraft\)\s*\{\s*return\s*\(([\s\S]*?)\);\s*\}/);
      assert.ok(draftBlockMatch, 'expected an `if (isDraft) { return (...); }` block in the source');
      assert.doesNotMatch(
        draftBlockMatch[1],
        /<SendDocumentButton/,
        'the Draft early-return block must not render SendDocumentButton — Send must only be ' +
          'available once the invoice is Completed (CO)',
      );
    });

    it('still renders a SendDocumentButton once the invoice is Completed (existing behavior, must not regress)', () => {
      const afterDraftBlock = src.slice(src.indexOf('if (isCompleted && isCreditInstrument)'));
      assert.match(afterDraftBlock, /<SendDocumentButton/);
    });
  });
});
