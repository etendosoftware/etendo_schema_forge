import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const urls = [
  new URL('../DocumentTotalsPanel.jsx', import.meta.url),
  new URL('../LinesBottomSection.jsx', import.meta.url),
  new URL('../BalanceFooterPanel.jsx', import.meta.url),
];

describe('generic contract UI semantic boundaries (ETP-4554)', () => {
  it('uses semantic control and structural tokens without sub-pixel boundaries', async () => {
    const sources = await Promise.all(urls.map((url) => readFile(url, 'utf8')));
    for (const source of sources) {
      assert.doesNotMatch(source, /0\.5px/);
      assert.doesNotMatch(source, /border-border\/(?:40|50|60)/);
      assert.doesNotMatch(source, /#[0-9A-Fa-f]{3,8}/);
      assert.doesNotMatch(source, /disabled:opacity/);
    }
    assert.match(sources[0], /border-border-control/);
    // ETP-4767: decorative dividers use the plain border-border token, not
    // the WCAG-gated border-border-structural one (same fix as ETP-4659's
    // Documents/Notes divider). The negative lookahead keeps this assertion
    // from accidentally passing via the unrelated border-border-control /
    // border-border-subtle tokens that also appear in these files.
    assert.match(sources[0], /border-border(?!-)/);
    assert.match(sources[1], /border-border(?!-)/);
    // BalanceFooterPanel (sources[2]) intentionally has no divider of its own
    // any more: ETP-4917 removed the difference/balanced-badge row it used to
    // separate from the debit/credit totals above (that check still runs via
    // `computeBalance` for Save/Complete blocking, it's just not rendered).
    // With only two peer total rows left, there is nothing left to divide.
  });
});
