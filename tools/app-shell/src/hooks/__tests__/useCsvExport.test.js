import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'useCsvExport.js'), 'utf8');

// Comment-stripped view of the source. The absence assertions below must only
// look at executable code: this hook documents its auth transport in a JSDoc
// block, so a prose mention of "Bearer"/"Authorization" there would otherwise
// match and fail the test spuriously. Both block comments (JSDoc) and `//` line
// comments are removed.
const codeOnly = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// Source-reading checks (node:test, no DOM) — behavioral coverage lives in
// useCsvExport.vitest.jsx; this guards the contract the backend relies on.
describe('useCsvExport source', () => {
  it('always forces export=csv on the query', () => {
    assert.match(src, /set\(\s*['"]export['"]\s*,\s*['"]csv['"]\s*\)/);
  });

  // ETP-4576 — the session is a server-side `__Host-go_session` cookie, so this
  // export GET authenticates purely with the cookie: `credentials: 'include'`
  // and no bearer token anywhere in the code.
  it("sends credentials: 'include' so the __Host- session cookie travels", () => {
    assert.match(codeOnly, /credentials:\s*['"]include['"]/);
  });

  it('sends no Authorization header and holds no bearer token', () => {
    assert.doesNotMatch(codeOnly, /Authorization/);
    assert.doesNotMatch(codeOnly, /Bearer/);
  });

  it('does not carry the X-Go-CSRF proof (this is a safe GET)', () => {
    assert.doesNotMatch(codeOnly, /X-Go-CSRF/);
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
