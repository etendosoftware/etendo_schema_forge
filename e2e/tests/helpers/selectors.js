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
 * Expected grid column labels per locale, in order, for both invoice grids.
 * Sales and purchase share the same final list because labelOverrides + the
 * customs are aligned. If a locale's session is active, the grid renders
 * using that set.
 */
export const INVOICE_GRID_COLUMNS = {
  es_ES: [
    'Fecha de la factura',
    'Nº documento',
    'Vencimiento',
    'Contacto',
    'Estado doc.',
    'Imp.total',
    'Pendiente de pago',
    'Estado de entrega',
  ],
  en_US: [
    'Invoice Date',
    'Document No.',
    'Due Date',
    'Business Partner',
    'Document Status',
    'Total Gross Amount',
    'Pending Payment',
    'Delivery Status',
  ],
};

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
