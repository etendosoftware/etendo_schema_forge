import { useMemo } from 'react';
import menuConfig from '@/menu.json';
import { useCapabilitiesSafe, useWindowAccessSafe } from '@/hooks/useCapabilitiesSafe.js';
import {
  canCreateIn,
  filterByNavigationWindow,
  filterQuickActions,
  hasAnyWindowRead,
  isWidgetVisible,
  PENDING_TASK_WINDOWS,
  resolvePendingAmountsVisibility,
} from '@/lib/dashboardWidgetAccess.js';

/**
 * ETP-5088 — Bridges the raw `windowAccess` map (keyed by `AD_Window_ID`) to the window SLUGS the
 * widget declarations and the widget payloads speak in.
 *
 * `menu.json` already carries `name` (slug) -> `windowId` for every window, so no AD_Window_ID is
 * ever hardcoded: change the menu and the gating follows. Entries with no `windowId` (the
 * dashboard itself, custom pages) are skipped — they are not window-backed and nothing gates on
 * them.
 */
function buildWindowIdBySlug(menu) {
  const bySlug = {};
  for (const group of menu ?? []) {
    for (const item of group?.items ?? []) {
      if (item?.name && item?.windowId) bySlug[item.name] = String(item.windowId);
    }
  }
  return bySlug;
}

const WINDOW_ID_BY_SLUG = buildWindowIdBySlug(menuConfig?.menu);

/**
 * ETP-5088 — The dashboard's single gating entry point.
 *
 * Returns the resolved access for the current role plus the four gating helpers the page and the
 * data hook need. Everything derives from `windowAccess` (SFWindowAccessMap), which the app
 * already fetches at role-selection time — no extra request, and the viewer's role NAME is never
 * needed, so `SFListMenu` does not have to expose it.
 *
 * FAILS CLOSED by design (ETP-5088 decision 4): while `windowAccess` is still empty — first
 * render, a failed/unreachable SFWindowAccessMap, or a role with no grants at all — every gated
 * widget resolves hidden. A blank dashboard after a webhook outage was explicitly preferred over
 * showing a restricted role data it may not see; `DashboardPage` renders an explicit
 * "permissions unavailable" empty state for that case rather than a silently blank page.
 *
 * `isAdmin` (client-admin / System Administrator) bypasses every check, mirroring
 * SFWindowAccessMap's own tier-2 bypass.
 */
export function useDashboardWidgetAccess() {
  const windowAccess = useWindowAccessSafe();
  const capabilities = useCapabilitiesSafe();
  const isAdmin = capabilities?.isAdminOrClientAdmin === true;

  // Rebuilt on every render rather than memoized on `windowAccess`: the map's IDENTITY is not
  // guaranteed stable (a caller — or a test mock — returning a fresh object each render would
  // invalidate the memo every time), and the loop is ~40 property reads over a plain object.
  // Note it must stay a read-per-slug loop rather than an Object.entries() walk of
  // `windowAccess`: demo/mock mode supplies a Proxy that answers any `windowAccess[id]` lookup
  // without exposing own keys (`lib/mockFetch.js`), and enumerating it would yield nothing.
  const tierBySlug = {};
  for (const [slug, windowId] of Object.entries(WINDOW_ID_BY_SLUG)) {
    const tier = windowAccess?.[windowId];
    if (tier) tierBySlug[slug] = tier;
  }

  // Memoized on the map's VALUE, so the returned object stays referentially stable while the
  // grants do not change. `useDashboardData()` puts these helpers in a `useCallback` dependency
  // list that drives a fetch effect — a new identity per render would re-fetch forever.
  const accessKey = JSON.stringify(tierBySlug);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `tierBySlug` is intentionally keyed
  // by `accessKey` (its serialized value) instead of its identity; see the two comments above.
  return useMemo(() => ({
    tierBySlug,
    isAdmin,
    /** Whether the permissions map resolved at all — drives the empty state, not the gating. */
    resolved: isAdmin || Object.keys(tierBySlug).length > 0,
    isWidgetVisible: (widgetKey) => isWidgetVisible(tierBySlug, widgetKey, isAdmin),
    filterFeed: (items, options) => filterByNavigationWindow(items, tierBySlug, isAdmin, options),
    filterQuickActions: (actions) => filterQuickActions(actions, tierBySlug, isAdmin),
    pendingAmountsVisibility: resolvePendingAmountsVisibility(tierBySlug, isAdmin),
    /**
     * Container-level visibility for "Tareas pendientes": true when the role reaches at least one
     * window a task could point at, so an empty list still renders its normal "nothing pending"
     * state instead of vanishing.
     */
    pendingTasksVisible: hasAnyWindowRead(tierBySlug, PENDING_TASK_WINDOWS, isAdmin),
    /** Whether the role may create a record in `slug` — for creation buttons outside the quick
     *  actions list, e.g. the Financial summary card's empty state. */
    canCreateIn: (slug) => canCreateIn(tierBySlug, slug, isAdmin),
  }), [accessKey, isAdmin]);
}
