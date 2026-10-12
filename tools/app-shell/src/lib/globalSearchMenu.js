/**
 * Menu matching for the global search (top-bar command palette).
 *
 * The palette lists the app's windows next to the record (vector) results. With a
 * query, only the windows the user is looking for may be listed: a window matches
 * by its own label (translated or original) or its route name, and a whole section
 * matches by its group label — typing "Configura" brings up every window of
 * "Configuración". Matching ignores case and accents, because Spanish is the primary
 * locale and users type "albaran" for "Albarán".
 *
 * Matches are ranked in tiers, because Enter opens the first one: windows whose
 * translated label matches, then the remaining windows of the sections whose label
 * matches, then windows that match only by their source label or route name (kept,
 * so English route names such as "contacts" still find the window). A window's own
 * name outranks its section's: "configu" opens "Configuración Fiscal", not the first
 * window of "Configuración". No window is listed twice. Within a tier, menu order holds.
 * When the same section ends one tier and starts the next, the two are merged so its
 * heading is not repeated back to back; a section that recurs further down stays apart.
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
 * @returns the groups to list: unchanged for an empty query, otherwise the matches
 *   ranked by tier. A section may appear once per tier (adjacent appearances merged),
 *   so each listed group carries the `tier` it starts in (1 translated label, 2 section
 *   label, 3 source label or route name); `${tier}:${group}` is unique.
 */
export function filterMenuGroups(groups, query, translate) {
  const needle = normalizeLabel(query);
  if (!needle) return groups;
  const translated = [];
  const sections = [];
  const others = [];
  for (const group of groups) {
    const byTranslation = group.items.filter((item) => matchesAny([translate(item.label)], needle));
    const rest = group.items.filter((item) => !byTranslation.includes(item));
    const sectionMatches = matchesAny([translate(group.group), group.group], needle);
    const bySource = sectionMatches ? [] : rest.filter((item) => matchesAny([item.label, item.name], needle));
    if (byTranslation.length > 0) translated.push({ ...group, items: byTranslation, tier: 1 });
    if (sectionMatches && rest.length > 0) sections.push({ ...group, items: rest, tier: 2 });
    if (bySource.length > 0) others.push({ ...group, items: bySource, tier: 3 });
  }
  return mergeAdjacentSections([...translated, ...sections, ...others]);
}

function mergeAdjacentSections(ranked) {
  const merged = [];
  for (const group of ranked) {
    const last = merged.at(-1);
    if (last?.group === group.group) merged[merged.length - 1] = { ...last, items: [...last.items, ...group.items] };
    else merged.push(group);
  }
  return merged;
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
