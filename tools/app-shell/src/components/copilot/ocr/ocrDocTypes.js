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

// ETP-5585 — issuer / receiver parties, used to validate the invoice is addressed to the active
// organisation. Descriptions validated against real invoices; keep them verbatim.
const ISSUER_DESCRIPTION = 'The party that issued the invoice (seller/supplier): usually the letterhead, logo or sender block. NOT the customer.';
const RECEIVER_DESCRIPTION = "The party being invoiced: the buyer/customer who owes payment (labels such as Bill to, Sold to, Customer, Cliente, Client, Destinatario, Kunde, Rechnungsempfänger). It is NOT the issuer/seller (the party that emits the invoice, usually with the logo or letterhead) and NOT the Ship to / delivery address, unless Ship to is the only buyer shown. Labels may be absent: infer roles from document structure (issuer = letterhead / sender block; receiver = the other party block). Return null if the receiver is not identifiable.";
const ISSUER_TAX_ID_DESCRIPTION = 'Tax identifier of the ISSUER only, exactly as printed (keep prefix, letters, digits; do not reformat). Null if not printed.';
const RECEIVER_TAX_ID_DESCRIPTION = "Tax identifier of the RECEIVER only, exactly as printed (keep any country prefix, letters and digits; do not reformat, do not invent). It may appear far from the receiver's name, for example in a table row like 'Cliente | NIF'; use any label or row that is explicitly attached to the customer. NEVER copy the issuer's tax id here. If the only id printed for the receiver is a personal id (DNI, passport, SSN) set tax_id_type='personal_id'. If no receiver tax id is printed, return null; do not guess.";
const TAX_ID_LABEL_DESCRIPTION = "The exact label text printed with the id (e.g. 'NIF', 'CIF', 'VAT ID', 'CUIT'). Null if none.";
// Informational only: the comparison runs whatever the type is.
const TAX_ID_TYPES = ['vat', 'national_tax_id', 'company_registration', 'personal_id', 'unknown'];

function partyProperties(party) {
  const isReceiver = party === 'receiver';
  return [
    { name: 'name', kind: 'text', description: `Name of the ${party}, as printed. Null if not printed.` },
    { name: 'tax_id_raw', kind: 'text', description: isReceiver ? RECEIVER_TAX_ID_DESCRIPTION : ISSUER_TAX_ID_DESCRIPTION },
    { name: 'tax_id_label', kind: 'text', description: TAX_ID_LABEL_DESCRIPTION },
    {
      name: 'tax_id_type',
      kind: 'text',
      enum: TAX_ID_TYPES,
      description: `Kind of the ${party}'s tax identifier, as best as can be told from its format and label. Informational only. Null if there is no id.`,
    },
  ];
}

export const OCR_DOC_TYPES = [
  {
    id: 'purchase-invoice',
    // ETP-5585 — name of the pre-flight check in useOcrFlow's VALIDATORS map.
    validateExtraction: 'receiverTaxId',
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
    // output schema by buildOcrSchema. Every `vendor_*` description names the *issuer* to
    // keep the model from picking up the recipient's address block, which on a
    // purchase invoice is our own organisation. The one deliberate exception is the
    // `receiver` object below (ETP-5585): it reads that recipient block on purpose, to
    // compare its tax id with the active organisation's (see receiverTaxIdCheck.js).
    extraHeaderFields: [
      {
        name: 'issuer',
        kind: 'object',
        description: ISSUER_DESCRIPTION,
        properties: partyProperties('issuer'),
      },
      {
        name: 'receiver',
        kind: 'object',
        description: RECEIVER_DESCRIPTION,
        properties: partyProperties('receiver'),
      },
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
