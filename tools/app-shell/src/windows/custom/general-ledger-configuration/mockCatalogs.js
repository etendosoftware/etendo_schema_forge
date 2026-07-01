/**
 * Mock catalogs + seed records for the General Ledger Configuration window.
 *
 * The NEO backend for window 125 is GREENFIELD (no ETGO_SF_SPEC yet — see
 * docs/plans/santo_4246_plan_status.md, Phase 3). Until the spec + NeoHandler
 * land, the window renders and interacts against these mocks so the UI can be
 * built and reviewed locally. Phase 3 replaces `loadConfig()` in
 * useGeneralLedgerConfig.js with real `useApiFetch` reads/writes; the shapes
 * here mirror the contract entities (see artifacts/general-ledger-configuration/
 * contract.json) so swapping the data source is mechanical.
 */

// Account combinations (C_ValidCombination) — code + name, reused by every
// AccountBadgeSelect in the "Valores por defecto" tab.
export const ACCOUNT_OPTIONS = [
  { id: 'acc-572', code: '572', name: 'Bancos c/c' },
  { id: 'acc-5723', code: '5723', name: 'Bancos, cuenta puente' },
  { id: 'acc-626', code: '626', name: 'Servicios bancarios' },
  { id: 'acc-662', code: '662', name: 'Intereses de deudas' },
  { id: 'acc-769', code: '769', name: 'Otros ingresos financieros' },
  { id: 'acc-570', code: '570', name: 'Caja, euros' },
  { id: 'acc-678', code: '678', name: 'Gastos excepcionales' },
  { id: 'acc-430', code: '430', name: 'Clientes' },
  { id: 'acc-438', code: '438', name: 'Anticipos de clientes' },
  { id: 'acc-400', code: '400', name: 'Proveedores' },
  { id: 'acc-407', code: '407', name: 'Anticipos a proveedores' },
  { id: 'acc-650', code: '650', name: 'Pérdidas de créditos comerciales' },
  { id: 'acc-794', code: '794', name: 'Reversión del deterioro de créditos' },
  { id: 'acc-436', code: '436', name: 'Clientes de dudoso cobro' },
  { id: 'acc-490', code: '490', name: 'Deterioro de valor de créditos' },
  { id: 'acc-4309', code: '4309', name: 'Recepciones pendientes de facturar' },
  { id: 'acc-477', code: '477', name: 'H.P. IVA repercutido' },
  { id: 'acc-472', code: '472', name: 'H.P. IVA soportado' },
  { id: 'acc-631', code: '631', name: 'Otros tributos' },
  { id: 'acc-4770', code: '4770', name: 'IVA repercutido transitorio' },
  { id: 'acc-4720', code: '4720', name: 'IVA soportado transitorio' },
  { id: 'acc-213', code: '213', name: 'Maquinaria' },
  { id: 'acc-600', code: '600', name: 'Compras de mercaderías' },
  { id: 'acc-480', code: '480', name: 'Gastos anticipados' },
  { id: 'acc-700', code: '700', name: 'Ventas de mercaderías' },
  { id: 'acc-485', code: '485', name: 'Ingresos anticipados' },
  { id: 'acc-610', code: '610', name: 'Variación de existencias' },
  { id: 'acc-602', code: '602', name: 'Variación de precio en compras' },
  { id: 'acc-708', code: '708', name: 'Devoluciones de ventas' },
  { id: 'acc-608', code: '608', name: 'Devoluciones de compras' },
  { id: 'acc-659', code: '659', name: 'Diferencias de inventario' },
  { id: 'acc-298', code: '298', name: 'Revalorización de existencias' },
  { id: 'acc-340', code: '340', name: 'Productos en curso' },
  { id: 'acc-681', code: '681', name: 'Amortización del inmovilizado material' },
  { id: 'acc-281', code: '281', name: 'Amortización acumulada del inmovilizado' },
  { id: 'acc-771', code: '771', name: 'Beneficios de inmovilizado material' },
  { id: 'acc-671', code: '671', name: 'Pérdidas de inmovilizado material' },
];

export const CURRENCY_OPTIONS = [
  { value: 'EUR', name: 'EUR — Euro' },
  { value: 'USD', name: 'USD — US Dollar' },
  { value: 'GBP', name: 'GBP — Pound Sterling' },
];

export const ORGANIZATION_OPTIONS = [
  { value: '0', name: '* — Todas las organizaciones' },
  { value: 'ES', name: 'España S.A.' },
];

// gAAP enum values come straight from the contract (enumValues). Mirrored here
// so the select renders without a backend.
export const GAAP_OPTIONS = [
  { value: 'SA', name: 'Spanish Accounting Standard' },
  { value: 'IF', name: 'IFRS' },
  { value: 'FR', name: 'French Accounting Standard' },
  { value: 'DE', name: 'German HGB' },
  { value: 'US', name: 'US GAAP' },
  { value: 'XX', name: 'Custom' },
  { value: 'OT', name: 'Other' },
];

// ── Seed record: General (C_AcctSchema, single row) ──────────────────────────
// `automaticPeriodControl` is the RAW AD value (AutoPeriodControl). The "Asientos
// en periodos cerrados" toggle is bound INVERTED in the UI (see GeneralTab).
export const GENERAL_SEED = {
  name: 'Contabilidad España — EUR',
  gAAP: 'SA',
  accrual: true, // IsAccrual=true ⇒ Devengo
  description: '',
  currency: 'EUR',
  automaticPeriodControl: true, // AutoPeriodControl=Y ⇒ posting in closed periods OFF
};

// Offline fallback for the read-only org-scoped values (fiscal calendar +
// organization label). At runtime these are sourced by the aggregate handler
// (GeneralLedgerConfigurationHandler.buildOrgInfo — the org's calendar + name);
// this seed is only used when NEO is unreachable. Always rendered read-only.
export const ORG_INFO_SEED = {
  fiscalCalendar: 'Ejercicio 2026 · Ene–Dic',
  organization: '* — Todas las organizaciones',
};

// ── Seed record: Valores por defecto (C_AcctSchema_Default, single row) ──────
export const DEFAULTS_SEED = {
  // Tesorería y banco
  bankAsset: 'acc-572',
  bankInTransit: 'acc-5723',
  bankExpense: 'acc-626',
  bankRevaluationGain: 'acc-769',
  bankRevaluationLoss: 'acc-662',
  cashBookAsset: 'acc-570',
  cashBookDifferences: 'acc-678',
  cashTransfer: 'acc-5723',
  // Clientes y proveedores
  customerReceivablesNo: 'acc-430',
  customerPrepayment: 'acc-438',
  vendorLiability: 'acc-400',
  vendorPrepayment: 'acc-407',
  writeoff: 'acc-650',
  writeoffRevenue: 'acc-794',
  nonInvoicedReceipts: 'acc-4309',
  doubtfulDebtAccount: 'acc-436',
  badDebtExpenseAccount: 'acc-650',
  badDebtRevenueAccount: 'acc-794',
  allowanceForDoubtfulDebtAccount: 'acc-490',
  // Impuestos
  taxDue: 'acc-477',
  taxCredit: 'acc-472',
  taxExpense: 'acc-631',
  // Otras cuentas
  tDueTransAcct: 'acc-4770',
  tCreditTransAcct: 'acc-4720',
  fixedAsset: 'acc-213',
  productExpense: 'acc-600',
  productDeferredExpense: 'acc-480',
  productRevenue: 'acc-700',
  productDeferredRevenue: 'acc-485',
  productCOGS: 'acc-610',
  invoicePriceVariance: 'acc-602',
  productRevenueReturn: 'acc-708',
  productCOGSReturn: 'acc-608',
  warehouseDifferences: 'acc-659',
  inventoryRevaluation: 'acc-298',
  workInProgress: 'acc-340',
  depreciation: 'acc-681',
  accumulatedDepreciation: 'acc-281',
  disposalGain: 'acc-771',
  disposalLoss: 'acc-671',
};

// Field → i18n-label-key + required, grouped by section. Drives the Defaults tab.
export const DEFAULTS_GROUPS = [
  {
    section: 'treasury',
    fields: [
      { key: 'bankAsset', required: true },
      { key: 'bankInTransit', required: true },
      { key: 'bankExpense', required: false },
      { key: 'bankRevaluationGain', required: false },
      { key: 'bankRevaluationLoss', required: false },
      { key: 'cashBookAsset', required: false },
      { key: 'cashBookDifferences', required: false },
      { key: 'cashTransfer', required: false },
    ],
  },
  {
    section: 'receivablesPayables',
    fields: [
      { key: 'customerReceivablesNo', required: true },
      { key: 'vendorLiability', required: true },
      { key: 'customerPrepayment', required: false },
      { key: 'vendorPrepayment', required: false },
      { key: 'writeoff', required: false },
      { key: 'writeoffRevenue', required: false },
      { key: 'nonInvoicedReceipts', required: false },
      { key: 'doubtfulDebtAccount', required: false },
      { key: 'badDebtExpenseAccount', required: false },
      { key: 'badDebtRevenueAccount', required: false },
      { key: 'allowanceForDoubtfulDebtAccount', required: false },
    ],
  },
  {
    section: 'taxes',
    fields: [
      { key: 'taxDue', required: true },
      { key: 'taxCredit', required: true },
      { key: 'taxExpense', required: false },
    ],
  },
  {
    section: 'other',
    fields: [
      { key: 'tDueTransAcct', required: false },
      { key: 'tCreditTransAcct', required: false },
      { key: 'fixedAsset', required: false },
      { key: 'productExpense', required: false },
      { key: 'productDeferredExpense', required: false },
      { key: 'productRevenue', required: false },
      { key: 'productDeferredRevenue', required: false },
      { key: 'productCOGS', required: false },
      { key: 'invoicePriceVariance', required: false },
      { key: 'productRevenueReturn', required: false },
      { key: 'productCOGSReturn', required: false },
      { key: 'warehouseDifferences', required: false },
      { key: 'inventoryRevaluation', required: false },
      { key: 'workInProgress', required: false },
      { key: 'depreciation', required: false },
      { key: 'accumulatedDepreciation', required: false },
      { key: 'disposalGain', required: false },
      { key: 'disposalLoss', required: false },
    ],
  },
];

// ── Seed records: Dimensiones (C_AcctSchema_Element, one row per dimension) ───
// `active` = IsActive toggle; `mandatory` = IsMandatory; `scope` = i18n key for
// the sub-caption.
export const DIMENSIONS_SEED = [
  { id: 'dim-cc', labelKey: 'glc.dim.costCenter', active: true, mandatory: true, caption: 'Obligatorio · Facturas y asientos' },
  { id: 'dim-pr', labelKey: 'glc.dim.product', active: true, mandatory: false, caption: 'Opcional · Ventas y compras' },
  { id: 'dim-pj', labelKey: 'glc.dim.project', active: true, mandatory: false, caption: 'Opcional · Todos los documentos' },
  { id: 'dim-mc', labelKey: 'glc.dim.campaign', active: false, mandatory: false, caption: 'Opcional · Ventas y compras' },
  { id: 'dim-as', labelKey: 'glc.dim.fixedAsset', active: false, mandatory: false, caption: 'Opcional · Todos los documentos' },
  { id: 'dim-sr', labelKey: 'glc.dim.salesRegion', active: false, mandatory: false, caption: 'Opcional · Ventas y compras' },
];

// ── Seed records: Documentos (C_AcctSchema_Table_DocType, read-only) ─────────
// `accountId` → ACCOUNT_OPTIONS (badge), or `journalKey` → plain journal label
// (no code badge). Status is always "Mapeado" in the mock.
export const DOCUMENTS_SEED = [
  { id: 'doc-arc', typeKey: 'glc.doc.salesInvoice', accountId: 'acc-700' },
  { id: 'doc-api', typeKey: 'glc.doc.purchaseInvoice', accountId: 'acc-600' },
  { id: 'doc-arn', typeKey: 'glc.doc.salesCreditMemo', accountId: 'acc-708' },
  { id: 'doc-apn', typeKey: 'glc.doc.purchaseCreditMemo', accountId: 'acc-608' },
  { id: 'doc-arr', typeKey: 'glc.doc.receipt', accountId: 'acc-572' },
  { id: 'doc-app', typeKey: 'glc.doc.payment', accountId: 'acc-572' },
  { id: 'doc-glj', typeKey: 'glc.doc.manualJournal', journalKey: 'glc.doc.generalJournal' },
  { id: 'doc-amz', typeKey: 'glc.doc.depreciation', accountId: 'acc-681' },
];

export const accountById = (id) => ACCOUNT_OPTIONS.find((a) => a.id === id) ?? null;

export const GLC_SEED_PAYLOAD = {
  general: GENERAL_SEED,
  defaults: DEFAULTS_SEED,
  dimensions: DIMENSIONS_SEED,
  documents: DOCUMENTS_SEED,
  orgInfo: ORG_INFO_SEED,
  catalogs: {
    accounts: ACCOUNT_OPTIONS,
    currencies: CURRENCY_OPTIONS,
  },
  meta: {
    source: 'mock',
    documentsBacked: false,
    documentsNote: 'Document mappings are not backed in the current dataset.',
  },
};
