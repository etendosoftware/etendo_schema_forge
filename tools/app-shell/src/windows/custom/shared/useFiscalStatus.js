import { useState, useEffect, useCallback } from 'react';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { getInvoiceFiscalTargets } from './fiscalTargets.js';
import { useInvoiceUpdatedListener } from './useInvoiceUpdatedListener.js';

const SII_SPEC  = 'sii-monitor';
const TBAI_SPEC = 'tbai-facturas-enviadas';
const VF_SPEC   = 'monitor-verifactu';

async function fetchFirstStatus(apiFetch, spec, entity, extraParams, fields, invoiceId) {
  const { fkField, statusField } = fields;
  const params = new URLSearchParams({
    ...extraParams,
    _startRow: '0',
    _endRow:   '1',
    criteria: JSON.stringify([{ fieldName: fkField, operator: 'equals', value: invoiceId }]),
  });
  const res = await apiFetch(`/${spec}/${encodeURIComponent(entity)}?${params}`);
  if (!res.ok) return null;
  const json = await res.json();
  const row = json?.response?.data?.[0] ?? null;
  return row ? (row[statusField] ?? null) : null;
}

async function fetchSiiParentId(apiFetch, orgId) {
  const params = new URLSearchParams({ organization: orgId, _limit: '1' });
  const res = await apiFetch(`/${SII_SPEC}/organizations?${params}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json?.response?.data?.[0]?.id ?? null;
}

async function fetchSiiStatus(apiFetch, orgId, invoiceId) {
  const parentId = await fetchSiiParentId(apiFetch, orgId);
  if (!parentId) return null;
  const extra = { parentId };
  const siiFields = { fkField: 'aeatsiiInvoice', statusField: 'aeatsiiEstado' };
  const issued = await fetchFirstStatus(apiFetch, SII_SPEC, 'issuedInvoices', extra, siiFields, invoiceId);
  if (issued !== null) return issued;
  return fetchFirstStatus(apiFetch, SII_SPEC, 'receivedInvoices', extra, siiFields, invoiceId);
}

async function fetchTbaiStatus(apiFetch, orgId, invoiceId) {
  return fetchFirstStatus(apiFetch, TBAI_SPEC, 'sincronización', { organization: orgId }, { fkField: 'invoice', statusField: 'estado' }, invoiceId);
}

// Maps em_etvfac_invoice_status DB codes to the StatusPill keys defined in FmPrimitives.jsx.
// Without this mapping, codes like 'IN' are misread as the SII 'IN' code ("Rechazado")
// instead of the Verifactu 'invalid' code ("Inválido") — ETP-4783.
// The Verifactu AD reference list is AC/AE/IN/ER/PE (com.etendoerp.verifactu) —
// there is no 'CO' code here; that one belongs to SII.
export const VF_STATUS_MAP = {
  AC: 'accepted',
  AE: 'partiallyAccepted',
  ER: 'rejected',
  IN: 'invalid',
  PE: 'vf_pending',
};

/**
 * Canonical raw-code -> StatusPill-key mapper for VERI*FACTU statuses.
 * Single source of truth: every Verifactu surface (invoice preview badge,
 * fiscal monitor table, CSV export) must go through this helper so a raw code
 * never reaches `StatusPill` and collides with a same-letter SII code.
 * Unknown codes fall through unchanged.
 *
 * @param {string|null|undefined} raw raw `em_etvfac_invoice_status` code
 * @returns {string|null|undefined} StatusPill-compatible key
 */
export const mapVfStatus = (raw) => VF_STATUS_MAP[raw] ?? raw;

async function fetchVerifactuStatus(apiFetch, orgId, invoiceId) {
  const entities = [
    'facturasAceptadas',
    'facturasParcialmenteAceptadas',
    'facturasRechazadas',
    'facturasInválidas',
  ];
  for (const entity of entities) {
    const raw = await fetchFirstStatus(apiFetch, VF_SPEC, entity, { organization: orgId }, { fkField: 'invoice', statusField: 'verifactuSendingStatus' }, invoiceId);
    if (raw !== null) return mapVfStatus(raw);
  }
  return null;
}

/**
 * Fetches the SII / TBAI / Verifactu sending status for an invoice from the
 * dedicated monitor specs (`sii-monitor`, `tbai-facturas-enviadas`,
 * `monitor-verifactu`) — separate from the `tbaiSyncEstado` field the header
 * GET response injects for the list column.
 *
 * Because the fetch is keyed by `invoiceId` (which never changes for the same
 * invoice), a successful "Enviar a SIF" action would previously leave this
 * hook showing its pre-send snapshot (loading:false, tbai:null → "Pendiente")
 * for the rest of the preview session, even though the record on the server
 * already has a real status. `refetchInvoice()` in `useInvoicePreview.js`
 * dispatches `${specName}:invoice-updated` after a successful send (the same
 * event `SalesInvoiceTopbar`/`PurchaseInvoiceTopbar` already listen to via
 * `useInvoiceUpdatedListener`), so this hook re-runs the fetch on that same
 * event instead of introducing a second refresh mechanism.
 */
export function useFiscalStatus(invoiceId, specName, profile, apiBaseUrl, orgId, territory = null) {
  const [state, setState] = useState({ sii: null, tbai: null, verifactu: null, loading: true });
  const [refreshTick, setRefreshTick] = useState(0);
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));

  useInvoiceUpdatedListener(specName, invoiceId, useCallback(() => setRefreshTick((t) => t + 1), []));

  useEffect(() => {
    if (!invoiceId || !apiBaseUrl || !apiFetch) {
      setState({ sii: null, tbai: null, verifactu: null, loading: false });
      return;
    }
    const targets = getInvoiceFiscalTargets(specName, profile, territory);
    if (!targets.showSii && !targets.showTbai && !targets.showVerifactu) {
      setState({ sii: null, tbai: null, verifactu: null, loading: false });
      return;
    }

    setState(s => ({ ...s, loading: true }));

    Promise.all([
      targets.showSii && orgId ? fetchSiiStatus(apiFetch, orgId, invoiceId)  : Promise.resolve(null),
      targets.showTbai         ? fetchTbaiStatus(apiFetch, orgId, invoiceId) : Promise.resolve(null),
      targets.showVerifactu    ? fetchVerifactuStatus(apiFetch, orgId, invoiceId) : Promise.resolve(null),
    ])
      .then(([sii, tbai, verifactu]) => setState({ sii, tbai, verifactu, loading: false }))
      .catch(() => setState({ sii: null, tbai: null, verifactu: null, loading: false }));
  }, [invoiceId, specName, profile, apiBaseUrl, apiFetch, orgId, territory, refreshTick]);

  return state;
}
