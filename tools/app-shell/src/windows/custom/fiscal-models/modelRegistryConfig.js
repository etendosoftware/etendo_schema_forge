// Fiscal model registry — config drawer binding (ETP-5716). Maps each model id of
// `modelRegistry.js` to its own section of the config drawer (`models/<id>/ConfigSection<id>.jsx`).
//
// Kept apart from modelRegistry.js so that the registry stays a React-free leaf (it is loaded by
// fiscalModelsUtils.js and by plain `node --test` suites), and apart from the detail-page binding
// so that FmOverlays.jsx (ConfigDrawer) never imports a detail page — the detail pages import
// FmOverlays.jsx themselves.
//
// Section contract: `({ t, values, onChange })`, plus an optional static `initialValues` object
// for the inputs it controls (see ConfigSection303.jsx). The binding is OPTIONAL (ETP-5716): a
// model with nothing to configure (390) has none, and ConfigDrawer then shows only "Declarante".
// __tests__/modelRegistry.vitest.js checks that every binding present is a component.
import ConfigSection303 from './models/303/ConfigSection303.jsx';
import ConfigSection349 from './models/349/ConfigSection349.jsx';

const CONFIG_SECTIONS = Object.freeze({
  '303': ConfigSection303,
  '349': ConfigSection349,
});

/** The config-drawer section component of model `id`, or `undefined` for an unknown id. */
export function getConfigSection(id) {
  return Object.hasOwn(CONFIG_SECTIONS, id) ? CONFIG_SECTIONS[id] : undefined;
}
