import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  MOCK_SII_ROWS,
  MOCK_TBAI_ROWS,
  MOCK_VF_ROWS,
  MOCK_MONITOR_DATA,
} from '../../tools/app-shell/src/windows/custom/fiscal-monitor/fiscalMonitorMockData.js';

// ── Helper ────────────────────────────────────────────────────────────────────

function countBy(arr, field, value) {
  return arr.filter(r => r[field] === value).length;
}

// ── SII rows ──────────────────────────────────────────────────────────────────

describe('MOCK_SII_ROWS structure', () => {
  it('all rows have required fields', () => {
    for (const row of MOCK_SII_ROWS) {
      assert.ok(row.id,            `row missing id: ${JSON.stringify(row)}`);
      assert.ok(row._siiTab,       `row missing _siiTab: ${row.id}`);
      assert.ok(row.invoiceDate,   `row missing invoiceDate: ${row.id}`);
      assert.ok(row.documentNo,    `row missing documentNo: ${row.id}`);
      assert.ok(row.businessPartner, `row missing businessPartner: ${row.id}`);
      assert.ok(row.aeatsiiEstado, `row missing aeatsiiEstado: ${row.id}`);
    }
  });

  it('_siiTab values are one of the 4 valid variants', () => {
    const valid = new Set(['issued', 'received', 'issued-previous', 'received-previous']);
    for (const row of MOCK_SII_ROWS) {
      assert.ok(valid.has(row._siiTab), `unexpected _siiTab "${row._siiTab}" on row ${row.id}`);
    }
  });

  it('ids are unique', () => {
    const ids = MOCK_SII_ROWS.map(r => r.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate id found in MOCK_SII_ROWS');
  });
});

describe('MOCK_SII_ROWS counts match MOCK_MONITOR_DATA', () => {
  it('issued count matches', () => {
    const actual = countBy(MOCK_SII_ROWS, '_siiTab', 'issued');
    assert.equal(actual, MOCK_MONITOR_DATA.sii.issued.totalCount,
      `issued rows=${actual} but totalCount=${MOCK_MONITOR_DATA.sii.issued.totalCount}`);
  });

  it('received count matches', () => {
    const actual = countBy(MOCK_SII_ROWS, '_siiTab', 'received');
    assert.equal(actual, MOCK_MONITOR_DATA.sii.received.totalCount);
  });

  it('issuedPrevious count matches', () => {
    const actual = countBy(MOCK_SII_ROWS, '_siiTab', 'issued-previous');
    assert.equal(actual, MOCK_MONITOR_DATA.sii.issuedPrevious.totalCount);
  });

  it('receivedPrevious count matches', () => {
    const actual = countBy(MOCK_SII_ROWS, '_siiTab', 'received-previous');
    assert.equal(actual, MOCK_MONITOR_DATA.sii.receivedPrevious.totalCount);
  });
});

// ── TBAI rows ─────────────────────────────────────────────────────────────────

describe('MOCK_TBAI_ROWS structure', () => {
  it('all rows have required fields', () => {
    for (const row of MOCK_TBAI_ROWS) {
      assert.ok(row.id,           `row missing id`);
      assert.ok(row.invoiceDate,  `row missing invoiceDate: ${row.id}`);
      assert.ok(row.invoice,      `row missing invoice: ${row.id}`);
      assert.ok(row.descripcion,  `row missing descripcion: ${row.id}`);
      assert.ok(row.estado,       `row missing estado: ${row.id}`);
    }
  });

  it('estado values are one of the 4 valid statuses', () => {
    const valid = new Set(['Recibido', 'Rechazado', 'Error', 'Pendiente']);
    for (const row of MOCK_TBAI_ROWS) {
      assert.ok(valid.has(row.estado), `unexpected estado "${row.estado}" on row ${row.id}`);
    }
  });

  it('ids are unique', () => {
    const ids = MOCK_TBAI_ROWS.map(r => r.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe('MOCK_TBAI_ROWS counts match MOCK_MONITOR_DATA', () => {
  it('total count matches', () => {
    assert.equal(MOCK_TBAI_ROWS.length, MOCK_MONITOR_DATA.tbai.totalCount);
  });

  it('Recibido count matches', () => {
    const actual = countBy(MOCK_TBAI_ROWS, 'estado', 'Recibido');
    assert.equal(actual, MOCK_MONITOR_DATA.tbai.receivedCount);
  });

  it('Rechazado count matches', () => {
    const actual = countBy(MOCK_TBAI_ROWS, 'estado', 'Rechazado');
    assert.equal(actual, MOCK_MONITOR_DATA.tbai.rejectedCount);
  });

  it('Error count matches', () => {
    const actual = countBy(MOCK_TBAI_ROWS, 'estado', 'Error');
    assert.equal(actual, MOCK_MONITOR_DATA.tbai.errorCount);
  });

  it('Pendiente count matches', () => {
    const actual = countBy(MOCK_TBAI_ROWS, 'estado', 'Pendiente');
    assert.equal(actual, MOCK_MONITOR_DATA.tbai.pendingCount);
  });

  it('per-status counts sum to total', () => {
    const { receivedCount, rejectedCount, errorCount, pendingCount, totalCount } = MOCK_MONITOR_DATA.tbai;
    assert.equal(receivedCount + rejectedCount + errorCount + pendingCount, totalCount);
  });
});

// ── Verifactu rows ────────────────────────────────────────────────────────────

describe('MOCK_VF_ROWS structure', () => {
  it('all rows have required fields', () => {
    for (const row of MOCK_VF_ROWS) {
      assert.ok(row.id,                      `row missing id`);
      assert.ok(row.invoice,                 `row missing invoice: ${row.id}`);
      assert.ok(row.issuerTaxID,             `row missing issuerTaxID: ${row.id}`);
      assert.ok(row.verifactuSendingStatus,  `row missing verifactuSendingStatus: ${row.id}`);
    }
  });

  it('verifactuSendingStatus values are one of the 4 valid statuses', () => {
    const valid = new Set(['accepted', 'partiallyAccepted', 'rejected', 'invalid']);
    for (const row of MOCK_VF_ROWS) {
      assert.ok(valid.has(row.verifactuSendingStatus),
        `unexpected status "${row.verifactuSendingStatus}" on row ${row.id}`);
    }
  });

  it('ids are unique', () => {
    const ids = MOCK_VF_ROWS.map(r => r.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('error rows have codeError and errorReason; accepted rows do not', () => {
    for (const row of MOCK_VF_ROWS) {
      if (row.verifactuSendingStatus === 'accepted') {
        assert.equal(row.codeError, null,    `accepted row ${row.id} should have null codeError`);
        assert.equal(row.errorReason, null,  `accepted row ${row.id} should have null errorReason`);
      } else {
        assert.ok(row.codeError !== undefined, `non-accepted row ${row.id} missing codeError`);
      }
    }
  });
});

describe('MOCK_VF_ROWS counts match MOCK_MONITOR_DATA', () => {
  const vf = MOCK_MONITOR_DATA.verifactu;

  it('accepted count matches', () => {
    assert.equal(countBy(MOCK_VF_ROWS, 'verifactuSendingStatus', 'accepted'), vf.accepted.totalCount);
  });

  it('partiallyAccepted count matches', () => {
    assert.equal(countBy(MOCK_VF_ROWS, 'verifactuSendingStatus', 'partiallyAccepted'), vf.partiallyAccepted.totalCount);
  });

  it('rejected count matches', () => {
    assert.equal(countBy(MOCK_VF_ROWS, 'verifactuSendingStatus', 'rejected'), vf.rejected.totalCount);
  });

  it('invalid count matches', () => {
    assert.equal(countBy(MOCK_VF_ROWS, 'verifactuSendingStatus', 'invalid'), vf.invalid.totalCount);
  });

  it('all status counts sum to total row count', () => {
    const sum = vf.accepted.totalCount + vf.partiallyAccepted.totalCount
              + vf.rejected.totalCount + vf.invalid.totalCount;
    assert.equal(sum, MOCK_VF_ROWS.length);
  });
});

// ── Cross-system: no id collisions across arrays ──────────────────────────────

describe('mock data cross-system', () => {
  it('no duplicate ids across all three arrays', () => {
    const all = [...MOCK_SII_ROWS, ...MOCK_TBAI_ROWS, ...MOCK_VF_ROWS].map(r => r.id);
    assert.equal(new Set(all).size, all.length, 'duplicate id found across mock arrays');
  });
});
