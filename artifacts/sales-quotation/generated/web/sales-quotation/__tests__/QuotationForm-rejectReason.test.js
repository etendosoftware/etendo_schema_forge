/**
 * Sales Quotation — rejectReason field structural tests.
 *
 * Replaces e2e/tests/flows/sales-quotation-reject-reason-field.spec.js which
 * only checked that the field is visible when documentStatus='CJ' and hidden
 * otherwise. This is a displayLogic check — testable by reading the source.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'QuotationForm.jsx'), 'utf8');

describe('QuotationForm — rejectReason field', () => {
  it('declares rejectReason field', () => {
    assert.match(src, /key:\s*'rejectReason'/);
  });

  it('has displayLogic gated on documentStatus === CJ', () => {
    assert.match(src, /key:\s*'rejectReason'.*displayLogic:.*documentStatus\s*===\s*'CJ'/s);
  });

  it('is readOnly', () => {
    assert.match(src, /key:\s*'rejectReason'.*readOnly:\s*true/s);
  });

  it('is in the principal section', () => {
    assert.match(src, /key:\s*'rejectReason'.*section:\s*'principal'/s);
  });

  it('uses selector inputMode with Reject_Reason reference', () => {
    assert.match(src, /key:\s*'rejectReason'.*reference:\s*'Reject_Reason'/s);
  });
});
