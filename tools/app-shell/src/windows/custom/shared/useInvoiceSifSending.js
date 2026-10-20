import { useMemo } from 'react';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { useAuth } from '@/auth/AuthContext.jsx';
import { getPendingSifTargets, getSifBodyKey, getSifButtonLabelKey } from './sifSending.js';
import { resolveInvoiceOrgId } from './resolveInvoiceOrgId.js';

/**
 * The fiscal-sending state of ONE open invoice (form view): which systems it is still
 * pending for, and the copy that goes with them.
 *
 * ETP-5700 — extracted from the former form-topbar `SendToSifButton`; the form kebab
 * entry (`SifSendMenuItem`) is now its only consumer and the form view's only send
 * entry point. The fiscal config is keyed by the INVOICE's own org (ETP-5087, see
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
