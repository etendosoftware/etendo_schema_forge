/**
 * Registry of "create a new record from inside a lookup" targets.
 *
 * Sibling of `lookupDrawers.js` and deliberately shaped like it: a plain map plus a
 * resolver, so adding a second creatable entity later is a new entry here rather than
 * new branching inside the drawer.
 *
 * Everything the resolver needs is derived from the `selectorUrl` the drawer already
 * receives, which is why NONE of the three lookup trigger components
 * (`DataTable.LookupField`, `InlineLinesPanel.LookupTrigger`, `EntityForm.LookupFormField`)
 * had to be touched to wire this feature up. A selector URL is always
 *
 *     {neoBaseUrl}/{spec}/{entity}/selectors/{column}
 *
 * e.g. `/sws/neo/sales-order/lines/selectors/product`, so the document's spec and the
 * NEO root both fall out of one parse. `productSelectorDrawerShared.useProductImages`
 * already relies on the same shape to build its image URL.
 */

/**
 * Documents that offer "create product" on their line product selector.
 *
 * This list IS the scope switch — greppable in one place. It is deliberately an
 * allowlist rather than "every window using the default product drawer": ~10 other
 * specs share that drawer (requisition, physical inventory, cost adjustment, return to
 * vendor…), and the goods-movements / internal-consumption LINE FORMS reach it too,
 * because `EntityForm.LookupFormField` hardcodes `ProductSearchDrawer` instead of
 * honouring `lookupDrawer`. That inconsistency is a separate ticket; the allowlist
 * keeps us safe from it in the meantime.
 */
export const CREATE_PRODUCT_SPECS = new Set([
  'sales-quotation',
  'sales-order',
  'purchase-order',
  'sales-invoice',
  'purchase-invoice',
  'goods-shipment',
  'goods-receipt',
]);

/**
 * Seed values for a new Business Partner created from a document's Contacto selector.
 *
 * The customer/vendor flag is not cosmetic and is the reason this seed exists at all: a
 * contact created from a purchase invoice that is not flagged `vendor` never comes back in
 * a purchase selector, so the user creates it, uses it once, and cannot find it again. The
 * hand-rolled modal this replaced carried the same rule as its `documentType` prop.
 *
 * Keys are the NEO `businessPartner` field names, verified against the POST payload the old
 * `CreateContactModal.handleSave` built — `name`, `customer`, `vendor`.
 */
export function buildContactSeed(query, { documentType } = {}) {
  const name = String(query ?? '').trim();
  return {
    ...(name && { name }),
    ...(documentType === 'purchase' && { vendor: true }),
    ...(documentType === 'sale' && { customer: true }),
  };
}

/**
 * The caption a caller shows for the contact that was just created.
 *
 * `name` holds the razón social and is what a COMPANY carries. A PERSON is stored as
 * `etgoFirstname`/`etgoLastname` and may have an empty `name`, so reading `name` alone would
 * put a blank label in the document's Contacto field while the record itself is fine.
 */
export function resolveContactName(record) {
  const parts = [record?.etgoFirstname, record?.etgoLastname].filter(Boolean).join(' ').trim();
  return record?.name || parts || record?._identifier || '';
}

export const LOOKUP_CREATE_TARGETS = {
  /**
   * Contacts (ETP-5332). Unlike `product` below, this target is NOT resolved from a selector
   * URL: the Contacto affordance predates the drawer pattern and is wired through
   * `CreateContactContext` -> `EntityForm.SearchSelectField` -> `useCreateContactModal`, which
   * already knows the contacts API base and the document's sale/purchase nature. So there is
   * no `allowedSpecs` here and `resolveLookupCreateTarget` never returns it — the hook spreads
   * it with its own `apiBaseUrl` instead.
   */
  contact: {
    key: 'contacts',
    // NEO entity under the `contacts` spec: the POST target and the base its FK selectors
    // resolve against. The spec is `contacts`, the entity is `businessPartner` (C_BPartner).
    entity: 'businessPartner',
    ctaKey: 'createContact',
    titleKey: 'newContact',
    errorKey: 'createContactError',
    windowHintKey: 'createContactWindowHint',
    // The popup IS the Contacts window: same Persona/Empresa toggle, same General/Financiero
    // tabs, same Persona / Cuenta Bancaria / Dirección / Contabilidad child tabs. Mounting it
    // is what makes the drift this ticket removes structurally impossible to reintroduce.
    windowName: 'contacts',
    // The record is seconds old and only exists because the popup just created it — Cancel or
    // the dialog's X already mean "discard it". `/contacts` itself is untouched: this prop is
    // forwarded by RecordCreateModal only, never baked into the window's own decisions.json.
    hideDeleteButton: true,
    // 1152px instead of the 1280px default. Measured: 1280px reads as a comfortable 67% of an
    // external monitor but ~87% of a laptop screen, and this form does not need the room —
    // four header fields in two rows.
    //
    // 1152 and not less, established empirically: at 1024px the SECONDARY TAB STRIP wraps to
    // two lines (Bank Account / Customer Accounting / Vendor Accounting each break), which
    // costs more height than the narrower box saves. The tab strip binds before the field grid
    // does — and the grid has its own floor anyway, being `grid-cols-2 md:grid-cols-4` against
    // the VIEWPORT (no container queries in this repo), so narrowing never reflows 4 columns
    // down to 2, it only squeezes them.
    dialogMaxWidthClass: 'max-w-6xl',
    // 8px, uniform, instead of the dialog's default 24px (p-6). Requested directly against a
    // screenshot: with the tighter width above, 24px on all four edges read as wasted frame
    // around a form that is already snug. This is the DIALOG's own outer frame — do not
    // confuse it with `titlePaddingClass` below, a separate, narrower request scoped to just
    // the title row.
    dialogPaddingClass: 'p-2',
    // 4px instead of the default 16px (mt-4) between the "Nuevo contacto" title and the
    // embedded window below it — also requested directly against a screenshot.
    windowTopMarginClass: 'mt-1',
    // text-lg (18px) instead of the dialog's default text-xl (20px) — requested directly
    // against a screenshot as too large now that the surrounding chrome has shrunk to match it.
    titleSizeClass: 'text-lg',
    // 8px left/right, 0 top/bottom on the DialogHeader specifically (the row holding just the
    // title) — NOT the whole dialog's own padding above, which stays uniform. Applied here
    // because `dialogPaddingClass` already gives the header 8px on every side from its parent;
    // this sits on top of that, so `py-0` here does not zero out the header's actual distance
    // from the dialog's top edge.
    titlePaddingClass: 'px-2 py-0',
    // mt-0 instead of the default mt-4 (16px) above the "Completado" footer row —
    // also requested directly against a screenshot.
    finishRowMarginClass: 'mt-0',
    // 66vh instead of 72vh. Modest on purpose: at 60vh the child tab's "+ Add Person" button
    // was clipped off the bottom. The real height win is not this number — it is dropping the
    // period button and summary widget from the embedded window (see ContactsWindow), which
    // are chrome a create popup has no use for.
    windowHeight: '66vh',
    loadWindow: () => import('@/windows/custom/contacts/index.jsx'),
    // Dormant fallback, used only if the window module fails to load. Header fields only —
    // it cannot create the address/person/bank rows the window's child tabs do.
    loadForm: () => import('@generated/contacts/generated/web/contacts/BusinessPartnerForm.jsx'),
    loadLabels: () => import('@generated/contacts/generated/web/contacts/labels.js'),
    prefill: query => buildContactSeed(query),
  },
  product: {
    key: 'product',
    windowHintKey: 'createProductWindowHint',
    // NEO entity under the `product` spec — both the POST target and the base the
    // generated form's FK selectors resolve against.
    entity: 'product',
    ctaKey: 'createProduct',
    titleKey: 'createProductTitle',
    errorKey: 'createProductError',
    allowedSpecs: CREATE_PRODUCT_SPECS,
    // Prefill the name with whatever the user typed in the drawer's search box.
    prefill: (query) => (query ? { name: query } : {}),
    // Lazy so the product artifact is its own chunk: a document window must not pay for
    // the Products form unless the user actually opens the create popup. Imports
    // ProductForm.jsx ONLY — never ProductPage.jsx, which would drag DetailView (236 KB),
    // ListView, the gallery and the sidebar into every document bundle.
    loadForm: () => import('@generated/product/generated/web/product/ProductForm.jsx'),
    // The per-window field-label slice (ETP-4300). `WindowLoader` loads the slice of the
    // window being ROUTED to, so inside a sales invoice the dictionary holds the invoice's
    // columns and none of the product-only ones — `ProductType`, `C_UOM_ID`,
    // `C_TaxCategory_ID`… would fall back to the raw English AD label while `Name` and
    // `Description` happened to resolve, giving a half-translated form. The modal loads
    // this slice and re-provides the dictionary for its own subtree, exactly like
    // WindowLoader does for a window.
    loadLabels: () => import('@generated/product/generated/web/product/labels.js'),
    // Mirrors `window.labelOverrides` in artifacts/product/decisions.json, which the
    // generator emits into ProductPage.jsx as `api.labelOverrides`. Copied here rather
    // than imported because that module pulls DetailView, ListView, the sidebar, the
    // price bar and the gallery — a disproportionate bundle for a handful of strings. KEEP
    // IN SYNC with decisions.json: without it the popup says "Identificador" / "Categoría
    // del producto" / "Tipo de producto" where the Products window says "Código" /
    // "Categoría" / "Tipo". A drift test compares the two and names this file when they
    // diverge, which is how ETP-5245's DateFrom/DateTo additions were caught.
    labelOverrides: {
      en_US: {
        M_Product_Category_ID: 'Category', ProductType: 'Type',
        DateFrom: 'Start Date', DateTo: 'Expiry Date',
      },
      es_ES: {
        M_Product_Category_ID: 'Categoría', ProductType: 'Tipo', Value: 'Código',
        DateFrom: 'Fecha de inicio', DateTo: 'Fecha de expiración',
      },
      es_AR: { DateFrom: 'Fecha de inicio', DateTo: 'Fecha de expiración' },
    },
    // Mirrors `window.primaryTabs` in decisions.json (key and label verbatim, so the menu
    // dictionary translates them exactly as the window does), plus the EntityForm section
    // each tab renders. The popup reproduces the window's split rather than showing one
    // long scroll. `other` cannot be dropped: `taxCategory` lives there, is required, and
    // has no static default.
    tabs: [
      { key: 'general', label: 'General', section: 'principal' },
      { key: 'additionalInfo', label: 'Additional Info', section: 'other' },
    ],
    // The Products window renders its primary tabs with `primaryTabsVariant="pill"`.
    tabsVariant: 'pill',
    /**
     * Tabs shown AFTER the record is saved, mirroring the `customTabs` ProductPage hands
     * to DetailView (same components, same extra props) so the popup's second phase is the
     * window's own panels rather than a lookalike.
     *
     * They cannot exist before the POST: `ProductPriceBar` derives `recordId` from
     * `data?.id` and reads `/price?parentId=<id>`, and attachments need a record to attach
     * to. That constraint is what makes the popup two-phase.
     *
     * The window's other two tabs, Accounting and Costing, are deliberately absent: both
     * are `secondaryTabs` entries rather than custom panels, so rendering either means
     * recreating DetailView's per-tab useEntity machinery (`SecondaryTableTab` takes
     * `hook`, `secondaryHooks`, `addingSecondaryLine`…). Accounting is additionally gated
     * behind the `showAccountingFields` capability. Costing arrived with ETP-5245 and
     * settled a question this file used to leave open: a self-contained custom panel could
     * have joined phase 2 the way Price did — a `secondaryTabs` entry cannot. Tracked as
     * debt.
     */
    /**
     * Banner shown above the phase-2 panels, reusing the window's own component rather
     * than restating its rule: `ProductCostBanner` takes the record and decides for
     * itself, reading the `isProductMissingRequiredCost` predicate, so the popup and the
     * window can never disagree about when to warn. Advisory only — the save-block that
     * predicate once fed was removed, so a product with no cost saves normally.
     *
     * It only works because phase 2 re-reads the record after the POST: the predicate
     * keys off `etgoHasCost`, which the backend emits on a single-record GET and not on
     * the create response, and it deliberately treats an absent flag as "has a cost".
     */
    loadBanner: () => import('@/windows/custom/product/ProductCostBanner.jsx'),
    /**
     * Phase 2 rendered as the WINDOW ITSELF rather than a selection of its panels — the
     * only shape that delivers Cost and Accounting, whose renderer is welded to
     * DetailView's own child hooks and cannot be mounted standalone.
     *
     * Two things make it survivable: a MemoryRouter, so the window's many `navigate()`
     * calls stay inside the dialog instead of moving the document underneath, and an
     * error boundary, because a window is a large component never written to run in a
     * dialog and an uncaught throw here takes the whole app down.
     */
    // The module `windows/registry.js` mounts for this spec — the CUSTOM overlay, not the
    // generated index: Products ships its own wrapper (custom table, icons), and importing
    // the generated one would render a different window from the one the user knows.
    loadWindow: () => import('@/windows/custom/product/index.jsx'),
    windowName: 'product',
    loadPostCreateTabs: () => Promise.all([
      import('@/windows/custom/product/ProductPriceBar.jsx'),
      import('@/components/attachments'),
    ]).then(([priceMod, attachmentsMod]) => ([
      { key: 'pricing', labelKey: 'price', Component: priceMod.default },
      {
        key: 'attachments',
        labelKey: 'attachments',
        Component: attachmentsMod.AttachmentsTab,
        props: { tableName: 'M_Product', config: {} },
      },
    ])),
    // ProductForm's own default; keeps the field grid identical to the window's.
    cols: 3,
  },
};

/**
 * Splits `{neoBaseUrl}/{spec}/{entity}/selectors/{column}` into its parts.
 * Returns null when the URL does not have that shape (or is empty).
 */
export function parseSelectorUrl(selectorUrl) {
  const match = /^(.*)\/([^/]+)\/([^/]+)\/selectors\/([^/?#]+)/.exec(selectorUrl || '');
  if (!match) return null;
  return { neoBaseUrl: match[1], spec: match[2], entity: match[3], column: match[4] };
}

/**
 * Resolves the create target for a product drawer, or null when the affordance must
 * not be offered.
 *
 * @param {string}  selectorUrl  - the drawer's own selector URL.
 * @param {boolean} createEnabled - passed ONLY by `ProductSearchDrawer`, never by
 *   `ProductStockSearchDrawer`. Creating a stockless product inside a picker that
 *   filters by stock would return an immediately empty result, so the stock variant
 *   opts out simply by not forwarding the flag.
 * @returns {object|null} the target plus the resolved `apiBaseUrl` for the product spec.
 */
export function resolveLookupCreateTarget({ selectorUrl, createEnabled = false }) {
  if (!createEnabled) return null;
  const parsed = parseSelectorUrl(selectorUrl);
  if (!parsed) return null;

  const target = LOOKUP_CREATE_TARGETS.product;
  if (!target.allowedSpecs.has(parsed.spec)) return null;

  return { ...target, apiBaseUrl: `${parsed.neoBaseUrl}/${target.key}` };
}
