/**
 * Menu matching for the global search (top-bar command palette).
 *
 * The palette lists the app's windows next to the record (vector) results. With a
 * query, only the windows the user is looking for may be listed: a window matches
 * by its own label (translated or original) or its route name, and a whole section
 * matches by its group label — typing "Configura" brings up every window of
 * "Configuración". Matching ignores case and accents, because Spanish is the primary
 * locale and users type "albaran" for "Albarán".
 */
import { normalizeLabel } from './matchOptionLabel.js';

function matchesAny(values, needle) {
  return values.some((value) => normalizeLabel(value).includes(needle));
}

/**
 * @param {Array<{group: string, items: Array<{name: string, label: string}>}>} groups
 *   the menu groups already reduced to what the user may see
 * @param {string} query raw search text
 * @param {(label: string) => string} translate menu label translator
 * @returns the groups to list: unchanged for an empty query, otherwise only the
 *   matching sections (whole) and the matching windows of the other sections
 */
export function filterMenuGroups(groups, query, translate) {
  const needle = normalizeLabel(query);
  if (!needle) return groups;
  return groups.flatMap((group) => {
    if (matchesAny([translate(group.group), group.group], needle)) return [group];
    const items = group.items.filter((item) => matchesAny([translate(item.label), item.label, item.name], needle));
    return items.length > 0 ? [{ ...group, items }] : [];
  });
}

function foldChar(char) {
  if (/\s/.test(char)) return ' ';
  return char.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Splits `text` into `{ text, match }` segments around every occurrence of `query`,
 * folded exactly as `filterMenuGroups` matches (case, accents, whitespace runs), while
 * keeping the original characters — so "Albarán" is highlighted whole for "albaran".
 */
export function splitSearchHighlight(text, query) {
  const value = String(text ?? '');
  const needle = normalizeLabel(query);
  if (!needle) return [{ text: value, match: false }];

  let folded = '';
  const origin = [];
  for (let index = 0; index < value.length; index += 1) {
    for (const char of foldChar(value[index])) {
      if (char === ' ' && folded.endsWith(' ')) continue;
      folded += char;
      origin.push(index);
    }
  }

  const segments = [];
  let cursor = 0;
  let found = folded.indexOf(needle);
  while (found !== -1) {
    const start = origin[found];
    const end = origin[found + needle.length - 1] + 1;
    if (start > cursor) segments.push({ text: value.slice(cursor, start), match: false });
    segments.push({ text: value.slice(start, end), match: true });
    cursor = end;
    found = folded.indexOf(needle, found + needle.length);
  }
  if (cursor < value.length) segments.push({ text: value.slice(cursor), match: false });
  return segments;
}
