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

  it('guards on the full deposited status set, not just RPPC', () => {
    // RPPC alone under-counts: most deposited payments in practice settle
    // into RDNC/PWNC, not RPPC — the badge must match the same "deposited"
    // grouping used by the list's status color/label.
    for (const code of ['RPR', 'RPPC', 'RDNC', 'PPM', 'PWNC']) {
      assert.match(src, new RegExp(code));
    }
    assert.match(src, /data\?\.status/);
  });

  it('returns null when status is not a deposited status', () => {
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
    assert.match(src, /#ECFDF3/);
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
