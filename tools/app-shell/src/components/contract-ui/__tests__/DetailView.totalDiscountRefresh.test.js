import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'DetailView.jsx'), 'utf8');

// ETP-4777 — regression found during manual browser verification: saving the
// document-level discount % (handleTotalDiscountChange) PATCHes
// etgoTotalDiscount and applies it optimistically via hook.handleChange, but
// never refreshed grandTotalAmount/summedLineAmount — even though the PATCH
// makes the backend recompute grandTotalAmount (GET-time discount
// compensation). DocumentTotalsPanel's persisted-baseline (ETP-4777) then
// froze on the stale pre-discount grandTotalAmount the instant inputPct
// caught up to the (also stale) totalDiscountPct prop, because both matched
// and hasPendingEdit went false. Verified live: typing 30% on a real Draft
// order kept showing the pre-discount Total (597,69 €) instead of the
// backend's already-correct 418,38 € until a full page reload.
describe('DetailView.handleTotalDiscountChange — ETP-4777 header totals refresh', () => {
  const fnMatch = src.match(/const handleTotalDiscountChange = useCallback\(async \(pct\) => \{[\s\S]*?\}, \[[^\]]*\]\);/);

  it('defines handleTotalDiscountChange', () => {
    assert.ok(fnMatch, 'handleTotalDiscountChange not found in DetailView.jsx');
  });

  it('calls hook.refreshHeaderTotals after a successful PATCH, so grandTotalAmount/summedLineAmount are never left stale', () => {
    const body = fnMatch[0];
    assert.match(body, /hook\.refreshHeaderTotals\?\.\(currentId\)/);
    // Must come after the res.ok check (inside the success path), not before it.
    const okCheckIdx = body.indexOf('if (!res.ok)');
    const refreshIdx = body.indexOf('hook.refreshHeaderTotals');
    assert.ok(okCheckIdx > -1 && refreshIdx > okCheckIdx, 'refreshHeaderTotals must run after the res.ok success check');
  });

  it('still keeps the optimistic etgoTotalDiscount update for instant UI feedback', () => {
    assert.match(fnMatch[0], /hook\.handleChange\?\.\('etgoTotalDiscount', pct\)/);
  });
});
