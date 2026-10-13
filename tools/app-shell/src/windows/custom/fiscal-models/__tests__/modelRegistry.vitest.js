// @covers tools/app-shell/src/windows/custom/fiscal-models/modelRegistry.js
// @covers tools/app-shell/src/windows/custom/fiscal-models/modelRegistryList.js
// @covers tools/app-shell/src/windows/custom/fiscal-models/modelRegistryPages.js
// @covers tools/app-shell/src/windows/custom/fiscal-models/modelRegistryConfig.js
//
// Contract of the fiscal model registry: every registered model carries every field the window
// reads, with the right type, and has its list behaviour, detail page and config section bound.
// Plus a guardrail: the shared files of this window never spell a model id again — model
// specifics live in the registry and in `models/<id>/`.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listModels, getModel, isKnownModel, getModelOrDefault, modelTitleKey, DEFAULT_MODEL_ID,
} from '../modelRegistry.js';
import { getListBehavior } from '../modelRegistryList.js';
import { getDetailPage } from '../modelRegistryPages.js';
import { getConfigSection } from '../modelRegistryConfig.js';

const BOOLEAN_FIELDS = [
  'defaultActive', 'locked', 'iaeReminderOnActivate', 'iaeReminderOnYearEndPeriod',
  'telematicFiling', 'syncDraftComputeToDetail',
];
const KNOWN_PERIODICITIES = new Set(['monthly', 'quarterly', 'annual']);

describe('modelRegistry — entries', () => {
  const models = listModels();

  it('lists 303 then 349, in that order (catalog, filters and modal keep it)', () => {
    expect(models.map(m => m.id)).toEqual(['303', '349']);
  });

  it('has unique, 3-digit string ids', () => {
    const ids = models.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach(id => expect(id).toMatch(/^\d{3}$/));
  });

  it.each(listModels().map(m => [m.id, m]))('model %s carries every field with the right type', (_id, m) => {
    BOOLEAN_FIELDS.forEach(field => expect(typeof m[field], field).toBe('boolean'));
    expect(typeof m.badgeVariant).toBe('string');
    expect(m.badgeVariant.length).toBeGreaterThan(0);
    expect(Array.isArray(m.periodicities)).toBe(true);
    expect(m.periodicities.length).toBeGreaterThan(0);
    m.periodicities.forEach(p => expect(KNOWN_PERIODICITIES.has(p), p).toBe(true));
    expect(typeof m.monthlyDeadline).toBe('function');
    for (let month = 1; month <= 12; month++) {
      const d = m.monthlyDeadline(2026, month);
      expect(d).toBeInstanceOf(Date);
      expect(Number.isNaN(d.getTime())).toBe(false);
    }
  });

  it('is frozen, so no surface can mutate the shared entries', () => {
    expect(Object.isFrozen(models)).toBe(true);
    models.forEach(m => expect(Object.isFrozen(m)).toBe(true));
  });

  it('keeps the pre-registry per-model values', () => {
    expect(getModel('303')).toMatchObject({
      periodicities: ['monthly', 'quarterly'], defaultActive: true, locked: false, badgeVariant: '303',
      iaeReminderOnActivate: true, iaeReminderOnYearEndPeriod: true,
      telematicFiling: true, syncDraftComputeToDetail: false,
    });
    expect(getModel('349')).toMatchObject({
      periodicities: ['monthly', 'quarterly'], defaultActive: true, locked: false, badgeVariant: '349',
      iaeReminderOnActivate: false, iaeReminderOnYearEndPeriod: false,
      telematicFiling: false, syncDraftComputeToDetail: true,
    });
  });

  it('binds each model to its own monthly AEAT deadline rule', () => {
    // 303: day 30 of the next month, January extended to the last day of February.
    expect(getModel('303').monthlyDeadline(2024, 1)).toEqual(new Date(2024, 1, 29));
    expect(getModel('303').monthlyDeadline(2026, 7)).toEqual(new Date(2026, 7, 30));
    expect(getModel('303').monthlyDeadline(2026, 12)).toEqual(new Date(2027, 0, 30));
    // 349: day 20 of the next month, July consolidated with August (September 20).
    expect(getModel('349').monthlyDeadline(2026, 7)).toEqual(new Date(2026, 8, 20));
    expect(getModel('349').monthlyDeadline(2026, 1)).toEqual(new Date(2026, 1, 20));
    expect(getModel('349').monthlyDeadline(2026, 12)).toEqual(new Date(2027, 0, 20));
  });
});

describe('modelRegistry — accessors', () => {
  it('defaults to 303, the first registered model', () => {
    expect(DEFAULT_MODEL_ID).toBe('303');
    expect(listModels()[0].id).toBe(DEFAULT_MODEL_ID);
  });

  it('looks ids up strictly, like the comparisons it replaced', () => {
    expect(isKnownModel('303')).toBe(true);
    expect(isKnownModel('349')).toBe(true);
    expect(isKnownModel(303)).toBe(false);
    expect(isKnownModel('390')).toBe(false);
    expect(isKnownModel(undefined)).toBe(false);
    expect(getModel('390')).toBeUndefined();
  });

  it('falls back to the default model for an unknown id', () => {
    expect(getModelOrDefault('349').id).toBe('349');
    expect(getModelOrDefault('390').id).toBe('303');
    expect(getModelOrDefault(undefined).id).toBe('303');
  });

  it('builds the model title i18n key from the id', () => {
    expect(modelTitleKey('303')).toBe('fm.config.m303.title');
    expect(modelTitleKey('349')).toBe('fm.config.m349.title');
  });
});

describe('modelRegistry — bindings', () => {
  it.each(listModels().map(m => [m.id]))('model %s has a list behaviour, a detail page and a config section', (id) => {
    const behavior = getListBehavior(id);
    expect(typeof behavior?.computeFn).toBe('function');
    expect(typeof behavior?.checkModifiedFn).toBe('function');
    expect(typeof behavior?.deriveListResult).toBe('function');
    expect(typeof getDetailPage(id)).toBe('function');
    expect(typeof getConfigSection(id)).toBe('function');
  });

  it('binds nothing for an unknown id (including inherited object keys)', () => {
    ['390', 'toString', '__proto__', undefined].forEach((id) => {
      expect(getListBehavior(id)).toBeUndefined();
      expect(getDetailPage(id)).toBeUndefined();
      expect(getConfigSection(id)).toBeUndefined();
    });
  });

  it('binds each model to its own detail page and config section', () => {
    expect(getDetailPage('303').name).toBe('FmModel303Page');
    expect(getDetailPage('349').name).toBe('FmModel349Page');
    expect(getConfigSection('303').name).toBe('ConfigSection303');
    expect(getConfigSection('349').name).toBe('ConfigSection349');
  });

  it('derives the list result per model (303: box 71 of the boxes; 349: abs-summed key totals)', () => {
    const decl = { manualData: {} };
    const res303 = getListBehavior('303').deriveListResult(decl, {
      summary: { result: 500 }, boxes: { 27: 500 }, sources: [{ id: 'i1' }],
    });
    expect(res303.amount).toBe(500);
    const res349 = getListBehavior('349').deriveListResult(decl, {
      summary: { totalE: '10', totalS: -5 }, rectificativeSummary: { totalA: -2.5 },
    });
    expect(res349).toEqual({ kind: 'info', amount: 17.5 });
  });
});

// ── Guardrail: no model id spelled in the window's shared files ─────────────
// Model specifics live in the registry family (`modelRegistry*.js`) and in `models/<id>/` —
// never as a `'303'` / `'349'` (or any other 3-digit model id) literal in a shared file, which is
// how the window ended up with ~25 independent comparisons before ETP-5716. Comments are ignored.
const FM_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

// Files allowed to spell a model id, each with its reason.
const ALLOWLIST = {
  // The registry family: the one place a model id is written down.
  'modelRegistry.js': 'the registry itself',
  'modelRegistryList.js': 'list behaviour binding, keyed by model id',
  'modelRegistryPages.js': 'detail page binding, keyed by model id',
  'modelRegistryConfig.js': 'config section binding, keyed by model id',
  // Developer-only panel behind the debug flag: fixture declarations (`model: '303'`) and badge
  // colours for the mock views it navigates to. Never rendered for users, no model behaviour.
  'FmDebugPanel.jsx': 'debug-mode fixtures',
};

const MODEL_ID_LITERAL = /(['"`])\d{3}\1/;

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, '')) // keep line numbers
    .split('\n')
    .map(line => (/^\s*\/\//.test(line) ? '' : line.replace(/\s\/\/\s.*$/, '')))
    .join('\n');
}

describe('fiscal-models shared files — model id guardrail', () => {
  const sharedFiles = readdirSync(FM_DIR).filter(f => /\.(js|jsx)$/.test(f));

  it('scans the shared files of the window', () => {
    expect(sharedFiles).toEqual(expect.arrayContaining([
      'FiscalModelsPage.jsx', 'FmListPage.jsx', 'FmOverlays.jsx', 'FmCatalogPage.jsx', 'fiscalModelsUtils.js',
    ]));
  });

  it('allowlists only files that exist', () => {
    Object.keys(ALLOWLIST).forEach(f => expect(existsSync(join(FM_DIR, f)), f).toBe(true));
  });

  it.each(sharedFiles.filter(f => !Object.hasOwn(ALLOWLIST, f)).map(f => [f]))(
    '%s spells no model id literal (use modelRegistry.js / models/<id>/)',
    (file) => {
      const offending = stripComments(readFileSync(join(FM_DIR, file), 'utf8'))
        .split('\n')
        .map((line, i) => ({ line: i + 1, text: line.trim() }))
        .filter(({ text }) => MODEL_ID_LITERAL.test(text));
      expect(offending).toEqual([]);
    },
  );
});
