import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MOCK_VF_ROWS, MOCK_SII_ROWS, MOCK_TBAI_ROWS } from '../fiscalMonitorMockData.js';

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
