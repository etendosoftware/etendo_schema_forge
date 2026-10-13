// Fiscal model registry — declarations-list binding (ETP-5716). Maps each model id of
// `modelRegistry.js` to its list behaviour (`models/<id>/listBehavior<id>.js`): the "Resultado"
// auto-compute function, the draft polling check and the result derivation.
//
// Kept apart from modelRegistry.js because these modules import fiscalModelsUtils.js, which
// itself imports the registry — binding them there would be an import cycle. Every registered
// model must have one — enforced by __tests__/modelRegistry.vitest.js.
import listBehavior303 from './models/303/listBehavior303.js';
import listBehavior349 from './models/349/listBehavior349.js';

const LIST_BEHAVIORS = Object.freeze({
  '303': listBehavior303,
  '349': listBehavior349,
});

/** The list behaviour of model `id`, or `undefined` for an unknown id. */
export function getListBehavior(id) {
  return Object.hasOwn(LIST_BEHAVIORS, id) ? LIST_BEHAVIORS[id] : undefined;
}
