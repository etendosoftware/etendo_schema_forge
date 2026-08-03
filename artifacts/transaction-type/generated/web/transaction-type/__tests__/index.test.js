/**
 * Transaction Type — index.jsx structural tests.
 *
 * index.jsx is the thin App wrapper generated for every window; it
 * declares windowMeta and forwards props into TransactionTypePage. Locks
 * in that windowMeta stays in sync with decisions.json (category, name)
 * and the real window id used by the access-guard wiring.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');

describe('Transaction Type index.jsx — windowMeta and App wrapper', () => {
  it('imports TransactionTypePage and the api object from the sibling page module', () => {
    assert.match(src, /import TransactionTypePage,\s*\{\s*api\s*\}\s*from\s*'\.\/TransactionTypePage'/);
  });

  it('declares windowMeta matching decisions.json (category: finance, name: Transaction Type)', () => {
    assert.match(src, /category:\s*'finance'/);
    assert.match(src, /name:\s*'Transaction Type'/);
  });

  it('declares windowMeta.id matching the real AD window id used for access checks', () => {
    assert.match(src, /id:\s*'82922976BB524D1BAA3CF8462B9219FE'/);
  });

  it('exports a default App component that forwards windowMeta as the window fallback', () => {
    assert.match(src, /export default function App\(/);
    assert.match(src, /window=\{window \|\| windowMeta\}/);
  });

  it('forwards api into TransactionTypePage', () => {
    assert.match(src, /<TransactionTypePage[^>]*\bapi=\{api\}/s);
  });
});
