import { PackageCheck, Truck } from 'lucide-react';

/**
 * ETP-5576 — follow-up document configuration of the two invoice windows. Both share the
 * generic follow-up flow (components/follow-up-documents); only the texts, the icon and the
 * kind of document created differ. The option keys are the backend's follow-up keys
 * (`record.followUp.available`): 'shipment' for sales, 'receipt' for purchases.
 *
 * Kept as plain config so the order windows (shipment AND invoice) and goods-shipment
 * (invoice) can declare theirs the same way.
 */
// With a single follow-up (always the case for invoices) the modal is a direct confirmation:
// title `titleKey`, the summary (its «Líneas» column is the pending line count), the window's
// `questionKey`, ONE static option card (`labelKey` + `badgeKey`/`badgeTone` + description)
// and a primary `actionLabelKey` button.
// `documentNo` is the INTERNAL document number on both sides (e.g. «FC1000000»). On a
// purchase invoice it must never be `orderReference` (POReference): that is the supplier's
// own invoice number, a free-text reconciliation field, not the document being confirmed.
const INVOICE_SUMMARY = {
  documentLabelKey: 'invoice',
  documentNoField: 'documentNo',
  dateLabelKey: 'date',
  dateField: 'invoiceDate',
  contactField: 'businessPartner$_identifier',
  totalField: 'grandTotalAmount',
  currencyField: 'currency$_identifier',
};

// «¿Qué vas a hacer con esta factura?» — shared by both invoice windows.
const INVOICE_QUESTION_KEY = 'followUpInvoiceQuestion';

export const SALES_INVOICE_FOLLOW_UP = {
  spec: 'sales-invoice',
  questionKey: INVOICE_QUESTION_KEY,
  summary: INVOICE_SUMMARY,
  options: {
    shipment: {
      titleKey: 'followUpManageShipmentTitle',
      buttonLabelKey: 'soManageShipment',
      labelKey: 'followUpCreateShipmentLabel',
      descriptionKey: 'followUpCreateShipmentDescription',
      descriptionOneKey: 'followUpCreateShipmentDescriptionOne',
      actionLabelKey: 'followUpCreateShipmentAction',
      badgeKey: 'draft',
      badgeTone: 'info',
      icon: Truck,
      resultDocType: 'salida',
    },
  },
};

export const PURCHASE_INVOICE_FOLLOW_UP = {
  spec: 'purchase-invoice',
  questionKey: INVOICE_QUESTION_KEY,
  // The supplier's number ("Nº documento") is what the purchase invoice is known by; the
  // internal DocumentNo is the fallback (see purchase-invoice LABEL_OVERRIDES).
  summary: INVOICE_SUMMARY,
  options: {
    receipt: {
      titleKey: 'followUpManageReceiptTitle',
      buttonLabelKey: 'poManageReceipt',
      labelKey: 'followUpCreateReceiptLabel',
      descriptionKey: 'followUpCreateReceiptDescription',
      descriptionOneKey: 'followUpCreateReceiptDescriptionOne',
      actionLabelKey: 'followUpCreateReceiptAction',
      badgeKey: 'draft',
      badgeTone: 'info',
      icon: PackageCheck,
      resultDocType: 'entrada',
    },
  },
};
