import { useState, useEffect, useCallback } from 'react';
import { Settings, TrendingUp, FileText, Landmark, Package } from 'lucide-react';
import { fetchRolesOverview } from '@/lib/rolesApi.js';
import menuConfig from '../../menu.json' with { type: 'json' };

/**
 * ETP-4907 — data module for the redesigned "Configuración > Roles" overview
 * screen (5 summary cards + a category-grouped window x role access matrix).
 *
 * **Follow-up update:** the backend developer independently found (in
 * parallel with this frontend work) that no new endpoint was needed —
 * `SFRolesOverview.java` (ETP-4513, `GET /sws/neo/rolesoverview`) was the
 * right place, and was extended in place with `windowCount`/`matrix`/
 * `roleSource` (see `com.etendoerp.go`'s `feature/ETP-4907`, commit
 * `c3424a58`, not yet pushed). This module now calls the REAL
 * `fetchRolesOverview()` from `lib/rolesApi.js` (unchanged since ETP-4513 —
 * NEO bearer token, `{result: "<json-string>"}` unwrapping, non-JSON-response
 * guard) instead of returning isolated mock data. All mock fixtures moved
 * into this feature's own test files; `make dev-mock`'s fallback lives in
 * `lib/mockFetch.js`'s `handleRolesOverviewRequest()` (updated alongside this
 * module — the pre-existing convention for backend-less dev/E2E, not a
 * second ad-hoc mock).
 *
 * **Real response shape** (confirmed live against the backend):
 * ```json
 * {
 *   "roles": [
 *     { "id": "...", "name": "...", "rawDescription": "...", "isClientAdmin": bool,
 *       "roleSource": "tenant"|"systemTemplate", "userCount": n, "windowCount": n,
 *       "windows": [{ "id": "...", "name": "...", "tier": "full"|"read-only" }] }
 *   ],
 *   "matrix": { "categories": [
 *     { "name": "...", "windows": [
 *       { "id": "...", "name": "...", "access": { "<roleId>": "full"|"read-only"|"none" } }
 *     ]}
 *   ]}
 * }
 * ```
 * `adaptCards`/`adaptMatrix` below translate this into the shape this page's
 * components consume: `cards: [{id, name, isClientAdmin, roleSource,
 * windowCount, userCount}]`, `matrix: [{category, rows: [{windowId,
 * windowName, access: {[roleId]: 'full'|'readOnly'|'none'}}]}]`.
 *
 * **ETP-5402 — `reports`/`reportCount`/`reportsMatrix` (Informes subsection).**
 * A PARALLEL set of fields alongside `windows`/`windowCount`/`matrix` (never
 * merged into them — see `SFRolesOverview.java`'s own Informes design note):
 * `roles[].reports` (same `{id, name, tier}` shape as `windows[]`) and
 * `reportsMatrix.categories[].reports[]` (same shape as `matrix.categories[]
 * .windows[]`, just nested under a `reports` key instead of `windows`).
 * `adaptReportsMatrix` below reuses `adaptMatrix`'s exact bucketing/sorting
 * machinery (`bucketRowsByResolvedCategory` now takes an `itemsKey` so it can
 * read either `category.windows` or `category.reports`) — the row shape
 * itself (`{windowId, windowName, access}`, field names kept AS-IS even for a
 * report row, see `resolveMatrixRow`) needs no change at all, since a report
 * row and a window row already carry the exact same `{id, name, access}`
 * wire shape.
 *
 * **Tier normalization (picked once, here — not left floating as two
 * spellings across the codebase):** the backend uses hyphenated
 * `'read-only'` (matching `roles[].windows[].tier`'s pre-existing ETP-4513
 * convention). This module normalizes to camelCase `'readOnly'` in
 * `normalizeTier()` before anything reaches `AccessTierPill`/
 * `RolesAccessMatrix` — both of those were built fresh for ETP-4907 and were
 * never given a hyphenated-string contract, so the normalization happens
 * exactly once, at the adapter boundary, rather than teaching every
 * downstream consumer both spellings.
 *
 * **Role identity vs. matrix `access` keys:** `matrix.categories[].windows[].access`
 * is keyed by the SAME `id` values as `roles[].id` (real per-tenant strings,
 * not stable across tenants) — so cards keep their real `id` as React
 * key/lookup key. Icon and display-order assignment, which DO need a stable
 * identifier, go through `resolveRoleKind()` instead (isClientAdmin flag for
 * Admin — confirmed name-independent — else the fixed English `AD_Role.name`
 * for the 4 template roles, regardless of `roleSource`).
 */
export const ROLE_ORDER = ['admin', 'sales', 'purchasing', 'finance', 'inventory'];

/**
 * Role icon per role "kind" (see `resolveRoleKind`), used by both the summary
 * cards and the matrix's column headers. `sales`/`purchasing`/`finance`/
 * `inventory` intentionally reuse the exact same 4 lucide icons
 * (`TrendingUp`/`FileText`/`Landmark`/`Package`) chosen on the sibling
 * `feature/ETP-4906` branch for the User window's own role-preview matrix
 * (`UserRolesTab.jsx`'s `ROLE_ICONS`) — kept consistent across both screens
 * even though that branch isn't merged here yet. `admin` (`Settings`) is new
 * — `UserRolesTab.jsx`'s matrix now has an admin column too (ETP-5196),
 * gated by `isClientAdmin` there rather than by a name key in its own
 * `ROLE_ICONS` map, since that map is keyed by the 4 fixed template names.
 */
export const ROLE_ICONS = {
  admin: Settings,
  sales: TrendingUp,
  purchasing: FileText,
  finance: Landmark,
  inventory: Package,
};

const FIXED_ROLE_KIND_BY_NAME = {
  Finance: 'finance',
  Sales: 'sales',
  Purchasing: 'purchasing',
  Inventory: 'inventory',
};

/**
 * Resolves a role's stable display "kind" (`admin`/`sales`/`purchasing`/
 * `finance`/`inventory`), used to look up its icon and display order.
 * `isClientAdmin: true` marks Admin regardless of the role's literal name
 * (confirmed name-independent by the backend developer). The 4 template
 * roles are matched by their fixed English `AD_Role.name`
 * (`Finance`/`Sales`/`Purchasing`/`Inventory`) regardless of `roleSource`
 * (`'tenant'` vs `'systemTemplate'` — see this module's file-level JSDoc on
 * the ETP-4852 bug this masks). Returns `null` for anything unrecognized
 * rather than guessing.
 */
export function resolveRoleKind(role) {
  if (role?.isClientAdmin) return 'admin';
  return FIXED_ROLE_KIND_BY_NAME[role?.name] ?? null;
}

const ROLE_ORDER_INDEX = new Map(ROLE_ORDER.map((kind, index) => [kind, index]));

/**
 * Sorts role cards into the canonical ETP-4907 display order (Admin, Sales,
 * Purchasing, Finance, Inventory — see `ROLE_ORDER`). The backend does NOT
 * guarantee this order (its own fixed-name order is Finance/Sales/
 * Purchasing/Inventory) — this always re-sorts client-side rather than
 * trusting API order. Unrecognized kinds sort last, by id, rather than being
 * dropped.
 */
export function sortByRoleOrder(cards) {
  return [...cards].sort((a, b) => {
    const ka = resolveRoleKind(a);
    const kb = resolveRoleKind(b);
    const ia = ROLE_ORDER_INDEX.has(ka) ? ROLE_ORDER_INDEX.get(ka) : ROLE_ORDER.length;
    const ib = ROLE_ORDER_INDEX.has(kb) ? ROLE_ORDER_INDEX.get(kb) : ROLE_ORDER.length;
    if (ia !== ib) return ia - ib;
    return String(a.id).localeCompare(String(b.id));
  });
}

/** Normalizes a raw backend tier string to this app's internal tri-state contract. Anything other than the two known backend values (including `'none'` itself, `null`, or an unrecognized string) collapses to `'none'`. */
export function normalizeTier(rawTier) {
  if (rawTier === 'full') return 'full';
  if (rawTier === 'read-only') return 'readOnly';
  return 'none';
}

/**
 * Composite row key for a matrix row: `${category}::${windowId}`, NOT
 * `${category}::${windowName}` and NOT `windowId` alone. Using the backend's
 * real per-window `id` (unique within a category, per the confirmed
 * contract) rather than its translatable `name` sidesteps the
 * duplicate-window-NAME edge case entirely (e.g. "Contactos" appearing in
 * both `Comercial` and `Inventario`) — the backend already disambiguates
 * those as two separate entries with their own `id`, one per category.
 */
export function buildRowKey(category, windowId) {
  return `${category}::${windowId}`;
}

/** Flattens the category-grouped matrix into a single array of rows, each carrying its own composite `key` (see `buildRowKey`) alongside `category`/`windowId`/`windowName`/`access`. Convenience for tests and any consumer that doesn't need the category grouping. */
export function flattenMatrixRows(matrix) {
  const rows = [];
  for (const group of matrix ?? []) {
    for (const row of group.rows ?? []) {
      rows.push({ ...row, category: group.category, key: buildRowKey(group.category, row.windowId) });
    }
  }
  return rows;
}

/** Adapts the backend's `roles[]` into this page's card shape. */
function adaptCards(roles) {
  return (roles ?? []).map((role) => ({
    id: role.id,
    name: role.name,
    isClientAdmin: !!role.isClientAdmin,
    roleSource: role.roleSource,
    windowCount: role.windowCount ?? 0,
    userCount: role.userCount ?? 0,
  }));
}

/**
 * ETP-5071 — `windowId -> { group, label, groupOrder }` index built from `menu.json`,
 * this app's real source of truth for category/window display (imported the same way
 * `windows/registry.js` does). The backend's `matrix.categories[]` sources its category
 * names and window labels from the classic AD menu tree instead (`SFRolesOverview.java`,
 * out of scope here) — e.g. "Product" shows under "Master Data Management" instead of
 * "Inventory". `adaptMatrix` below re-resolves both against this index.
 *
 * Flattens every `menu[].items[]` entry that carries an identity id. Same convention as
 * `windows/registry.js`'s `filterMenuGroupsByAccess()` (its own `itemIds` helper treats
 * `windowId`/`processId`/`obuiappProcessId` as equivalent/interchangeable identity keys
 * for menu-filtering) — here each item's identity resolves as `item.windowId ??
 * item.obuiappProcessId ?? item.processId` (first non-null wins; no item sets more than
 * one of these today, so precedence between them doesn't actually arise in practice, but
 * it's written defensively). This is what lets ETP-5071's 3 windowless-but-proxied menu
 * items (`fiscal-monitor`/`fiscal-models` via `windowId`, `not-posted-documents` via
 * `obuiappProcessId`) resolve through this same index like any real window.
 *
 * `groupOrder` is the index of that entry's `menu[]` group in menu.json's OWN declaration
 * order — ETP-5071's product decision is to sort categories by that declaration order,
 * not alphabetically. `itemOrder` (ETP-5071 follow-up) is that same entry's index WITHIN
 * `group.items` — `menu.json`'s `items[]` array is already in the exact order the real
 * sidebar renders them, confirmed live against the Finance group's own order, so
 * `adaptMatrix` below sorts each category's ROWS by `itemOrder` too, not just the
 * categories themselves by `groupOrder` — the backend's `matrix.categories[].windows[]`
 * order is its own alphabetical-by-raw-classic-`AD_Window.name` sort
 * (`SFRolesOverview.java`, out of scope), unrelated to the sidebar's order.
 *
 * Precedence for an id shared by 2+ items (confirmed live, today always a same-group
 * visible/hidden pair — `"123"` People: `contacts`/`business-partner`, `"117"` Finance:
 * `calendar`/`fiscal-calendar` — never cross-group, though this does not assume that can
 * never happen): prefer the entry WITHOUT `hidden: true`; if every entry for that id is
 * hidden (or the first-seen entry already isn't), keep the first one encountered.
 * `itemOrder` travels with whichever candidate wins, same as `group`/`label`. The winning
 * candidate's own `hidden` flag is therefore `true` only when EVERY menu.json entry for
 * that id is hidden (no visible alternative exists) — `adaptMatrix` uses exactly that
 * signal to drop sidebar-hidden windows from the matrix (see ETP-5071 below).
 *
 * **Second consumer (ETP-5196):** `windows/custom/user/UserRolesTab.jsx` now imports this
 * function directly (not re-implemented) to resolve its own per-window category/label/order,
 * so the User window's "Roles del usuario" tab groups windows identically to this page's
 * `RolesAccessMatrix` — see that file's `resolveCategoryRow` JSDoc for its own fallback
 * chain (AD-menu-tree walk, then an "Other" bucket) for a window this index doesn't cover.
 *
 * **ETP-5402 — `item.reportId` (4th identity key).** A report row's backend id (`tax-report`,
 * `balance-sheet`, ...) lives in an entirely different id-space than `windowId`/
 * `obuiappProcessId`/`processId` — it is the stable Informes row id, not the classic AD
 * anchor (window/process) id that access is actually resolved against server-side. Using an
 * anchor id as the join key here would collide for the 5 financial-family report rows, which
 * all share the SAME `AD_Window_ID` ("Informes financieros" pseudo-window) as their access
 * anchor but must resolve to 5 DISTINCT category/label rows — a `windowId`-keyed index can
 * only ever hold one candidate per key. `reportId` sidesteps this entirely: it is never an AD
 * id (no collision risk with the other 3 branches) and is always unique per Informes row, so
 * one shared `Map` keeps working unchanged for both id-spaces.
 */
export function buildMenuWindowIndex() {
  const index = new Map();
  const groups = menuConfig?.menu ?? [];
  groups.forEach((group, groupOrder) => {
    group.items?.forEach((item, itemOrder) => {
      const rawId = item?.windowId ?? item?.obuiappProcessId ?? item?.processId ?? item?.reportId;
      if (rawId == null) return;
      const windowId = String(rawId);
      const candidate = { group: group.group, label: item.label, groupOrder, itemOrder, hidden: !!item.hidden };
      const existing = index.get(windowId);
      // Prefer this candidate when there's no existing entry yet, or when the
      // first-seen entry for this id was hidden but this one isn't. Any other
      // combination (existing already visible, or both hidden) keeps the
      // first-encountered entry.
      if (!existing || (existing.hidden && !candidate.hidden)) {
        index.set(windowId, candidate);
      }
    });
  });
  return index;
}

const MENU_WINDOW_INDEX = buildMenuWindowIndex();

/**
 * ETP-5071 — shared "ordered-first, then alphabetical fallback" comparator shape used by
 * both `compareCategoriesByOrder` and `compareRowsByItemOrder`: an entry with a known
 * order value always sorts before one without; two known order values sort numerically
 * between themselves; two entries with no order at all fall back to `fallbackCompare()`.
 */
function compareByOrderThenFallback(orderA, orderB, fallbackCompare) {
  if (orderA != null && orderB != null) return orderA - orderB;
  if (orderA != null) return -1;
  if (orderB != null) return 1;
  return fallbackCompare();
}

/**
 * Resolves a single backend window `w` (from `category.windows[]`) against `menuIndex`
 * (see `buildMenuWindowIndex`) instead of trusting the backend's classic-AD-tree grouping.
 * Returns `null` when the window must be excluded from the matrix entirely — ETP-5071: a
 * `menuIndex` match whose own `hidden` flag is `true` (meaning every menu.json entry for
 * that id is hidden — see `buildMenuWindowIndex`'s precedence rule: a visible alternative,
 * if one exists, always wins the index slot first). Two confirmed real cases: Match Rule
 * and Periods (`Finance`), both hidden-only in menu.json yet granted real
 * `AD_Window_Access` — an admin configuring "what can this role see" should never be
 * shown a toggle for something nobody can navigate to.
 *
 * **`excludeHidden` (ETP-5402 fix).** The hidden-exclusion above encodes "not reachable
 * from the sidebar as its OWN link, so hide it from the admin matrix too" — a real
 * inference for a window, which normally has (or could have) its own sidebar entry. Every
 * one of the 9 Informes report rows is marked `hidden: true` in `menu.json` for a
 * DIFFERENT reason — a report never gets its own top-level sidebar link at all, by design
 * (it's reached through the Reports viewer pages instead) — so applying the same exclusion
 * to `reportsMatrix` silently dropped every single report row, even ones with real access,
 * despite the backend returning correct data (caught live, ETP-5402 QA — the "Informes"
 * sub-header never rendered anywhere despite confirmed non-empty `reportsMatrix` grants in
 * the DB and the raw HTTP response). `adaptReportsMatrix` passes `excludeHidden: false` so
 * report rows are never dropped on this basis; `adaptMatrix` keeps the default (`true`).
 *
 * Otherwise returns the resolved `resolvedCategory` (falls back to the backend's raw
 * `category.name` when the window isn't in `menuIndex` — e.g. "Roles"/"Usuario",
 * deliberately granted to none of the 4 templates — it must never disappear from the
 * matrix just because it isn't in menu.json), the adapted `row` (with a transient
 * `_itemOrder`, that window's index within its menu.json group or `null` if absent from
 * `menuIndex`, used by `compareRowsByItemOrder` and stripped again by `adaptMatrix` before
 * it returns), and the window's own `groupOrder` (that window's menu.json group's own
 * declaration-order index, or `null` if absent from `menuIndex`) for
 * `trackBestGroupOrder` to fold into the running per-category best.
 */
function resolveMatrixRow(w, category, menuIndex, excludeHidden = true) {
  const match = menuIndex.get(String(w.id));
  if (excludeHidden && match?.hidden) return null;
  const resolvedCategory = match?.group ?? category.name;
  const row = {
    windowId: w.id,
    windowName: match?.label ?? w.name,
    access: Object.fromEntries(
      Object.entries(w.access ?? {}).map(([roleId, tier]) => [roleId, normalizeTier(tier)])
    ),
    _itemOrder: match?.itemOrder ?? null,
  };
  return { resolvedCategory, row, groupOrder: match?.groupOrder ?? null };
}

/**
 * Folds one window's `groupOrder` (see `resolveMatrixRow`) into `groupOrderByCategory`,
 * keeping the smallest value seen so far for `resolvedCategory` — used by
 * `compareCategoriesByOrder` to sort categories by menu.json's own declaration order
 * rather than alphabetically. A `null` `groupOrder` (window absent from `menuIndex`)
 * leaves the map untouched; `0` is a real, trackable value (not treated as absent).
 * Mutates `groupOrderByCategory` in place.
 */
function trackBestGroupOrder(groupOrderByCategory, resolvedCategory, groupOrder) {
  if (groupOrder == null) return;
  const currentBest = groupOrderByCategory.get(resolvedCategory);
  if (currentBest == null || groupOrder < currentBest) {
    groupOrderByCategory.set(resolvedCategory, groupOrder);
  }
}

/**
 * Flattens `matrix.categories[].windows[]` (or, ETP-5402, `reportsMatrix.categories[]
 * .reports[]` when `itemsKey` is `'reports'`) and buckets rows by their RESOLVED category
 * (see `resolveMatrixRow`) — since two different backend `category.name` buckets can map
 * to the same menu.json `group` (or vice versa), every window is flattened across all
 * backend categories first, then re-bucketed by its resolved category string. Windows
 * excluded by `resolveMatrixRow` (sidebar-hidden, ETP-5071) are skipped entirely — reports
 * are NOT subject to this exclusion (`excludeHidden: false` when `itemsKey === 'reports'`,
 * see `resolveMatrixRow`'s own JSDoc for why). Also tracks, per resolved category, the
 * smallest `groupOrder` seen among its windows via `trackBestGroupOrder`.
 */
function bucketRowsByResolvedCategory(categories, menuIndex, itemsKey = 'windows') {
  const rowsByCategory = new Map();
  const groupOrderByCategory = new Map();
  const excludeHidden = itemsKey !== 'reports';

  for (const category of categories) {
    for (const w of category[itemsKey] ?? []) {
      const resolved = resolveMatrixRow(w, category, menuIndex, excludeHidden);
      if (!resolved) continue;
      const { resolvedCategory, row, groupOrder } = resolved;
      if (!rowsByCategory.has(resolvedCategory)) rowsByCategory.set(resolvedCategory, []);
      rowsByCategory.get(resolvedCategory).push(row);
      trackBestGroupOrder(groupOrderByCategory, resolvedCategory, groupOrder);
    }
  }

  return { rowsByCategory, groupOrderByCategory };
}

/**
 * Sorts resolved category names by the smallest `groupOrder` seen among that category's
 * windows (see `bucketRowsByResolvedCategory`) — menu.json's own declaration order, not
 * alphabetical. A category with no `groupOrder` at all (100% fallback windows) sorts
 * last, alphabetically among themselves.
 */
function compareCategoriesByOrder(a, b, groupOrderByCategory) {
  return compareByOrderThenFallback(groupOrderByCategory.get(a), groupOrderByCategory.get(b), () =>
    a.localeCompare(b)
  );
}

/**
 * ETP-5071 follow-up — sorts rows within a category by `_itemOrder` (see
 * `bucketRowsByResolvedCategory`): the backend's own `category.windows[]` order is just
 * an alphabetical-by-raw-classic-name sort, unrelated to the real sidebar's order, which
 * `menu.json`'s `items[]` array declaration order already matches. A row with no
 * `_itemOrder` at all (the same menu.json-absent fallback case handled above) sorts
 * AFTER every ordered row in that category, alphabetically by `windowName` among
 * themselves.
 */
function compareRowsByItemOrder(a, b) {
  return compareByOrderThenFallback(a._itemOrder, b._itemOrder, () => a.windowName.localeCompare(b.windowName));
}

/**
 * Adapts a `{categories: [{name, windows|reports: [...]}]}`-shaped backend payload into
 * this page's category-grouped row shape, normalizing every cell's tier (see
 * `normalizeTier`). Delegates: bucketing + category/name resolution + hidden-row
 * exclusion to `bucketRowsByResolvedCategory`, category ordering to
 * `compareCategoriesByOrder`, and row ordering within each category to
 * `compareRowsByItemOrder`. See those functions' JSDoc for the full ETP-5071 rules.
 * Shared by `adaptMatrix` (`itemsKey: 'windows'`) and (ETP-5402) `adaptReportsMatrix`
 * (`itemsKey: 'reports'`) — the row shape itself needs no adaptation between the two,
 * see `resolveMatrixRow`'s JSDoc.
 */
function adaptCategoryMatrix(payload, menuIndex, itemsKey) {
  const categories = payload?.categories ?? [];
  const { rowsByCategory, groupOrderByCategory } = bucketRowsByResolvedCategory(categories, menuIndex, itemsKey);

  const categoryNames = [...rowsByCategory.keys()].sort((a, b) =>
    compareCategoriesByOrder(a, b, groupOrderByCategory)
  );

  return categoryNames.map((category) => {
    const rows = [...rowsByCategory.get(category)].sort(compareRowsByItemOrder);
    return {
      category,
      rows: rows.map(({ _itemOrder, ...row }) => row),
    };
  });
}

/** Adapts the backend's `matrix` (real windows) — see `adaptCategoryMatrix`. */
function adaptMatrix(matrix, menuIndex) {
  return adaptCategoryMatrix(matrix, menuIndex, 'windows');
}

/**
 * ETP-5402 — adapts the backend's `reportsMatrix` (the Informes subsection) — see
 * `adaptCategoryMatrix`. Not exported, same as `adaptMatrix` — consumed only through
 * `useRolesOverviewData()`'s `reportsMatrix` field, which `RolesAccessMatrix.jsx` then
 * merges into its per-category "Informes" sub-block alongside `adaptMatrix`'s rows.
 */
function adaptReportsMatrix(reportsMatrix, menuIndex) {
  return adaptCategoryMatrix(reportsMatrix, menuIndex, 'reports');
}

/**
 * Fetches + exposes the Roles-overview cards, window access matrix, and
 * (ETP-5402) the Informes `reportsMatrix`, with loading/error state and a
 * `reload()` escape hatch. `cards` is always returned pre-sorted into
 * `ROLE_ORDER`.
 */
export function useRolesOverviewData() {
  const [state, setState] = useState({ loading: true, error: null, cards: [], matrix: [], reportsMatrix: [] });

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchRolesOverview()
      .then((data) => {
        setState({
          loading: false,
          error: null,
          cards: sortByRoleOrder(adaptCards(data?.roles)),
          matrix: adaptMatrix(data?.matrix, MENU_WINDOW_INDEX),
          reportsMatrix: adaptReportsMatrix(data?.reportsMatrix, MENU_WINDOW_INDEX),
        });
      })
      .catch((err) => {
        setState((s) => ({ ...s, loading: false, error: err?.message || String(err) }));
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
