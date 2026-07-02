import menuConfig from '../menu.json' with { type: 'json' };
import { APP_CATALOG } from '../apps-registry.js';

/**
 * Known window loaders -- maps slug to dynamic import.
 * Windows not listed here fall back to PlaceholderWindow.
 *
 * Enterprise windows (removed): commission, commission-payment, requisition,
 * manage-requisitions, landed-cost, inventory-quality-inspection, bom-production,
 * packing, warehouse-picking-list, stock-reservation, cost-adjustment
 *
 * Out-of-scope windows (removed, ETP-4191): payment-method, unit-of-measure.
 * Not part of the 1st iteration. The C_UOM_ID / FIN_PaymentMethod_ID selectors
 * used by product / payment-in / payment-out resolve against AD_Column metadata,
 * not these specs, so removal does not affect them.
 */
const windowLoaders = {
  'sales-order': () => import('@generated/sales-order/generated/web/sales-order/index.jsx'),
  'match-rule': () => import('@generated/match-rule/generated/web/match-rule/index.jsx'),
  'business-partner': () => import('@generated/business-partner/generated/web/business-partner/index.jsx'),
  'contacts': () => import('@/windows/custom/contacts/index.jsx'),
  'warehouse': () => import('@generated/warehouse/generated/web/warehouse/index.jsx'),
  'price-list': () => import('@generated/price-list/generated/web/price-list/index.jsx'),
  'payment-term': () => import('@generated/payment-term/generated/web/payment-term/index.jsx'),
  'product': () => import('@/windows/custom/product/index.jsx'),
  'product-category': () => import('@/windows/custom/product-category/index.jsx'),
  'tax': () => import('@generated/tax/generated/web/tax/index.jsx'),
  'tax-category': () => import('@generated/tax-category/generated/web/tax-category/index.jsx'),
  'user': () => import('@generated/user/generated/web/user/index.jsx'),
  'purchase-order': () => import('@generated/purchase-order/generated/web/purchase-order/index.jsx'),
  'goods-receipt': () => import('@generated/goods-receipt/generated/web/goods-receipt/index.jsx'),
  'return-to-vendor': () => import('@generated/return-to-vendor/generated/web/return-to-vendor/index.jsx'),
  'return-to-vendor-shipment': () => import('@generated/return-to-vendor-shipment/generated/web/return-to-vendor-shipment/index.jsx'),
  'physical-inventory': () => import('@generated/physical-inventory/generated/web/physical-inventory/index.jsx'),
  'goods-movements': () => import('@generated/goods-movements/generated/web/goods-movements/index.jsx'),
  'internal-consumption': () => import('@generated/internal-consumption/generated/web/internal-consumption/index.jsx'),
  'warehouse-storage-bins': () => import('@generated/warehouse-storage-bins/generated/web/warehouse-storage-bins/index.jsx'),
  'sales-quotation': () => import('@generated/sales-quotation/generated/web/sales-quotation/index.jsx'),
  'goods-shipment': () => import('@/windows/custom/goods-shipment/index.jsx'),
  'return-from-customer': () => import('@generated/return-from-customer/generated/web/return-from-customer/index.jsx'),
  'return-material-receipt': () => import('@/windows/custom/return-material-receipt/index.jsx'),
  'sales-invoice': () => import('@generated/sales-invoice/generated/web/sales-invoice/index.jsx'),
  'deal': () => import('@generated/deal/generated/web/deal/index.jsx'),
  'activity': () => import('@generated/activity/generated/web/activity/index.jsx'),
  'lead': () => import('@generated/lead/generated/web/lead/index.jsx'),
  'employee': () => import('@generated/employee/generated/web/employee/index.jsx'),
  'absence': () => import('@generated/absence/generated/web/absence/index.jsx'),
  'project': () => import('@generated/project/generated/web/project/index.jsx'),
  'time-tracking': () => import('@generated/time-tracking/generated/web/time-tracking/index.jsx'),
  'document': () => import('@generated/document/generated/web/document/index.jsx'),
  'recurring-invoice': () => import('@generated/recurring-invoice/generated/web/recurring-invoice/index.jsx'),
  'payment-in': () => import('@generated/payment-in/generated/web/payment-in/index.jsx'),
  'payment-out': () => import('@generated/payment-out/generated/web/payment-out/index.jsx'),
  'chart-of-accounts': () => import('@generated/chart-of-accounts/generated/web/chart-of-accounts/index.jsx'),
  'assets': () => import('@generated/assets/generated/web/assets/index.jsx'),
  'asset-group': () => import('@generated/asset-group/generated/web/asset-group/index.jsx'),
  'conversion-rates': () => import('@generated/conversion-rates/generated/web/conversion-rates/index.jsx'),
  'conversion-rate-downloader-log': () => import('@generated/conversion-rate-downloader-log/generated/web/conversion-rate-downloader-log/index.jsx'),
  'amortization': () => import('@generated/amortization/generated/web/amortization/index.jsx'),
  'simple-g-l-journal': () => import('@generated/simple-g-l-journal/generated/web/simple-g-l-journal/index.jsx'),
  'open-close-period-control': () => import('@generated/open-close-period-control/generated/web/open-close-period-control/index.jsx'),
};

/**
 * Return the 2-level menu groups, merging installed SDK apps into the
 * group declared by each menu entry. Groups or items with hidden: true
 * are excluded by default; the `Marketplace` group is force-shown when
 * the easter-egg flag `appStoreUnlocked` is true.
 *
 * @param {string[]} [installedAppIds] — appIds present in the installed-apps
 *   store. External apps only appear in the menu when their id is here.
 * @param {{ appStoreUnlocked?: boolean }} [options]
 */
export function buildMenuGroups(installedAppIds = [], options = {}) {
  const { appStoreUnlocked = false } = options;
  const installedSet = new Set(installedAppIds);
  const extraByGroup = new Map();
  for (const app of APP_CATALOG) {
    if (!installedSet.has(app.appId)) continue;
    for (const entry of app.menuEntries) {
      // Each entry may override the app's default menuGroup so one app
      // can add a sales item under Sales and a purchase item under
      // Purchases without needing a single shared group.
      const targetGroup = entry.menuGroup || app.menuGroup;
      if (!extraByGroup.has(targetGroup)) extraByGroup.set(targetGroup, []);
      extraByGroup.get(targetGroup).push({ ...entry });
    }
  }

  return menuConfig.menu
    .filter(group => {
      if (group.hidden && group.group === 'Marketplace' && appStoreUnlocked) return true;
      return !group.hidden;
    })
    .map(group => {
      const extras = extraByGroup.get(group.group) || [];
      return {
        ...group,
        items: [
          ...group.items.filter(item => !item.hidden),
          ...extras,
        ],
      };
    });
}

/**
 * Flat list of all window slugs from menu.json plus every potential menu
 * entry from the app catalog (so route resolution never fails for an app
 * that happens to be installed).
 */
export function getAllWindowNames() {
  const names = menuConfig.menu.flatMap(g => g.items.map(i => i.name));
  for (const app of APP_CATALOG) {
    for (const entry of app.menuEntries) {
      if (!names.includes(entry.name)) names.push(entry.name);
    }
  }
  return names;
}

/**
 * API-only sub-windows: have a contract.json and NEO spec but are never loaded
 * as standalone UI windows. They are consumed directly via fetch by other custom
 * components (e.g. FiscalConfigPage fetches sii-config / tbai-config / verifactu-config).
 * Listed here so pipeline F3 validation knows they are intentionally registry-free.
 */
export const apiOnlyWindows = new Set([
  'sii-config',
  'tbai-config',
  'verifactu-config',
  'sii-monitor',
  'monitor-verifactu',
  'tbai-facturas-enviadas',
]);

/**
 * Hand-written custom window loaders.
 * Each entry maps a window slug to a dynamic import of its custom component.
 * Entries are auto-registered by the pipeline when layoutType is "custom".
 * Developers can also add entries manually for fully custom windows.
 */
const customLoaders = {
  // Auto-registered by pipeline when layoutType: "custom"
  'fiscal-config': () => import('./custom/fiscal-config/index.jsx'),
  'fiscal-monitor': () => import('./custom/fiscal-monitor/index.jsx'),
  'fiscal-models': () => import('./custom/fiscal-models/index.jsx'),
  'sales-order': () => import('./custom/sales-order/index.jsx'),
  'price-list': () => import('./custom/price-list/index.jsx'),
  'purchase-invoice': () => import('./custom/purchase-invoice/index.jsx'),
  'purchase-order': () => import('./custom/purchase-order/index.jsx'),
  'goods-receipt': () => import('./custom/goods-receipt/index.jsx'),
  'physical-inventory': () => import('./custom/physical-inventory/index.jsx'),
  'goods-movements': () => import('./custom/goods-movements/index.jsx'),
  'payment-out': () => import('./custom/payment-out/index.jsx'),
  'sales-invoice': () => import('./custom/sales-invoice/index.jsx'),
  'sales-quotation': () => import('./custom/sales-quotation/index.jsx'),
  'warehouse': () => import('./custom/warehouse/index.jsx'),
  'spike-hello-app': () => import('./spike-apps-host/index.jsx'),
  'quick-order-sales': () => import('./quick-order/index.jsx'),
  'quick-order-purchase': () => import('./quick-order/index.jsx'),
  'financial-account': () => import('./custom/financial-account/index.jsx'),
  'general-ledger-configuration': () => import('./custom/general-ledger-configuration/index.jsx'),
  'return-to-vendor-shipment': () => import('./custom/return-to-vendor-shipment/index.jsx'),
  'not-posted-documents': () => import('./custom/not-posted-documents/index.jsx'),
  'assets': () => import('./custom/assets/index.jsx'),
};

/**
 * Build window map with loaders for all windows in menu.json plus every
 * SDK-app menu entry from the catalog (so installing an app from the
 * App Store never hits PlaceholderWindow on first render).
 *
 * Resolution order: customLoaders > windowLoaders > PlaceholderWindow
 */
export function buildWindowMap() {
  const map = {};
  const register = (item) => {
    map[item.name] = {
      name: item.name,
      label: item.label,
      contract: null,
      loader: customLoaders[item.name]
        || windowLoaders[item.name]
        || (() => import('./PlaceholderWindow.jsx')),
    };
  };

  for (const group of menuConfig.menu) {
    for (const item of group.items) register(item);
  }
  for (const app of APP_CATALOG) {
    for (const entry of app.menuEntries) {
      if (!map[entry.name]) register(entry);
    }
  }
  return map;
}
