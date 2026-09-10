import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', '..', '..');

const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

// Choke-point contract for ETP-4492: the dashboard period filter must be
// cleared on EVERY logout path. The design centralizes this in a single hook
// (`useLogout`) so no call site can forget to clear. These tests validate the
// choke point structurally — the behavioral clear-then-logout ordering is
// asserted in src/auth/__tests__/useLogout.vitest.jsx.
//
// Assertions are intentionally loose about formatting and call counts: they
// verify the invariants (single choke point, no bypass) rather than exact
// whitespace or a fixed number of logout paths, so reformatting or a
// legitimate 5th logout consumer will not break them.

// Every module (besides useLogout itself) that logs a user out.
//
// `hooks/useEntity.js` used to be here: it had its own `res.status === 401 -> logout()`
// blocks. ETP-5022 moved that path into the shared request helper, so the module that logs
// a user out on an expired session is now `auth/useApiFetch.js` — for EVERY call site at
// once, not just the ones that remembered to check. That is a strictly wider guarantee, and
// this list follows the choke point rather than the old call sites.
const LOGOUT_CONSUMERS = [
  'auth/useApiFetch.js',
  'components/UserAvatarButton.jsx',
  'pages/OAuth2ClientsPage.jsx',
];

describe('useLogout — the single clear+logout choke point', () => {
  const src = read('auth/useLogout.js');

  it('imports clearStoredDateRange from the date range context', () => {
    assert.match(
      src,
      /import\s*\{\s*clearStoredDateRange\s*\}\s*from\s*'@\/components\/dashboard\/DashboardDateRangeContext(\.jsx)?'/,
    );
  });

  it('gets logout from the session (it wraps the core logout)', () => {
    // `useAuthOptional` rather than `useAuth` since ETP-5022: useApiFetch is now a caller,
    // and it must not throw in a tree with no AuthProvider. Either reader satisfies the
    // contract as long as the logout action comes from the session.
    assert.match(src, /useAuthOptional\(\)/);
    assert.match(src, /auth\?\.logout/);
  });

  it('calls clearStoredDateRange() before delegating the logout', () => {
    const clearIdx = src.indexOf('clearStoredDateRange(');
    // The delegation is `(logout || notifyAmbientUnauthorized)()` — the fallback keeps the
    // clear working when there is no provider, so match the call rather than a bare name.
    const logoutIdx = src.search(/\(logout \|\| notifyAmbientUnauthorized\)\(\)|\blogout\(\)/);
    assert.ok(clearIdx !== -1, 'clearStoredDateRange() must be called');
    assert.ok(logoutIdx !== -1, 'the logout action must be invoked');
    assert.ok(clearIdx < logoutIdx, 'clear must run before logout');
  });
});

describe('logout consumers route through useLogout (no bypass)', () => {
  for (const rel of LOGOUT_CONSUMERS) {
    describe(rel, () => {
      const src = read(rel);

      it('imports useLogout from the auth choke point', () => {
        assert.match(
          src,
          /import\s*\{\s*useLogout\s*\}\s*from\s*'@\/auth\/useLogout(\.js)?'/,
        );
      });

      it('obtains its logout action from useLogout()', () => {
        assert.match(src, /useLogout\(\)/);
      });

      it('does NOT call clearStoredDateRange directly (only useLogout does)', () => {
        assert.doesNotMatch(src, /clearStoredDateRange\s*\(/);
      });

      it('does NOT destructure logout from useAuth (would bypass the clear)', () => {
        // Any `{ ...logout... } = useAuth()` destructuring would let the raw
        // core logout escape without clearing the range.
        assert.doesNotMatch(src, /\{[^}]*\blogout\b[^}]*\}\s*=\s*useAuth\(\)/);
      });
    });
  }
});
