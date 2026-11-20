/**
 * ETP-6080 F9 — the drill-down from a Profit & Loss account: account → its ledger (General Ledger
 * `/query`) → one journal entry (Journal Entries `/query`) → the entry's document.
 */
export const LEDGER_REPORT_ID = 'report-general-ledger';
/**
 * Ledger lines loaded before the user asks for all (ETP-6080 W2). Production, Nov 2026: p99 324 and
 * max 661 lines per account and year, so the cap is hit by under 1% of account-years.
 */
export const LEDGER_LINE_CAP = 500;
export const ENTRY_REPORT_ID = 'report-journal-entries';
export const ENTRY_REQUIRED_PARAMS = Object.freeze(['orgId', 'acctSchemaId', 'factAcctGroupId']);

/**
 * The ledger of one account under the view's period and filters. `accountId` (the tree's node id,
 * a leaf account = `fact_acct.account_id`) lets the SQL use the account index instead of reading
 * the client's whole history through the account code. The code bounds are redundant with it (one
 * schema = one chart) and kept so the request still means the same to a General Ledger without `accountId`.
 * `range` (`{from, to}`, ETP-6239) replaces the view's period: the bucket of the cell clicked, or the range it was compared with.
 */
export function ledgerParams(queryParams, row, range = null, { atDate = false } = {}) {
  const { acctSchemaId, orgId, bPartnerId, productId, projectId, costCenterId, groupBy, openingEntryAmount } = queryParams;
  const dateFrom = range?.from ?? queryParams.dateFrom;
  const dateTo = range?.to ?? queryParams.dateTo;
  const params = { acctSchemaId, orgId, dateFrom, dateTo, bPartnerId, productId, projectId, costCenterId, accountId: row.node_id, fromAccountId: row.value, toAccountId: row.value };
  // ETP-6084: the Trial Balance's opening-entry toggle travels, so the ledger's opening matches the clicked cell.
  if (openingEntryAmount !== undefined) params.openingEntryAmount = openingEntryAmount;
  // ETP-6083: the ledger of a balance AT A DATE counts the opening entry too, so its closing is the amount clicked.
  if (atDate) params.openingEntryAmount = 'true';
  // A dimension row narrows the ledger to its own contact / product / project / cost centre.
  const dimensionParam = DIMENSION_PARAMS[groupBy];
  if (row.isDimension && row.dimension_id && dimensionParam) params[dimensionParam] = row.dimension_id;
  // ETP-6083: a folded row reads its hidden accounts as a code range (no single account id).
  if (row.foldedRange) Object.assign(params, { accountId: '', fromAccountId: row.foldedRange.from, toAccountId: row.foldedRange.to });
  return params;
}

/** The report's `groupBy` value → the General Ledger parameter that filters by that dimension. */
export const DIMENSION_PARAMS = Object.freeze({ bpartner: 'bPartnerId', product: 'productId', project: 'projectId', costcenter: 'costCenterId' });

/**
 * ETP-6084: the row a drill-down opens, as the ledger reads it. A chart-tree row carries the posting account
 * as `account_id` / `account_value` (a dimension row's own `node_id` is synthetic, never an account); the P&L's
 * rows have neither, so they pass through unchanged.
 */
export function drillRowOf(row) {
  if (row.account_id == null && row.account_value == null) return row;
  return { ...row, node_id: row.account_id ?? row.node_id, value: row.account_value ?? row.value };
}

/** A row whose ledger can open: an account with no sub-accounts (dimension children don't count) or a folded row (its hidden accounts' range), or a dimension row that has a value. */
export function canDrill(row) {
  if (row.isFormula || !(row.account_value ?? row.value)) return false;
  if (row.isDimension) return Boolean(row.dimension_id);
  return !row.hasChildren || Boolean(row.hasDimensionChildren) || Boolean(row.foldedRange);
}

/**
 * One whole entry: no dates and no account or dimension filter, or the entry would lose lines and
 * stop balancing. The org stays: without it a restricted role is refused (§13).
 */
export function entryParams(queryParams, factAcctGroupId) {
  const { acctSchemaId, orgId } = queryParams;
  return { acctSchemaId, orgId, factAcctGroupId };
}

/**
 * The calendar day of a SQL `date` read through `/query`. `pg` turns it into a Date at the server's
 * local midnight and JSON sends that in UTC, so east of UTC it reads as the day before
 * ("2026-01-04T23:00:00.000Z" for 5 January in Madrid). Rounding to the nearest UTC day gives the
 * right day for any server offset under 12 hours. A plain `yyyy-MM-dd` passes through.
 */
export function sqlDateDay(raw) {
  if (!raw) return '';
  const text = String(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const time = Date.parse(text);
  if (Number.isNaN(time)) return text.slice(0, 10);
  return new Date(time + 12 * 3600 * 1000).toISOString().slice(0, 10);
}

const num = (v) => Number(v) || 0;

/**
 * Opening / debit / credit / closing of the ledger, in debit − credit terms, plus `movement`: the
 * period's debit − credit with the report row's sign (`C` flips it), so it equals the amount the
 * user clicked on. The closing never does: it carries every earlier period too. `openingSigned` / `closingSigned`
 * carry the row's sign as well (ETP-6083): for a balance AT A DATE the closing IS the amount clicked.
 */
export function ledgerSummary(rows = [], openingRows = [], sign = 'D') {
  const opening = (openingRows || []).reduce((sum, r) => sum + num(r.openingtotal), 0);
  const debit = rows.reduce((sum, r) => sum + num(r.amtacctdr), 0);
  const credit = rows.reduce((sum, r) => sum + num(r.amtacctcr), 0);
  const flip = sign === 'C' ? -1 : 1;
  const movement = (debit - credit) * flip;
  const closing = opening + debit - credit;
  return { opening, debit, credit, closing, movement: movement || 0, openingSigned: opening * flip || 0, closingSigned: closing * flip || 0 };
}

const SEARCHED_FIELDS = ['groupbyname', 'bpname', 'productname', 'projectname', 'costcentername'];

/** The loaded ledger lines whose description, dimensions or date contain the text. */
export function filterLedgerRows(rows, text) {
  const needle = text.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((r) => [...SEARCHED_FIELDS.map((f) => r[f]), sqlDateDay(r.dateacct)]
    .some((v) => v != null && String(v).toLowerCase().includes(needle)));
}

/** The entry's document, or null when its table has no window mapped (the drill-down ends there). */
export function entryDocument(rows = []) {
  const row = rows.find((r) => r.doc_window && r.doc_record_id);
  return row
    ? { docWindow: row.doc_window, recordId: row.doc_record_id, docQueryKey: row.doc_query_key, docQueryValue: row.doc_query_value }
    : null;
}

/** Cents: the report rounds to two decimals, the ledger sums raw lines. */
export const sameAmount = (a, b) => Math.abs(num(a) - num(b)) < 0.005;

/**
 * ETP-6083: the Profit & Loss behind an income-summary result — the report's period opened from the start of the fiscal
 * year of `to` (the on-the-fly result is that year's), with the view's org and contact / product filters (ETP-6239 URL keys).
 * `basePath` is the app's (`/etendogoclean`), as the viewer's own new-tab link builds it.
 */
export const RESULT_REPORT_ID = 'profit-loss';
export function resultReportUrl({ basePath, from, to, orgId, bPartnerId, productId }) {
  const q = new URLSearchParams({ report: RESULT_REPORT_ID, category: 'finance', dateFrom: from, dateTo: to });
  for (const [key, value] of Object.entries({ orgId, bPartnerId, productId })) if (value) q.set(key, value);
  return `${basePath}/report-viewer?${q.toString()}`;
}
