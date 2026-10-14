/**
 * ETP-5585 — compares the tax id the OCR read as the invoice RECEIVER against the active
 * organisation's tax id (AD_OrgInfo.TaxID, from `GET /sws/neo/session` → organization.taxId).
 *
 * Pure: no I/O. No check-digit validation; leading zeros are kept.
 */

// Leading 2-letter prefixes that are real VAT country prefixes. Anything else (e.g. the `X`/`Y`/`Z`
// of an NIE, the letter of a CIF) is part of the id and must never be stripped. GR is an alias of EL.
const VAT_PREFIXES = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT',
  'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'XI', 'GB',
]);

/** Uppercase, keep only [A-Z0-9]. Blank and the "?" placeholder become ''. */
export function cleanTaxId(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** The id without a known VAT country prefix (only when something remains after it). */
export function stripVatPrefix(clean) {
  const head = clean.slice(0, 2);
  const prefix = head === 'GR' ? 'EL' : head;
  if (clean.length > 2 && VAT_PREFIXES.has(prefix)) return clean.slice(2);
  return clean;
}

/** True when two ids are the same after cleaning, with or without a country prefix. */
export function taxIdsMatch(a, b) {
  const ca = cleanTaxId(a);
  const cb = cleanTaxId(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  const ba = stripVatPrefix(ca);
  const bb = stripVatPrefix(cb);
  return ba === bb;
}

/**
 * @param {object} extraction OCR payload (`receiver`, `issuer`, legacy `tax_id`)
 * @param {string|null} orgTaxId the active organisation's tax id
 * @returns {{status: 'match'|'mismatch'|'absent'|'no-org-tax-id'|'same-as-issuer', receiverTaxId: string, orgTaxId: string}}
 */
export function checkReceiverTaxId(extraction, orgTaxId) {
  const receiverRaw = String(extraction?.receiver?.tax_id_raw ?? '').trim();
  const orgRaw = String(orgTaxId ?? '').trim();
  const out = (status) => ({ status, receiverTaxId: receiverRaw, orgTaxId: orgRaw });

  if (!cleanTaxId(receiverRaw)) return out('absent');
  // The receiver equals the issuer: the model confused the two blocks, nothing to conclude.
  const issuerRaw = extraction?.issuer?.tax_id_raw || extraction?.tax_id;
  if (taxIdsMatch(receiverRaw, issuerRaw)) return out('same-as-issuer');
  if (!cleanTaxId(orgRaw)) return out('no-org-tax-id');
  return out(taxIdsMatch(receiverRaw, orgRaw) ? 'match' : 'mismatch');
}
