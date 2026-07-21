import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ReactivarConfirmModal.jsx'), 'utf8');

describe('payment-out ReactivarConfirmModal', () => {

  it('exports ReactivarConfirmModal as the default export', () => {
    assert.match(src, /export default function ReactivarConfirmModal/);
  });

  it('accepts process/record props to route between modals and forward the record', () => {
    assert.match(src, /\{\s*process\s*,\s*record\s*,\s*onConfirm\s*,\s*onClose\s*\}/);
  });

  it('routes aPRMProcessPayment to ConfirmPaymentModal with dir="out"', () => {
    assert.match(src, /process\?\.columnName === 'aPRMProcessPayment'/);
    assert.match(src, /<ConfirmPaymentModal dir="out"/);
  });

  it('falls through to PaymentLifecycleConfirmModal with dir="out", action="reactivate", forwarding the record', () => {
    assert.match(src, /<PaymentLifecycleConfirmModal dir="out" action="reactivate" data={record}/);
  });

  it('imports both modal components from the shared window', () => {
    assert.match(src, /import PaymentLifecycleConfirmModal from '@\/windows\/custom\/shared\/PaymentLifecycleConfirmModal'/);
    assert.match(src, /import ConfirmPaymentModal from '@\/windows\/custom\/shared\/ConfirmPaymentModal'/);
  });

});
