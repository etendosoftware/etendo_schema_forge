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

async function fetchVerifactuStatus(apiFetch, orgId, invoiceId) {
  const entities = [
    'facturasAceptadas',
    'facturasParcialmenteAceptadas',
    'facturasRechazadas',
    'facturasInválidas',
  ];
  for (const entity of entities) {
    const status = await fetchFirstStatus(apiFetch, VF_SPEC, entity, { organization: orgId }, { fkField: 'invoice', statusField: 'verifactuSendingStatus' }, invoiceId);
    if (status !== null) return status;
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
export function useFiscalStatus(invoiceId, specName, profile, apiBaseUrl, orgId) {
  const [state, setState] = useState({ sii: null, tbai: null, verifactu: null, loading: true });
  const [refreshTick, setRefreshTick] = useState(0);
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));

  useInvoiceUpdatedListener(specName, invoiceId, useCallback(() => setRefreshTick((t) => t + 1), []));

  useEffect(() => {
    if (!invoiceId || !apiBaseUrl || !apiFetch) {
      setState({ sii: null, tbai: null, verifactu: null, loading: false });
      return;
    }
    const targets = getInvoiceFiscalTargets(specName, profile);
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
  }, [invoiceId, specName, profile, apiBaseUrl, apiFetch, orgId, refreshTick]);

  return state;
}
