/**
 * OCR document-type registry.
 *
 * Each entry binds a URL route prefix to the UI side of the extraction (the review
 * modals' fields and columns) and the per-doctype window event the extractor
 * dispatches. What the extraction tool is ASKED — the tool, the question and the strict
 * JSON schema of its answer — is NOT here: it lives once, in the server's OCR
 * configuration (`GET /sws/neo/ocrconfig?docType=<id>`, see `useOcrConfig.js`), the same one
 * the MCP's document-reading tools use, so the two cannot drift apart. Every payload key the
 * fields below read (`extractFrom`, `createPrefilledFrom`) must be in that schema. The actual
 * mapping from extracted
 * JSON to a `/sws/neo/batch` payload lives in a per-window descriptor under
 * `ingest/<window>Descriptor.js` and is wired up in `useOcrFlow.jsx`'s
 * DESCRIPTORS map — adding a new window is one descriptor file plus one
 * entry here.
 */

export const OCR_DOC_TYPES = [
  {
    id: 'purchase-invoice',
    // ETP-5585 — name of the pre-flight check in useOcrFlow's VALIDATORS map.
    validateExtraction: 'receiverTaxId',
    routePrefix: '/purchase-invoice/',
    eventName: 'copilot:ocr-prefill:purchase-invoice',
    // AD_Tab_ID of the Purchase Invoice header tab. Required by the AttachFile
    // webhook so the uploaded PDF lands in the AD_Attachment grid for the new
    // record. Look up via: SELECT ad_tab_id FROM ad_tab JOIN ad_window USING(ad_window_id)
    // WHERE ad_window.name='Purchase Invoice' AND tablevel=0.
    tabId: '290',
    tableName: 'C_Invoice',
    headerFields: [
      {
        key: 'vendor',
        kind: 'entity',
        label: 'ocrReviewVendorLabel',
        extractFrom: ['vendor_name', 'tax_id'],
        // The invoice header's own vendor selector — a plain `q` search that passes the
        // production WAF, unlike an HQL `_neoWhere` (see ocrQuery.js).
        selector: 'purchase-invoice/header/C_BPartner_ID',
        selectorParams: { isSOTrx: 'N', isVendor: 'Y' },
        preResolve: 'findBp',
        createComponent: 'CreateContactModal',
        createDocumentType: 'purchase',
        // Values are extracted payload keys (ETP-4855 Error 1: the user should not
        // retype what the OCR already read).
        //
        // ETP-5332 — the popup is now the real Contacts window, so only the keys that
        // are `businessPartner` HEADER fields are actually seeded: `name`, `taxID`,
        // `etgoEmail`, `etgoPhone` (see `buildOcrContactSeed` in
        // CreateContactModalAdapter.jsx). `address`, `postalCode`, `city` and `country`
        // belong to the `locationAddress` CHILD tab: they are forwarded separately as
        // `initialChildData` (`buildOcrContactAddressSeed`, ETP-5654) and prefill the
        // tab's first "Add address" modal. Adding a key here does nothing unless one of
        // those two builders reads it.
        createPrefilledFrom: {
          name: 'vendor_name',
          taxID: 'tax_id',
          address: 'vendor_address',
          postalCode: 'vendor_postal_code',
          city: 'vendor_city',
          country: 'vendor_country',
          etgoEmail: 'vendor_email',
          etgoPhone: 'vendor_phone',
        },
      },
      {
        key: 'documentNo',
        kind: 'text',
        label: 'ocrReviewDocumentNoLabel',
        extractFrom: 'document_no',
        placeholder: 'ocrReviewDocumentNoPlaceholder',
      },
      {
        key: 'invoiceDate',
        kind: 'date',
        label: 'ocrReviewInvoiceDateLabel',
        extractFrom: 'invoice_date',
      },
    ],
    lineColumns: [
      {
        key: 'description',
        kind: 'text',
        label: 'ocrLinesColDescription',
        extractFrom: 'description',
      },
      {
        key: 'quantity',
        kind: 'number',
        label: 'ocrLinesColQuantity',
        extractFrom: 'quantity',
        width: 'w-24',
      },
      {
        key: 'unitPrice',
        kind: 'number',
        label: 'ocrLinesColUnitPrice',
        extractFrom: 'unit_price',
        width: 'w-28',
      },
      {
        key: 'tax',
        kind: 'entity',
        label: 'ocrLinesColTax',
        extractFrom: 'tax_label',
        // A plain `q` selector search (see ocrQuery.js). Not the line's C_Tax_ID selector: its
        // validation rule needs @DateInvoiced@, which NEO turns into NULL here, so it lists
        // nothing. The invoice tax tab's C_Tax_ID has no rule — every tax of the client.
        selector: 'purchase-invoice/tax/C_Tax_ID',
        // Preselected by the backend `defaultTax` action from the printed rate (ETP-5585),
        // never by a similarity search on the label.
        preResolve: 'findDefaultTax',
        emptyOptionLabel: 'ocrLinesTaxDefault',
        searchPlaceholder: 'ocrLinesTaxSearch',
        noMatchesLabel: 'ocrLinesTaxNoMatches',
        clearLabel: 'ocrLinesTaxClear',
        // Fixed layout (OcrLinesReviewModal `table-fixed`): quantity 96 + price 112 + tax 320 leave
        // the description ~200 of the 728px content width, whatever the tax label length.
        width: 'w-80',
      },
    ],
  },
];

export const OCR_PREFILL_EVENT_PREFIX = 'copilot:ocr-prefill:';

/**
 * Return the OCR config for the current pathname, or null when no document
 * type matches.
 */
export function matchOcrDocType(pathname) {
  if (!pathname) return null;
  return OCR_DOC_TYPES.find(t => pathname.startsWith(t.routePrefix)) || null;
}

export function getOcrDocType(docTypeId) {
  if (!docTypeId) return null;
  return OCR_DOC_TYPES.find(t => t.id === docTypeId) || null;
}
