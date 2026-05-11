import { getInvoiceFiscalTargets } from './fiscalTargets.js';

function isSent(value) {
  return value === true || value === 'Y';
}

export function getPendingSifTargets(specName, profile, invoice) {
  const { showSii, showTbai } = getInvoiceFiscalTargets(specName, profile);

  return {
    sendSii: showSii && !isSent(invoice?.aeatsiiIssent),
    sendTbai: showTbai && !isSent(invoice?.tbaiIssent),
  };
}

export function getSifBodyKey({ sendSii, sendTbai }) {
  if (sendSii && sendTbai) return 'sendToSifBodyBoth';
  if (sendTbai) return 'sendToSifBodyTbai';
  return 'sendToSifBodySii';
}
