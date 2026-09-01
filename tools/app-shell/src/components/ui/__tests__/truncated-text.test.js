/**
 * TruncatedText — structural contract (source-reading).
 *
 * Behaviour lives in the co-located vitest suite (`truncated-text.vitest.jsx`), which renders the
 * component and stubs the layout metrics jsdom cannot produce. This file pins the decisions that
 * are easy to undo by accident and satisfies the repo's `.test.js`-only coverage detection for a
 * new source file.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'truncated-text.jsx'), 'utf8');

describe('TruncatedText — structure', () => {
  // Without its own provider the component would throw in any tree that does not already mount
  // one, which is most of them — same reasoning as CopyLinkButton.
  it('carries its own TooltipProvider', () => {
    assert.match(src, /<TooltipProvider/);
  });

  // Controlled `open` is what makes the "only when clipped" rule possible; letting Radix manage
  // it would open the tooltip on every short label too.
  it('drives the tooltip from a controlled open state', () => {
    assert.match(src, /open=\{open\}/);
    assert.match(src, /onOpenChange=\{handleOpenChange\}/);
  });

  it('opens only when the text is actually clipped, with a pixel of slack', () => {
    assert.match(src, /scrollWidth > el\.clientWidth \+ 1/);
  });

  it('asks the browser to ellipsise the line', () => {
    assert.match(src, /'block w-full truncate'/);
  });

  // The tooltip body is the point of the component: it must wrap, not clip a second time.
  it('lets the tooltip body wrap', () => {
    assert.match(src, /whitespace-normal/);
    assert.match(src, /break-words/);
  });
});
