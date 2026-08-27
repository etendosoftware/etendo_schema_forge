import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MOCK_VF_ROWS, MOCK_SII_ROWS, MOCK_TBAI_ROWS, MOCK_TBAI_VALIDATION_RESULTS } from '../fiscalMonitorMockData.js';

// Guards: MOCK_VF_ROWS must use yyyy-mm-dd format so fmtDate can reformat them to dd/mm/yyyy
describe('MOCK_VF_ROWS — invoiceDate format', () => {
  it('contains exactly 8 rows', () => {
    assert.equal(MOCK_VF_ROWS.length, 8);
  });

  it('every row has a truthy invoiceDate', () => {
    for (const row of MOCK_VF_ROWS) {
      assert.ok(row.invoiceDate, `row ${row.id} is missing invoiceDate`);
    }
  });

  it('every invoiceDate is in yyyy-mm-dd format', () => {
    for (const row of MOCK_VF_ROWS) {
      assert.match(
        row.invoiceDate,
        /^\d{4}-\d{2}-\d{2}$/,
        `row ${row.id} invoiceDate "${row.invoiceDate}" is not yyyy-mm-dd`
      );
    }
  });
});

// Guards: regression — VF changes must not strip invoiceDate from SII and TBAI rows
describe('MOCK_SII_ROWS — invoiceDate regression', () => {
  it('every SII row has a truthy invoiceDate', () => {
    for (const row of MOCK_SII_ROWS) {
      assert.ok(row.invoiceDate, `row ${row.id} is missing invoiceDate`);
    }
  });
});

describe('MOCK_TBAI_ROWS — invoiceDate regression', () => {
  it('every TBAI row has a truthy invoiceDate', () => {
    for (const row of MOCK_TBAI_ROWS) {
      assert.ok(row.invoiceDate, `row ${row.id} is missing invoiceDate`);
    }
  });
});

// Guards: MOCK_TBAI_VALIDATION_RESULTS must stay joinable to MOCK_TBAI_ROWS and only
// reference rows in an error state (Rechazado/Error) — a "no enviada" success row
// wired to a fake error would silently break the join test coverage.
describe('MOCK_TBAI_VALIDATION_RESULTS — integrity', () => {
  const tbaiRowsById = new Map(MOCK_TBAI_ROWS.map(r => [r.id, r]));
  const ERROR_STATES = new Set(['Rechazado', 'Error']);

  it('every tbaiSyncinvoiceID references an existing MOCK_TBAI_ROWS row', () => {
    for (const r of MOCK_TBAI_VALIDATION_RESULTS) {
      assert.ok(tbaiRowsById.has(r.tbaiSyncinvoiceID), `no MOCK_TBAI_ROWS row with id ${r.tbaiSyncinvoiceID}`);
    }
  });

  it('every referenced row is in an error state (Rechazado/Error)', () => {
    for (const r of MOCK_TBAI_VALIDATION_RESULTS) {
      const row = tbaiRowsById.get(r.tbaiSyncinvoiceID);
      assert.ok(ERROR_STATES.has(row.estado), `row ${row.id} has estado ${row.estado}, expected Rechazado/Error`);
    }
  });

  it('every entry has both codigo and descripcion', () => {
    for (const r of MOCK_TBAI_VALIDATION_RESULTS) {
      assert.ok(r.codigo, `entry ${r.id} is missing codigo`);
      assert.ok(r.descripcion, `entry ${r.id} is missing descripcion`);
    }
  });

  it('at least one row has 0..N (more than one) validation results, to exercise the multi-reason render path', () => {
    const counts = {};
    for (const r of MOCK_TBAI_VALIDATION_RESULTS) counts[r.tbaiSyncinvoiceID] = (counts[r.tbaiSyncinvoiceID] ?? 0) + 1;
    assert.ok(Object.values(counts).some(c => c > 1), 'expected at least one tbaiSyncinvoiceID with >1 validation result');
  });
});
