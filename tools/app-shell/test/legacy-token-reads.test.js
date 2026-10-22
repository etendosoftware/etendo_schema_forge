import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ETP-5454 guardrail — the legacy browser token keys are never read again.
 *
 * ADR-0001 (ETP-4576) moved the session to the `__Host-go_session` httpOnly cookie and the
 * X-Go-CSRF proof, so the browser holds no bearer token. The `sf_auth_token` /
 * `sf_platform_token` / `sf_admin_token` keys in localStorage are therefore dead: nothing
 * writes them, so every read of them evaluates to `undefined` or `null`.
 *
 * That is exactly why the reads are dangerous rather than harmless. A call site passing
 * `token: localStorage.getItem('sf_auth_token')` reads as "this request is authenticated"
 * while in fact it contributes no credential at all — the request silently rides on whatever
 * `apiFetch` attaches, which is the right cookie. If that indirection is ever needed for real,
 * the guard below forces the change to be made deliberately in the canonical place
 * (`@etendosoftware/app-shell-core/auth`) rather than smuggled in through a storage key.
 *
 * The sibling control `auth-header-policy.test.js` covers the OTHER half of the same migration
 * (no hand-rolled `Authorization` header). Its allowance list is deliberately left untouched by
 * ETP-5454 — this file is the separate record of the dead-key reads the issue listed, so both
 * halves can be reasoned about without either control absorbing the other.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src');

// The keys ADR-0001 retired. `sf_admin_token` was in the same family: it was only ever a
// developer-tool convenience and, like the other two, has had no writer since the cookie session.
const LEGACY_KEYS = ['sf_auth_token', 'sf_platform_token', 'sf_admin_token'];

// The eight files ETP-5454 names. Seven were cleaned up by ETP-5455 (merged 2026-09-23, the day
// after the issue was filed); `explorer/useDiscovery.js` still read `sf_admin_token`. They are
// listed explicitly so a rename or a move is caught instead of quietly dropping a file from the
// tracked set — the whole-src scan below would pass either way.
const REVIEWED_FILES = [
  'components/ChangePasswordDialog.jsx',
  'windows/custom/user/InviteUserDialog.jsx',
  'lib/neoWebhookClient.js',
  'lib/menuTree.js',
  'lib/flags/useAccountIdentity.js',
  'lib/flags/bootstrap.js',
  'lib/observability/health-events.js',
  'explorer/useDiscovery.js',
];

/**
 * Blanks out comments while preserving the line count, so prose that merely NAMES a retired key
 * is not read as code. This is not optional for this file: all seven ETP-5455 cleanups explain
 * themselves in place ("it used to be read from the legacy sf_auth_token / sf_platform_token
 * keys"), so a naive grep reports seven of them as offenders and the signal is worthless.
 * Same technique as the sibling control's `stripComments`, kept separate so neither file depends
 * on the other.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

/**
 * A read is a legacy key inside a storage accessor call. Matching the storage API as well as
 * the bare key means a bare mention in real code (`const k = 'sf_auth_token'`) is caught too,
 * while the same string passed to something unrelated (a label, a test fixture outside
 * `__tests__`) still surfaces for a human to judge.
 */
const LEGACY_READ = new RegExp(
  `(?:localStorage|sessionStorage)\\s*\\.\\s*getItem\\s*\\(\\s*['"\`](?:${LEGACY_KEYS.join('|')})['"\`\\s]`
  + `|(?:localStorage|sessionStorage)\\s*\\[\\s*['"\`](?:${LEGACY_KEYS.join('|')})['"\`]\\s*\\]`,
);

/** The `removeItem` twin: clearing a key nobody writes is the same mistake, pointed the other way. */
const LEGACY_REMOVE = new RegExp(
  `(?:localStorage|sessionStorage)\\s*\\.\\s*removeItem\\s*\\(\\s*['"\`](?:${LEGACY_KEYS.join('|')})['"\`\\s]`,
);

function readsLegacyKey(source) {
  const code = stripComments(source);
  return LEGACY_READ.test(code) || LEGACY_REMOVE.test(code);
}

function collectSourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Test files legitimately seed and assert on these keys (the useDiscovery suite sets
      // `sf_auth_token` in localStorage to prove it is IGNORED), so they are not production
      // call sites and must not be reported.
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

describe('legacy browser token keys are never read (ETP-5454)', () => {
  it('no source file reads a retired token key out of browser storage', () => {
    const offenders = collectSourceFiles(SRC)
      .filter((file) => readsLegacyKey(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file).split(sep).join('/'));

    assert.deepEqual(
      offenders,
      [],
      'These files read a token key that ADR-0001 retired. Nothing writes these keys since the\n'
      + 'cookie session, so the read always yields null/undefined and contributes no credential:\n'
      + offenders.map((f) => `  - ${f}`).join('\n')
      + '\n\nSend the request with apiFetch/useApiFetch and let it attach the active scheme:\n'
      + "  import { apiFetch } from '@etendosoftware/app-shell-core/auth/api';\n"
      + '  // the X-Go-CSRF proof comes from getSessionCsrfToken() when a call needs it\n',
    );
  });

  it('the eight files this issue reviewed are all still present and clean', () => {
    // Guards the guard: a deleted or renamed file would otherwise leave this issue's tracked set
    // silently shorter than the issue describes.
    const missing = REVIEWED_FILES.filter((rel) => !existsSync(join(SRC, rel)));
    assert.deepEqual(
      missing,
      [],
      'These files were reviewed by ETP-5454 but no longer exist at that path. If one was moved\n'
      + 'or removed on purpose, update REVIEWED_FILES in this file so the tracked set stays honest:\n'
      + missing.map((f) => `  - ${f}`).join('\n'),
    );

    const dirty = REVIEWED_FILES
      .filter((rel) => existsSync(join(SRC, rel)))
      .filter((rel) => readsLegacyKey(readFileSync(join(SRC, rel), 'utf8')));
    assert.deepEqual(dirty, [], 'Reviewed files that regressed to a legacy key read:\n'
      + dirty.map((f) => `  - ${f}`).join('\n'));
  });
});