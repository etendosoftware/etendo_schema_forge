import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * ETP-5338 — the Sources tab's invoice-date column was relabeled from the
 * ambiguous "Fecha"/"Date" to "Fecha Factura"/"Invoice Date" (key unchanged:
 * `fm.sources.col.date`), and a new "Fecha Contable"/"Accounting Date" column
 * key (`fm.sources.col.accountingDate`) was added right after it. Both must
 * exist with the expected value in all 3 locale files (en_US, es_ES, es_AR).
 */

describe('ETP-5338 — fm.sources.col.date relabel + fm.sources.col.accountingDate key', () => {
  let enUS;
  let esES;
  let esAR;

  before(() => {
    enUS = JSON.parse(readFileSync(new URL('../en_US.json', import.meta.url), 'utf8'));
    esES = JSON.parse(readFileSync(new URL('../es_ES.json', import.meta.url), 'utf8'));
    esAR = JSON.parse(readFileSync(new URL('../es_AR.json', import.meta.url), 'utf8'));
  });

  it('en_US.genericLabels["fm.sources.col.date"] is "Invoice Date"', () => {
    assert.equal(enUS.genericLabels['fm.sources.col.date'], 'Invoice Date');
  });

  it('es_ES.genericLabels["fm.sources.col.date"] is "Fecha Factura"', () => {
    assert.equal(esES.genericLabels['fm.sources.col.date'], 'Fecha Factura');
  });

  it('es_AR.genericLabels["fm.sources.col.date"] is "Fecha Factura"', () => {
    assert.equal(esAR.genericLabels['fm.sources.col.date'], 'Fecha Factura');
  });

  it('en_US.genericLabels["fm.sources.col.accountingDate"] is "Accounting Date"', () => {
    assert.equal(enUS.genericLabels['fm.sources.col.accountingDate'], 'Accounting Date');
  });

  it('es_ES.genericLabels["fm.sources.col.accountingDate"] is "Fecha Contable"', () => {
    assert.equal(esES.genericLabels['fm.sources.col.accountingDate'], 'Fecha Contable');
  });

  it('es_AR.genericLabels["fm.sources.col.accountingDate"] is "Fecha Contable"', () => {
    assert.equal(esAR.genericLabels['fm.sources.col.accountingDate'], 'Fecha Contable');
  });
});
