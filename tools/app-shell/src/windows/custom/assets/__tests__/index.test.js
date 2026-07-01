import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');

describe('AssetsWindow custom wrapper', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function App/);
  });

  it('imports AssetsPage and api from the generated assets artifact', () => {
    assert.match(src, /import AssetsPage,\s*\{\s*api\s*\}\s*from\s*'@generated\/assets.*AssetsPage'/);
  });

  it('passes saveBeforeProcesses to AssetsPage', () => {
    assert.match(src, /saveBeforeProcesses/);
  });

  it('falls back to windowMeta when window prop is absent', () => {
    assert.match(src, /window\s*\|\|\s*windowMeta/);
  });

  it('forwards api={api} to AssetsPage', () => {
    assert.match(src, /api=\{api\}/);
  });

  it('spreads rest props onto AssetsPage', () => {
    assert.match(src, /\.\.\.\s*rest/);
  });

  it('defines windowMeta with name Assets and category finance', () => {
    assert.match(src, /windowMeta\s*=\s*\{[^}]*name:\s*'Assets'/s);
    assert.match(src, /windowMeta\s*=\s*\{[^}]*category:\s*'finance'/s);
  });

  it('sets a data-testid on the AssetsPage element', () => {
    assert.match(src, /data-testid=/);
  });
});
