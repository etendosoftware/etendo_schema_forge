/**
 * Report categories (`report-contract.json` → `category`) and the label each one shows as the
 * first breadcrumb level and the catalog section heading. `en` is also the menu.json group key,
 * so `tMenu(label.en)` translates it through the same entry as the sidebar group (ETP-6389).
 *
 * Plain module on purpose: shared by ReportViewerPage and DynamicReportView without either
 * importing the other's whole page.
 */
export const CATEGORY_LABELS = Object.freeze({
  purchases: { en: 'Purchases', es: 'Compras' },
  finance: { en: 'Finance', es: 'Finanzas' },
  treasury: { en: 'Treasury', es: 'Tesorería' },
  sales: { en: 'Sales', es: 'Ventas' },
  inventory: { en: 'Inventory', es: 'Inventario' },
  other: { en: 'Other', es: 'Otros' },
});

/**
 * The menu label key (to pass through `tMenu`) of a report category, or `fallback` when the
 * category is missing or unknown.
 *
 * @param {string|null|undefined} category
 * @param {string|null} [fallback]
 * @returns {string|null}
 */
export function reportCategoryMenuKey(category, fallback = null) {
  return CATEGORY_LABELS[category]?.en ?? fallback;
}
