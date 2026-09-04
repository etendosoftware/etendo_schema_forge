import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'useVectorSearchContracts.js'), 'utf8');

describe('useVectorSearchContracts', () => {
  it('loads generated contracts by spec name', () => {
    assert.match(src, /import\.meta\.glob\('@generated\/\*\/contract\.json'\)/);
    assert.match(src, /specNameFromContractPath/);
  });

  it('does not load contracts when disabled', () => {
    assert.match(src, /if\s*\(!enabled\)\s*return undefined/);
  });

  it('ignores asynchronous results after unmount', () => {
    assert.match(src, /let active = true/);
    assert.match(src, /if\s*\(active\)\s*setContracts/);
    assert.match(src, /active = false/);
  });
});
