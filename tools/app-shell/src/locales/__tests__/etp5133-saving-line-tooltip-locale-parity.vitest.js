import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esES from '../es_ES.json';

/**
 * ETP-5133 — `savingLineTooltip` is the new `ui()` key backing the add-row
 * spinner's `aria-label` (previously a hardcoded "Saving line" string —
 * see DataTable.savingSpinnerAlignment.vitest.jsx for the component-level
 * regression guard). `useUI()` echoes the raw key when the active locale has
 * no entry, so a missing translation would surface as literal
 * "savingLineTooltip" text to a screen-reader user — CLAUDE.md's i18n policy
 * treats a hardcoded/missing string as a bug, not a style nit.
 *
 * `es_ES-structure.test.js` only checks parity for the `fields`/`windows`/
 * `tabs`/`menus` namespaces, not `genericLabels` (the namespace `useUI()`
 * reads from) — so a new genericLabels key is NOT auto-covered by that suite
 * and needs its own guard, following the existing per-key pattern
 * established by etp5034-record-unavailable-locale-parity.vitest.js.
 */
describe('ETP-5133 — savingLineTooltip locale parity', () => {
  it('is defined in en_US.json genericLabels', () => {
    expect(typeof enUS.genericLabels.savingLineTooltip).toBe('string');
    expect(enUS.genericLabels.savingLineTooltip.trim()).not.toBe('');
  });

  it('is defined in es_ES.json genericLabels', () => {
    expect(typeof esES.genericLabels.savingLineTooltip).toBe('string');
    expect(esES.genericLabels.savingLineTooltip.trim()).not.toBe('');
  });

  it('es_ES does not ship the English copy verbatim', () => {
    expect(esES.genericLabels.savingLineTooltip).not.toBe(enUS.genericLabels.savingLineTooltip);
  });

  it('matches the expected copy on both locales', () => {
    expect(enUS.genericLabels.savingLineTooltip).toBe('Saving line');
    expect(esES.genericLabels.savingLineTooltip).toBe('Guardando línea');
  });
});
