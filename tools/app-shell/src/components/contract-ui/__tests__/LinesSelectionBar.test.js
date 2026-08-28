import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'LinesSelectionBar.jsx'), 'utf8');

// ETP-4972 — LinesSelectionBar.jsx was rebuilt in place as SelectionToolbar.jsx
// (a viewport-fixed floating toolbar, not anchored to a measured DOM rect —
// see SelectionToolbar.jsx's own header comment for the full history). This
// file is now a one-release re-export shim so any straggler import of the old
// filename keeps resolving. Its own behavioral coverage (visibility, portal,
// children/dividers, close button, no DOM measurement) lives in
// SelectionToolbar.vitest.jsx / SelectionToolbar.test.js — this file only
// verifies the shim's re-export contract.
describe('LinesSelectionBar (re-export shim, ETP-4972)', () => {
  it('re-exports SelectionToolbar as its default export', () => {
    assert.match(src, /export\s*\{\s*default\s*\}\s*from\s*'\.\/SelectionToolbar\.jsx'/);
  });

  it('contains no component logic of its own (single re-export statement, no JSX/hooks)', () => {
    assert.doesNotMatch(src, /export default function/);
    assert.doesNotMatch(src, /useState|useEffect|useRef/);
    assert.doesNotMatch(src, /<[A-Za-z]/); // no JSX tags
  });
});
