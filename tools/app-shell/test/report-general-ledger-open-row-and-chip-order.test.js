/**
 * ETP-5013 follow-up — two small visual fixes to report-general-ledger's
 * grayscale redesign:
 *
 *  1. The "Saldo inicial" (opening balance) row read as lighter-weight than
 *     "Subtotal"/"Total" even though it's the same kind of summary row —
 *     `.acct-open td` now carries `font-weight: 700` alongside its existing
 *     italic style, matching `.acct-total`'s weight.
 *
 *  2. The dimension chip header ("[CONTACTO] Blanquiceleste S.A.") originally
 *     read backwards next to a filled table body, so ETP-5013 put the
 *     dimension VALUE first (bold, on the left) and pushed the dimension
 *     LABEL chip ("Contacto") to the right via `justify-content:
 *     space-between` on `.dim-group-head`.
 *
 * ETP-5128 follow-up — that `space-between` layout made the chip read as
 * effectively missing/lost in the real generated report (pushed far off to
 * the right, away from the value it labels). Reversed again: `.dim-group-head`
 * no longer sets `justify-content: space-between` (plain flex, natural
 * width), and the markup order is swapped back to chip-first, value-second —
 * `<span class="chip">...</span><span class="value">...</span>`. The chip's
 * own visual style (filled light-gray pill) is unchanged, only its position.
 * The same reversal was applied in lockstep to inventory-stock-report's
 * `.stock-card-head` (see report-inventory-stock-grouped-cards.test.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ARTIFACT_DIR = resolve(import.meta.dirname, '../../../artifacts/report-general-ledger');
const src = readFileSync(resolve(ARTIFACT_DIR, 'template.hbs'), 'utf8');

function ruleBody(css, selector) {
  const match = css.match(new RegExp(`${selector.replace(/[.[\]]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
  return match ? match[1] : null;
}

describe('report-general-ledger — .acct-open bold, matching .acct-total (ETP-5013 follow-up)', () => {
  it('.acct-open td declares font-weight: 700', () => {
    const body = ruleBody(src, '.acct-open td');
    assert.ok(body, 'expected an .acct-open td rule');
    assert.match(body, /font-weight:\s*700/);
    // Still italic — this is additive, not a replacement.
    assert.match(body, /font-style:\s*italic/);
  });
});

describe('report-general-ledger — dim-group-head value/chip order (ETP-5128 follow-up, reverses ETP-5013)', () => {
  it('.dim-group-head does NOT use justify-content: space-between', () => {
    const body = ruleBody(src, '.dim-group-head');
    assert.ok(body, 'expected a .dim-group-head rule');
    assert.doesNotMatch(body, /justify-content:\s*space-between/);
  });

  it('the chip renders BEFORE the dimension VALUE in markup (chip on the left, value on the right)', () => {
    assert.match(
      src,
      /<div class="dim-group-head"><span class="chip">\{\{@root\.meta\.dimensionLabel\}\}<\/span><span class="value">\{\{this\.dimensionValue\}\}<\/span><\/div>/
    );
  });

  it('.dim-group-head .chip is a filled light-gray pill, not an uppercase outlined tag', () => {
    const match = src.match(/\.dim-group-head \.chip\s*\{([^}]*)\}/);
    assert.ok(match, 'expected a .dim-group-head .chip rule');
    assert.match(match[1], /background:\s*var\(--color-bg-stripe\)/);
    assert.doesNotMatch(match[1], /text-transform:\s*uppercase/);
  });
});
