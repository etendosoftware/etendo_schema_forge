/**
 * Returns the list of backend spec names to fetch for a given fiscal profile.
 * @param {string|null} profile
 * @returns {string[]}
 */
export function buildMonitorFetchPlan(profile) {
  switch (profile) {
    case 'sii':
    case 'sii-navarra':
      return ['sii-monitor'];
    case 'tbai':
      return ['tbai-facturas-enviadas'];
    case 'sii+tbai':
      return ['sii-monitor', 'tbai-facturas-enviadas'];
    case 'verifactu':
      return ['monitor-verifactu'];
    default:
      return [];
  }
}

/**
 * Computes KPI card data from monitor subtab totalCounts.
 *
 * @param {string|null} profile  - active fiscal profile
 * @param {object} monitorData   - { sii?: {emitidas, recibidas, ...}, tbai?: {totalCount}, verifactu?: {...} }
 * @returns {object} kpis        - { sii?: {...}, tbai?: {...}, verifactu?: {...} }
 */
export function computeKpis(profile, monitorData) {
  const kpis = {};
  const sii  = monitorData?.sii  ?? {};
  const tbai = monitorData?.tbai ?? {};
  const vf   = monitorData?.verifactu ?? {};

  if (profile === 'sii' || profile === 'sii-navarra' || profile === 'sii+tbai') {
    kpis.sii = {
      issued:          sii.issued?.totalCount          ?? 0,
      received:        sii.received?.totalCount        ?? 0,
      issuedPrevious:  sii.issuedPrevious?.totalCount  ?? 0,
      receivedPrevious:sii.receivedPrevious?.totalCount ?? 0,
    };
  }

  if (profile === 'tbai' || profile === 'sii+tbai') {
    kpis.tbai = {
      total:    tbai?.totalCount   ?? 0,
      received: tbai?.receivedCount ?? 0,
      rejected: tbai?.rejectedCount ?? 0,
      error:    tbai?.errorCount   ?? 0,
      pending:  tbai?.pendingCount ?? 0,
    };
  }

  if (profile === 'verifactu') {
    kpis.verifactu = {
      accepted:         vf.accepted?.totalCount         ?? 0,
      partiallyAccepted:vf.partiallyAccepted?.totalCount ?? 0,
      rejected:         vf.rejected?.totalCount         ?? 0,
      invalid:          vf.invalid?.totalCount          ?? 0,
    };
  }

  return kpis;
}
