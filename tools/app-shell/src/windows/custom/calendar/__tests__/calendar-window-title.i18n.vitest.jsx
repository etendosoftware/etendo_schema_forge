/**
 * Regression test for a real bug (ETP-4478): the Calendar window's sidebar entry (menu.json's
 * `calendar` item, label "Calendar"/"Calendario") and its detail-page title/breadcrumb
 * disagreed — the sidebar showed the correct renamed label, but the page title still showed
 * "Calendario anual y periodos" (es_ES) / stale text.
 *
 * Root cause (confirmed by source-reading, not assumed): the generated `YearPage.jsx` (from
 * the `fiscal-calendar` spec) hardcodes `breadcrumb = 'Finance / Fiscal Calendar'` — the
 * underlying AD window's real (unrenamed) name. `DetailView.jsx`'s `getWindowTitle`/
 * `getFullBreadcrumb` resolve that last segment via `tMenu('Fiscal Calendar')`
 * (`useMenuLabel()`), which looks up `dictionary.menus['Fiscal Calendar'].label` first (then
 * `windows`, `tabs`, `genericLabels`) — a leftover pre-rename translation entry, entirely
 * independent of menu.json's own `calendar` entry (which the sidebar reads instead). This test
 * exercises the REAL locale JSON + the real getWindowTitle/getFullBreadcrumb helpers (not a
 * mocked tMenu) so a re-introduced stale translation would actually fail here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getWindowTitle, getFullBreadcrumb } from '@/components/contract-ui/DetailView.jsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, '..', '..', '..', '..', 'locales');
const esES = JSON.parse(readFileSync(join(localesDir, 'es_ES.json'), 'utf8'));
const enUS = JSON.parse(readFileSync(join(localesDir, 'en_US.json'), 'utf8'));
const esAR = JSON.parse(readFileSync(join(localesDir, 'es_AR.json'), 'utf8'));

// Mirrors useMenuLabel()'s real lookup order (ui -> menus -> windows -> tabs -> genericLabels
// -> raw key) against a real dictionary, without needing a full LocaleProvider/React tree.
function makeTMenu(dictionary) {
  return (key) =>
    dictionary?.ui?.[key]?.label ??
    dictionary?.menus?.[key]?.label ??
    dictionary?.windows?.[key]?.label ??
    dictionary?.tabs?.[key]?.label ??
    dictionary?.genericLabels?.[key] ??
    key;
}

// The generated artifacts/fiscal-calendar/generated/web/fiscal-calendar/YearPage.jsx's own
// hardcoded breadcrumb constant — kept in sync manually here since it's generator output.
const FISCAL_CALENDAR_BREADCRUMB = 'Finance / Fiscal Calendar';

describe.each([
  ['es_ES', esES, 'Calendario'],
  ['en_US', enUS, 'Calendar'],
  ['es_AR', esAR, 'Calendario'],
])('Calendar window title/breadcrumb (%s)', (_locale, dictionary, expectedLabel) => {
  const tMenu = makeTMenu(dictionary);

  it(`resolves the window title to "${expectedLabel}", not the stale pre-rename label`, () => {
    const title = getWindowTitle(FISCAL_CALENDAR_BREADCRUMB, tMenu, 'fiscal-calendar');
    expect(title).toBe(expectedLabel);
    expect(title).not.toContain('Calendario anual y periodos');
  });

  it(`resolves the full breadcrumb to end with "${expectedLabel}"`, () => {
    const breadcrumb = getFullBreadcrumb(FISCAL_CALENDAR_BREADCRUMB, tMenu, null, expectedLabel);
    expect(breadcrumb.endsWith(expectedLabel)).toBe(true);
    expect(breadcrumb).not.toContain('Calendario anual y periodos');
  });
});
