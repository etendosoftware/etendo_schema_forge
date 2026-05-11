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

  it('renders InvoicePaymentModal for the payments modal', () => {
    assert.match(src, /InvoicePaymentModal/);
  });

  it('passes specName="sales-invoice" to InvoicePaymentModal', () => {
    assert.match(src, /specName="sales-invoice"/);
  });

  it('passes onPaymentAdded={fetchInstallments} to InvoicePaymentModal', () => {
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
});
