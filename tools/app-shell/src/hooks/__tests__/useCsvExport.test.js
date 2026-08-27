import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'useCsvExport.js'), 'utf8');

// Source-reading checks (node:test, no DOM) — behavioral coverage lives in
// useCsvExport.vitest.jsx; this guards the contract the backend relies on.
describe('useCsvExport source', () => {
  it('always forces export=csv on the query', () => {
    assert.match(src, /set\(\s*['"]export['"]\s*,\s*['"]csv['"]\s*\)/);
  });

  it('sends the session Bearer token', () => {
    // ETP-5022 — the header is no longer a literal here: it comes from the canonical
    // builder, which also attaches Accept-Language. Asserting the builder call is the
    // stronger check, and test/auth-header-policy.test.js fails the build if any file
    // goes back to hand-rolling the header.
    assert.match(src, /(authHeaders|buildHeaders)\s*\(/);
  });

  it('skips null/undefined/empty params', () => {
    assert.match(src, /value !== undefined && value !== null && value !== ''/);
  });

  it('downloads the response as a Blob via an anchor', () => {
    assert.match(src, /res\.blob\(\)/);
    assert.match(src, /a\.download/);
  });

  it('throws on a non-ok response', () => {
    assert.match(src, /HTTP \$\{res\.status\}/);
  });
});
