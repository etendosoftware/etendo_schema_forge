import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'PaymentConciliadoBadge.jsx'), 'utf8');

describe('PaymentConciliadoBadge', () => {

  // ── Exports ────────────────────────────────────────────────────────────────

  it('exports PaymentConciliadoBadge as the default export', () => {
    assert.match(src, /export default function PaymentConciliadoBadge/);
  });

  // ── Reconciliation status ──────────────────────────────────────────────────

  it('guards on RPPC only, matching Classic\'s reconciliation model', () => {
    // Only RPPC ("Payment Cleared") means bank-reconciled in Classic — every
    // other deposited status (RPR, RDNC, PPM, PWNC, RPAE) is money that moved
    // but was not yet matched against a bank statement.
    assert.match(src, /RECONCILED_STATUS\s*=\s*'RPPC'/);
    assert.match(src, /data\?\.status/);
  });

  it('returns null when status is not RPPC', () => {
    assert.match(src, /return null/);
  });

  // ── i18n ───────────────────────────────────────────────────────────────────

  it('uses useUI hook from @/i18n', () => {
    assert.match(src, /import.*useUI.*from '@\/i18n'/);
    assert.match(src, /useUI\(\)/);
  });

  it('renders the conciliado translation key', () => {
    assert.match(src, /'conciliado'/);
  });

  // ── Color token ────────────────────────────────────────────────────────────

  it('uses green background color token for visual differentiation', () => {
    assert.match(src, /#EEFBF4/);
  });

  it('uses green text color token #17663A', () => {
    assert.match(src, /#17663A/);
  });

  // ── Checkmark icon ─────────────────────────────────────────────────────────

  it('renders a checkmark SVG polyline icon', () => {
    assert.match(src, /<polyline/);
    assert.match(src, /CHECK_ICON/);
  });

});
