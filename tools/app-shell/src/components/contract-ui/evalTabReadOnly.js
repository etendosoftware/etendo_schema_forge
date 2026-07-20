/**
 * Evaluate a secondary tab's readOnlyLogic against the header record.
 * Returns true when the tab should block add/edit/delete actions.
 * Existing rows still render — only mutation is suppressed.
 *
 * Extracted into a plain .js module so Node's built-in test runner
 * (which does not understand JSX) can import it directly.
 */
export function evalTabReadOnly(tab, record) {
  if (!tab?.readOnlyLogic) return false;
  const safeRecord = record ?? {};
  // NEO serializes a Yes/No AD column as either a JS boolean or the raw 'Y'/'N'
  // string depending on the endpoint, and the generated readOnlyLogic itself
  // is inconsistent about which form it expects field-by-field within the SAME
  // compiled function (e.g. `posted === true` alongside `hASREVERSEDINVOICESO
  // === 'Y'`, both compiled from the same decisions.json condition). No single
  // normalization of the record satisfies both comparison styles at once, so
  // evaluate against the raw record AND a boolean-normalized copy and lock if
  // either says to — mirrors the `=== true || === 'Y'` guard already used by
  // getDocumentReadOnly for the document-wide lock, generalized to any field.
  try {
    if (tab.readOnlyLogic(safeRecord)) return true;
  } catch {
    // fall through to the normalized attempt below
  }
  try {
    return !!tab.readOnlyLogic(normalizeYesNo(safeRecord));
  } catch {
    return false;
  }
}

function normalizeYesNo(record) {
  const normalized = {};
  for (const [key, value] of Object.entries(record)) {
    normalized[key] = value === 'Y' ? true : value === 'N' ? false : value;
  }
  return normalized;
}
