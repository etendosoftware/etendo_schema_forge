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
  it('always forces the export param on the query, defaulting to csv', () => {
    // ETP-4997: the value is the requested format now (csv or xlsx), but the invariant this
    // guards is unchanged — the param is SET rather than merged in from the caller's params,
    // so no caller can ship a list GET that answers JSON and gets saved under a file name.
    assert.match(src, /set\(\s*['"]export['"]\s*,\s*format\s*\)/);
    // And csv stays the default, so every pre-xlsx caller keeps its old behaviour untouched.
    assert.match(src, /format\s*=\s*['"]csv['"]/);
  });

  it('sends the session Bearer token', () => {
    // ETP-5022 — the header is no longer a literal here: it comes from the unified
    // useApiFetch hook, which attaches Authorization + Accept-Language for every
    // request. Asserting the hook is in use is the stronger check, and
    // test/auth-header-policy.test.js fails the build if any file goes back to
    // hand-rolling the header.
    assert.match(src, /useApiFetch\s*\(/);
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
