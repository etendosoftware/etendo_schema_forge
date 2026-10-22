// Fiscal period codes shared by every model of the window (ETP-5716).
//
// A LEAF module (plain `.js`, no imports) on purpose: the list, the "Nueva declaración" modal and
// the detail chrome all read it, and several fiscal-models test suites replace
// `fiscalModelsUtils.js` with a hand-written mock — a new export there would silently be
// `undefined` in those suites, so period helpers live here instead.
//
// Period codes, as stored on the declaration (`ETGO_Fiscal_Decl.period`) and sent to the
// `/fiscal<model>/*` endpoints:
//   'T1'..'T4'   quarter
//   '01'..'12'   month
//   '0A'         the whole fiscal year (annual models, e.g. the annual VAT summary). The backend
//                maps it to periods 1-12 (`AbstractFiscalHandler.ANNUAL_PERIOD`).

/** Period code of an annual declaration. */
export const ANNUAL_PERIOD = '0A';

/** True when `period` is the annual period code. */
export function isAnnualPeriod(period) {
  return period === ANNUAL_PERIOD;
}

/**
 * True when a registry entry is filed ONLY once a year (`periodicities` is exactly
 * `['annual']`): the "Nueva declaración" modal then asks for the year alone and creates the
 * declaration on `ANNUAL_PERIOD`.
 */
export function isAnnualOnlyModel(model) {
  const p = model?.periodicities;
  return Array.isArray(p) && p.length === 1 && p[0] === 'annual';
}
