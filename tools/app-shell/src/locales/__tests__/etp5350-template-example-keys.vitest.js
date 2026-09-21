import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import enUS from '../en_US.json';
import esES from '../es_ES.json';
import esAR from '../es_AR.json';

/**
 * ETP-5350 — the downloadable template's SAMPLE ROW, in the session language.
 *
 * "Download CSV template" in an English session wrote English headers over Spanish data —
 * "Tornillo hexagonal M8", "Unidad", "Herramientas" — so the user who asked for an English file
 * opened it and found a language they had not chosen. Headers had been localized since
 * ETP-5223; the values under them had no mechanism at all.
 *
 * The window now declares `exampleKey` per field and `ImportDialog` resolves it through the
 * dialog's own translator, falling back to `example`. The fallback is what makes a missing entry
 * SILENT — the template still downloads, in Spanish, inside an English session — which is the
 * failure this guards.
 *
 * Only values whose language actually changes carry a key. The rest deliberately do not, and the
 * last test below pins that boundary rather than leaving it to memory:
 *  - codes, emails, phones, a NIF, a postcode: identical in every language;
 *  - person names (María, García, Lucía, Fernández): proper nouns, translating them adds nothing;
 *  - city and region (Sevilla): matched against real AD records, so an English spelling would
 *    name a place the database does not have.
 */
function contractFor(window) {
  let dir = process.cwd();
  while (!existsSync(resolve(dir, 'artifacts', window, 'contract.json'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`could not locate artifacts/${window}/contract.json`);
    dir = parent;
  }
  return JSON.parse(readFileSync(resolve(dir, 'artifacts', window, 'contract.json'), 'utf8'));
}

const DICTIONARIES = { en_US: enUS, es_ES: esES, es_AR: esAR };
const IMPORT_FIELDS = {
  product: contractFor('product').frontendContract.window.import.fields,
  contacts: contractFor('contacts').frontendContract.window.import.fields,
};
const DECLARED_KEYS = Object.values(IMPORT_FIELDS)
  .flat()
  .map((f) => f.exampleKey)
  .filter(Boolean);

describe('ETP-5350 — the template example keys', () => {
  it('declares keys on both windows, so neither was left behind', () => {
    for (const [window, fields] of Object.entries(IMPORT_FIELDS)) {
      expect(fields.filter((f) => f.exampleKey).length, `${window} declares no exampleKey`)
        .toBeGreaterThan(0);
    }
  });

  it.each(Object.keys(DICTIONARIES))('%s resolves every declared key to a non-empty value', (name) => {
    for (const key of DECLARED_KEYS) {
      const value = DICTIONARIES[name].genericLabels?.[key];
      expect(typeof value, `${name}.genericLabels.${key} must be a string`).toBe('string');
      expect(value.trim(), `${name}.genericLabels.${key} must be non-empty`).not.toBe('');
    }
  });

  // The whole point of the ticket: a template downloaded in English must not contain the
  // Spanish value. A key that resolves to the same text in both languages is a key that
  // changes nothing, and would have been better left undeclared.
  it('gives English a different value from Spanish for every declared key', () => {
    for (const key of DECLARED_KEYS) {
      expect(enUS.genericLabels[key], key).not.toBe(esES.genericLabels[key]);
    }
  });

  // These feed coded columns and foreign keys, so they are not decoration: the value written
  // into the template has to be one the import can resolve back. `productType` goes through
  // PRODUCT_TYPE_VALUES, whose alias list is bilingual and accent-insensitive; `uOM` and
  // `country` go through SimSearch, which since this ticket asks every installed AD language.
  it('keeps the coded and foreign-key examples resolvable in both languages', () => {
    expect(enUS.genericLabels.importExampleProductType).toBe('Item');
    expect(esES.genericLabels.importExampleProductType).toBe('Artículo');
    expect(enUS.genericLabels.importExampleProductUom).toBe('Unit');
    expect(esES.genericLabels.importExampleProductUom).toBe('Unidad');
    expect(enUS.genericLabels.importExampleContactCountry).toBe('Spain');
    expect(esES.genericLabels.importExampleContactCountry).toBe('España');
  });

  // The decimal separator is part of the language, and `isNumeric` columns are parsed per
  // locale. An English template carrying "12,50" would read as twelve thousand fifty.
  it('writes the price examples with the separator of their own language', () => {
    for (const key of ['importExampleProductSalesPrice', 'importExampleProductPurchasePrice']) {
      expect(enUS.genericLabels[key], key).toMatch(/^\d+\.\d{2}$/);
      expect(esES.genericLabels[key], key).toMatch(/^\d+,\d{2}$/);
    }
  });

  // The boundary, pinned: a field with no key keeps one value for every language, and that is
  // a decision, not an oversight. If someone adds a key to one of these, this test asks them
  // to say why here.
  it('leaves the language-neutral columns without a key, on purpose', () => {
    const unkeyed = Object.fromEntries(
      Object.entries(IMPORT_FIELDS).map(([window, fields]) => [
        window, fields.filter((f) => !f.exampleKey).map((f) => f.target).sort(),
      ]),
    );
    expect(unkeyed.product).toEqual(['searchKey']);
    expect(unkeyed.contacts).toEqual([
      'city', 'email', 'etgoEmail', 'etgoFirstname', 'etgoLastname', 'etgoPhone', 'etgoWeb',
      'firstName', 'lastName', 'oBTIKTaxIDKey', 'phone', 'postal', 'region', 'taxID',
    ]);
  });
});
