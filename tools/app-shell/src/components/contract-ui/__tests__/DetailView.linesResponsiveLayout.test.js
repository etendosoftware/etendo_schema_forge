import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'DetailView.jsx'), 'utf8');

describe('DetailView — lines layout responsive flow (inline-editable)', () => {
  it('inline-editable outer column is overflow-y-auto so the page scrolls when the viewport is short', () => {
    // Acts as the single vertical scroll for the whole document when form +
    // lines + bottom section overflow the viewport (e.g. 1366×768). The
    // previous `overflow-hidden` clipped the bottom section out of view and
    // left no way to reach Documentos / Notas / Resumen.
    assert.match(
      src,
      /linesLayout === 'inlineEditable'[\s\S]*?'flex flex-col overflow-y-auto'/s,
      'inline-editable outer column must opt into overflow-y-auto',
    );
    assert.doesNotMatch(
      src,
      /linesLayout === 'inlineEditable' \? 'flex flex-col overflow-hidden'/,
      'inline-editable outer column must not return to overflow-hidden',
    );
  });

  it('intermediate inline-editable wrappers do NOT capture vertical space via flex-1 + min-h-0', () => {
    // The `flex-1 min-h-0` chain that used to sit on 1808/1809 absorbed the
    // overflow silently and prevented the outer overflow-y-auto from kicking
    // in. The fix is to let those wrappers flow naturally — the lines area
    // grows with content and the outer column owns the scroll.
    assert.doesNotMatch(
      src,
      /linesLayout === 'inlineEditable' \? 'flex-1 min-h-0 flex flex-col'/,
      'wrapper 1808 must not re-introduce flex-1 min-h-0 for inline-editable',
    );
    assert.doesNotMatch(
      src,
      /linesLayout === 'inlineEditable' \? 'flex flex-col min-h-0 flex-1'/,
      'wrapper 1809 must not re-introduce flex-1 min-h-0 for inline-editable',
    );
  });

  it('tabs section in inline-editable mode flows naturally (no flex-1 / min-h-0 / relative-only)', () => {
    // Was: 'mt-1 flex-1 flex flex-col min-h-0 relative'
    // Is:  'mt-1 flex flex-col relative'
    assert.match(
      src,
      /linesLayout === 'inlineEditable' \? 'mt-1 flex flex-col relative' : 'mt-2'/,
      'tabs section wrapper must use the natural-flow class string for inline-editable',
    );
  });

  it('the lines wrapper renders with the ref but no flex / overflow / max-height clamp', () => {
    // Sonar caught a dead className ternary (`? '' : ''`) — both branches were
    // empty, so the className was dropped entirely. The wrapper now contains
    // only the ref and is part of the outer scroll context.
    assert.match(
      src,
      /<div ref=\{linesScrollRef\}>/,
      'lines wrapper must render with only the ref attribute, no className clamp',
    );
    assert.doesNotMatch(
      src,
      /ref=\{linesScrollRef\}[^>]*className=\{linesLayout === 'inlineEditable' \? '[^']*max-h-/,
      'lines wrapper must not re-introduce a max-h cap that would restore internal scroll',
    );
    assert.doesNotMatch(
      src,
      /ref=\{linesScrollRef\}[^>]*className=\{linesLayout === 'inlineEditable' \? '[^']*overflow-/,
      'lines wrapper must not re-introduce internal overflow',
    );
    assert.doesNotMatch(
      src,
      /ref=\{linesScrollRef\}[^>]*className=\{linesLayout === 'inlineEditable' \? '[^']*flex-1/,
      'lines wrapper must not re-capture vertical space via flex-1',
    );
  });
});
