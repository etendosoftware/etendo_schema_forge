import menuConfig from '@/menu.json';
import { buildFeatureKey } from '@etendosoftware/app-shell-core/auth';

/**
 * ETP-5646 — the canonical spec of "what is a feature" for usage analytics.
 *
 * One stable key per actionable menu entry, derived deterministically from `menu.json`:
 *
 * | kind      | menu entry                                           | key                      |
 * |-----------|------------------------------------------------------|--------------------------|
 * | `window`  | has `windowId`, or is a `routeOnly` spec window      | `window.<name>`          |
 * | `process` | has `obuiappProcessId`                               | `process.<name>`         |
 * | `report`  | has `reportId`                                       | `report.<reportId>`      |
 * | `custom`  | any other page (dashboard, inbox, settings, lists)   | `custom.<name>`          |
 *
 * An entry with `redirect` has no key of its own: it resolves to the entry it redirects to, so an
 * alias never counts as a second feature. The key is the menu `name` (the route segment), which
 * is already stable and low-cardinality; it never contains a record id, a label or a user input.
 * A route that is not in the menu has no feature (nothing is attributed or counted).
 */

function kindOf(item) {
  if (item.reportId) return 'report';
  if (item.obuiappProcessId) return 'process';
  if (item.windowId || item.routeOnly) return 'window';
  return 'custom';
}

function keyOf(item) {
  const kind = kindOf(item);
  return buildFeatureKey(kind, kind === 'report' ? item.reportId : item.name);
}

export function buildFeatureCatalog(config = menuConfig) {
  const items = new Map();
  for (const group of config?.menu ?? []) {
    for (const item of group.items ?? []) {
      if (item?.name && !items.has(item.name)) items.set(item.name, item);
    }
  }

  const resolve = (name, depth = 0) => {
    const item = items.get(name);
    if (!item) return null;
    if (item.redirect && depth < 3) {
      const target = String(item.redirect).replace(/^\//, '').split(/[/?#]/)[0];
      return target && target !== name ? resolve(target, depth + 1) : null;
    }
    return item;
  };

  const features = new Map();
  for (const name of items.keys()) {
    const item = resolve(name);
    const key = item ? keyOf(item) : null;
    if (key) features.set(key, { key, kind: kindOf(item), name: item.name });
  }

  const byReportId = new Map(
    [...items.values()].filter(item => item.reportId).map(item => [item.reportId, item]),
  );

  /** The feature of a location, or `null` when the route is not an actionable menu entry. */
  function resolveFeature(pathname = '/', search = '') {
    const segment = String(pathname).replace(/^\/+/, '').split('/')[0];
    if (!segment) return null;
    if (segment === 'report-viewer') {
      const params = new URLSearchParams(search);
      const reportId = params.get('report');
      if (reportId && byReportId.has(reportId)) return features.get(keyOf(byReportId.get(reportId))) ?? null;
      const category = params.get('category');
      const listing = category ? resolve(`report-viewer-${category}`) : null;
      return listing ? features.get(keyOf(listing)) ?? null : null;
    }
    const item = resolve(segment);
    return item ? features.get(keyOf(item)) ?? null : null;
  }

  return { features, resolveFeature };
}

const defaultCatalog = buildFeatureCatalog();

export const FEATURE_CATALOG = defaultCatalog.features;
export const resolveFeature = defaultCatalog.resolveFeature;
