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
  'telematicFiling', 'syncDraftComputeToDetail', 'siiWarningOnActivate', 'singleOrdinaryPerYear',
];
// Optional hooks: a function, or `null` when the model has none (ETP-5716).
const NULLABLE_FUNCTION_FIELDS = ['monthlyDeadline', 'annualDeadline', 'newDeclWarning', 'selectableYears'];
const isFnOrNull = (v) => v === null || typeof v === 'function';
const KNOWN_PERIODICITIES = new Set(['monthly', 'quarterly', 'annual']);

describe('modelRegistry — entries', () => {
  const models = listModels();

  it('lists 303, 349 then 390, in that order (catalog, filters and modal keep it)', () => {
    expect(models.map(m => m.id)).toEqual(['303', '349', '390']);
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
    NULLABLE_FUNCTION_FIELDS.forEach(field => expect(isFnOrNull(m[field]), field).toBe(true));
    // A model filed monthly has a monthly rule; a model filed annually has an annual one.
    expect(typeof m.monthlyDeadline === 'function').toBe(m.periodicities.includes('monthly'));
    expect(typeof m.annualDeadline === 'function').toBe(m.periodicities.includes('annual'));
    expect([null, 'rectificative', 'substitutive']).toContain(m.duplicatePeriodType);
    if (m.monthlyDeadline) {
      for (let month = 1; month <= 12; month++) {
        const d = m.monthlyDeadline(2026, month);
        expect(d).toBeInstanceOf(Date);
        expect(Number.isNaN(d.getTime())).toBe(false);
      }
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
    ['303', '349'].forEach(id => expect(getModel(id)).toMatchObject({
      annualDeadline: null, siiWarningOnActivate: false, singleOrdinaryPerYear: false, newDeclWarning: null,
    }));
    expect(getModel('349').selectableYears).toBeNull();
    // ETP-5725: a never-saved draft on a presented period reads as rectificativa (303) /
    // sustitutiva (349); the 390 has no such fallback.
    expect(getModel('303').duplicatePeriodType).toBe('rectificative');
    expect(getModel('349').duplicatePeriodType).toBe('substitutive');
    expect(getModel('390').duplicatePeriodType).toBeNull();
    // ETP-5716: the 303 also offers 2025 (2025 303s to test the 390 2025 preload).
    expect(getModel('303').selectableYears()).toEqual([2026, 2025]);
  });

  // ETP-5716 — Modelo 390, the annual VAT summary.
  it('registers 390 as an annual, single-ordinary, telematically filed model with the SII activation warning', () => {
    expect(getModel('390')).toMatchObject({
      periodicities: ['annual'], defaultActive: false, locked: false, badgeVariant: '390',
      monthlyDeadline: null, iaeReminderOnActivate: false, iaeReminderOnYearEndPeriod: false,
      telematicFiling: true, syncDraftComputeToDetail: false,
      siiWarningOnActivate: true, singleOrdinaryPerYear: true,
    });
    // Filed from January 1 to January 30 of the following year.
    expect(getModel('390').annualDeadline(2026)).toEqual(new Date(2027, 0, 30));
    expect(getModel('390').annualDeadline('2026')).toEqual(new Date(2027, 0, 30));
  });

  it('offers the 390 for 2026 and the previous exercise 2025 in "Nueva declaración"', () => {
    expect(getModel('390').selectableYears()).toEqual([2026, 2025]);
  });

  it('warns on "Nueva declaración" of a 390 when 303s of the year are missing', () => {
    const warn = getModel('390').newDeclWarning;
    const quarterly = [
      { model: '303', year: 2026, period: 'T1' }, { model: '303', year: 2026, period: 'T2' },
      { model: '303', year: 2026, period: 'T3' }, { model: '303', year: 2025, period: 'T4' },
      { model: '349', year: 2026, period: 'T4' },
    ];
    expect(warn(quarterly, 2026)).toEqual({
      key: 'fm.m390.new_decl.missing_303_lead', bodyKey: 'fm.m390.new_decl.missing_303_body', params: { year: 2026, periods: 'T4' },
    });
    expect(warn([...quarterly, { model: '303', year: 2026, period: 'T4' }], 2026)).toBeNull();
    // A monthly filer: every month is expected, shown without the leading zero.
    const monthly = ['01', '02', '03', '04', '05', '06', '07', '08', '09'].map(p => ({ model: '303', year: 2026, period: p }));
    expect(warn(monthly, 2026).params.periods).toBe('10, 11, 12');
    expect(warn([], 2026).params.periods).toBe('T1, T2, T3, T4');
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
    expect(isKnownModel('390')).toBe(true);
    expect(isKnownModel(390)).toBe(false);
    expect(isKnownModel('111')).toBe(false);
    expect(isKnownModel(undefined)).toBe(false);
    expect(getModel('111')).toBeUndefined();
  });

  it('falls back to the default model for an unknown id', () => {
    expect(getModelOrDefault('349').id).toBe('349');
    expect(getModelOrDefault('390').id).toBe('390');
    expect(getModelOrDefault('111').id).toBe('303');
    expect(getModelOrDefault(undefined).id).toBe('303');
  });

  it('builds the model title i18n key from the id', () => {
    expect(modelTitleKey('303')).toBe('fm.config.m303.title');
    expect(modelTitleKey('349')).toBe('fm.config.m349.title');
    expect(modelTitleKey('390')).toBe('fm.config.m390.title');
  });
});

describe('modelRegistry — bindings', () => {
  it.each(listModels().map(m => [m.id]))('model %s has a list behaviour and a detail page (config section optional)', (id) => {
    const behavior = getListBehavior(id);
    expect(typeof behavior?.computeFn).toBe('function');
    expect(typeof behavior?.checkModifiedFn).toBe('function');
    expect(typeof behavior?.deriveListResult).toBe('function');
    expect(typeof getDetailPage(id)).toBe('function');
    const section = getConfigSection(id);
    expect(section === undefined || typeof section === 'function').toBe(true);
  });

  it('binds nothing for an unknown id (including inherited object keys)', () => {
    ['111', 'toString', '__proto__', undefined].forEach((id) => {
      expect(getListBehavior(id)).toBeUndefined();
      expect(getDetailPage(id)).toBeUndefined();
      expect(getConfigSection(id)).toBeUndefined();
    });
  });

  it('binds each model to its own detail page and config section', () => {
    expect(getDetailPage('303').name).toBe('FmModel303Page');
    expect(getDetailPage('349').name).toBe('FmModel349Page');
    expect(getDetailPage('390').name).toBe('FmModel390Page');
    expect(getConfigSection('303').name).toBe('ConfigSection303');
    expect(getConfigSection('349').name).toBe('ConfigSection349');
    // 390 has nothing to configure: no config section (ConfigDrawer shows "Declarante" only).
    expect(getConfigSection('390')).toBeUndefined();
  });

  // ETP-5725 (QA CP-19) — the 349 row reports the two AEAT header blocks SEPARATELY and never
  // their sum: `amount` is the total of operations (the regular operator rows, the same
  // reduction the detail KPI and the .349 file apply) and `rectifications` is the prior-period
  // corrections amount. This used to be a single `Σ|summary| + Σ|rectificativeSummary|`.
  it('derives the list result per model (303: box 71 of the boxes; 349: operations + rectifications, kept apart)', () => {
    const decl = { manualData: {} };
    const res303 = getListBehavior('303').deriveListResult(decl, {
      summary: { result: 500 }, boxes: { 27: 500 }, sources: [{ id: 'i1' }],
    });
    expect(res303.amount).toBe(500);
    // ETP-5725 real-world follow-up — `rectifications` now sums `correctedBase` (the restated
    // AEAT total) across corrective rows, not the backend's signed-delta `rectificativeSummary`
    // (still present on the payload for the Operadores tab's per-row display, just unread here).
    const res349 = getListBehavior('349').deriveListResult(decl, {
      operators: [
        { key: 'E', base: '10', rectificative: false },
        { key: 'S', base: '5', rectificative: false },
        { key: 'A', base: '-2.5', correctedBase: '2.5', rectificative: true },
      ],
      summary: { totalE: '10', totalS: '5' }, rectificativeSummary: { totalA: -2.5 },
    });
    expect(res349).toEqual({
      kind: 'info', amount: 15, rectifications: 2.5, rectificationOriginsLabel: '',
      hasRectifications: true,
    });
  });

  // ETP-5716 — 390: the annual result ([86], or [94] in territory mode), informative: only its sign
  // ("Resultado positivo / negativo"), never the 303's "A ingresar" / "A compensar/devolver".
  it('derives the 390 list result from summary.annualResult, falling back to the boxes', () => {
    const derive = getListBehavior('390').deriveListResult;
    const decl = { manualData: {} };
    expect(derive(decl, { summary: { accrued: '300.00', deductible: '100.00', annualResult: '200.00' }, boxes: {} }))
      .toEqual({ kind: 'positive', labelKey: 'fm.m390.result.positive', amount: 200 });
    expect(derive(decl, { summary: { accrued: '100.00', deductible: '150.00', annualResult: '-50.00' }, boxes: {} }))
      .toEqual({ kind: 'negative', labelKey: 'fm.m390.result.negative', amount: -50 });
    expect(derive(decl, { summary: {}, boxes: { 47: '10.00', 64: '10.00', 86: '0.00' }, mode: 'liquidation' }))
      .toEqual({ kind: 'zero', labelKey: 'fm.result.zero', amount: 0 });
    expect(derive(decl, { summary: {}, boxes: { 47: '50.00', 86: '1.00', 94: '25.00' }, mode: 'territory' }))
      .toEqual({ kind: 'positive', labelKey: 'fm.m390.result.positive', amount: 25 });
    expect(derive(decl, { summary: {}, boxes: {} })).toEqual({ kind: 'N', labelKey: 'fm.result.N', amount: 0 });
  });

  it('leaves the 303 and 349 list results on the shared kinds (no labelKey)', () => {
    const decl = { manualData: {} };
    expect(getListBehavior('303').deriveListResult(decl, {
      summary: { result: 500 }, boxes: { 27: 500 }, sources: [{ id: 'i1' }],
    })).not.toHaveProperty('labelKey');
    expect(getListBehavior('349').deriveListResult(decl, { summary: { totalE: '1' } })).not.toHaveProperty('labelKey');
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
