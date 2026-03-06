import menuConfig from '../menu.json' with { type: 'json' };

/**
 * Known window loaders -- maps slug to dynamic import.
 * Windows not listed here fall back to PlaceholderWindow.
 */
const windowLoaders = {
  'sales-order': () => import('@generated/sales-order/generated/web/sales-order/index.jsx'),
  'business-partner': () => import('@generated/business-partner/generated/web/business-partner/index.jsx'),
  'warehouse': () => import('@generated/warehouse/generated/web/warehouse/index.jsx'),
  'price-list': () => import('@generated/price-list/generated/web/price-list/index.jsx'),
  'payment-term': () => import('@generated/payment-term/generated/web/payment-term/index.jsx'),
  'payment-method': () => import('@generated/payment-method/generated/web/payment-method/index.jsx'),
  'product': () => import('@generated/product/generated/web/product/index.jsx'),
  'product-category': () => import('@generated/product-category/generated/web/product-category/index.jsx'),
  'tax': () => import('@generated/tax/generated/web/tax/index.jsx'),
  'uom': () => import('@generated/uom/generated/web/uom/index.jsx'),
  'user': () => import('@generated/user/generated/web/user/index.jsx'),
  'requisition': () => import('@generated/requisition/generated/web/requisition/index.jsx'),
  'purchase-order': () => import('@generated/purchase-order/generated/web/purchase-order/index.jsx'),
  'goods-receipt': () => import('@generated/goods-receipt/generated/web/goods-receipt/index.jsx'),
  'purchase-invoice': () => import('@generated/purchase-invoice/generated/web/purchase-invoice/index.jsx'),
  'manage-requisitions': () => import('@generated/manage-requisitions/generated/web/manage-requisitions/index.jsx'),
  'return-to-vendor': () => import('@generated/return-to-vendor/generated/web/return-to-vendor/index.jsx'),
  'return-to-vendor-shipment': () => import('@generated/return-to-vendor-shipment/generated/web/return-to-vendor-shipment/index.jsx'),
  'landed-cost': () => import('@generated/landed-cost/generated/web/landed-cost/index.jsx'),
};

/**
 * Return the 2-level menu groups from menu.json.
 */
export function buildMenuGroups() {
  return menuConfig.menu;
}

/**
 * Flat list of all window slugs from menu.json.
 */
export function getAllWindowNames() {
  return menuConfig.menu.flatMap(g => g.items.map(i => i.name));
}

/**
 * Build window map with loaders for all windows in menu.json.
 */
export function buildWindowMap() {
  const map = {};
  for (const group of menuConfig.menu) {
    for (const item of group.items) {
      map[item.name] = {
        name: item.name,
        label: item.label,
        contract: null,
        loader: windowLoaders[item.name] || (() => import('./PlaceholderWindow.jsx')),
      };
    }
  }
  return map;
}
