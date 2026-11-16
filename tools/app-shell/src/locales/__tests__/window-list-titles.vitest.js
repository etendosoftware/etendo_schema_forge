// @covers tools/app-shell/src/locales/en_US.json
// @covers tools/app-shell/src/locales/es_ES.json
// @covers tools/app-shell/src/locales/es_AR.json
// @covers artifacts/document-sequence/decisions.json
/**
 * A window's list-page title must read the same as its sidebar menu entry.
 *
 * The generated list page passes the AD window name as `entityLabel` (`ListView` resolves it
 * with `tMenu(entityLabel)`), while the sidebar and breadcrumb use the Etendo GO menu name.
 * When the two translation keys drift, the same window shows two different names. Simple G/L
 * Journal read "Asientos Manuales Simplificados" on the list and "Asientos Manuales" in the
 * menu (ETP-5682). Add a row here for any window whose AD name differs from its menu name.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const load = (locale) => JSON.parse(readFileSync(join(__dirname, '..', `${locale}.json`), 'utf8'));

// Mirrors useMenuLabel()'s lookup order (ui -> menus -> windows -> tabs -> genericLabels).
function makeTMenu(dictionary) {
  return (key) =>
    dictionary?.ui?.[key]?.label ??
    dictionary?.menus?.[key]?.label ??
    dictionary?.windows?.[key]?.label ??
    dictionary?.tabs?.[key]?.label ??
    dictionary?.genericLabels?.[key] ??
    key;
}

// [AD window name (list entityLabel), menu key, expected label per locale]
const WINDOWS = [
  ['Simple G/L Journal', 'Manual Journals', { en_US: 'Manual Journals', es_ES: 'Asientos Manuales', es_AR: 'Asientos Manuales' }],
];

describe.each(['en_US', 'es_ES', 'es_AR'])('list titles match the menu (%s)', (locale) => {
  const dictionary = load(locale);
  const tMenu = makeTMenu(dictionary);

  it.each(WINDOWS)('%s reads the same as %s', (windowName, menuKey, expected) => {
    expect(tMenu(windowName)).toBe(expected[locale]);
    expect(tMenu(menuKey)).toBe(expected[locale]);
    expect(dictionary.windows?.[windowName]?.label).toBe(expected[locale]);
  });
});

/**
 * A list-only window whose rows are a fixed enum shows each row through its enum label key:
 * `decisions.json` -> `enumValues[].name` becomes the form option `label`, which the grid and the
 * record title resolve with `useUI()` (genericLabels). `useUI()` echoes the raw key when a locale
 * lacks it, so a missing entry shows `documentSequenceSalesQuotation` as literal row text.
 */
const ENUM_WINDOWS = [['document-sequence', 'sequence', 'name']];
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const enumLabelKeys = (window, entity, field) => {
  const decisions = JSON.parse(readFileSync(join(REPO_ROOT, 'artifacts', window, 'decisions.json'), 'utf8'));
  return (decisions.entities?.[entity]?.fields?.[field]?.enumValues ?? []).map((v) => v.name);
};

describe.each(['en_US', 'es_ES', 'es_AR'])('window enum labels are translated (%s)', (locale) => {
  const genericLabels = load(locale).genericLabels ?? {};

  it.each(ENUM_WINDOWS)('%s: every %s.%s enum label key is defined', (window, entity, field) => {
    const keys = enumLabelKeys(window, entity, field);
    expect(keys.length).toBeGreaterThan(0);
    const missing = keys.filter((key) => typeof genericLabels[key] !== 'string' || !genericLabels[key].trim());
    expect(missing).toEqual([]);
  });
});
