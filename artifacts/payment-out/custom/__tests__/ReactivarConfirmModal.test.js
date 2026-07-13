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

  it('accepts a process prop to route between modals', () => {
    assert.match(src, /\{\s*process\s*,\s*onConfirm\s*,\s*onClose\s*\}/);
  });

  it('routes aPRMProcessPayment to ConfirmPaymentModal with dir="out"', () => {
    assert.match(src, /process\?\.columnName === 'aPRMProcessPayment'/);
    assert.match(src, /<ConfirmPaymentModal dir="out"/);
  });

  it('falls through to ReactivarModal with dir="out" for any other process', () => {
    assert.match(src, /<ReactivarModal dir="out"/);
  });

  it('imports both modal components from the shared window', () => {
    assert.match(src, /import ReactivarModal from '@\/windows\/custom\/shared\/ReactivarModal'/);
    assert.match(src, /import ConfirmPaymentModal from '@\/windows\/custom\/shared\/ConfirmPaymentModal'/);
  });

});
