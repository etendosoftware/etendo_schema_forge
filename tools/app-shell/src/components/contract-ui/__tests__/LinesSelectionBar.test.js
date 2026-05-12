import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'LinesSelectionBar.jsx'), 'utf8');

describe('LinesSelectionBar', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function LinesSelectionBar/);
  });

  it('uses createPortal to avoid overflow clipping', () => {
    assert.match(src, /createPortal/);
    assert.match(src, /document\.body/);
  });

  it('returns null when visible is false or barRect is missing', () => {
    assert.match(src, /if \(!visible \|\| !barRect\) return null/);
  });

  it('positions the portal via fixed coordinates from barRect', () => {
    assert.match(src, /position:\s*'fixed'/);
    assert.match(src, /top:\s*barRect\.top/);
    assert.match(src, /left:\s*barRect\.left/);
    assert.match(src, /width:\s*barRect\.width/);
    assert.match(src, /height:\s*barRect\.height/);
  });

  it('compact prop reduces button size to 28px (vs 40px default)', () => {
    assert.match(src, /compact\s*=\s*false/);
    assert.match(src, /compact\s*\?\s*28\s*:\s*40/);
  });

  it('applies appear/dismiss animation classes', () => {
    assert.match(src, /lines-bar-appear/);
    assert.match(src, /lines-bar-dismiss/);
    assert.match(src, /closing\s*\?\s*'lines-bar-dismiss'\s*:\s*'lines-bar-appear'/);
  });

  it('hides totalLabel line when prop is null', () => {
    assert.match(src, /totalLabel\s*!=\s*null/);
  });

  it('renders a trash (delete) button and an X (close) button', () => {
    assert.match(src, /Trash2/);
    assert.match(src, /\bX\b/);
    assert.match(src, /onClick=\{onDelete\}/);
    assert.match(src, /onClick=\{onClose\}/);
  });

  it('disables the trash button while deleting', () => {
    assert.match(src, /disabled=\{deleting\}/);
  });

  it('shows selectedLabel and optional totalLabel', () => {
    assert.match(src, /\{selectedLabel\}/);
    assert.match(src, /\{totalLabel\}/);
  });

  it('uses Inter font and brand color #121217 for labels', () => {
    assert.match(src, /fontFamily:\s*'Inter'/);
    assert.match(src, /'#121217'/);
  });

  it('uses pink border and red icon for the delete button (matches ListView bar)', () => {
    assert.match(src, /#FBB1C4/);
    assert.match(src, /#F3164E/);
  });
});
