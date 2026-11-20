// @covers tools/app-shell/src/components/reports/dynamic/drillDown.js
// @covers tools/app-shell/src/components/reports/reportDocumentUrl.js
import { canDrill, drillRowOf, entryDocument, entryParams, filterLedgerRows, ledgerParams, ledgerSummary, sqlDateDay } from '../drillDown.js';
import { reportDocumentUrl } from '../../reportDocumentUrl.js';

const VIEW = {
  acctSchemaId: 'S1', orgId: 'O1', dateFrom: '2026-07-01', dateTo: '2026-11-03', bPartnerId: 'B1', productId: '',
  compareTo: 'true', fromReferenceDate: '2025-07-01', toReferenceDate: '2025-11-03', showOnlyAccountsWithValue: 'true',
};

describe('drillDown', () => {
  it('the ledger: the account id, the code as both bounds, the view filters, no comparison', () => {
    expect(ledgerParams(VIEW, { node_id: 'N700', value: '700' })).toEqual({
      acctSchemaId: 'S1', orgId: 'O1', dateFrom: '2026-07-01', dateTo: '2026-11-03', bPartnerId: 'B1', productId: '',
      accountId: 'N700', fromAccountId: '700', toAccountId: '700',
    });
  });

  it('a cell range replaces the view period (a bucket or a compared range), the rest unchanged', () => {
    expect(ledgerParams(VIEW, { node_id: 'N700', value: '700' }, { from: '2026-02-01', to: '2026-02-28' })).toEqual({
      acctSchemaId: 'S1', orgId: 'O1', dateFrom: '2026-02-01', dateTo: '2026-02-28', bPartnerId: 'B1', productId: '',
      accountId: 'N700', fromAccountId: '700', toAccountId: '700',
    });
    expect(ledgerParams(VIEW, { node_id: 'N700', value: '700' }, null).dateFrom).toBe('2026-07-01');
  });

  it('the entry: only schema, org and the entry, so it keeps every line', () => {
    expect(entryParams(VIEW, 'G1')).toEqual({ acctSchemaId: 'S1', orgId: 'O1', factAcctGroupId: 'G1' });
  });

  it('a SQL date from pg is the server day, east or west of UTC', () => {
    expect(sqlDateDay('2026-09-14T22:00:00.000Z')).toBe('2026-09-15'); // Madrid midnight
    expect(sqlDateDay('2026-09-15T03:00:00.000Z')).toBe('2026-09-15'); // Buenos Aires midnight
    expect(sqlDateDay('2026-09-15T00:00:00.000Z')).toBe('2026-09-15'); // UTC
    expect(sqlDateDay('2026-09-15')).toBe('2026-09-15');
    expect(sqlDateDay(null)).toBe('');
  });

  it('a balance at a date counts the opening entry: openingEntryAmount true, whatever the view says', () => {
    const params = ledgerParams({ ...VIEW, openingEntryAmount: 'false' }, { node_id: 'A1', value: '4000' }, { from: '2026-01-01', to: '2026-11-03' }, { atDate: true });
    expect(params).toMatchObject({ dateFrom: '2026-01-01', dateTo: '2026-11-03', openingEntryAmount: 'true' });
  });

  it('opening, debit, credit and closing in debit − credit terms; the movement signed like the row', () => {
    const rows = [{ amtacctdr: '50', amtacctcr: 0 }, { amtacctdr: 0, amtacctcr: 1050 }];
    expect(ledgerSummary(rows, [{ openingtotal: -150 }, { openingtotal: '-50' }])).toEqual({ opening: -200, debit: 50, credit: 1050, closing: -1200, movement: -1000, openingSigned: -200, closingSigned: -1200 });
    // A credit-signed row (revenue): the movement is the amount the report shows for it.
    expect(ledgerSummary(rows, [], 'C').movement).toBe(1000);
    expect(ledgerSummary([], null)).toEqual({ opening: 0, debit: 0, credit: 0, closing: 0, movement: 0, openingSigned: 0, closingSigned: 0 });
    // ETP-6083: a credit-signed balance (liabilities) closes positive in the report's sign.
    expect(ledgerSummary(rows, [{ openingtotal: -150 }], 'C')).toMatchObject({ closing: -1150, closingSigned: 1150, openingSigned: 150 });
  });

  it('the search looks at description, dimensions and day, ignoring case', () => {
    const rows = [
      { groupbyname: 'Acme', bpname: null, dateacct: '2026-09-14T22:00:00.000Z' },
      { groupbyname: 'Pago', productname: 'Tornillo', dateacct: '2026-10-01T22:00:00.000Z' },
    ];
    expect(filterLedgerRows(rows, '  ')).toBe(rows);
    expect(filterLedgerRows(rows, 'ACME')).toEqual([rows[0]]);
    expect(filterLedgerRows(rows, 'tornillo')).toEqual([rows[1]]);
    expect(filterLedgerRows(rows, '2026-10-02')).toEqual([rows[1]]);
  });

  it('the entry document comes from the first line that maps one', () => {
    expect(entryDocument([{ doc_window: null }, { doc_window: 'financial-account', doc_record_id: 'FA1', doc_query_key: 'txn', doc_query_value: 'T1' }]))
      .toEqual({ docWindow: 'financial-account', recordId: 'FA1', docQueryKey: 'txn', docQueryValue: 'T1' });
    expect(entryDocument([{ doc_window: null, doc_record_id: 'X' }])).toBeNull();
  });
});

describe('reportDocumentUrl', () => {
  const location = { origin: 'https://go.example', pathname: '/app/reports' };
  it('opens the window next to the current page, with the optional deep-link query encoded', () => {
    expect(reportDocumentUrl({ docWindow: 'sales-invoice', recordId: 'INV1' }, location)).toBe('https://go.example/app/sales-invoice/INV1');
    expect(reportDocumentUrl({ docWindow: 'financial-account', recordId: 'FA1', docQueryKey: 'txn', docQueryValue: 'a b' }, location))
      .toBe('https://go.example/app/financial-account/FA1?txn=a%20b');
    expect(reportDocumentUrl({ docWindow: 'x', recordId: '1', docQueryKey: '', docQueryValue: 'v' }, location)).toBe('https://go.example/app/x/1');
  });
});

// ETP-6084 D7: a Trial Balance row opens its ledger.
describe('drillDown — chart-tree rows (ETP-6084)', () => {
  const TB_VIEW = { ...VIEW, projectId: 'PR1', costCenterId: 'CC1', groupBy: 'bpartner', openingEntryAmount: 'false' };

  it('a dimension row reads the account, never its synthetic id', () => {
    const row = { node_id: 'S1|B7', account_id: 'ACC1', account_value: '430', isDimension: true, dimension_id: 'B7', name: 'Acme' };
    expect(drillRowOf(row)).toMatchObject({ node_id: 'ACC1', value: '430', dimension_id: 'B7' });
    expect(drillRowOf({ node_id: 'N700', value: '700' })).toEqual({ node_id: 'N700', value: '700' }); // P&L rows pass through
  });

  it('the ledger carries project, cost centre, the opening toggle and the clicked dimension into its own param', () => {
    const params = ledgerParams(TB_VIEW, drillRowOf({ node_id: 'S1|B7', account_id: 'ACC1', account_value: '430', isDimension: true, dimension_id: 'B7' }));
    expect(params).toMatchObject({ accountId: 'ACC1', fromAccountId: '430', toAccountId: '430', projectId: 'PR1', costCenterId: 'CC1', bPartnerId: 'B7', openingEntryAmount: 'false' });
    expect(ledgerParams({ ...TB_VIEW, groupBy: 'costcenter' }, { node_id: 'A', value: '1', isDimension: true, dimension_id: 'CC9' })).toMatchObject({ costCenterId: 'CC9', bPartnerId: 'B1' });
    expect(ledgerParams(VIEW, { node_id: 'N', value: '1' })).not.toHaveProperty('openingEntryAmount'); // the P&L never sends it
  });

  it('the ledger gets the TB toggle as is, for either value and with a comparison range', () => {
    const row = { node_id: 'A', value: '430' };
    for (const v of ['true', 'false']) expect(ledgerParams({ ...TB_VIEW, openingEntryAmount: v }, row)).toHaveProperty('openingEntryAmount', v);
    expect(ledgerParams({ ...TB_VIEW, openingEntryAmount: 'true' }, row, { from: '2025-01-01', to: '2025-01-31' }))
      .toMatchObject({ openingEntryAmount: 'true', dateFrom: '2025-01-01', dateTo: '2025-01-31' });
  });

  it('canDrill: leaf accounts and dimension rows with an id; not summaries, formulas or an empty dimension', () => {
    expect(canDrill({ value: '700', hasChildren: false })).toBe(true);
    expect(canDrill({ value: '700', hasChildren: true, hasDimensionChildren: true })).toBe(true);
    expect(canDrill({ value: '70', hasChildren: true })).toBe(false);
    expect(canDrill({ value: '700', isFormula: true })).toBe(false);
    expect(canDrill({ account_value: '430', isDimension: true, dimension_id: 'B7' })).toBe(true);
    expect(canDrill({ account_value: '430', isDimension: true, dimension_id: '' })).toBe(false);
    expect(canDrill({ name: 'x' })).toBe(false);
    expect(canDrill({ value: '70', hasChildren: true, foldedRange: { from: '700', to: '709' } })).toBe(true);
  });
});
