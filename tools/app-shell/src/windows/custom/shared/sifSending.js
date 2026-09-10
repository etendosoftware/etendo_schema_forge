import { getInvoiceFiscalTargets, isSifEligibleByDate } from './fiscalTargets.js';

/**
 * NEO serialises an AD `boolean` column either as a real JSON `true`/`false` or
 * as the raw AD character flag `'Y'`/`'N'`, depending on the read path. `'N'` is
 * a truthy JS string, so a bare `if (row.someFlag)` reports "sent" for an
 * unsent record — hence this explicit check (the same idiom `SifTab`,
 * `SifDataTabs` and `useSifFieldPatcher` use). Exported so the invoice LIST
 * columns can read `tbaiIssent`/`aeatsiiIssent` with the same semantics the
 * detail path uses (ETP-5087).
 */
export function isSent(value) {
  return value === true || value === 'Y';
}

/**
 * @param {string} specName kebab-case spec (`sales-invoice`, `purchase-invoice`, ...)
 * @param {string|null|undefined} profile active fiscal profile from `useFiscalConfig`
 * @param {object} invoice the invoice record (needs `aeatsiiIssent`, `tbaiIssent`, `invoiceDate`)
 * @param {string|null} [territory] TBAI territory (`tbaiRecord.etsgSifTerritory`, ETP-5087) —
 *   only `BIZKAIA` enables TBAI for purchase documents; see `getInvoiceFiscalTargets`.
 * @param {object|null} [tbaiRecord] `useFiscalConfig().tbaiRecord` — carries `tbaisystemdate`
 *   (the org's TBAI adoption date). TBAI is never pending without it (ETP-5122):
 *   an invoice dated before the org's adoption date must not offer TicketBAI sending.
 *   Territory (ETP-5087) and date (ETP-5122) are independent gates and are ANDed:
 *   TBAI is only pending when the document's territory AND its date both qualify.
 */
export function getPendingSifTargets(specName, profile, invoice, territory = null, tbaiRecord = null) {
  const { showSii, showTbai } = getInvoiceFiscalTargets(specName, profile, territory);
  const tbaiEligibleByDate = showTbai
    && isSifEligibleByDate(invoice?.invoiceDate, tbaiRecord?.tbaisystemdate);

  return {
    sendSii: showSii && !isSent(invoice?.aeatsiiIssent),
    sendTbai: tbaiEligibleByDate && !isSent(invoice?.tbaiIssent),
  };
}

// ETP-5027: for a PURCHASE invoice, TBAI eligibility (gated by fiscalTargets.js
// to the Bizkaia territory — see ETP-5087) always means the invoice is being sent
// to Batuz specifically, never to the generic TicketBAI scheme. Sales invoices
// keep the generic "TicketBAI" wording regardless of territory, since TBAI is
// always eligible for them (fiscalTargets.js never gates sales by territory).
export function getSifBodyKey(specName, { sendSii, sendTbai }) {
  const isPurchase = specName === 'purchase-invoice';
  if (sendSii && sendTbai) return isPurchase ? 'sendToSifBodyBothPurchase' : 'sendToSifBodyBoth';
  if (sendTbai) return isPurchase ? 'sendToSifBodyTbaiPurchase' : 'sendToSifBodyTbai';
  return 'sendToSifBodySii';
}

/**
 * ETP-5087: the RESULT copy must follow the same purchase/sales split the
 * confirmation copy already applies — a purchase invoice that was just sent to
 * Batuz used to report "Enviado a TicketBAI correctamente.", contradicting the
 * confirmation the user had just accepted. Only the TBAI outcome differs: SII is
 * SII in both directions, so `sendToSifSuccessSii`/`sendToSifErrorSii` stay
 * shared. There is no combined SII+TBAI result key — the modal renders one line
 * per target.
 */
export function getSifTbaiSuccessKey(specName) {
  return specName === 'purchase-invoice' ? 'sendToSifSuccessTbaiPurchase' : 'sendToSifSuccessTbai';
}

export function getSifTbaiErrorKey(specName) {
  return specName === 'purchase-invoice' ? 'sendToSifErrorTbaiPurchase' : 'sendToSifErrorTbai';
}
