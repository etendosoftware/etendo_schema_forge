// Fiscal model registry — the ONE list of the AEAT models this window knows (ETP-5716).
//
// Every surface that used to compare against a model id on its own ('303' / '349') reads the
// model's data from here instead: the catalog, the "Nueva declaración" modal, the config drawer,
// the declarations list (filter options, auto-compute buckets, "Resultado"), the detail-page
// switch and the AEAT deadline rule. Adding a model is "add an entry here + its own
// `models/<id>/` folder" — see "Model registry" in docs/generated-custom-windows/fiscal-models.md.
//
// This module is a LEAF on purpose: it imports nothing but pure per-model helpers (plain `.js`,
// no React, no `@/` alias), because `fiscalModelsUtils.js` imports it and is itself loaded by
// plain `node --test` suites. Model code that needs React or the network (detail pages, config
// sections, list compute functions) is bound in the sibling `modelRegistry*.js` binding modules,
// so importing the registry never drags a detail page (or a cycle back into the utils) along.
//
// Entry fields — keep this list to what a call site actually reads:
//   id                          AEAT model number, as a string. Also the declaration's `model`.
//   periodicities               Catalog pills (`fm.catalog.periodicity.<p>`).
//   defaultActive               Catalog toggle state when no saved catalog is passed in.
//   locked                      Catalog "Próximamente" card (no toggle, not counted as active).
//   badgeVariant                Catalog badge CSS modifier (`fm-catalog-card__badge--<v>`).
//   monthlyDeadline             (year, month) => Date — AEAT deadline of a MONTHLY period, or
//                               `null` for a model never filed monthly. Quarterly periods share
//                               one rule for every model (utils).
//   annualDeadline              (year) => Date — AEAT deadline of the ANNUAL period ('0A'), or
//                               `null` for a model never filed annually.
//   iaeReminderOnActivate       Show the IAE-activity reminder when the catalog activates it.
//   iaeReminderOnYearEndPeriod  Show it when "Nueva declaración" selects T4 / 12 for it.
//   telematicFiling             The detail page can file to the AEAT telematically
//                               (receives `onSubmittedRemotely`).
//   syncDraftComputeToDetail    The list pushes this model's draft auto-compute results into
//                               an open detail page (`onComputeUpdate`).
//   siiWarningOnActivate        The catalog asks for confirmation before activating it when the
//                               organization is in the SII (entities in the SII are exempt).
//   singleOrdinaryPerYear       Only one ordinary declaration per exercise (the backend answers a
//                               second one with 409 DUPLICATE_ORDINARY); the modal pre-checks it.
//   newDeclWarning              (existingDecls, year) => { key, params } | null — non-blocking
//                               notice of "Nueva declaración" for this model, or `null` (no hook).
//   selectableYears             () => number[] — the exercises "Nueva declaración" offers for this
//                               model, or `null` to use the shared `SELECTABLE_YEARS` (fm303Layouts).
import { monthlyDeadline303 } from './models/303/deadline303.js';
import { monthlyDeadline349 } from './models/349/deadline349.js';
import { annualDeadline390 } from './models/390/deadline390.js';
import { newDeclWarning390 } from './models/390/newDeclWarning390.js';
import { selectableYears390 } from './models/390/selectableYears390.js';

const MODELS = Object.freeze([
  Object.freeze({
    id: '303',
    periodicities: Object.freeze(['monthly', 'quarterly']),
    defaultActive: true,
    locked: false,
    badgeVariant: '303',
    monthlyDeadline: monthlyDeadline303,
    annualDeadline: null,
    iaeReminderOnActivate: true,
    iaeReminderOnYearEndPeriod: true,
    telematicFiling: true,
    syncDraftComputeToDetail: false,
    siiWarningOnActivate: false,
    singleOrdinaryPerYear: false,
    newDeclWarning: null,
    selectableYears: null,
  }),
  Object.freeze({
    id: '349',
    periodicities: Object.freeze(['monthly', 'quarterly']),
    defaultActive: true,
    locked: false,
    badgeVariant: '349',
    monthlyDeadline: monthlyDeadline349,
    annualDeadline: null,
    iaeReminderOnActivate: false,
    iaeReminderOnYearEndPeriod: false,
    telematicFiling: false,
    syncDraftComputeToDetail: true,
    siiWarningOnActivate: false,
    singleOrdinaryPerYear: false,
    newDeclWarning: null,
    selectableYears: null,
  }),
  // Annual VAT summary. Not active by default (an opt-in model: SII entities are exempt). Filed
  // telematically (`POST /fiscal390/submit`) or registered as presented elsewhere.
  Object.freeze({
    id: '390',
    periodicities: Object.freeze(['annual']),
    defaultActive: false,
    locked: false,
    badgeVariant: '390',
    monthlyDeadline: null,
    annualDeadline: annualDeadline390,
    iaeReminderOnActivate: false,
    iaeReminderOnYearEndPeriod: false,
    telematicFiling: true,
    syncDraftComputeToDetail: false,
    siiWarningOnActivate: true,
    singleOrdinaryPerYear: true,
    newDeclWarning: newDeclWarning390,
    selectableYears: selectableYears390,
  }),
]);

const BY_ID = new Map(MODELS.map(m => [m.id, m]));

/** The model a surface falls back to when none is chosen (first catalog entry). */
export const DEFAULT_MODEL_ID = MODELS[0].id;

/** Every registered model, in display order (catalog, filters, modal). */
export function listModels() {
  return MODELS;
}

// Lookups are strict (no String() coercion), exactly like the `decl.model === '303'` comparisons
// they replace: a numeric 303 is not a known model id.

/** The registry entry for `id`, or `undefined` for an unknown id. */
export function getModel(id) {
  return BY_ID.get(id);
}

/** True when `id` is a registered model. */
export function isKnownModel(id) {
  return BY_ID.has(id);
}

/**
 * The registry entry for `id`, or the default model's entry for an unknown id. Keeps the
 * pre-registry fallback of the call sites that treated "anything that is not 349" as 303
 * (the monthly deadline rule and the list's computed-map lookup).
 */
export function getModelOrDefault(id) {
  return getModel(id) ?? BY_ID.get(DEFAULT_MODEL_ID);
}

/** i18n key of a model's title ("Modelo 303" / "Form 303"), for any id. */
export function modelTitleKey(id) {
  return `fm.config.m${id}.title`;
}
