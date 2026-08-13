import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'DetailView.jsx'), 'utf8');

/**
 * Regression guard for ETP-4173: the callout field-change guard must allow
 * ISO date values (yyyy-MM-dd) to pass through so that date-column callouts
 * (e.g. SifInvoiceOperationDateCallout on invoiceDate) fire when the user
 * picks a date, keeping dependent fields like dateAcct in sync.
 */
describe('DetailView — callout guard allows ISO date values (ETP-4173)', () => {
  it('includes a yyyy-MM-dd regex branch in the callout field-change guard', () => {
    assert.match(src, /\\d\{4\}-\\d\{2\}-\\d\{2\}/);
  });

  it('guard has three branches: UUID, numeric, and ISO date', () => {
    assert.match(src, /\[0-9A-Fa-f\]\{32\}[\s\S]{0,60}-\?\\d\+[\s\S]{0,60}\\d\{4\}-\\d\{2\}-\\d\{2\}/);
  });
});
