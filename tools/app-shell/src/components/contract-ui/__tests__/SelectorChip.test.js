import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'SelectorChip.jsx'), 'utf8');

describe('SelectorChip (ETP-4000 Figma chip)', () => {
  it('exports a named SelectorChip function', () => {
    assert.match(src, /export function SelectorChip/);
  });

  it('also exports as default for ergonomic imports', () => {
    assert.match(src, /export default SelectorChip/);
  });

  it('accepts the public chip API: label, onClick, onClear, clearAriaLabel, testId', () => {
    assert.match(src, /label/);
    assert.match(src, /onClick/);
    assert.match(src, /onClear/);
    assert.match(src, /clearAriaLabel/);
    assert.match(src, /testId/);
  });

  it('renders a button as the chip body so click on the chip is keyboard-accessible', () => {
    assert.match(src, /<button[\s\S]*?type="button"/);
  });

  it('forwards onClick to the chip body and testId to data-testid', () => {
    assert.match(src, /onClick=\{onClick\}/);
    assert.match(src, /data-testid=\{testId\}/);
  });

  it('renders the X icon from lucide-react', () => {
    assert.match(src, /import \{ X \} from 'lucide-react'/);
    assert.match(src, /<X[\s\S]/);
  });

  it('uses the semantic muted-foreground label token and a transparent background (the gray fill lives on the field wrapper hover, not the chip)', () => {
    assert.match(src, /text-\[hsl\(var\(--muted-foreground\)\)\]/);
    assert.match(src, /bg-transparent/);
  });

  it('paints the X icon with the semantic muted foreground', () => {
    assert.match(src, /text-\[hsl\(var\(--text-disabled\)\)\]/);
  });

  it('triggers clear on click and on Enter / Space keypress for accessibility', () => {
    assert.match(src, /onMouseDown=\{triggerClear\}/);
    assert.match(src, /event\.key === 'Enter' \|\| event\.key === ' '/);
  });

  it('stops propagation on the X so the chip onClick does not fire alongside onClear', () => {
    assert.match(src, /event\.stopPropagation\(\)/);
    assert.match(src, /event\.preventDefault\(\)/);
  });

  it('exposes a tabbable X via role="button" and aria-label', () => {
    assert.match(src, /role="button"/);
    assert.match(src, /tabIndex=\{0\}/);
    assert.match(src, /aria-label=\{clearAriaLabel\}/);
  });
});
