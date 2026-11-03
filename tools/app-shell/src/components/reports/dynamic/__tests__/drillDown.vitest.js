// @covers tools/app-shell/src/components/reports/dynamic/drillDown.js
// @covers tools/app-shell/src/components/reports/reportDocumentUrl.js
import { entryDocument, entryParams, filterLedgerRows, ledgerParams, ledgerSummary, sqlDateDay } from '../drillDown.js';
import { reportDocumentUrl } from '../../reportDocumentUrl.js';

const VIEW = {
  acctSchemaId: 'S1', orgId: 'O1', dateFrom: '2026-07-01', dateTo: '2026-11-03', bPartnerId: 'B1', productId: '',
  compareTo: 'true', fromReferenceDate: '2025-07-01', toReferenceDate: '2025-11-03', showOnlyAccountsWithValue: 'true',
};

describe('drillDown', () => {
  it('the ledger: the account code as both bounds, the view filters, no comparison', () => {
    expect(ledgerParams(VIEW, { node_id: 'N700', value: '700' })).toEqual({
      acctSchemaId: 'S1', orgId: 'O1', dateFrom: '2026-07-01', dateTo: '2026-11-03', bPartnerId: 'B1', productId: '',
      fromAccountId: '700', toAccountId: '700',
    });
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

  it('opening, debit, credit and closing in debit − credit terms', () => {
    const rows = [{ amtacctdr: '50', amtacctcr: 0 }, { amtacctdr: 0, amtacctcr: 1050 }];
    expect(ledgerSummary(rows, [{ openingtotal: -150 }, { openingtotal: '-50' }])).toEqual({ opening: -200, debit: 50, credit: 1050, closing: -1200 });
    expect(ledgerSummary([], null)).toEqual({ opening: 0, debit: 0, credit: 0, closing: 0 });
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
