import { isErrorStatus } from './FmPrimitives.jsx';

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

/**
 * Builds an invoice → most-recent `motivo` lookup from a list of `*SiiData`
 * rows (aeatsii_facturas). A single invoice can have several rows (resends);
 * this picks the one with the highest recency key.
 *
 * ETP-4784 fix: the C_Invoice header field (EM_Aeatsii_Error_Msg) can be
 * empty for an "Error" (EE) invoice even though the related aeatsii_facturas
 * row(s) carry the real reason in `motivo`. Recency is read from
 * `fechaltimaModificacinSII` (Fecha_Ultima_Modif_Sii) with a fallback to the
 * generic `updated`/`created` audit columns when that field is blank — all
 * three are lexically-sortable ISO-like strings, so a plain string comparison
 * is timezone-safe (no Date parsing involved).
 *
 * ETP-4784 correction #4: `*SiiData` rows carry their own `estadoRegistro`
 * (the outcome of that particular send attempt — same enum as the header's
 * `em_aeatsii_estado`: CO/AE/IN/PE/EE/AN/BA/NR). A row whose own status is
 * *not* an error (e.g. `CO` — Correcto) is skipped as a `motivo` source: the
 * observed real-world case is a single `aeatsii_facturas` row that gets
 * reused across resends, where AEAT/Etendo Go flips `estadoRegistro` back to
 * `CO` on success but leaves the stale `motivo` text from the previous
 * failed attempt untouched. Rows that omit `estadoRegistro` (older payload
 * shapes, existing tests) are treated as unknown and still considered, to
 * stay backward compatible. This is a defense-in-depth measure — the
 * primary gate is the invoice's CURRENT `aeatsiiEstado`, applied by the
 * caller before ever consulting this map (see SiiMonitorSection.jsx).
 *
 * @param {Array<object>} siiDataRows - rows from an `*SiiData` entity response
 * @returns {Record<string, string|null>} invoice id → motivo
 */
export function pickMostRecentMotivo(siiDataRows) {
  const motivoMap = {};
  const recencyByInvoice = {};
  for (const row of (siiDataRows ?? [])) {
    if (!row?.invoice) continue;
    if (row.estadoRegistro != null && !isErrorStatus(row.estadoRegistro)) continue;
    const recencyKey = row.fechaltimaModificacinSII || row.updated || row.created || '';
    const currentBest = recencyByInvoice[row.invoice];
    if (currentBest === undefined || recencyKey > currentBest) {
      recencyByInvoice[row.invoice] = recencyKey;
      motivoMap[row.invoice] = row.motivo ?? null;
    }
  }
  return motivoMap;
}
