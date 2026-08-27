import { describe, it, expect } from 'vitest';
import { buildMonitorFetchPlan, computeKpis, pickMostRecentMotivo } from '../fiscalMonitor.utils.js';

// ---------------------------------------------------------------------------
// buildMonitorFetchPlan
// ---------------------------------------------------------------------------

describe('buildMonitorFetchPlan — known profiles', () => {
  it('returns sii-monitor for "sii"', () => {
    expect(buildMonitorFetchPlan('sii')).toEqual(['sii-monitor']);
  });

  it('returns sii-monitor for "sii-navarra"', () => {
    expect(buildMonitorFetchPlan('sii-navarra')).toEqual(['sii-monitor']);
  });

  it('returns tbai spec for "tbai"', () => {
    expect(buildMonitorFetchPlan('tbai')).toEqual(['tbai-facturas-enviadas']);
  });

  it('returns both specs for "sii+tbai"', () => {
    expect(buildMonitorFetchPlan('sii+tbai')).toEqual(['sii-monitor', 'tbai-facturas-enviadas']);
  });

  it('returns verifactu spec for "verifactu"', () => {
    expect(buildMonitorFetchPlan('verifactu')).toEqual(['monitor-verifactu']);
  });
});

describe('buildMonitorFetchPlan — unknown / null profiles', () => {
  it('returns empty array for null', () => {
    expect(buildMonitorFetchPlan(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(buildMonitorFetchPlan(undefined)).toEqual([]);
  });

  it('returns empty array for unknown string', () => {
    expect(buildMonitorFetchPlan('unknown-profile')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(buildMonitorFetchPlan('')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeKpis
// ---------------------------------------------------------------------------

describe('computeKpis — sii profile', () => {
  it('populates kpis.sii with counts from monitorData', () => {
    const data = {
      sii: {
        issued:           { totalCount: 10 },
        received:         { totalCount: 5 },
        issuedPrevious:   { totalCount: 3 },
        receivedPrevious: { totalCount: 2 },
      },
    };
    const kpis = computeKpis('sii', data);
    expect(kpis.sii).toEqual({ issued: 10, received: 5, issuedPrevious: 3, receivedPrevious: 2 });
    expect(kpis.tbai).toBeUndefined();
    expect(kpis.verifactu).toBeUndefined();
  });

  it('defaults missing counts to 0', () => {
    const kpis = computeKpis('sii', {});
    expect(kpis.sii).toEqual({ issued: 0, received: 0, issuedPrevious: 0, receivedPrevious: 0 });
  });
});

describe('computeKpis — sii-navarra profile', () => {
  it('populates kpis.sii and no tbai/verifactu', () => {
    const kpis = computeKpis('sii-navarra', {});
    expect(kpis.sii).toBeDefined();
    expect(kpis.tbai).toBeUndefined();
    expect(kpis.verifactu).toBeUndefined();
  });
});

describe('computeKpis — tbai profile', () => {
  it('populates kpis.tbai with counts', () => {
    const data = {
      tbai: { totalCount: 20, receivedCount: 15, rejectedCount: 2, errorCount: 1, pendingCount: 2 },
    };
    const kpis = computeKpis('tbai', data);
    expect(kpis.tbai).toEqual({ total: 20, received: 15, rejected: 2, error: 1, pending: 2 });
    expect(kpis.sii).toBeUndefined();
    expect(kpis.verifactu).toBeUndefined();
  });

  it('defaults missing tbai counts to 0', () => {
    const kpis = computeKpis('tbai', {});
    expect(kpis.tbai).toEqual({ total: 0, received: 0, rejected: 0, error: 0, pending: 0 });
  });
});

describe('computeKpis — sii+tbai profile', () => {
  it('populates both kpis.sii and kpis.tbai', () => {
    const data = {
      sii:  { issued: { totalCount: 7 }, received: { totalCount: 3 }, issuedPrevious: { totalCount: 1 }, receivedPrevious: { totalCount: 1 } },
      tbai: { totalCount: 4, receivedCount: 4, rejectedCount: 0, errorCount: 0, pendingCount: 0 },
    };
    const kpis = computeKpis('sii+tbai', data);
    expect(kpis.sii).toBeDefined();
    expect(kpis.tbai).toBeDefined();
    expect(kpis.verifactu).toBeUndefined();
    expect(kpis.sii.issued).toBe(7);
    expect(kpis.tbai.total).toBe(4);
  });
});

describe('computeKpis — verifactu profile', () => {
  it('populates kpis.verifactu with counts', () => {
    const data = {
      verifactu: {
        accepted:          { totalCount: 100 },
        partiallyAccepted: { totalCount: 5 },
        rejected:          { totalCount: 2 },
        invalid:           { totalCount: 1 },
      },
    };
    const kpis = computeKpis('verifactu', data);
    expect(kpis.verifactu).toEqual({ accepted: 100, partiallyAccepted: 5, rejected: 2, invalid: 1 });
    expect(kpis.sii).toBeUndefined();
    expect(kpis.tbai).toBeUndefined();
  });

  it('defaults missing verifactu counts to 0', () => {
    const kpis = computeKpis('verifactu', {});
    expect(kpis.verifactu).toEqual({ accepted: 0, partiallyAccepted: 0, rejected: 0, invalid: 0 });
  });
});

describe('computeKpis — null / unknown profile', () => {
  it('returns empty kpis for null profile', () => {
    expect(computeKpis(null, {})).toEqual({});
  });

  it('returns empty kpis for unknown profile', () => {
    expect(computeKpis('unknown', {})).toEqual({});
  });

  it('handles null monitorData gracefully', () => {
    expect(computeKpis('sii', null)).toEqual({
      sii: { issued: 0, received: 0, issuedPrevious: 0, receivedPrevious: 0 },
    });
  });
});

// ---------------------------------------------------------------------------
// pickMostRecentMotivo (ETP-4784 — "Motivo error" header-empty fallback)
// ---------------------------------------------------------------------------

describe('pickMostRecentMotivo', () => {
  it('returns the single motivo when an invoice has one SiiData row', () => {
    const rows = [
      { invoice: 'inv-1', motivo: 'NIF no identificado', fechaltimaModificacinSII: '2026-01-10' },
    ];
    expect(pickMostRecentMotivo(rows)).toEqual({ 'inv-1': 'NIF no identificado' });
  });

  it('picks the most recent motivo by fechaltimaModificacinSII when an invoice has 2+ rows', () => {
    const rows = [
      { invoice: 'inv-1', motivo: 'Motivo antiguo', fechaltimaModificacinSII: '2026-01-01' },
      { invoice: 'inv-1', motivo: 'Motivo reciente', fechaltimaModificacinSII: '2026-01-15' },
    ];
    expect(pickMostRecentMotivo(rows)).toEqual({ 'inv-1': 'Motivo reciente' });
  });

  it('falls back to updated/created when fechaltimaModificacinSII is blank on all rows (real-world sample)', () => {
    // Mirrors the real ETP-4784 sample: invoice 10000053 has 2 rows, both with the
    // same motivo and an empty Fecha_Ultima_Modif_Sii — recency falls back to `updated`.
    const rows = [
      { invoice: 'inv-53', motivo: '[4104]. Error en la cabecera.', fechaltimaModificacinSII: null, updated: '2026-02-01T10:00:00Z' },
      { invoice: 'inv-53', motivo: '[4104]. Error en la cabecera.', fechaltimaModificacinSII: null, updated: '2026-02-03T10:00:00Z' },
    ];
    expect(pickMostRecentMotivo(rows)).toEqual({ 'inv-53': '[4104]. Error en la cabecera.' });
  });

  it('falls back to created when both fechaltimaModificacinSII and updated are blank', () => {
    const rows = [
      { invoice: 'inv-2', motivo: 'Motivo A', created: '2026-01-01T00:00:00Z' },
      { invoice: 'inv-2', motivo: 'Motivo B', created: '2026-01-05T00:00:00Z' },
    ];
    expect(pickMostRecentMotivo(rows)).toEqual({ 'inv-2': 'Motivo B' });
  });

  it('returns an empty map when there are no rows for the invoice', () => {
    expect(pickMostRecentMotivo([])).toEqual({});
  });

  it('handles null/undefined input gracefully', () => {
    expect(pickMostRecentMotivo(null)).toEqual({});
    expect(pickMostRecentMotivo(undefined)).toEqual({});
  });

  it('skips rows without an invoice FK', () => {
    const rows = [{ motivo: 'Orphan row', fechaltimaModificacinSII: '2026-01-01' }];
    expect(pickMostRecentMotivo(rows)).toEqual({});
  });

  it('keeps separate motivos for different invoices', () => {
    const rows = [
      { invoice: 'inv-1', motivo: 'Motivo 1', fechaltimaModificacinSII: '2026-01-01' },
      { invoice: 'inv-2', motivo: 'Motivo 2', fechaltimaModificacinSII: '2026-01-02' },
    ];
    expect(pickMostRecentMotivo(rows)).toEqual({ 'inv-1': 'Motivo 1', 'inv-2': 'Motivo 2' });
  });

  // ETP-4784 correction #4 — defense-in-depth: a *SiiData row's own
  // estadoRegistro (the outcome of THAT send attempt) is CO (Correcto), so
  // it is never a valid motivo source, even in isolation from the caller's
  // header-status gate.
  it('skips a row whose own estadoRegistro is not an error status (CO)', () => {
    const rows = [
      { invoice: 'inv-1', motivo: 'Stale motivo from a reused row', estadoRegistro: 'CO', fechaltimaModificacinSII: '2026-01-01' },
    ];
    expect(pickMostRecentMotivo(rows)).toEqual({});
  });

  it('still picks the motivo of a row whose own estadoRegistro IS an error status', () => {
    const rows = [
      { invoice: 'inv-1', motivo: 'Real reason', estadoRegistro: 'EE', fechaltimaModificacinSII: '2026-01-01' },
    ];
    expect(pickMostRecentMotivo(rows)).toEqual({ 'inv-1': 'Real reason' });
  });

  it('picks the most-recent ERROR row, skipping a later successful (CO) row', () => {
    // Reproduces the reported case at the row-history level: an old failed
    // attempt (EE, real motivo) followed by a newer successful resend (CO)
    // for the same invoice — the CO row must not "win" the map with a null
    // motivo, so the caller's header-status gate (row.aeatsiiEstado) is what
    // ultimately decides whether anything is shown for a currently-CO invoice.
    const rows = [
      { invoice: 'inv-1', motivo: 'Referencia del proveedor', estadoRegistro: 'EE', fechaltimaModificacinSII: '2026-01-01' },
      { invoice: 'inv-1', motivo: null, estadoRegistro: 'CO', fechaltimaModificacinSII: '2026-01-15' },
    ];
    expect(pickMostRecentMotivo(rows)).toEqual({ 'inv-1': 'Referencia del proveedor' });
  });

  it('treats a missing estadoRegistro as unknown and still considers the row (back-compat)', () => {
    const rows = [{ invoice: 'inv-1', motivo: 'No status field on this row', fechaltimaModificacinSII: '2026-01-01' }];
    expect(pickMostRecentMotivo(rows)).toEqual({ 'inv-1': 'No status field on this row' });
  });
});
