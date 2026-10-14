import createContact from './create-contact.json';
import createProduct from './create-product.json';
import createSalesOrder from './create-sales-order.json';
import accountingCalendar from './accounting-calendar.json';
import { isProductivePlan } from '@/pages/first-steps/firstStepsConfig.js';

/**
 * The guided walkthroughs shipped with this application, in the order they are
 * offered in the launcher.
 *
 * This order is also the PROGRESSION: when a tour finishes, its completion card
 * invites the user to continue with the next entry in this list (the last one
 * has no next). Contact -> Product -> Sales Order is deliberate — an order
 * needs a customer and something to sell, so a user who follows the list in
 * order always has the data the following tour asks for. Reordering this array
 * reorders both the launcher and the invitation; there is no separate graph.
 *
 * These are pure DATA: the engine that runs them lives in
 * `@etendosoftware/app-shell-core/walkthrough` and knows nothing about
 * contacts, products or orders. Adding a flow means dropping a JSON file next
 * to these, adding its locale keys to `en_US.json` AND `es_ES.json`, and
 * listing it here — no engine change, no new component.
 *
 * The JSON contract (step shape, advance modes, route/target resolution) is
 * documented in `docs/walkthrough-flows.md`.
 */
export const WALKTHROUGH_FLOWS = [
  createContact,
  createProduct,
  createSalesOrder,
  // ETP-5577: also launched from the "Revisar calendario contable" First Steps row.
  accountingCalendar,
];

/**
 * Tours a trial (demo) environment is not offered. A demo's periods are open for the whole trial,
 * so the calendar tour (opening periods, creating next year) would teach something it never needs.
 */
const PRODUCTIVE_ONLY_FLOW_IDS = Object.freeze(['accounting-calendar']);

/**
 * The tours offered to an environment on `plan`. An unknown plan counts as productive, the same
 * fail-open direction as the First Steps checklist (`isProductivePlan`).
 */
export function walkthroughFlowsForPlan(plan) {
  return isProductivePlan(plan) ? WALKTHROUGH_FLOWS
    : WALKTHROUGH_FLOWS.filter((flow) => !PRODUCTIVE_ONLY_FLOW_IDS.includes(flow.id));
}
