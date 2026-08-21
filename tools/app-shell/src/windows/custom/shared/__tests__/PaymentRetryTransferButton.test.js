import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'PaymentRetryTransferButton.jsx'), 'utf8');
const topbar = readFileSync(join(__dirname, '..', 'PaymentTopbarActions.jsx'), 'utf8');

// Source-reading guards for the invariants the rendered tests in
// PaymentRetryTransferButton.vitest.jsx cannot express as cheaply.
describe('PaymentRetryTransferButton', () => {
  it('exports PaymentRetryTransferButton as the default export', () => {
    assert.match(src, /export default function PaymentRetryTransferButton/);
  });

  it('gates on the shared error status rather than a local literal', () => {
    // A fifth copy of 'ETGOERR' is exactly how the four payment surfaces drifted apart before.
    assert.match(src, /import \{ PAYMENT_STATUS_ERROR, pisOutcome \} from '\.\/paymentStatuses'/);
    assert.doesNotMatch(src, /'ETGOERR'/);
  });

  it('posts against the payment record, never an invoice', () => {
    // The retry reuses the existing payment, so there is no invoice in scope to address.
    assert.match(src, /\/\$\{specName\}\/\$\{entity\}\/\$\{paymentId\}\/action\/retryPisPayment/);
  });

  // ETP-4895: the retry used to end at window.open. Nothing else follows the new attempt — the
  // invoice modal's poll belongs to the modal, the Salt Edge webhook cannot reach a server that is
  // not publicly addressable, and PSD2's periodic refresh is not scheduled by default.
  it('follows the new attempt to its outcome instead of ending at the popup', () => {
    assert.match(src, /action\/pisPaymentStatus/);
    assert.match(src, /pisOutcome\(status\)/);
  });

  // The classifier and the status lists live in paymentStatuses.js precisely so the modal and this
  // button read a Salt Edge status the same way.
  it('does not re-declare the Salt Edge status lists', () => {
    assert.doesNotMatch(src, /const PIS_(SUCCESS|FAILURE|REGISTERED)_STATUSES\s*=/);
  });

  // `ui` and `onRefresh` are new functions on every render, so listing them as effect deps
  // cancelled the pending tick and restarted the wait on each re-render.
  it('keeps the per-render callbacks out of the poll effect deps', () => {
    assert.match(src, /\}, \[watching\]\);/);
    assert.match(src, /pollCtx\.current\s*=/);
  });

  it('requires a rejected attempt before offering anything', () => {
    assert.match(src, /if \(!retryable\) return null;/);
  });
});

describe('PaymentTopbarActions', () => {
  it('composes the reconciled badge and the retry action in one topbar slot', () => {
    // The generated page can only be handed a single component for `topbarExtra`.
    assert.match(topbar, /export default function PaymentTopbarActions/);
    assert.match(topbar, /<PaymentConciliadoBadge/);
    assert.match(topbar, /<PaymentRetryTransferButton/);
  });
});
