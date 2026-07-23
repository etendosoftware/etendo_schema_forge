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
    assert.match(sources[0], /border-border-structural/);
    assert.match(sources[1], /border-border-structural/);
    assert.match(sources[2], /border-border-structural/);
  });
});
