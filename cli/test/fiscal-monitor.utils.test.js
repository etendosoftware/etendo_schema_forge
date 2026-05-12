import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  buildMonitorFetchPlan,
  computeKpis,
} from '../../tools/app-shell/src/windows/custom/fiscal-monitor/fiscalMonitor.utils.js';

describe('buildMonitorFetchPlan', () => {
  it('sii profile fetches only sii-monitor', () => {
    assert.deepStrictEqual(buildMonitorFetchPlan('sii'), ['sii-monitor']);
  });
  it('sii-navarra profile fetches sii-monitor', () => {
    assert.deepStrictEqual(buildMonitorFetchPlan('sii-navarra'), ['sii-monitor']);
  });
  it('tbai profile fetches only tbai-facturas-enviadas', () => {
    assert.deepStrictEqual(buildMonitorFetchPlan('tbai'), ['tbai-facturas-enviadas']);
  });
  it('sii+tbai profile fetches both', () => {
    const plan = buildMonitorFetchPlan('sii+tbai');
    assert.ok(plan.includes('sii-monitor'));
    assert.ok(plan.includes('tbai-facturas-enviadas'));
    assert.equal(plan.length, 2);
  });
  it('verifactu profile fetches only monitor-verifactu', () => {
    assert.deepStrictEqual(buildMonitorFetchPlan('verifactu'), ['monitor-verifactu']);
  });
  it('unconfigured profile fetches nothing', () => {
    assert.deepStrictEqual(buildMonitorFetchPlan('unconfigured'), []);
  });
  it('conflict profile fetches nothing', () => {
    assert.deepStrictEqual(buildMonitorFetchPlan('conflict'), []);
  });
  it('null profile fetches nothing', () => {
    assert.deepStrictEqual(buildMonitorFetchPlan(null), []);
  });
});

describe('computeKpis - verifactu', () => {
  it('maps all 4 subtab totalCounts to kpi object', () => {
    const kpis = computeKpis('verifactu', {
      verifactu: {
        accepted:          { totalCount: 10 },
        partiallyAccepted: { totalCount: 3 },
        rejected:          { totalCount: 2 },
        invalid:           { totalCount: 1 },
      },
    });
    assert.deepStrictEqual(kpis.verifactu, {
      accepted: 10, partiallyAccepted: 3, rejected: 2, invalid: 1,
    });
    assert.equal(kpis.sii, undefined);
    assert.equal(kpis.tbai, undefined);
  });

  it('defaults to 0 when a subtab bucket is absent', () => {
    const kpis = computeKpis('verifactu', { verifactu: {} });
    assert.equal(kpis.verifactu.accepted, 0);
    assert.equal(kpis.verifactu.rejected, 0);
  });
});

describe('computeKpis - sii', () => {
  it('returns issued and received totals for both periods', () => {
    const kpis = computeKpis('sii', {
      sii: {
        issued:          { totalCount: 50 },
        received:        { totalCount: 30 },
        issuedPrevious:  { totalCount: 100 },
        receivedPrevious:{ totalCount: 80 },
      },
    });
    assert.deepStrictEqual(kpis.sii, {
      issued: 50, received: 30,
      issuedPrevious: 100, receivedPrevious: 80,
    });
  });

  it('defaults to 0 on missing data', () => {
    const kpis = computeKpis('sii', { sii: {} });
    assert.equal(kpis.sii.issued, 0);
    assert.equal(kpis.sii.received, 0);
  });
});

describe('computeKpis - sii-navarra', () => {
  it('produces sii kpi bucket (same as sii)', () => {
    const kpis = computeKpis('sii-navarra', {
      sii: { issued: { totalCount: 5 }, received: { totalCount: 3 }, issuedPrevious: { totalCount: 0 }, receivedPrevious: { totalCount: 0 } },
    });
    assert.equal(kpis.sii.issued, 5);
  });
});

describe('computeKpis - sii+tbai', () => {
  it('returns kpi buckets for both systems', () => {
    const kpis = computeKpis('sii+tbai', {
      sii:  { issued: { totalCount: 20 }, received: { totalCount: 15 }, issuedPrevious: { totalCount: 0 }, receivedPrevious: { totalCount: 0 } },
      tbai: { totalCount: 8, receivedCount: 6, rejectedCount: 1, errorCount: 1 },
    });
    assert.equal(kpis.sii.issued, 20);
    assert.equal(kpis.tbai.total, 8);
    assert.equal(kpis.tbai.received, 6);
  });
});

describe('computeKpis - tbai', () => {
  it('returns total and per-status counts', () => {
    const kpis = computeKpis('tbai', {
      tbai: { totalCount: 45, receivedCount: 40, rejectedCount: 3, errorCount: 2 },
    });
    assert.deepStrictEqual(kpis.tbai, { total: 45, received: 40, rejected: 3, error: 2, pending: 0 });
  });

  it('defaults to 0 on missing data', () => {
    const kpis = computeKpis('tbai', { tbai: null });
    assert.equal(kpis.tbai.total, 0);
    assert.equal(kpis.tbai.received, 0);
    assert.equal(kpis.tbai.error, 0);
  });

  it('defaults individual counts to 0 when absent', () => {
    const kpis = computeKpis('tbai', { tbai: { totalCount: 10 } });
    assert.equal(kpis.tbai.total, 10);
    assert.equal(kpis.tbai.received, 0);
  });
});

describe('computeKpis - unconfigured/conflict', () => {
  it('returns empty object', () => {
    assert.deepStrictEqual(computeKpis('unconfigured', {}), {});
    assert.deepStrictEqual(computeKpis('conflict', {}), {});
    assert.deepStrictEqual(computeKpis(null, {}), {});
  });
});
