import { CHIP_ICONS, CHIP_COLORS, STATUS_KEYS } from './constants.jsx';

/**
 * Registry of document chip types used by RelatedDocuments components.
 *
 * Each entry declares the default presentation (icon, title i18n key, route
 * prefix) and the doc field names to read for amount/currency/status/title.
 * Per-call-site overrides are supported via the `iconKey` and `title`
 * arguments to `docChipProps()`.
 *
 * Single source of truth — adding or modifying a doc-chip semantics should
 * only require an edit here.
 */
export const DOCUMENT_CHIP_TYPES = {
  order: {
    iconKey: 'order',
    titleKey: 'orderDoc',
    titleField: 'documentNo',
    amountField: 'grandTotalAmount',
    currencyField: 'currency$_identifier',
    statusField: 'documentStatus',
    routePrefix: '/purchase-order',
  },
  invoice: {
    iconKey: 'invoice',
    titleKey: 'invoiceDoc',
    titleField: 'documentNo',
    amountField: 'grandTotalAmount',
    currencyField: 'currency$_identifier',
    statusField: 'documentStatus',
    routePrefix: '/purchase-invoice',
  },
  receipt: {
    iconKey: 'shipment',
    titleKey: 'receiptDoc',
    titleField: 'documentNo',
    statusField: 'documentStatus',
    routePrefix: '/goods-receipt',
  },
  payment: {
    iconKey: 'payment',
    titleKey: 'paymentDoc',
    titleField: 'documentNo',
    titleFallbackField: 'id',
    amountField: 'amount',
    currencyField: 'currency$_identifier',
    statusField: 'status',
    routePrefix: '/payment-out',
  },
  'sales-order': {
    iconKey: 'order',
    titleKey: 'orderDoc',
    titleField: 'documentNo',
    amountField: 'grandTotalAmount',
    currencyField: 'currency$_identifier',
    statusField: 'documentStatus',
    routePrefix: '/sales-order',
  },
  'sales-invoice': {
    iconKey: 'invoice',
    titleKey: 'invoiceDoc',
    titleField: 'documentNo',
    amountField: 'grandTotalAmount',
    currencyField: 'currency$_identifier',
    statusField: 'documentStatus',
    routePrefix: '/sales-invoice',
  },
  shipment: {
    iconKey: 'shipment',
    titleKey: 'shipmentDoc',
    titleField: 'documentNo',
    statusField: 'documentStatus',
    routePrefix: '/goods-shipment',
  },
  'payment-in': {
    iconKey: 'payment',
    titleKey: 'paymentDoc',
    titleField: 'documentNo',
    titleFallbackField: 'id',
    amountField: 'amount',
    currencyField: 'currency$_identifier',
    statusField: 'status',
    routePrefix: '/payment-in',
  },
  'return-material-receipt': {
    iconKey: 'returnDoc',
    titleKey: 'returnDoc',
    titleField: 'documentNo',
    statusField: 'documentStatus',
    routePrefix: '/return-material-receipt',
  },
  'return-to-vendor': {
    iconKey: 'returnDoc',
    titleKey: 'returnDoc',
    titleField: 'documentNo',
    statusField: 'documentStatus',
    routePrefix: '/return-to-vendor-shipment',
  },
  'goods-receipt': {
    iconKey: 'shipment',
    titleKey: 'receiptDoc',
    titleField: 'documentNo',
    statusField: 'documentStatus',
    routePrefix: '/goods-receipt',
  },
  'purchase-invoice': {
    iconKey: 'invoice',
    titleKey: 'invoiceDoc',
    titleField: 'documentNo',
    amountField: 'grandTotalAmount',
    currencyField: 'currency$_identifier',
    statusField: 'documentStatus',
    routePrefix: '/purchase-invoice',
  },
};

/**
 * Build the props object for a DocChip from a doc-type configuration.
 *
 * @param {object} args
 * @param {string} args.type — DOCUMENT_CHIP_TYPES key.
 * @param {object} args.doc — record providing the field values.
 * @param {(key: string, params?: object) => string} args.ui — i18n translator.
 * @param {(path: string) => void} args.navigate — router navigator.
 * @param {string} [args.iconKey] — override the default icon (CHIP_ICONS key).
 * @param {string} [args.title] — override the resolved title entirely.
 * @returns {object} props to spread on <DocChip ... />
 */
export function docChipProps({ type, doc, ui, navigate, iconKey: iconOverride, title: titleOverride }) {
  const cfg = DOCUMENT_CHIP_TYPES[type];
  if (!cfg) throw new Error(`Unknown DocChip type: ${type}`);
  const iconKey = iconOverride || cfg.iconKey;
  const titleValue = doc[cfg.titleField] ?? (cfg.titleFallbackField ? doc[cfg.titleFallbackField] : undefined);
  const amount = cfg.amountField ? doc[cfg.amountField] : undefined;
  const currency = cfg.currencyField ? doc[cfg.currencyField] : undefined;
  const status = cfg.statusField ? doc[cfg.statusField] : undefined;
  return {
    icon: CHIP_ICONS[iconKey],
    iconColor: CHIP_COLORS[iconKey],
    title: titleOverride ?? ui(cfg.titleKey, { number: titleValue }),
    amount,
    currency,
    status,
    statusLabel: status ? ui(STATUS_KEYS[status] || status) : undefined,
    onClick: () => navigate(`${cfg.routePrefix}/${doc.id}`),
  };
}
