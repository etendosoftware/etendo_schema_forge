import { useMemo } from 'react';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { useAuth } from '@/auth/AuthContext.jsx';
import { getPendingSifTargets, getSifBodyKey, getSifButtonLabelKey } from './sifSending.js';
import { resolveInvoiceOrgId } from './resolveInvoiceOrgId.js';

/**
 * The fiscal-sending state of ONE open invoice (form view): which systems it is still
 * pending for, and the copy that goes with them.
 *
 * ETP-5700 — extracted from `SendToSifButton` so the form topbar button and the form
 * kebab entry (`SifSendMenuItem`) gate on exactly the same rules and can never drift
 * apart. The fiscal config is keyed by the INVOICE's own org (ETP-5087, see
 * resolveInvoiceOrgId.js), never the top-nav org selector.
 *
 * @param {object} params
 * @param {object|null|undefined} params.data the invoice header record
 * @param {string} params.apiBaseUrl the window's NEO base (`/sws/neo/<spec>`)
 * @returns {{
 *   specName: string,
 *   pendingTargets: {sendSii: boolean, sendTbai: boolean},
 *   hasPendingTargets: boolean,
 *   labelKey: string,
 *   bodyKey: string,
 *   base: string,
 * }}
 */
export function useInvoiceSifSending({ data, apiBaseUrl }) {
  const specName = apiBaseUrl?.split('/').filter(Boolean).pop() || 'sales-invoice';
  const { selectedOrg } = useAuth();
  const orgId = resolveInvoiceOrgId(data, selectedOrg?.id);
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);

  const { profile, tbaiRecord, earliestSiiCutoverDate, earliestTbaiCutoverDate } = useFiscalConfig(orgId, apiBaseUrl);
  const territory = tbaiRecord?.etsgSifTerritory ?? null;
  // ETP-5432 #3 / QA: SII and TBAI are both gated on the org's EARLIEST-ever cutover
  // date — see sifSending.js.
  const pendingTargets = getPendingSifTargets(
    specName, profile, data, territory, tbaiRecord, earliestSiiCutoverDate, earliestTbaiCutoverDate,
  );
  const hasPendingTargets = pendingTargets.sendSii || pendingTargets.sendTbai;

  return {
    specName,
    pendingTargets,
    hasPendingTargets,
    labelKey: getSifButtonLabelKey(specName, pendingTargets),
    bodyKey: getSifBodyKey(specName, pendingTargets),
    base,
  };
}
