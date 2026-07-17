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
const LOGOUT_CONSUMERS = [
  'hooks/useEntity.js',
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

  it('gets logout from useAuth (it wraps the core logout)', () => {
    assert.match(src, /\bconst\s*\{\s*logout\s*\}\s*=\s*useAuth\(\)/);
  });

  it('calls clearStoredDateRange() before logout()', () => {
    const clearIdx = src.indexOf('clearStoredDateRange(');
    const logoutIdx = src.indexOf('logout()');
    assert.ok(clearIdx !== -1, 'clearStoredDateRange() must be called');
    assert.ok(logoutIdx !== -1, 'logout() must be called');
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
