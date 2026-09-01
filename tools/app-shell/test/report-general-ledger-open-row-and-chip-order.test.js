/**
 * ETP-5013 follow-up — two small visual fixes to report-general-ledger's
 * grayscale redesign:
 *
 *  1. The "Saldo inicial" (opening balance) row read as lighter-weight than
 *     "Subtotal"/"Total" even though it's the same kind of summary row —
 *     `.acct-open td` now carries `font-weight: 700` alongside its existing
 *     italic style, matching `.acct-total`'s weight.
 *
 *  2. The dimension chip header ("[CONTACTO] Blanquiceleste S.A.") read
 *     backwards next to a filled table body — the dimension VALUE now comes
 *     first (bold, on the left) and the dimension LABEL chip ("Contacto")
 *     moves to the right as a light-gray pill, via `justify-content:
 *     space-between` on `.dim-group-head` plus swapping the markup order.
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

describe('report-general-ledger — dim-group-head value/chip order (ETP-5013 follow-up)', () => {
  it('.dim-group-head uses justify-content: space-between', () => {
    const body = ruleBody(src, '.dim-group-head');
    assert.ok(body, 'expected a .dim-group-head rule');
    assert.match(body, /justify-content:\s*space-between/);
  });

  it('the dimension VALUE renders BEFORE the chip in markup (value on the left, chip on the right)', () => {
    assert.match(
      src,
      /<div class="dim-group-head"><span class="value">\{\{this\.dimensionValue\}\}<\/span><span class="chip">\{\{@root\.meta\.dimensionLabel\}\}<\/span><\/div>/
    );
  });

  it('.dim-group-head .chip is a filled light-gray pill, not an uppercase outlined tag', () => {
    const match = src.match(/\.dim-group-head \.chip\s*\{([^}]*)\}/);
    assert.ok(match, 'expected a .dim-group-head .chip rule');
    assert.match(match[1], /background:\s*var\(--color-bg-stripe\)/);
    assert.doesNotMatch(match[1], /text-transform:\s*uppercase/);
  });
});
