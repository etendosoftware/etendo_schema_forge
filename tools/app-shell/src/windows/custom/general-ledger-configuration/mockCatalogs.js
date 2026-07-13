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

import contract from '@generated/general-ledger-configuration/contract.json';

// Fixed display order for the Defaults tab's account-selector groups. 'other'
// is the catch-all for any editable field with no curated `section` in
// decisions.json (currently: disposalGain, disposalLoss — see
// docs/superpowers/specs/2026-07-07-glc-defaults-ad-driven-grouping-design.md).
const DEFAULTS_SECTION_ORDER = [
  'bank', 'diario', 'contacts', 'taxes', 'product', 'assets', 'project', 'warehouse', 'other',
];

/**
 * Derives the Defaults tab's grouped field list from the window's generated
 * contract (`frontendContract.entities['Valores por defecto'].fields` in
 * `artifacts/general-ledger-configuration/contract.json`). This is what
 * makes AD_Field.IsActive/IsDisplayed/AD_FieldGroup changes take effect via
 * `make regen` instead of a hand-edit — see the design doc referenced above.
 *
 * @param {Array<{apiKey: string, visibility: string, required?: boolean, label: string, section?: string}>} contractFields
 * @returns {Array<{section: string, fields: Array<{key: string, required: boolean, fallbackLabel: string}>}>}
 */
export function buildDefaultsGroups(contractFields) {
  const bySection = new Map();
  for (const field of contractFields) {
    if (field.visibility !== 'editable') continue;
    const section = field.section || 'other';
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section).push({
      key: field.apiKey,
      required: Boolean(field.required),
      fallbackLabel: field.label,
    });
  }
  return DEFAULTS_SECTION_ORDER
    .filter((section) => bySection.has(section))
    .map((section) => ({ section, fields: bySection.get(section) }));
}

/**
 * Resolves a Defaults-tab field's label: prefers the curated `glc.acct.<key>`
 * i18n entry; falls back to the field's raw AD label (from contract.json)
 * for a field nobody has translated yet, so a brand-new AD field renders
 * something functional instead of a raw i18n key.
 *
 * @param {{genericLabels?: Record<string,string>}|null|undefined} dictionary
 * @param {string} apiKey
 * @param {string|undefined} fallbackLabel
 * @returns {string}
 */
export function resolveFieldLabel(dictionary, apiKey, fallbackLabel) {
  const key = `glc.acct.${apiKey}`;
  return dictionary?.genericLabels?.[key] ?? fallbackLabel ?? key;
}

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
export const GENERAL_SEED = {
  name: 'Contabilidad España — EUR',
  gAAP: 'SA',
  accrual: true, // IsAccrual=true ⇒ Devengo
  description: '',
  currency: 'EUR',
  allowNegative: false, // Allownegative=N ⇒ toggle OFF
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
  tDueTransAcct: 'acc-4770',
  tCreditTransAcct: 'acc-4720',
  // Producto
  fixedAsset: 'acc-213',
  productExpense: 'acc-600',
  productDeferredExpense: 'acc-480',
  productRevenue: 'acc-700',
  productDeferredRevenue: 'acc-485',
  productCOGS: 'acc-610',
  invoicePriceVariance: 'acc-602',
  productRevenueReturn: 'acc-708',
  productCOGSReturn: 'acc-608',
  depreciation: 'acc-681',
  accumulatedDepreciation: 'acc-281',
  disposalGain: 'acc-771',
  disposalLoss: 'acc-671',
  // Proyecto
  projectAsset: null,
  // Almacén
  warehouseDifferences: 'acc-659',
  inventoryRevaluation: 'acc-298',
  workInProgress: 'acc-340',
  // Banco
  bankInterestRevenue: null,
  bankInterestExpense: null,
  bankUnidentifiedReceipts: null,
  unallocatedCash: null,
  bankSettlementGain: null,
  bankSettlementLoss: null,
  cashBookExpense: null,
  cashBookReceipt: null,
  paymentSelection: null,
};

// DEFAULTS_GROUPS is derived from contract.json, not hand-typed — see
// buildDefaultsGroups() above and
// docs/superpowers/specs/2026-07-07-glc-defaults-ad-driven-grouping-design.md.
export const DEFAULTS_GROUPS = buildDefaultsGroups(
  contract.frontendContract.entities['Valores por defecto'].fields,
);

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

// ── Seed record: Cuentas generales (C_AcctSchema_GL, single row) ─────────────
export const GENERAL_ACCOUNTS_SEED = {
  suspenseBalancingUse: false,
  suspenseBalancing: null,
  suspenseErrorUse: false,
  currencyBalancingUse: false,
  currencyBalancingAcct: null,
  retainedEarning: null,
  incomeSummary: null,
  cFSOrderAccount: null,
  active: true,
  createClosing: true,
};

export const GLC_SEED_PAYLOAD = {
  general: GENERAL_SEED,
  defaults: DEFAULTS_SEED,
  dimensions: DIMENSIONS_SEED,
  orgInfo: ORG_INFO_SEED,
  generalAccounts: GENERAL_ACCOUNTS_SEED,
  catalogs: {
    accounts: ACCOUNT_OPTIONS,
    currencies: CURRENCY_OPTIONS,
  },
  meta: {
    source: 'mock',
  },
};
