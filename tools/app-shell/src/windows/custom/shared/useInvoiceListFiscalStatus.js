import { useState, useEffect } from 'react';
import { neoBase } from '@/components/related-documents/helpers.js';
import { getInvoiceFiscalTargets } from './fiscalTargets.js';

const SII_SPEC  = 'sii-monitor';
const TBAI_SPEC = 'tbai-facturas-enviadas';
const VF_SPEC   = 'monitor-verifactu';

async function fetchInSetStatus(base, spec, entity, extraParams, fields, ids, token) {
  const { fkField, statusField } = fields;
  if (!ids.length) return {};
  const params = new URLSearchParams({
    ...extraParams,
    _startRow: '0',
    _endRow: String(ids.length),
    criteria: JSON.stringify([{ fieldName: fkField, operator: 'inSet', value: ids }]),
  });
  const res = await fetch(`${base}/${spec}/${encodeURIComponent(entity)}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return {};
  const json = await res.json();
  const rows = json?.response?.data ?? [];
  const map = {};
  for (const row of rows) {
    if (row[fkField]) map[row[fkField]] = row[statusField] ?? null;
  }
  return map;
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

export function useInvoiceListFiscalStatus(ids, specName, profile, apiBaseUrl, token, orgId) {
  const [state, setState] = useState({ statusMap: null, loading: false });

  const idsKey = ids?.join(',') ?? '';

  useEffect(() => {
    if (!idsKey || !apiBaseUrl || !token || !profile || !orgId) return;
    const targets = getInvoiceFiscalTargets(specName, profile);
    if (!targets.showSii && !targets.showTbai && !targets.showVerifactu) return;

    let cancelled = false;
    setState({ statusMap: null, loading: true });
    const base = neoBase(apiBaseUrl);
    const idList = idsKey.split(',').filter(Boolean);

    (async () => {
      let siiMap = {};
      if (targets.showSii) {
        const parentId = await fetchSiiParentId(base, orgId, token);
        if (parentId) {
          const [issued, received] = await Promise.all([
            fetchInSetStatus(base, SII_SPEC, 'issuedInvoices',  { parentId }, { fkField: 'aeatsiiInvoice', statusField: 'aeatsiiEstado' }, idList, token),
            fetchInSetStatus(base, SII_SPEC, 'receivedInvoices', { parentId }, { fkField: 'aeatsiiInvoice', statusField: 'aeatsiiEstado' }, idList, token),
          ]);
          siiMap = { ...received, ...issued };
        }
      }

      let tbaiMap = {};
      if (targets.showTbai) {
        tbaiMap = await fetchInSetStatus(base, TBAI_SPEC, 'sincronización', { organization: orgId }, { fkField: 'invoice', statusField: 'estado' }, idList, token);
      }

      let vfMap = {};
      if (targets.showVerifactu) {
        const maps = await Promise.all([
          fetchInSetStatus(base, VF_SPEC, 'facturasAceptadas',           { organization: orgId }, { fkField: 'invoice', statusField: 'verifactuSendingStatus' }, idList, token),
          fetchInSetStatus(base, VF_SPEC, 'partiallyAcceptedInvoices',   { organization: orgId }, { fkField: 'invoice', statusField: 'verifactuSendingStatus' }, idList, token),
          fetchInSetStatus(base, VF_SPEC, 'facturasRechazadas',          { organization: orgId }, { fkField: 'invoice', statusField: 'verifactuSendingStatus' }, idList, token),
          fetchInSetStatus(base, VF_SPEC, 'facturasInválidas',           { organization: orgId }, { fkField: 'invoice', statusField: 'verifactuSendingStatus' }, idList, token),
        ]);
        for (const m of maps) Object.assign(vfMap, m);
      }

      const statusMap = {};
      for (const id of idList) {
        statusMap[id] = {
          sii:       targets.showSii       ? (siiMap[id]  ?? null) : undefined,
          tbai:      targets.showTbai      ? (tbaiMap[id] ?? null) : undefined,
          verifactu: targets.showVerifactu ? (vfMap[id]   ?? null) : undefined,
        };
      }

      if (!cancelled) setState({ statusMap, loading: false });
    })().catch(() => { if (!cancelled) setState({ statusMap: {}, loading: false }); });

    return () => { cancelled = true; };
  }, [idsKey, specName, profile, apiBaseUrl, token, orgId]);

  return state;
}
