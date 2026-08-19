/**
 * OCR document-type registry.
 *
 * Each entry binds a URL route prefix to the extraction config (which copilot
 * assistant tool runs and what JSON schema it returns) and the per-doctype
 * window event the extractor dispatches. The actual mapping from extracted
 * JSON to a `/sws/neo/batch` payload lives in a per-window descriptor under
 * `ingest/<window>Descriptor.js` and is wired up in `useOcrFlow.jsx`'s
 * DESCRIPTORS map — adding a new window is one descriptor file plus one
 * entry here.
 */

export const OCR_DOC_TYPES = [
  {
    id: 'purchase-invoice',
    routePrefix: '/purchase-invoice/',
    toolName: 'SimpleOcrTool',
    eventName: 'copilot:ocr-prefill:purchase-invoice',
    question: 'Extract all invoice fields: vendor name, vendor tax id, vendor address (street, postal code, city, country), vendor email and phone, document number, invoice date, line items (description, quantity, unit price). Return strict JSON.',
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
        entitySpec: 'contacts/businessPartner',
        filter: 'active = true',
        preResolve: 'findBp',
        createComponent: 'CreateContactModal',
        createDocumentType: 'purchase',
        // Keys are CreateContactModal form field ids, values are extracted
        // payload keys. Everything declared here lands in the create-contact
        // popup, so the user does not retype what the OCR already read
        // (ETP-4855 Error 1). `country` is matched from its printed label
        // against the country selector; the rest is free text.
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
        entitySpec: 'tax/tax',
        preResolve: 'findTax',
        emptyOptionLabel: 'ocrLinesTaxDefault',
        searchPlaceholder: 'ocrLinesTaxSearch',
        noMatchesLabel: 'ocrLinesTaxNoMatches',
        clearLabel: 'ocrLinesTaxClear',
        width: 'w-48',
      },
    ],
    // Header-level fields no review-modal row surfaces, but which pre-fill the
    // create-contact popup via `createPrefilledFrom` above. Fed into the LLM
    // output schema by buildOcrSchema. Every description names the *issuer* to
    // keep the model from picking up the recipient's address block, which on a
    // purchase invoice is our own organisation.
    extraHeaderFields: [
      {
        name: 'vendor_address',
        kind: 'text',
        description: "Street address of the party issuing the invoice (the supplier): street name and number only. Exclude postal code, city and country. Null if not printed.",
      },
      {
        name: 'vendor_postal_code',
        kind: 'text',
        description: 'Postal code of the issuing party address, exactly as printed. Null if not printed.',
      },
      {
        name: 'vendor_city',
        kind: 'text',
        description: 'City or town of the issuing party address. Null if not printed.',
      },
      {
        name: 'vendor_country',
        kind: 'text',
        description: "Country of the issuing party address, as printed (e.g. 'España'). Null if not printed — do not infer it from the currency or language.",
      },
      {
        name: 'vendor_email',
        kind: 'text',
        description: 'Email address of the issuing party. Null if not printed.',
      },
      {
        name: 'vendor_phone',
        kind: 'text',
        description: 'Telephone number of the issuing party. Null if not printed.',
      },
    ],
    // Line-level fields the descriptor needs but the review modal doesn't
    // surface. Fed into the LLM output schema by buildOcrSchema.
    extraLineFields: [
      {
        name: 'tax_rate',
        kind: 'number',
        description: "Numeric tax percentage on this line if printed (e.g., 21.0 for '21%' or 'IVA 21%'). Null if only a textual label is shown or no tax info is present.",
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
