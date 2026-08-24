import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ReactivarConfirmModal.jsx'), 'utf8');

describe('payment-in ReactivarConfirmModal', () => {

  it('exports ReactivarConfirmModal as the default export', () => {
    assert.match(src, /export default function ReactivarConfirmModal/);
  });

  it('accepts process/record props to route between modals and forward the record', () => {
    assert.match(src, /process\s*,\s*record\s*,\s*onConfirm\s*,\s*onClose\s*,\s*apiBaseUrl\s*,\s*onRefresh/);
  });

  it('routes aPRMProcessPayment to the editable payment modal, not a yes/no dialog', () => {
    // This window has no form of its own, so the old confirm dialog was the only thing a user who
    // reactivated a payment could reach — and it could not change anything. Confirmar now opens the
    // invoice's editor, which falls back to that dialog on its own when the invoice is unresolvable.
    assert.match(src, /process\?\.columnName === 'aPRMProcessPayment'/);
    assert.match(src, /<PaymentEditModalLauncher/);
    assert.match(src, /dir="in"/);
    assert.doesNotMatch(src, /<ConfirmPaymentModal/);
  });

  it('forwards what the launcher needs to reach the API and refresh the window', () => {
    // It never goes through handleProcess, so nothing else would reload the record afterwards.
    assert.match(src, /apiBaseUrl=\{apiBaseUrl\}/);
    assert.match(src, /onRefresh=\{onRefresh\}/);
  });

  it('falls through to PaymentLifecycleConfirmModal with dir="in", action="reactivate", forwarding the record', () => {
    assert.match(src, /<PaymentLifecycleConfirmModal dir="in" action="reactivate" data={record}/);
  });

  it('imports both modal components from the shared window', () => {
    assert.match(src, /import PaymentLifecycleConfirmModal from '@\/windows\/custom\/shared\/PaymentLifecycleConfirmModal'/);
    assert.match(src, /import PaymentEditModalLauncher from '@\/windows\/custom\/shared\/PaymentEditModalLauncher'/);
  });

});
