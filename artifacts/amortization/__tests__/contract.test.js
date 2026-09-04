import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Amortization — listSortBy regression test (ETP-4979)
//
// Bug: the Amortization list sorted alphabetically by "Name" instead of by
// accounting date, because decisions.json declared no `window.listSortBy` —
// ListView.jsx's `parseListSortBy()` then defaulted to `creationDate desc`,
// a field that doesn't exist in this window's contract, so NEO silently
// ignored the sort request and the API fell back to its own default
// (alphabetical). Fix: `decisions.json → window.listSortBy` was set to
// `"accountingDate desc"` and the pipeline regenerated
// (`make regen ONLY=amortization`).
//
// This test locks both the source of truth (decisions.json) and its
// resolved output (contract.json) so a future regeneration or edit cannot
// silently drop the setting again.
// ---------------------------------------------------------------------------

const decisions = JSON.parse(
  readFileSync(join(__dirname, '..', 'decisions.json'), 'utf8'),
);
const contract = JSON.parse(
  readFileSync(join(__dirname, '..', 'contract.json'), 'utf8'),
);

describe('Amortization — window.listSortBy (ETP-4979)', () => {
  it('decisions.json declares listSortBy as "accountingDate desc"', () => {
    assert.equal(decisions.window?.listSortBy, 'accountingDate desc');
  });

  it('contract.json resolves listSortBy as "accountingDate desc" under frontendContract.window', () => {
    assert.equal(
      contract.frontendContract?.window?.listSortBy,
      'accountingDate desc',
    );
  });

  it('contract.json header entity declares an accountingDate field (the sort target must exist)', () => {
    const fields = contract.frontendContract?.entities?.header?.fields ?? [];
    const hasAccountingDate = fields.some((f) => f.name === 'accountingDate');
    assert.ok(
      hasAccountingDate,
      'Expected header entity to declare an "accountingDate" field — listSortBy must point at a real field or NEO silently ignores the sort',
    );
  });
});
