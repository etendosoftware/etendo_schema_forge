import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

/**
 * Repo-wide invariants for the cookie-session contract (ETP-4576).
 *
 * Why these exist rather than relying on the unit suites: the failure mode of this
 * migration is silent. A `if (!token) return` does not throw — it makes the request
 * never happen, and the component renders empty. The vitest suites mock the very
 * hooks being migrated, so they stayed green (11166 passing) while 62 Playwright
 * specs were failing on exactly this. Playwright does catch it, but it covers the
 * flows it covers, not every file.
 *
 * These assertions are exhaustive by construction: they read every production
 * source file, so "did we miss a call site?" stops being a judgement call. When
 * they pass, the migration is complete by definition.
 *
 * IMPORTANT — comments are stripped before matching. The migrated code explains
 * itself with prose like "instead of a bearer token", and a naive whole-file regex
 * would match that forever. Only executable code is asserted on.
 */

const SRC = resolve(import.meta.dirname, '..');

/** Reads this contract's own vocabulary; asserting on it would be circular. */
const EXEMPT = new Set([
  'test/sessionContract.js',      // the assertion helper: it looks FOR these strings
  'test/authContextMock.js',      // the shared useAuth mock
  '__tests__/sessionContractInvariants.test.js',
]);

function sourceFiles(dir = SRC, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      sourceFiles(p, acc);
    } else if (/\.(js|jsx)$/.test(entry.name) && !/\.(test|vitest)\./.test(entry.name)) {
      const rel = relative(SRC, p);
      if (!EXEMPT.has(rel)) acc.push({ rel, path: p });
    }
  }
  return acc;
}

/**
 * Strips comments and string/template literals.
 *
 * Literals go too: a URL or a toast message may legitimately contain the word
 * "token" (`/oauth2/token`, "Tu sesión expiró"), and those are not credentials in
 * a header. What remains is identifiers and operators — where a real gate lives.
 */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\[\s\S]|\$\{[^{}]*\}|[^`\\])*`/g, '`L`')
    .replace(/'(?:\\.|[^'\\])*'/g, "'L'")
    .replace(/"(?:\\.|[^"\\])*"/g, '"L"');
}

const FILES = sourceFiles().map((f) => ({ ...f, code: code(readFileSync(f.path, 'utf8')) }));

describe('ETP-4576 — cookie-session invariants across app-shell source', () => {
  it('finds source files to scan (guards against a silently empty sweep)', () => {
    assert.ok(FILES.length > 300, `expected the whole tree, scanned ${FILES.length}`);
  });

  /**
   * G1 — no request carries a credential in a header. The session is the
   * `__Host-go_session` cookie; anything building an Authorization header is either
   * unmigrated or reintroducing the token the whole task removes.
   */
  it('G1: no production file builds an Authorization or Bearer header', () => {
    const offenders = FILES
      .filter((f) => /\bAuthorization\b/.test(f.code) || /\bBearer\b/.test(f.code))
      .map((f) => f.rel);
    assert.deepEqual(offenders, [], `${offenders.length} file(s) still send a credential header:\n  ${offenders.join('\n  ')}`);
  });

  /**
   * G2 — the silent killer. Nothing may gate a request on a client-held token,
   * because `useAuth()` never exposes one under the cookie session: the gate is
   * permanently false and the request is simply never issued.
   */
  it('G2: no production file gates behaviour on a client-held token', () => {
    const GATE = /!\s*(?:token|authToken|accessToken|bearerToken)\b|\b(?:token|authToken)\s*\?\s*\{/;
    const offenders = FILES.filter((f) => GATE.test(f.code)).map((f) => f.rel);
    assert.deepEqual(offenders, [], `${offenders.length} file(s) still gate on a token:\n  ${offenders.join('\n  ')}`);
  });
});
