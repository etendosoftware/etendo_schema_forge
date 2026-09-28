import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ETP-5443 guardrail — the pre-cookie-session storage keys have exactly one legitimate
 * reader left: `purgeLegacyAuthStorage`.
 *
 * ADR-0001 moved the session into an `__Host-go_session` HttpOnly cookie. Nothing writes
 * `LEGACY_AUTH_KEYS` (`sf_auth_*`, `sf_platform_token`, `sf_platform_auth_method` —
 * `@etendosoftware/app-shell-core/src/auth/session.js`) to `localStorage` any more, and
 * `purgeLegacyAuthStorage` actively deletes them on migration. A call site that still reads
 * one of these keys is not "falling back to legacy" — it is reading a value that can never
 * be there again, which is exactly the bug Francisco hit: the demo→PRO upgrade silently
 * failed because the billing code read `sf_platform_token` from `localStorage` while the
 * backend was bearer-only. That failure mode is SILENT (a missing token, not a thrown
 * error), which is why this needs a static guard rather than relying on it surfacing in a
 * manual test every time.
 *
 * Two ways out, mirroring `no-raw-fetch.test.js`:
 *   - the file-level list below, for a call site that is a pre-existing, already-audited
 *     gap (came from develop before this guard existed);
 *   - a `legacy-auth-ok:` comment on (or directly above) the line, for a NEW call site that
 *     has a genuine reason to touch one of these keys (e.g. `purgeLegacyAuthStorage` itself,
 *     which lives in the core package and is out of this guard's reach).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src');
const CORE_SESSION_SRC_PATH = join(
  __dirname, '..', '..', '..', 'node_modules', '@etendosoftware', 'app-shell-core', 'src', 'auth', 'session.js',
);

const OPT_OUT = 'legacy-auth-ok';

// ETP-5455 emptied this list: every pre-existing offender now reads the session through the
// cookie-aware helpers (the CSRF proof from sessionCredentials, the credential from apiFetch's
// ambient session, the signed-in identity from lib/sessionIdentity.js). It must stay empty — a
// new reader belongs behind those helpers, and a genuine exception carries a `legacy-auth-ok:`
// comment on its line instead of an entry here.
const ALLOWED_FILES = new Map([]);

/**
 * `LEGACY_AUTH_KEYS` is internal to the core package (not part of its public export surface —
 * only `purgeLegacyAuthStorage`, which uses it, is exported). Read it statically from the
 * installed core's source rather than hardcoding the list here, so this guard tracks the real
 * list even if a key is ever added or removed upstream.
 */
function readLegacyAuthKeys() {
  const coreSrc = readFileSync(CORE_SESSION_SRC_PATH, 'utf8');
  const match = coreSrc.match(/const LEGACY_AUTH_KEYS\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(
    match,
    'app-shell-core/src/auth/session.js no longer defines LEGACY_AUTH_KEYS as a plain array — '
    + 'update this guard\'s extraction to match its new shape.',
  );
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function buildLegacyKeyPattern(keys) {
  const alternation = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`['"\`](?:${alternation})['"\`]`);
}

function collectSourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      collectSourceFiles(full, acc);
      continue;
    }
    if (!/\.jsx?$/.test(entry)) continue;
    if (/\.(test|vitest)\.jsx?$/.test(entry)) continue;
    acc.push(full);
  }
  return acc;
}

/** Blanks comments while preserving line count, so prose that only NAMES a key is not a hit. */
function blankComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

function legacyKeyLines(source, pattern) {
  const lines = source.split('\n');
  const code = blankComments(source).split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!pattern.test(code[i])) continue;
    // The opt-out marker lives in a comment, so it is read from the ORIGINAL lines.
    const nearby = `${lines[i - 2] || ''}\n${lines[i - 1] || ''}\n${lines[i]}`;
    if (nearby.includes(OPT_OUT)) continue;
    hits.push(i + 1);
  }
  return hits;
}

describe('no legacy auth-storage access (ETP-5443 / ADR-0001 cookie-session migration)', () => {
  const legacyKeys = readLegacyAuthKeys();

  it('LEGACY_AUTH_KEYS resolved from the core is non-empty (this guard has something to check)', () => {
    assert.ok(legacyKeys.length > 0, 'expected app-shell-core to still define at least one legacy auth key');
  });

  it('no source file reads or writes a legacy auth-storage key outside the allowed exceptions', () => {
    const pattern = buildLegacyKeyPattern(legacyKeys);
    const offenders = [];
    for (const file of collectSourceFiles(SRC)) {
      const rel = relative(SRC, file);
      if (ALLOWED_FILES.has(rel)) continue;
      const hits = legacyKeyLines(readFileSync(file, 'utf8'), pattern);
      const name = rel.split(sep).join('/');
      for (const line of hits) offenders.push(`${name}:${line}`);
    }

    assert.deepEqual(
      offenders,
      [],
      'These call sites read/write a pre-cookie-session localStorage key — under cookie\n'
      + 'sessions nothing writes these any more, so the read is silently dead (this is the exact\n'
      + 'shape of the ETP-5443 sf_platform_token billing bug):\n'
      + offenders.map((o) => `  - ${o}`).join('\n')
      + `\n\nLegacy keys: ${legacyKeys.join(', ')}\n`
      + '\nUse the session/auth APIs instead of reading these keys directly. If the call is a\n'
      + `genuine, reviewed exception, put a "${OPT_OUT}: <reason>" comment on it or on the line\n`
      + 'above.',
    );
  });

  it('every allowed exception still exists and still needs the exception', () => {
    const pattern = buildLegacyKeyPattern(legacyKeys);
    for (const [file, reason] of ALLOWED_FILES) {
      const full = join(SRC, file);
      assert.doesNotThrow(() => statSync(full), `${file} is listed as an exception but no longer exists`);
      assert.ok(reason.length > 10, `${file} needs a real reason, got "${reason}"`);
      const hits = legacyKeyLines(readFileSync(full, 'utf8'), pattern);
      assert.ok(hits.length > 0, `${file} is listed as an exception but no longer reads/writes a legacy key — remove the entry`);
    }
  });
});

describe('no-legacy-auth-storage guard behavior (proven with fixtures)', () => {
  const legacyKeys = ['sf_platform_token', 'sf_auth_token'];
  const pattern = buildLegacyKeyPattern(legacyKeys);

  it('RED — reproduces the billing bug: a bare localStorage read of a legacy key is flagged', () => {
    const src = "const token = localStorage.getItem('sf_platform_token');\n";
    const hits = legacyKeyLines(src, pattern);
    assert.deepEqual(hits, [1], 'a raw legacy-key read must be flagged on its line');
  });

  it('GREEN — a file that only mentions the key in a comment is not flagged', () => {
    const src = '// develop used to read sf_platform_token here; the cookie migration removed it.\n'
      + "const token = getSessionToken();\n";
    const hits = legacyKeyLines(src, pattern);
    assert.deepEqual(hits, [], 'a comment-only mention must not be flagged');
  });

  it('GREEN — an opted-out line is not flagged', () => {
    const src = "const token = localStorage.getItem('sf_platform_token'); // legacy-auth-ok: one-off migration shim, removed after ETP-9999\n";
    const hits = legacyKeyLines(src, pattern);
    assert.deepEqual(hits, [], 'a legacy-auth-ok comment must suppress the hit on that line');
  });

  it('GREEN — an opt-out on the line above still suppresses the hit', () => {
    const src = '// legacy-auth-ok: one-off migration shim, removed after ETP-9999\n'
      + "const token = localStorage.getItem('sf_platform_token');\n";
    const hits = legacyKeyLines(src, pattern);
    assert.deepEqual(hits, [], 'a legacy-auth-ok comment one line above must suppress the hit');
  });
});
