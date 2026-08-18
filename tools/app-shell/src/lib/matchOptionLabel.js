/**
 * Match a printed label against selector options.
 *
 * Pre-filled data (OCR extraction, an imported document, a pasted address)
 * carries human-readable labels — "España" — while the form fields that consume
 * them are selectors keyed by option id. Writing the label straight into the
 * form would produce a value that looks filled to the required-field check but
 * is rejected by the API, so it has to be resolved to an id first.
 */

export function normalizeLabel(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Resolve a label to an option id: exact match (accent- and case-insensitive)
 * first, then a prefix match in either direction, so "España" still finds
 * "ESPAÑA (ES)" and "Spain (ES)" still finds "Spain".
 *
 * Returns '' when nothing matches — the caller leaves the field empty and the
 * user picks it manually, which is the behaviour when there is no pre-fill at
 * all. Never guess: a wrong id is worse than an empty field, because the user
 * cannot see that it is wrong.
 *
 * @param {Array<{id: string, label: string}>} options
 * @param {string} raw  label as printed on the source document
 * @returns {string} matching option id, or '' when unresolved
 */
export function matchOptionByLabel(options, raw) {
  const needle = normalizeLabel(raw);
  if (needle.length < 2) return '';

  const list = Array.isArray(options) ? options : [];
  const exact = list.find(o => normalizeLabel(o.label) === needle);
  if (exact) return exact.id;

  // Guard the prefix pass with a minimum length: a 2-char option label would
  // otherwise swallow anything starting with those two characters.
  const prefixed = list.find(o => {
    const label = normalizeLabel(o.label);
    return label.length >= 3 && (label.startsWith(needle) || needle.startsWith(label));
  });
  return prefixed ? prefixed.id : '';
}
