/**
 * File naming for the portal's PDF downloads (ETP-5267) — pure, no React, no DOM, so it stays
 * loadable by the plain `node --test` suite that covers `src/lib/`.
 *
 * The MVP's invoice-status rules (`resolveInvoiceStatus`, `PORTAL_INVOICE_STATUS`) were removed in
 * ETP-6209 with the `/invoices` list they served; payment states now come from the app's own
 * `resolveInvoicePaymentBadge` through `pages/portal/portalPresentation.js`.
 */

/**
 * File name for a downloaded invoice PDF.
 *
 * Etendo document numbers routinely contain a slash (`FV/0001`), which a browser reads as a
 * path separator in the `download` attribute and silently truncates the saved name to its last
 * segment. Every character outside a conservative safe set is therefore folded to `-`.
 *
 * @param {{ documentNo: string|null, id: string|null }} invoice
 */
export function portalPdfFileName(invoice) {
  const raw = invoice?.documentNo || invoice?.id || 'invoice';
  const folded = String(raw).replace(/[^A-Za-z0-9._-]+/g, '-');
  return `${trimDashes(folded) || 'invoice'}.pdf`;
}

/**
 * Strips leading and trailing `-` by scanning in from both ends.
 *
 * This replaced `.replace(/^-+|-+$/g, '')`, which was quadratic — and measurably so, not just in
 * theory. `-+$` is retried from every start position, and on a dash run that sits neither at the
 * start nor at the end each attempt scans the whole run before `$` fails: `x` + 8000 dashes + `x`
 * took ~200 ms, quadrupling per doubling of the run, and 50k dashes did not finish in two minutes.
 * That input is reachable — `-` is inside the safe set above, so a document number like
 * `FV-----0001` keeps its run; the fold collapses runs of UNSAFE characters, not of dashes.
 *
 * Written as an index scan rather than a tidier regex on purpose: it is the construct itself that
 * carries the risk, so removing it is what makes the outcome certain.
 *
 * @param {string} value already folded to the safe character set
 * @returns {string} `value` without its leading or trailing dashes; `''` when it is all dashes
 */
function trimDashes(value) {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === '-') start += 1;
  while (end > start && value[end - 1] === '-') end -= 1;
  return value.slice(start, end);
}
