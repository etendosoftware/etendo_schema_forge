// @covers tools/app-shell/src/locales/en_US.json
// @covers tools/app-shell/src/locales/es_ES.json
// @covers tools/app-shell/src/locales/es_AR.json
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
