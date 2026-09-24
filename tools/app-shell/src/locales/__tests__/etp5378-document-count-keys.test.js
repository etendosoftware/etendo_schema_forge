import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * ETP-5378 QA follow-up — the bulk "Crear Factura" card count label.
 *
 * The label used to be built at the call site from a single-use noun plus a literal 's':
 * Albarán de Venta read `genericLabels.shipment` ("envío") while Albarán de Compra read
 * `genericLabels.receipt` ("albarán") for the SAME kind of document, and both appended an
 * English plural marker to the Spanish noun, producing "2 albaráns".
 *
 * Both windows now read a count key and the LOCALE owns both the noun and the plural form.
 *
 * WHY THERE ARE TWO KEY PAIRS AND NOT ONE — do not "simplify" this:
 *   English genuinely distinguishes the two windows ("shipment" vs "receipt"), so a single
 *   shared pair cannot serve both. Spanish deliberately does NOT distinguish them: both
 *   windows must say "albarán", because the defect QA reported was precisely the two windows
 *   naming the same document differently. So the pairs look like copy-paste in Spanish and
 *   are not — the string EQUALITY across the two pairs in es_ES/es_AR is the requirement, and
 *   it is asserted explicitly at the bottom of this file rather than left to look accidental.
 *
 * WHY THE SPANISH SINGULAR CARRIES A TILDE AND THE PLURAL DOES NOT — do not "correct" this:
 *   - "albarán" is aguda (stressed on the final syllable) and ends in -n, so it takes the
 *     written accent.
 *   - Adding -es shifts the word's class: "albaranes" is llana (stressed on the
 *     next-to-last syllable) and ends in -s, so by rule it takes NO written accent.
 *   "albaranes" is the only correct plural. Both "albaráns" (the original defect) and
 *   "albaránes" (the over-correction) are misspellings, and the exact-string assertions
 *   below exist precisely to stop either one from coming back.
 */

const KEYS = [
  'shipmentCount_one',
  'shipmentCount_plural',
  'receiptCount_one',
  'receiptCount_plural',
];

const LOCALES = ['en_US', 'es_ES', 'es_AR'];

describe('ETP-5378 — shipmentCount_* / receiptCount_* document count keys', () => {
  let locales;

  before(() => {
    locales = {
      en_US: JSON.parse(readFileSync(new URL('../en_US.json', import.meta.url), 'utf8')),
      es_ES: JSON.parse(readFileSync(new URL('../es_ES.json', import.meta.url), 'utf8')),
      es_AR: JSON.parse(readFileSync(new URL('../es_AR.json', import.meta.url), 'utf8')),
    };
  });

  for (const locale of LOCALES) {
    for (const key of KEYS) {
      it(`${locale}.genericLabels["${key}"] exists and is a non-empty string`, () => {
        const value = locales[locale].genericLabels?.[key];
        assert.equal(typeof value, 'string', `${locale}.genericLabels.${key} must be a string`);
        assert.ok(value.trim().length > 0, `${locale}.genericLabels.${key} must not be empty`);
      });

      // Without the placeholder the number silently disappears from the card: `ui(key, { count })`
      // has nowhere to substitute, so the label renders the bare noun and the user sees
      // "albaranes" with no quantity at all.
      it(`${locale}.genericLabels["${key}"] carries the {count} placeholder`, () => {
        assert.match(locales[locale].genericLabels[key], /\{count\}/);
      });
    }
  }

  it('en_US uses the English shipment wording, singular and plural', () => {
    assert.equal(locales.en_US.genericLabels.shipmentCount_one, '{count} shipment');
    assert.equal(locales.en_US.genericLabels.shipmentCount_plural, '{count} shipments');
  });

  it('en_US uses the English receipt wording, singular and plural', () => {
    assert.equal(locales.en_US.genericLabels.receiptCount_one, '{count} receipt');
    assert.equal(locales.en_US.genericLabels.receiptCount_plural, '{count} receipts');
  });

  for (const locale of ['es_ES', 'es_AR']) {
    it(`${locale} shipmentCount_* is "{count} albarán" / "{count} albaranes" — plural WITHOUT the tilde`, () => {
      assert.equal(locales[locale].genericLabels.shipmentCount_one, '{count} albarán');
      assert.equal(locales[locale].genericLabels.shipmentCount_plural, '{count} albaranes');
    });

    it(`${locale} receiptCount_* is "{count} albarán" / "{count} albaranes" — plural WITHOUT the tilde`, () => {
      assert.equal(locales[locale].genericLabels.receiptCount_one, '{count} albarán');
      assert.equal(locales[locale].genericLabels.receiptCount_plural, '{count} albaranes');
    });
  }

  it('no Spanish plural is the misspelled "albaráns" or "albaránes"', () => {
    for (const locale of ['es_ES', 'es_AR']) {
      for (const key of ['shipmentCount_plural', 'receiptCount_plural']) {
        const plural = locales[locale].genericLabels[key];
        assert.doesNotMatch(plural, /albaráns/, `${locale}.${key}: English 's' plural on a Spanish noun`);
        assert.doesNotMatch(plural, /albaránes/, `${locale}.${key}: the plural is llana, it takes no tilde`);
      }
    }
  });

  // ── the one assertion that stops the two pairs being collapsed back into one ──────────
  //
  // This is the whole reason the split is safe. Someone reading es_ES.json will see four keys
  // and two distinct values and reasonably conclude the duplication is a mistake. It is not:
  // Albarán de Venta and Albarán de Compra name the SAME document, and QA raised a bug
  // precisely because they once named it differently ("envío" vs "albarán"). The Spanish
  // strings must stay byte-identical across the pairs; English must stay different, because
  // that difference is the only justification for having two pairs at all.
  describe('the two pairs say the same thing in Spanish and different things in English', () => {
    for (const locale of ['es_ES', 'es_AR']) {
      it(`${locale}: shipmentCount_* and receiptCount_* are string-equal — one document, one Spanish word`, () => {
        const g = locales[locale].genericLabels;
        assert.equal(
          g.shipmentCount_one,
          g.receiptCount_one,
          `${locale}: the two windows must name the same document identically in the singular`,
        );
        assert.equal(
          g.shipmentCount_plural,
          g.receiptCount_plural,
          `${locale}: the two windows must name the same document identically in the plural`,
        );
      });
    }

    it('en_US: shipmentCount_* and receiptCount_* DIFFER — this is why two pairs exist', () => {
      const g = locales.en_US.genericLabels;
      assert.notEqual(
        g.shipmentCount_one,
        g.receiptCount_one,
        'if English no longer distinguishes the two nouns, collapse the pairs into one shared key',
      );
      assert.notEqual(
        g.shipmentCount_plural,
        g.receiptCount_plural,
        'if English no longer distinguishes the two nouns, collapse the pairs into one shared key',
      );
    });
  });
});
