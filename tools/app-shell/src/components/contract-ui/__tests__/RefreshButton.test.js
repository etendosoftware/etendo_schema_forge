/**
 * RefreshButton — structural contract (source-reading).
 *
 * The component started out under `components/financial-accounts/` and moved here once
 * `ListModalWindow` (Reglas de matcheo) needed the same control: it is a plain clone of
 * ListView's own private refresh button, so it belongs beside ListView, not inside the
 * financial-account feature folder. `financial-accounts/index.js` keeps re-exporting it
 * because all four of that feature's toolbars still import it through the barrel.
 *
 * Behaviour is covered where the button is actually wired: AccountsToolbar.vitest.jsx,
 * StatementsToolbar.vitest.jsx, MovementsToolbar/__tests__/index.vitest.jsx and
 * ListModalWindow.vitest.jsx. This file locks the invariants all of those depend on: one
 * shared definition of the `finance-refresh-button` testid, an icon-only button whose
 * accessible name comes from the caller's i18n `label`, and no state/effect of its own —
 * every reload lives in the hosting toolbar or window.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'RefreshButton.jsx'), 'utf8');
const barrel = readFileSync(
  join(__dirname, '..', '..', 'financial-accounts', 'index.js'),
  'utf8',
);
const listModalWindow = readFileSync(join(__dirname, '..', 'ListModalWindow.jsx'), 'utf8');

describe('RefreshButton — module shape', () => {
  it('exports the component as a named export', () => {
    assert.match(src, /export function RefreshButton\(\{/);
  });

  it('takes only the reload handler and its label', () => {
    assert.match(src, /export function RefreshButton\(\{\s*onRefresh,\s*label,?\s*\}\)/);
  });

  it('lives in contract-ui and is re-exported from the financial-accounts barrel', () => {
    assert.match(
      barrel,
      /export \{ RefreshButton \} from '\.\.\/contract-ui\/RefreshButton\.jsx'/,
    );
    // The barrel must NOT resolve a local copy — a second definition would fork the testid.
    assert.doesNotMatch(barrel, /from '\.\/RefreshButton\.jsx'/);
  });

  it('is consumed by ListModalWindow through the co-located relative path', () => {
    assert.match(listModalWindow, /import \{ RefreshButton \} from '\.\/RefreshButton\.jsx'/);
  });
});

describe('RefreshButton — E2E testid contract', () => {
  it('keeps the shared finance-refresh-button testid', () => {
    assert.match(src, /data-testid="finance-refresh-button"/);
  });
});

describe('RefreshButton — accessibility and i18n', () => {
  it('renders a non-submitting button that calls onRefresh', () => {
    assert.match(src, /type="button"/);
    assert.match(src, /onClick=\{onRefresh\}/);
  });

  it('labels the icon-only button from the caller-supplied label (no hardcoded string)', () => {
    assert.match(src, /title=\{label\}/);
    assert.match(src, /aria-label=\{label\}/);
    // The label is resolved by the hosting toolbar via useUI — never inlined here.
    assert.doesNotMatch(src, /from '@\/i18n'/);
  });

  it('draws the same RefreshCw icon as ListView own refresh control', () => {
    assert.match(src, /import \{ RefreshCw \} from 'lucide-react'/);
    assert.match(src, /<RefreshCw/);
  });
});

describe('RefreshButton — presentational only', () => {
  it('owns no state, effect or data fetching', () => {
    assert.doesNotMatch(src, /useState|useEffect|fetch\(/);
  });
});
