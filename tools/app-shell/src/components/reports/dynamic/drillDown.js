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
export function ledgerParams(queryParams, row, range = null) {
  const { acctSchemaId, orgId, bPartnerId, productId, projectId, costCenterId, groupBy, openingEntryAmount } = queryParams;
  const dateFrom = range?.from ?? queryParams.dateFrom;
  const dateTo = range?.to ?? queryParams.dateTo;
  const params = { acctSchemaId, orgId, dateFrom, dateTo, bPartnerId, productId, projectId, costCenterId, accountId: row.node_id, fromAccountId: row.value, toAccountId: row.value };
  // ETP-6084: the Trial Balance's opening-entry toggle travels, so the ledger's opening matches the clicked cell.
  if (openingEntryAmount !== undefined) params.openingEntryAmount = openingEntryAmount;
  // A dimension row narrows the ledger to its own contact / product / project / cost centre.
  const dimensionParam = DIMENSION_PARAMS[groupBy];
  if (row.isDimension && row.dimension_id && dimensionParam) params[dimensionParam] = row.dimension_id;
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

/** A row whose ledger can open: an account with no sub-accounts (dimension children don't count), or a dimension row that has a value. */
export function canDrill(row) {
  if (row.isFormula || !(row.account_value ?? row.value)) return false;
  if (row.isDimension) return Boolean(row.dimension_id);
  return !row.hasChildren || Boolean(row.hasDimensionChildren);
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
 * user clicked on. The closing never does: it carries every earlier period too.
 */
export function ledgerSummary(rows = [], openingRows = [], sign = 'D') {
  const opening = (openingRows || []).reduce((sum, r) => sum + num(r.openingtotal), 0);
  const debit = rows.reduce((sum, r) => sum + num(r.amtacctdr), 0);
  const credit = rows.reduce((sum, r) => sum + num(r.amtacctcr), 0);
  const movement = (debit - credit) * (sign === 'C' ? -1 : 1);
  return { opening, debit, credit, closing: opening + debit - credit, movement: movement || 0 };
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
