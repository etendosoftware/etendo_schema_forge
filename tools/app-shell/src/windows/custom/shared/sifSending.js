import { getInvoiceFiscalTargets, isTbaiEligibleByDate } from './fiscalTargets.js';

function isSent(value) {
  return value === true || value === 'Y';
}

/**
 * @param {string} specName kebab-case spec (`sales-invoice`, `purchase-invoice`, ...)
 * @param {string|null|undefined} profile active fiscal profile from `useFiscalConfig`
 * @param {object} invoice the invoice record (needs `aeatsiiIssent`, `tbaiIssent`, `invoiceDate`)
 * @param {object|null} [tbaiRecord] `useFiscalConfig().tbaiRecord` — carries `tbaisystemdate`
 *   (the org's TBAI adoption date). TBAI is never pending without it (ETP-5122):
 *   an invoice dated before the org's adoption date must not offer TicketBAI sending.
 */
export function getPendingSifTargets(specName, profile, invoice, tbaiRecord) {
  const { showSii, showTbai } = getInvoiceFiscalTargets(specName, profile);
  const tbaiEligibleByDate = showTbai
    && isTbaiEligibleByDate(invoice?.invoiceDate, tbaiRecord?.tbaisystemdate);

  return {
    sendSii: showSii && !isSent(invoice?.aeatsiiIssent),
    sendTbai: tbaiEligibleByDate && !isSent(invoice?.tbaiIssent),
  };
}

export function getSifBodyKey({ sendSii, sendTbai }) {
  if (sendSii && sendTbai) return 'sendToSifBodyBoth';
  if (sendTbai) return 'sendToSifBodyTbai';
  return 'sendToSifBodySii';
}
