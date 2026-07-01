/**
 * Stable UI selectors for Playwright tests.
 *
 * Prefer data-testid selectors over localized labels. Visible copy can change
 * with the active locale, while these ids describe the tested UI contract.
 */

export const dashboard = {
  newSalesOrder: 'quick-action-sales-order-new',
  newSalesInvoice: 'quick-action-sales-invoice-new',
  newContact: 'quick-action-contacts-new',
};

export const listView = {
  root: 'list-view',
  newButton: 'action-new',
  statusFilter: 'filter-status',
  dateFilter: 'filter-date',
  advancedFilter: 'filter-advanced',
};

export const detailView = {
  root: 'detail-view',
  save: 'action-save',
  cancel: 'action-cancel',
  addLine: 'action-add-line',
  linesEmptyState: 'lines-empty-state',
  linesEmptyStateTitle: 'lines-empty-state-title',
  linesEmptyStateDescription: 'lines-empty-state-description',
};

// --- Sales Invoice: List View ---
// Column headers come from labelOverrides in artifacts/sales-invoice/decisions.json
// (es_ES). The order is enforced by InvoiceHeaderTable.jsx. Locale-sensitive
// labels are resolved per-environment via SALES_INVOICE_GRID_COLUMNS below.
export const salesInvoiceList = {
  // Generic "any h1" — the visible text depends on session locale.
  heading: { role: 'heading', level: 1 },
};

// --- Purchase Invoice: List View ---
export const purchaseInvoiceList = {
  heading: { role: 'heading', level: 1 },
};

/**
 * Expected grid column labels per locale, in order. The first seven columns are
 * shared by both invoice grids; the last column is the logistics-status column
 * and differs per window: sales invoices ship to the customer ("Delivery Status"
 * / "Estado de entrega"), while purchase invoices receive goods from the vendor
 * ("Reception Status" / "Estado de recepción", ETP-4303).
 */
const SHARED_INVOICE_COLUMNS = {
  es_ES: [
    'Fecha de la factura',
    'Nº documento',
    'Vencimiento',
    'Contacto',
    'Estado doc.',
    'Imp.total',
    'Pendiente de pago',
  ],
  en_US: [
    'Invoice Date',
    'Document No.',
    'Due Date',
    'Business Partner',
    'Document Status',
    'Total Gross Amount',
    'Pending Payment',
  ],
};

/** Last grid column (logistics status), per window and locale. */
export const INVOICE_DELIVERY_STATUS_LABEL = {
  'sales-invoice': { es_ES: 'Estado de entrega', en_US: 'Delivery Status' },
  'purchase-invoice': { es_ES: 'Estado de recepción', en_US: 'Reception Status' },
};

/** Full expected column list (in order) for a given window + locale. */
export function invoiceGridColumns(window, locale) {
  return [...SHARED_INVOICE_COLUMNS[locale], INVOICE_DELIVERY_STATUS_LABEL[window][locale]];
}

// Shared subset, used only for locale detection (the seven common columns are
// enough to tell es_ES from en_US regardless of the per-window last column).
export const INVOICE_GRID_COLUMNS = SHARED_INVOICE_COLUMNS;

// --- Purchase Order: List View ---
export const purchaseOrderList = {
  heading: { role: 'heading', name: 'Orders', level: 1 },
  newButton: { role: 'button', name: 'New Order' },
  columns: {
    transactionDoc: { role: 'columnheader', name: 'Transaction Document' },
    docStatus: { role: 'columnheader', name: 'Document Status' },
    orderDate: { role: 'columnheader', name: 'Order Date' },
    businessPartner: { role: 'columnheader', name: 'Business Partner' },
    warehouse: { role: 'columnheader', name: 'Warehouse' },
    priceList: { role: 'columnheader', name: 'Price List' },
    grossAmount: { role: 'columnheader', name: 'Total Gross Amount' },
  },
};

export const field = (key) => `field-${key}`;
export const columnHeader = (key) => `column-header-${key}`;
export const inlineAddField = (key) => `inline-add-field-${key}`;
export const inlineAddOption = (fieldKey, optionId) => `inline-add-option-${fieldKey}-${optionId}`;
export const option = (fieldKey, optionId) => `option-${fieldKey}-${optionId}`;

export function byTestId(page, testId) {
  return page.getByTestId(testId);
}
