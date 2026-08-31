/**
 * ETP-5088 — Resolves which dashboard widgets (and which of their individual rows) a role may
 * see, derived from the `AD_Window_Access` grants the tenant already provisions rather than from
 * any new per-role widget configuration.
 *
 * The requirement is the widget x role matrix attached to ETP-5088. Every row of that matrix was
 * verified to be reproducible from the real grants, so nothing here hardcodes the 5 template role
 * names (Admin/Finance/Sales/Purchasing/Inventory): the same declarations keep working for
 * tenant-specific or future roles.
 *
 * Three shapes of requirement, one per row kind in the matrix:
 * - **Whole widget** (`WIDGET_REQUIREMENTS`) — hidden unless the role can reach every listed
 *   window. Used by the rows the matrix marks all-or-nothing.
 * - **Per item** (`filterByNavigationWindow`) — the widget stays, its rows are filtered by the
 *   window each row navigates to. Used by "Tareas pendientes" and "Actividad reciente", whose
 *   payload already carries a `navigation.window` slug per entry.
 * - **Per half** (`resolvePendingAmountsVisibility`) — "Cobros y pagos", where the matrix gives
 *   Sales the collect side only and Purchasing the pay side only.
 *
 * Quick actions are gated on the **write** tier, not mere visibility: the matrix denies Finance
 * "Nuevo pedido de venta" and Inventory "Nuevo contacto", and in both cases the role *does* hold
 * the window — as `read-only`. A presence-only check would wrongly show both.
 *
 * Kept dependency-free (no `@/` imports, no `menu.json`) so it can be covered by a plain
 * `node --test` unit test, mirroring the `capabilityVisibility.js` convention. Callers pass a
 * plain `{slug: tier}` map; `useDashboardWidgetAccess()` builds it from `windowAccess`.
 */

/** Access tiers as reported by SFWindowAccessMap, plus the absent case. */
const TIER_FULL = 'full';
const TIER_READ_ONLY = 'read-only';

/**
 * Window slugs this module gates on. Names match `menu.json`'s `name` field, which is what
 * `useDashboardWidgetAccess()` resolves to an `AD_Window_ID`, and what the widget payloads' own
 * `navigation.window` already carries — so no AD_Window_ID is ever written by hand here.
 */
export const SALES_INVOICE = 'sales-invoice';
export const PURCHASE_INVOICE = 'purchase-invoice';
export const CONTACTS = 'contacts';
export const PRODUCT = 'product';
export const SALES_ORDER = 'sales-order';
export const FINANCIAL_ACCOUNT = 'financial-account';

/**
 * Whole-widget requirements. A widget absent from this map is NOT gated (it renders), matching
 * `isCapabilityVisible`'s opt-in convention — gating is declared, never inferred.
 *
 * `kpis`/`trends` ("Resumen financiero"/"Evolución financiera") gate on the financial-account
 * window, NOT on invoices: the matrix gives them to Admin + Finance only, and invoices would let
 * Sales and Purchasing in. `capabilities.showAccountingFields` was considered and rejected — in
 * the real tenant only the client-admin role has `EM_ETGO_Show_Acct_Fields = 'Y'`, Finance has
 * `'N'`, so that axis cannot express this row.
 *
 * `bestProducts`/`bestSellers` gate on product, NOT on sales-invoice: the matrix grants them to
 * all five roles, including Purchasing and Inventory, which have no sales-invoice access.
 *
 * `topClients` gates on sales-invoice (where its data comes from), NOT on contacts: the matrix
 * excludes Purchasing, which does hold contacts.
 */
export const WIDGET_REQUIREMENTS = Object.freeze({
  kpis: [FINANCIAL_ACCOUNT],
  trends: [FINANCIAL_ACCOUNT],
  topClients: [SALES_INVOICE],
  recentInvoices: [SALES_INVOICE],
  bestProducts: [PRODUCT],
  bestSellers: [PRODUCT],
});

/** Widget keys whose data must not even be requested when the widget is hidden. */
export const GATED_WIDGET_KEYS = Object.freeze(Object.keys(WIDGET_REQUIREMENTS));

/**
 * Every window a "Tareas pendientes" entry can point at, per `WidgetPendingTasksHandler`:
 * overdue invoices and collections (sales-invoice), payments (purchase-invoice), receptions
 * (goods-receipt), deliveries (goods-shipment) and low-stock alerts (physical-inventory).
 *
 * Used to decide whether the CONTAINER renders at all. The distinction matters: an empty list
 * because the role reaches none of these windows must hide the card (ETP-5088 decision: no
 * orphan titles), while an empty list because there is genuinely nothing pending must keep the
 * card and show its normal empty state.
 */
export const PENDING_TASK_WINDOWS = Object.freeze([
  SALES_INVOICE,
  PURCHASE_INVOICE,
  'goods-receipt',
  'goods-shipment',
  'physical-inventory',
]);

/** True when at least one of `slugs` is readable — the container-level test. */
export function hasAnyWindowRead(tierBySlug, slugs, isAdmin = false) {
  if (isAdmin) return true;
  return (slugs ?? []).some((slug) => hasWindowRead(tierBySlug, slug));
}

/**
 * True when the role can OPEN the window (either tier). Fails closed: an unloaded map, a missing
 * slug, or an unrecognized tier value all resolve `false`.
 */
export function hasWindowRead(tierBySlug, slug) {
  const tier = tierBySlug?.[slug];
  return tier === TIER_FULL || tier === TIER_READ_ONLY;
}

/** True only when the role can WRITE in the window (`full`). Fails closed, same as above. */
export function hasWindowWrite(tierBySlug, slug) {
  return tierBySlug?.[slug] === TIER_FULL;
}

/**
 * Whole-widget visibility. `isAdmin` short-circuits to visible for a client-admin/System
 * Administrator caller, mirroring SFWindowAccessMap's own tier-2 bypass.
 *
 * @param {Record<string,string>|null|undefined} tierBySlug
 * @param {string} widgetKey - a key of `WIDGET_REQUIREMENTS`
 * @param {boolean} [isAdmin]
 */
export function isWidgetVisible(tierBySlug, widgetKey, isAdmin = false) {
  if (isAdmin) return true;
  const required = WIDGET_REQUIREMENTS[widgetKey];
  if (!required) return true; // not declared as gated → renders, opt-in convention
  return required.every((slug) => hasWindowRead(tierBySlug, slug));
}

/**
 * PER_ITEM filter for the feed-style widgets ("Tareas pendientes", "Actividad reciente"). Each
 * entry is kept only when its own `navigation.window` is a window the role can open.
 *
 * `dropUnresolved` decides what happens to an entry whose target cannot be resolved (no
 * `navigation`, empty `window`):
 * - `true` (default, fail closed) — the entry is dropped, since there is no way to prove the role
 *   may see the record behind it. A NEW, unmapped kind of entry disappears instead of leaking,
 *   which is the safe direction for a permission filter. Correct for `pending-tasks`, whose
 *   handler sets `window` on every task it builds.
 * - `false` (compatibility) — the entry is kept. Required only while a widget's handler does not
 *   yet emit `navigation` at all, where dropping would empty the widget for everyone rather than
 *   filter it. Every use of `false` is a temporary gap and must name the backend work that closes
 *   it.
 */
export function filterByNavigationWindow(items, tierBySlug, isAdmin = false, { dropUnresolved = true } = {}) {
  if (!Array.isArray(items)) return [];
  if (isAdmin) return items;
  return items.filter((item) => {
    const slug = String(item?.navigation?.window ?? '').trim();
    return slug ? hasWindowRead(tierBySlug, slug) : !dropUnresolved;
  });
}

/**
 * PER_HALF visibility for "Cobros y pagos": Sales sees only the collect side (sales-invoice),
 * Purchasing only the pay side (purchase-invoice), Finance/Admin both, Inventory neither — at
 * which point the caller hides the whole card.
 */
export function resolvePendingAmountsVisibility(tierBySlug, isAdmin = false) {
  const toCollect = isAdmin || hasWindowRead(tierBySlug, SALES_INVOICE);
  const toPay = isAdmin || hasWindowRead(tierBySlug, PURCHASE_INVOICE);
  return { toCollect, toPay, visible: toCollect || toPay };
}

/**
 * Quick-action filter. Each action declares the `window` slug it creates a record in; the action
 * is kept only when the role may WRITE there. An action that declares no window is kept (not a
 * record-creating action, nothing to gate on).
 */
export function filterQuickActions(actions, tierBySlug, isAdmin = false) {
  if (!Array.isArray(actions)) return [];
  if (isAdmin) return actions;
  return actions.filter((action) => {
    const slug = String(action?.window ?? '').trim();
    return slug ? hasWindowWrite(tierBySlug, slug) : true;
  });
}
