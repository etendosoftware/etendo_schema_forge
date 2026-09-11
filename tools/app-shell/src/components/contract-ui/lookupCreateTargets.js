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

export const LOOKUP_CREATE_TARGETS = {
  product: {
    key: 'product',
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
    // price bar and the gallery — a disproportionate bundle for three strings. KEEP IN
    // SYNC with decisions.json: without it the popup says "Identificador" / "Categoría
    // del producto" / "Tipo de producto" where the Products window says "Código" /
    // "Categoría" / "Tipo".
    labelOverrides: {
      en_US: { M_Product_Category_ID: 'Category', ProductType: 'Type' },
      es_ES: { M_Product_Category_ID: 'Categoría', ProductType: 'Tipo', Value: 'Código' },
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
     * The window's third such tab, Accounting, is deliberately absent: it is a
     * `secondaryTabs` entry rather than a custom panel, so rendering it means recreating
     * DetailView's per-tab useEntity machinery (`SecondaryTableTab` takes `hook`,
     * `secondaryHooks`, `addingSecondaryLine`…). It is also gated behind the
     * `showAccountingFields` capability, so most users never see it. Tracked as debt.
     */
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
