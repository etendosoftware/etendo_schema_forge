import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'NewPaymentModal.jsx'), 'utf8');

describe('NewPaymentModal', () => {
  it('exports NewPaymentModal as the default export', () => {
    assert.match(src, /export default function NewPaymentModal/);
  });

  // ETP-4314: fmt() used to build its own try/catch-wrapped
  // `Intl.NumberFormat(undefined, { style: 'currency', currency: curr })` call
  // with no `useGrouping`, so amounts >= 1000 in the invoice picker's option
  // labels lost the thousands separator. It must now delegate entirely to the
  // shared formatCurrency() instead of hand-rolling Intl.
  it('delegates fmt entirely to the shared formatCurrency() (no hand-rolled try/catch Intl.NumberFormat)', () => {
    assert.match(src, /import \{ formatCurrency \} from '@\/lib\/formatCurrency\.js';/);
    assert.match(
      src,
      /function fmt\(val, curr\) \{\s*\n\s*const n = [^\n]+;\s*\n\s*return formatCurrency\(curr, n\);\s*\n\s*\}/,
    );
    assert.doesNotMatch(src, /new Intl\.NumberFormat/);
  });

  it('uses fmt to render both the invoice total and its outstanding amount in the invoice-mode option label', () => {
    assert.match(
      src,
      /\{fmt\(inv\.grandTotalAmount, inv\['currency\$_identifier'\]\)\}[\s\S]*?\{fmt\(inv\.outstandingAmount, inv\['currency\$_identifier'\]\)\}/,
    );
  });

  it('supports both credit-advance and linked-to-invoice modes', () => {
    assert.match(src, /const \[mode, setMode\] = useState\('credit'\);/);
    assert.match(src, /setMode\('invoice'\)/);
  });
});
