import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * ETP-5021 — standardize the "add address" action text across the whole app.
 * The "add address" action rendered different text depending on the screen
 * (Contact card's Address tab said "Añadir Dirección", the Sales Order
 * address selector said "Agregar dirección"). Every surface must now read
 * the identical "+ Añadir dirección" — only the first letter capitalized,
 * "+" prefix as a visual creation indicator.
 *
 * genericLabels.addAddress is the single source of truth consumed by:
 *   - PartnerAddressPicker.jsx (document-header address selector — Sales
 *     Order/Invoice, Purchase Order/Invoice, etc., wherever a field on
 *     column C_BPartner_Location_ID renders).
 *   - contacts' decisions.json secondaryTabs.locationAddress.addLineLabelKey
 *     (Contact card's Address tab — see resolveAddLineLabel in
 *     detailViewHelpers.jsx), converging it onto this same key/value instead
 *     of the generic "Añadir {label}" (addEntity) composition.
 */

describe('ETP-5021 — genericLabels.addAddress reads "+ Añadir dirección" everywhere', () => {
  let esES;
  let esAR;
  let enUS;

  before(() => {
    esES = JSON.parse(readFileSync(new URL('../../locales/es_ES.json', import.meta.url), 'utf8'));
    esAR = JSON.parse(readFileSync(new URL('../../locales/es_AR.json', import.meta.url), 'utf8'));
    enUS = JSON.parse(readFileSync(new URL('../../locales/en_US.json', import.meta.url), 'utf8'));
  });

  it('es_ES.genericLabels.addAddress is "+ Añadir dirección"', () => {
    assert.equal(esES.genericLabels.addAddress, '+ Añadir dirección');
  });

  it('es_AR.genericLabels.addAddress is "+ Añadir dirección"', () => {
    assert.equal(esAR.genericLabels.addAddress, '+ Añadir dirección');
  });

  it('en_US.genericLabels.addAddress is "+ Add address" (unaffected — ticket is Spanish-scoped)', () => {
    assert.equal(enUS.genericLabels.addAddress, '+ Add address');
  });

  it('never regresses to the old "Agregar" wording in either Spanish locale', () => {
    assert.doesNotMatch(esES.genericLabels.addAddress, /Agregar/);
    assert.doesNotMatch(esAR.genericLabels.addAddress, /Agregar/);
  });
});
