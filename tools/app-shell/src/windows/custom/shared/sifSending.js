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
 * @param {object} invoice the invoice record (needs `aeatsiiIssent`, `tbaiIssent`,
 *   `invoiceDate`, `accountingDate`)
 * @param {string|null} [territory] TBAI territory (`tbaiRecord.etsgSifTerritory`, ETP-5087) —
 *   only `BIZKAIA` enables TBAI for purchase documents; see `getInvoiceFiscalTargets`.
 * @param {object|null} [tbaiRecord] `useFiscalConfig().tbaiRecord` — carries `tbaisystemdate`
 *   (the org's TBAI adoption date). TBAI is never pending without it (ETP-5122):
 *   an invoice dated before the org's adoption date must not offer TicketBAI sending.
 *   Territory (ETP-5087) and date (ETP-5122) are independent gates and are ANDed:
 *   TBAI is only pending when the document's territory AND its date both qualify.
 * @param {string|null} [siiCutoverDate] `useFiscalConfig().earliestSiiCutoverDate` — the
 *   org's earliest-ever SII enrollment date (`fechaAcogidaSII`), across all config rows.
 *   ETP-5432 #3: SII used to have NO date gate at all here, so "Enviar a SIF" offered
 *   to send an invoice dated before the org was ever SII-enrolled — live-tested on
 *   invoice 10000075 (accountingDate 22/09/2026, fechaAcogidaSII 24/09/2026). Mirrors
 *   the TBAI gate above: without a cutover date on file, SII is never pending
 *   (fail-safe, same as `isSifEligibleByDate`'s own default).
 * @param {string|null} [tbaiCutoverDate] `useFiscalConfig().earliestTbaiCutoverDate` — the
 *   org's earliest-ever TBAI enrollment date, across all config rows (active or
 *   deactivated). ETP-5432 QA: the TBAI gate used to read `tbaiRecord?.tbaisystemdate`
 *   (the currently ACTIVE row's own date), so a "Change SIF" config swap could hide a
 *   genuinely-eligible invoice — dated after the org's TRUE earliest enrollment but
 *   before the new active row's later date — behind the wrong cutover. Mirrors the SII
 *   fix above: prefer the earliest-ever date, fall back to the active record's own date
 *   only when no earliest date is on file (e.g. tests/callers that don't thread it yet).
 */
export function getPendingSifTargets(specName, profile, invoice, territory = null, tbaiRecord = null, siiCutoverDate = null, tbaiCutoverDate = null) {
  const { showSii, showTbai } = getInvoiceFiscalTargets(specName, profile, territory);
  // SII books by accounting date, not invoice date — mirrors isSifEligibleByDate's
  // own doc and useFiscalStatus.js's siiEligible check.
  const siiEligibleByDate = showSii && isSifEligibleByDate(invoice?.accountingDate, siiCutoverDate);
  const tbaiEligibleByDate = showTbai
    && isSifEligibleByDate(invoice?.invoiceDate, tbaiCutoverDate ?? tbaiRecord?.tbaisystemdate);

  // ETP-5272: a registry-error correction (`aeatsiiErrorRegistral = 'Y'`/`true`) needs
  // a fresh SII send even when the invoice was already sent once (`aeatsiiIssent` stays
  // `true` forever — the classic backend never resets it after the correction cycle).
  // Without this OR, the "Send to SIF" button never reappears for a corrected invoice.
  const pendingRegistralCorrection = isSent(invoice?.aeatsiiErrorRegistral);

  return {
    sendSii: siiEligibleByDate && (!isSent(invoice?.aeatsiiIssent) || pendingRegistralCorrection),
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
