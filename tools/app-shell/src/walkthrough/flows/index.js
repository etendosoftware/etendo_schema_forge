import createContact from './create-contact.json';
import createProduct from './create-product.json';
import createSalesOrder from './create-sales-order.json';

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
];
