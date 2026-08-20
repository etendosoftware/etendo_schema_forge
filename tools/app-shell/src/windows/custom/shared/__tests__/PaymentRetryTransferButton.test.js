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
    assert.match(src, /import \{ PAYMENT_STATUS_ERROR \} from '\.\/paymentStatuses'/);
    assert.doesNotMatch(src, /'ETGOERR'/);
  });

  it('posts against the payment record, never an invoice', () => {
    // The retry reuses the existing payment, so there is no invoice in scope to address.
    assert.match(src, /\/\$\{specName\}\/\$\{entity\}\/\$\{paymentId\}\/action\/retryPisPayment/);
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
