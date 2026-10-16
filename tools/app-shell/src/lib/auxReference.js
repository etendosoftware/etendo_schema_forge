/**
 * Selector items carry auxiliary values (`_aux`, e.g. `_UOM` on a product) that the NEO selector
 * serialises with the Java `toString()` of the referenced object: `UOM(<id>) (name: Centimeter)`.
 * `parseAuxReference` splits that into `{ id, name }`; anything else (a plain number, a blank, an
 * unexpected shape) returns `null` so callers never invent a value.
 */
const REFERENCE_KIND = /^[A-Za-z][\w.]*$/;
const NAME_OPEN = '(name:';

export function parseAuxReference(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  // `<Kind>(<id>) (name: <name>)` — parsed with index lookups, not a regex over the whole
  // string: a pattern with several open-ended quantifiers can backtrack super-linearly.
  const open = text.indexOf('(');
  const close = text.indexOf(')', open + 1);
  if (open < 1 || close < 0) return null;
  if (!REFERENCE_KIND.test(text.slice(0, open))) return null;
  const id = text.slice(open + 1, close);
  if (!id || /[\s()]/.test(id)) return null;
  const rest = text.slice(close + 1).trim();
  if (!rest.startsWith(NAME_OPEN) || !rest.endsWith(')')) return null;
  const name = rest.slice(NAME_OPEN.length, -1).trim();
  return name ? { id, name } : null;
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
