import { useState, useEffect } from 'react';
import { neoBase } from '@/components/related-documents/helpers.js';
import { getInvoiceFiscalTargets } from './fiscalTargets.js';

const SII_SPEC  = 'sii-monitor';
const TBAI_SPEC = 'tbai-facturas-enviadas';
const VF_SPEC   = 'monitor-verifactu';

async function fetchFirstStatus(base, spec, entity, extraParams, fields, invoiceId, token) {
  const { fkField, statusField } = fields;
  const params = new URLSearchParams({
    ...extraParams,
    _startRow: '0',
    _endRow:   '1',
    criteria: JSON.stringify([{ fieldName: fkField, operator: 'equals', value: invoiceId }]),
  });
  const res = await fetch(`${base}/${spec}/${encodeURIComponent(entity)}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const row = json?.response?.data?.[0] ?? null;
  return row ? (row[statusField] ?? null) : null;
}

async function fetchSiiParentId(base, orgId, token) {
  const params = new URLSearchParams({ organization: orgId, _limit: '1' });
  const res = await fetch(`${base}/${SII_SPEC}/organizations?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.response?.data?.[0]?.id ?? null;
}

async function fetchSiiStatus(base, orgId, invoiceId, token) {
  const parentId = await fetchSiiParentId(base, orgId, token);
  if (!parentId) return null;
  const extra = { parentId };
  const siiFields = { fkField: 'aeatsiiInvoice', statusField: 'aeatsiiEstado' };
  const issued = await fetchFirstStatus(base, SII_SPEC, 'issuedInvoices', extra, siiFields, invoiceId, token);
  if (issued !== null) return issued;
  return fetchFirstStatus(base, SII_SPEC, 'receivedInvoices', extra, siiFields, invoiceId, token);
}

async function fetchTbaiStatus(base, orgId, invoiceId, token) {
  return fetchFirstStatus(base, TBAI_SPEC, 'sincronización', { organization: orgId }, { fkField: 'invoice', statusField: 'estado' }, invoiceId, token);
}

async function fetchVerifactuStatus(base, orgId, invoiceId, token) {
  const entities = [
    'facturasAceptadas',
    'partiallyAcceptedInvoices',
    'facturasRechazadas',
    'facturasInválidas',
  ];
  for (const entity of entities) {
    const status = await fetchFirstStatus(base, VF_SPEC, entity, { organization: orgId }, { fkField: 'invoice', statusField: 'verifactuSendingStatus' }, invoiceId, token);
    if (status !== null) return status;
  }
  return null;
}

export function useFiscalStatus(invoiceId, specName, profile, apiBaseUrl, token, orgId) {
  const [state, setState] = useState({ sii: null, tbai: null, verifactu: null, loading: true });

  useEffect(() => {
    if (!invoiceId || !apiBaseUrl || !token) {
      setState({ sii: null, tbai: null, verifactu: null, loading: false });
      return;
    }
    const targets = getInvoiceFiscalTargets(specName, profile);
    if (!targets.showSii && !targets.showTbai && !targets.showVerifactu) {
      setState({ sii: null, tbai: null, verifactu: null, loading: false });
      return;
    }

    setState(s => ({ ...s, loading: true }));
    const base = neoBase(apiBaseUrl);

    Promise.all([
      targets.showSii && orgId ? fetchSiiStatus(base, orgId, invoiceId, token)  : Promise.resolve(null),
      targets.showTbai         ? fetchTbaiStatus(base, orgId, invoiceId, token) : Promise.resolve(null),
      targets.showVerifactu    ? fetchVerifactuStatus(base, orgId, invoiceId, token) : Promise.resolve(null),
    ])
      .then(([sii, tbai, verifactu]) => setState({ sii, tbai, verifactu, loading: false }))
      .catch(() => setState({ sii: null, tbai: null, verifactu: null, loading: false }));
  }, [invoiceId, specName, profile, apiBaseUrl, token, orgId]);

  return state;
}
