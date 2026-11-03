/**
 * ETP-6080 F9 — the drill-down from a Profit & Loss account: account → its ledger (General Ledger
 * `/query`) → one journal entry (Journal Entries `/query`) → the entry's document.
 */
export const LEDGER_REPORT_ID = 'report-general-ledger';
export const ENTRY_REPORT_ID = 'report-journal-entries';
export const ENTRY_REQUIRED_PARAMS = Object.freeze(['orgId', 'acctSchemaId', 'factAcctGroupId']);

/**
 * The ledger of one account under the view's period and filters. The General Ledger compares
 * against the account code (`ev.value`), not the tree's node id, so both bounds are the row's value.
 */
export function ledgerParams(queryParams, row) {
  const { acctSchemaId, orgId, dateFrom, dateTo, bPartnerId, productId } = queryParams;
  return { acctSchemaId, orgId, dateFrom, dateTo, bPartnerId, productId, fromAccountId: row.value, toAccountId: row.value };
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

/** Opening / debit / credit / closing of the ledger, in debit − credit terms. */
export function ledgerSummary(rows = [], openingRows = []) {
  const opening = (openingRows || []).reduce((sum, r) => sum + num(r.openingtotal), 0);
  const debit = rows.reduce((sum, r) => sum + num(r.amtacctdr), 0);
  const credit = rows.reduce((sum, r) => sum + num(r.amtacctcr), 0);
  return { opening, debit, credit, closing: opening + debit - credit };
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
