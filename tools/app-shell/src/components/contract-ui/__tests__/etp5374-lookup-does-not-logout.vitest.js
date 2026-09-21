import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * ETP-5374 — the duplicate pre-check must not be able to log the user out.
 *
 * `apiFetch` routes a 401 to the ambient logout handler unless the caller passes
 * `on401: 'ignore'` (app-shell-core `auth/api.js`). `existingKeyFetchFn` did not pass it, so a
 * single 401 from the lookup tore down the session and took the open import dialog with it,
 * mid-review, with nothing said — the user saw the popup vanish.
 *
 * Two things make that more than a theoretical edge:
 *
 * - The lookup's URL is built from the window's base, and when that base is wrong the request
 *   lands outside `/sws/neo`, where Etendo's own auth filter answers 401 rather than 404. That
 *   is exactly the First Steps shape ETP-5371 describes.
 * - ETP-5374 batches by URL length instead of by key count, so a full file issues ~136 requests
 *   where it used to stop at the first failure. A logout that used to need one unlucky response
 *   now gets a hundred chances.
 *
 * The rule itself does not depend on either: a pre-flight check whose contract is that failing
 * must never block an import cannot be allowed to end the session. A genuinely expired session
 * still logs out at the next real request, which is the one the user is waiting on.
 *
 * Asserted against the source, in the same family as `test/auth-header-policy.test.js` and
 * `test/no-raw-fetch.test.js`: what must hold is that this ONE call site carries the option, and
 * behaviour-level coverage of the hook would need the whole auth/ui provider stack around it to
 * say the same thing.
 */
function repoRoot() {
  let dir = process.cwd();
  while (!existsSync(resolve(dir, 'tools/app-shell/src/components/contract-ui/useWindowImportDialog.js'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`could not locate the repo root from ${process.cwd()}`);
    dir = parent;
  }
  return dir;
}

const SOURCE = readFileSync(
  resolve(repoRoot(), 'tools/app-shell/src/components/contract-ui/useWindowImportDialog.js'),
  'utf8',
);

describe('ETP-5374 — the existing-record lookup never triggers a logout', () => {
  it('still has exactly one lookup fetch to reason about', () => {
    // The whole assertion below is about one call site. If a second one appears, this test has
    // to be told about it rather than silently covering half the surface.
    expect(SOURCE.match(/apiFetch\(`\/\$\{entity\}\?/g) ?? []).toHaveLength(1);
  });

  it('passes on401: ignore, so a 401 cannot end the session mid-review', () => {
    const [, options] = SOURCE.match(/apiFetch\(`\/\$\{entity\}\?[^`]*`\s*,\s*(\{[^}]*\})\s*\)/) ?? [];
    expect(options, 'the lookup fetch must pass an options object').toBeTruthy();
    expect(options).toMatch(/on401:\s*'ignore'/);
  });

  it('still treats a failed lookup as a failure rather than swallowing the response', () => {
    // `on401: 'ignore'` hands the 401 back as an ordinary non-ok response. It must still throw,
    // or the batch would be recorded as a successful check that found no duplicates — which is
    // the exact lie ETP-5374 exists to stop telling.
    expect(SOURCE).toMatch(/if \(!res\.ok\) throw new Error\(`existing-record lookup failed/);
  });
});
