/**
 * Transaction Type — TransactionTypePage.jsx structural tests.
 *
 * This is the first-ever generated frontend page for transaction-type
 * (ETP-4658 onboarded the window into the regen registry). The page is
 * deliberately NOT wired into any route yet (backend-only artifact — see
 * docs/generated-custom-windows/transaction-type.md), but the generator
 * still emits the standard useWindowAccess/WindowAccessGuard wiring
 * because the contract carries a real window.id. This locks in that
 * wiring so a future regen can't silently drop it — same generator/pattern
 * already proven in artifacts/match-rule/generated/web/match-rule/EtgoMatchRuleHeaderPage.jsx.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const src = readFileSync(join(__dirname, '..', 'TransactionTypePage.jsx'), 'utf8');

const WINDOW_ID = '82922976BB524D1BAA3CF8462B9219FE';

describe('TransactionTypePage — window access wiring', () => {
  it('imports useWindowAccess and WindowAccessGuard from AuthContext', () => {
    assert.match(
      src,
      /import\s*\{\s*useWindowAccess,\s*WindowAccessGuard\s*\}\s*from\s*'@\/auth\/AuthContext\.jsx'/
    );
  });

  it('calls useWindowAccess with the real transaction-type window id', () => {
    assert.match(src, new RegExp(`useWindowAccess\\('${WINDOW_ID}'\\)`));
  });

  it('guards the "none" access tier by rendering WindowAccessGuard', () => {
    assert.match(src, /windowAccessTier === 'none'/);
    assert.match(src, new RegExp(`<WindowAccessGuard windowId="${WINDOW_ID}"\\s*/>`));
  });

  it('downgrades to read-only window state on the "read-only" access tier', () => {
    assert.match(src, /windowAccessTier === 'read-only'/);
    assert.match(src, /readOnly:\s*true/);
  });

  it('exports the default TransactionTypePage component and the api object', () => {
    assert.match(src, /export default function TransactionTypePage/);
    assert.match(src, /export const api = \{/);
  });

  it('declares the api.window.category as finance (matches decisions.json)', () => {
    assert.match(src, /"window":\s*\{\s*"category":\s*"finance"\s*\}/);
  });
});
