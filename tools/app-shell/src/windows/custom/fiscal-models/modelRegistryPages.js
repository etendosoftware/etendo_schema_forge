// Fiscal model registry — detail-page binding (ETP-5716). Maps each model id of
// `modelRegistry.js` to its detail page (`models/<id>/FmModel<id>Page.jsx`), rendered by
// FiscalModelsPage.jsx when a declaration of that model is opened.
//
// Only FiscalModelsPage.jsx imports this module: the detail pages import FmOverlays.jsx,
// fiscalModelsUtils.js and most of this window, so binding them from the leaf registry (or from
// any module those pages import back) would drag them in everywhere or close an import cycle.
//
// Page contract: `{ decl, onBack, token, apiBaseUrl, onStatusChange, onManualDataSaved }`, plus
// `onSubmittedRemotely` when the registry entry sets `telematicFiling`. Every registered model
// must have one — enforced by __tests__/modelRegistry.vitest.js.
import FmModel303Page from './models/303/FmModel303Page.jsx';
import FmModel349Page from './models/349/FmModel349Page.jsx';

const DETAIL_PAGES = Object.freeze({
  '303': FmModel303Page,
  '349': FmModel349Page,
});

/** The detail-page component of model `id`, or `undefined` for an unknown id. */
export function getDetailPage(id) {
  return Object.hasOwn(DETAIL_PAGES, id) ? DETAIL_PAGES[id] : undefined;
}
