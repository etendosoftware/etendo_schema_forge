/**
 * Selector items carry auxiliary values (`_aux`, e.g. `_UOM` on a product) that the NEO selector
 * serialises with the Java `toString()` of the referenced object: `UOM(<id>) (name: Centimeter)`.
 * `parseAuxReference` splits that into `{ id, name }`; anything else (a plain number, a blank, an
 * unexpected shape) returns `null` so callers never invent a value.
 */
const AUX_REFERENCE = /^[A-Za-z][\w.]*\(([^()\s]+)\)\s*\(name:\s*(.*)\)\s*$/;

export function parseAuxReference(value) {
  if (typeof value !== 'string') return null;
  const match = AUX_REFERENCE.exec(value.trim());
  if (!match || !match[2]) return null;
  return { id: match[1], name: match[2] };
}

/**
 * ETP-5696 — the grey-pill columns (`display: 'tag'`, the unit of a document line) are filled
 * from the selected item's `_aux` while a line is still being ADDED: some line callouts answer
 * the column with an empty object (purchase/sales invoice), so without this the pill would only
 * appear after the line is saved. Matches by NAME, not identity: an aux suffix `_<Name>` feeds
 * the tag column whose key equals `<Name>` case-insensitively. Returns `{ [key]: id,
 * [key + '$_identifier']: name }` pairs to apply, empty when nothing matches.
 */
export function tagColumnsFromAux(columns, aux) {
  const out = {};
  if (!aux || typeof aux !== 'object') return out;
  for (const [suffix, raw] of Object.entries(aux)) {
    const wanted = suffix.replace(/^_/, '').toLowerCase();
    const col = (columns ?? []).find(c => c?.display === 'tag' && String(c.key).toLowerCase() === wanted);
    const ref = col && parseAuxReference(raw);
    if (!ref) continue;
    out[col.key] = ref.id;
    out[`${col.key}$_identifier`] = ref.name;
  }
  return out;
}
