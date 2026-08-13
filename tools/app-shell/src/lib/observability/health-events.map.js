// Maps schema-forge windowName (URL first segment) to Health Score event properties.
// transactional: true  → the window can also fire transaction_posted (via DocAction)
// transactional: false → only document_created applies (master data, no posting step)
export const HEALTH_EVENTS_MAP = {
  // ── Sales ────────────────────────────────────────────────────────────────
  'sales-quotation': { document_type: 'quote',          functional_area: 'sales',      transactional: false },
  'sales-order':     { document_type: 'sales_order',    functional_area: 'sales',      transactional: true  },
  'goods-shipment':  { document_type: 'delivery_note',  functional_area: 'sales',      transactional: true  },
  'sales-invoice':   { document_type: 'sales_invoice',  functional_area: 'sales',      transactional: true  },
  'payment-in':      { document_type: 'payment_in',     functional_area: 'sales',      transactional: true  },

  // ── Purchases ────────────────────────────────────────────────────────────
  'purchase-order':  { document_type: 'purchase_order',   functional_area: 'purchases', transactional: true  },
  'goods-receipt':   { document_type: 'goods_receipt',    functional_area: 'purchases', transactional: true  },
  'purchase-invoice':{ document_type: 'supplier_invoice', functional_area: 'purchases', transactional: true  },
  'payment-out':     { document_type: 'payment_out',      functional_area: 'purchases', transactional: true  },

  // ── Stock ────────────────────────────────────────────────────────────────
  'goods-movements':    { document_type: 'stock_movement',       functional_area: 'stock', transactional: true  },
  'physical-inventory': { document_type: 'inventory_adjustment', functional_area: 'stock', transactional: true  },
  'inventory':          { document_type: 'warehouse_transfer',   functional_area: 'stock', transactional: true  },

  // ── Accounting ───────────────────────────────────────────────────────────
  'bank-reconciliation': { document_type: 'bank_reconciliation',    functional_area: 'accounting', transactional: true  },
  'accounting':          { document_type: 'manual_accounting_entry', functional_area: 'accounting', transactional: true  },

  // ── Master data (no transaction step) ───────────────────────────────────
  'contacts': { document_type: 'contact_created', functional_area: 'contacts', transactional: false },
  'product':  { document_type: 'product_created', functional_area: 'products', transactional: false },
  'assets':   { document_type: 'asset_created',   functional_area: 'assets',   transactional: false },
};
