// ETP-5824 — advisory warning for a missing postal code on a business partner address.
//
// com.smf.ticketbai refuses to complete an invoice subject to TicketBAI when the business
// partner is NOT flagged as simplified invoice (`tbaiIssimplifiedinv = N`) and the invoice
// partner address has no postal code (`TBAI_EmptyPostalCode`, ProcessInvoiceTbaiHook.preProcess).
// The address modal warns about it while the address is being typed, so the user can fix it
// before an invoice is ever blocked. The warning never blocks the save: it is not part of the
// modal's save gate (`isSaveBlocked`, ETP-5103/ETP-5806), which never requires a postal code.
//
// Customer scope: the completion block only runs on SALES invoices, so only a partner flagged
// as customer (`customer = Y`) can ever hit it. The modal is also opened from the purchase
// invoice partner picker ("+ Añadir dirección"), and a supplier-only partner must not see a
// warning about a block that never applies to it. A partner that is both customer and vendor
// still warns: its sales invoices are blocked.
//
// Sources, both read through the shared request helper:
//   - the business partner's customer and simplified flags: `{apiBase}/businessPartner/{bpId}`
//     (contacts spec, properties `customer` and `tbaiIssimplifiedinv`);
//   - whether TicketBAI is in use: ANY active `tbai-config/header` row the user can read.
//     Neither spec exposes an organization the browser could match on (the contacts record has
//     no organization field, and the tbai-config list ignores an `organization` parameter), and
//     a GO tenant normally has a single legal organization, so "TicketBAI is in use" is the
//     criterion. The warning is advisory; the hard guarantee is the completion block in
//     com.smf.ticketbai, which resolves the invoice organization up the org tree.
//
// Fail closed: a source that fails to load (network error, no access to the spec), or a flag the
// record does not carry, leaves the warning hidden.
import { useEffect, useState } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { neoBase } from '@/components/related-documents/helpers.js';
// Imported from fiscal-config on purpose: other shared files (TaxSifField, TaxSifModal,
// useTaxSifLineRowActions) already do, and moving the helpers to @/lib would touch ~20 importers
// and the test mocks that target this path.
import { isActiveRecord, isEtendoTrue } from '@/windows/custom/fiscal-config/fiscalConfig.utils.js';

const UNKNOWN = Object.freeze({ tbaiActive: false, partnerCustomer: null, partnerSimplified: null });
// One page is enough: a tenant has a handful of TicketBAI config rows at most (one per legal
// organization, plus the inactive traces "Change SIF" leaves behind), and a single active row
// anywhere in the page is all the rule needs. Same page size as useFiscalConfig's fetchAllRows.
const TBAI_CONFIG_PATH = `/tbai-config/header?${new URLSearchParams({ _limit: '50' })}`;

/**
 * Reads the customer flag off a business partner record: `true`, `false`, or `null` when the
 * record does not carry it (unknown → no warning).
 */
export function readPartnerCustomer(record) {
  const raw = record?.customer;
  if (raw === undefined || raw === null || raw === '') return null;
  return isEtendoTrue(raw);
}

/**
 * Reads the simplified flag off a business partner record: `true`, `false`, or `null` when the
 * record does not carry it (unknown → no warning).
 */
export function readPartnerSimplified(record) {
  const raw = record?.tbaiIssimplifiedinv;
  if (raw === undefined || raw === null || raw === '') return null;
  return isEtendoTrue(raw);
}

/**
 * Pure warning rule — exported for tests.
 *
 * @param {{ tbaiActive?: boolean, partnerCustomer?: boolean|null, partnerSimplified?: boolean|null,
 *   postalCode?: string }} input
 * @returns {boolean}
 */
export function shouldWarnMissingTbaiPostalCode({
  tbaiActive = false, partnerCustomer = null, partnerSimplified = null, postalCode = '',
} = {}) {
  if (!tbaiActive || partnerCustomer !== true || partnerSimplified !== false) return false;
  return String(postalCode ?? '').trim() === '';
}

async function readJson(apiFetch, url) {
  const res = await apiFetch(url);
  return res.ok ? res.json() : null;
}

/**
 * Loads what {@link shouldWarnMissingTbaiPostalCode} needs, only for a business-partner address
 * ('bpartner' save mode with a known `bpId`) while the modal is open.
 *
 * @param {{ open: boolean, saveMode: string, bpId?: string, apiBase: string }} params
 *   `apiBase` is the contacts spec base the modal already uses (`.../sws/neo/contacts`).
 * @returns {{ tbaiActive: boolean, partnerCustomer: boolean|null, partnerSimplified: boolean|null }}
 */
export function useTbaiPostalCodeContext({ open, saveMode, bpId, apiBase }) {
  const apiFetch = useApiFetch(apiBase);
  const neoFetch = useApiFetch(neoBase(apiBase));
  const [context, setContext] = useState(UNKNOWN);
  const enabled = Boolean(open && saveMode === 'bpartner' && bpId && apiBase);

  useEffect(() => {
    setContext(UNKNOWN);
    if (!enabled) return undefined;
    let cancelled = false;
    (async () => {
      const partnerJson = await readJson(apiFetch, `/businessPartner/${encodeURIComponent(bpId)}`);
      const partner = partnerJson?.response?.data?.[0];
      const partnerCustomer = readPartnerCustomer(partner);
      const partnerSimplified = readPartnerSimplified(partner);
      // A partner that is not a customer, or is simplified, or whose flags are unknown, never
      // warns: no need to ask for the configuration.
      if (partnerCustomer !== true || partnerSimplified !== false) {
        return { tbaiActive: false, partnerCustomer, partnerSimplified };
      }
      const tbaiJson = await readJson(neoFetch, TBAI_CONFIG_PATH);
      const tbaiActive = (tbaiJson?.response?.data ?? []).some(isActiveRecord);
      return { tbaiActive, partnerCustomer, partnerSimplified };
    })()
      .then((next) => {
        if (!cancelled) setContext(next);
      })
      .catch(() => {
        // Fail closed: the warning is advisory, a failed lookup simply hides it.
      });
    return () => { cancelled = true; };
  }, [enabled, bpId, apiFetch, neoFetch]);

  return context;
}
