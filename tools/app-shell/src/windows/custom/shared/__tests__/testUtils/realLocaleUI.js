// Real-locale i18n test helpers (ETP-4945 breadcrumb regression coverage).
//
// A mocked `useUI: () => (key) => key` (the default across custom-window test
// files) is fine for structural tests, but it silently hides a real translation
// regression — e.g. a breadcrumb key that resolves to the wrong text, or a
// stale locale entry that never got updated when a menu label changed. ETP-4945
// fixed exactly that bug class across 6 Finance-section windows; these helpers
// let a test assert the EXACT string a real user sees, sourced from the real
// locale JSON files, without needing a full LocaleProvider/React tree.
//
// Usage in a test file (mirrors the pattern already used by
// windows/custom/calendar/__tests__/calendar-window-title.i18n.vitest.jsx and
// components/contract-ui/__tests__/ListView.importLabels.vitest.jsx — a plain
// top-level `const` referenced inside a `vi.mock(...)` factory in the SAME
// file is hoist-safe in this codebase's Vitest setup):
//
//   import { loadLocaleDictionary, makeRealUI } from '../../shared/__tests__/testUtils/realLocaleUI.js';
//   const esES = loadLocaleDictionary('es_ES');
//   const realUI = makeRealUI(esES);
//   vi.mock('@/i18n', () => ({ useUI: () => realUI }));
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// This file lives at windows/custom/shared/__tests__/testUtils/ — locales/ is
// 5 levels up, at tools/app-shell/src/locales/.
const LOCALES_DIR = join(__dirname, '..', '..', '..', '..', '..', 'locales');

const cache = new Map();

/**
 * Reads and parses a real locale JSON file (es_ES, en_US, es_AR, ...).
 * Cached per file so multiple test files sharing this helper in the same
 * Vitest worker don't re-read/re-parse the (large) locale files repeatedly.
 */
export function loadLocaleDictionary(locale) {
  if (!cache.has(locale)) {
    cache.set(locale, JSON.parse(readFileSync(join(LOCALES_DIR, `${locale}.json`), 'utf8')));
  }
  return cache.get(locale);
}

/**
 * Mirrors useUI()'s real resolution exactly (see
 * @etendosoftware/app-shell-core/src/i18n/useUI.js): resolves `genericLabels`,
 * falls back to the raw key, then substitutes any `{param}` placeholders.
 */
export function makeRealUI(dictionary) {
  return (key, params = {}) => {
    let text = dictionary?.genericLabels?.[key] ?? key;
    if (params && typeof params === 'object') {
      Object.keys(params).forEach((p) => {
        text = text.replace(`{${p}}`, params[p]);
      });
    }
    return text;
  };
}

/**
 * Mirrors useMenuLabel()'s real resolution chain exactly (see
 * @etendosoftware/app-shell-core/src/i18n/useMenuLabel.js):
 * ui -> menus -> windows -> tabs -> genericLabels -> raw key.
 */
export function makeRealTMenu(dictionary) {
  return (key, { field } = {}) => {
    if (field) {
      return dictionary?.windows?.[key]?.[field] ?? null;
    }
    return (
      dictionary?.ui?.[key]?.label ??
      dictionary?.menus?.[key]?.label ??
      dictionary?.windows?.[key]?.label ??
      dictionary?.tabs?.[key]?.label ??
      dictionary?.genericLabels?.[key] ??
      key
    );
  };
}
