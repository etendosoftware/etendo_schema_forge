// @covers tools/app-shell/src/components/reports/dynamic/reportUrlState.js
import { MAX_PICKER_IDS, readReportUrlState, reportOffers, reportUrlKeys, urlStateSpec, writeReportUrlState } from '../reportUrlState.js';

// The P&L's own definition (the contract's parameters), and a synthetic one that shares no
// parameter set with it: the helper must serve both with no change.
const PL = {
  parameters: [
    { name: 'orgId', type: 'search', selector: 'org', hidden: true },
    { name: 'yearId', type: 'search', selector: 'year' },
    { name: 'dateFrom', type: 'date' }, { name: 'dateTo', type: 'date' },
    { name: 'compareTo', type: 'toggle' },
    { name: 'columns', type: 'string', hidden: true },
    { name: 'bPartnerId', type: 'search', selector: 'bpartner' },
    { name: 'productId', type: 'search', selector: 'product' },
    { name: 'splitBy', type: 'string', hidden: true },
  ],
};
const SYNTHETIC = {
  parameters: [
    { name: 'acctSchemaId', type: 'search', selector: 'acctschema', hidden: true },
    { name: 'dateFrom', type: 'date' }, { name: 'dateTo', type: 'date' },
    { name: 'productId', type: 'search', selector: 'product' },
    { name: 'warehouseId', type: 'search', selector: 'warehouse' }, // no picker for it in the panel
    { name: 'hiddenProduct', type: 'search', selector: 'product', hidden: true },
  ],
};
const ORGS = ['ORG1', 'ORG2'];
const DEFAULTS = { orgId: 'ORG1', dateFrom: '2026-01-01', dateTo: '2026-11-17' };
const BASE = { orgId: 'ORG1', dateFrom: '2026-01-01', dateTo: '2026-11-17', bPartnerId: '', productId: '', compare: '', columns: 'total', splitBy: '' };

describe('reportUrlKeys / urlStateSpec', () => {
  it('derives the owned keys from each report definition', () => {
    expect(reportUrlKeys(PL)).toEqual(['orgId', 'dateFrom', 'dateTo', 'columns', 'compare', 'splitBy', 'bPartnerId', 'productId', '_display_bPartnerId', '_display_productId']);
    expect(reportUrlKeys(SYNTHETIC)).toEqual(['dateFrom', 'dateTo', 'productId', '_display_productId']);
    expect(reportUrlKeys({})).toEqual([]);
    expect(reportUrlKeys(undefined)).toEqual([]);
    expect(urlStateSpec(SYNTHETIC).pickers).toEqual([{ name: 'productId', selector: 'product' }]);
  });
});

describe('writeReportUrlState', () => {
  it('writes nothing for the defaults, and keeps other keys (report, category)', () => {
    expect(writeReportUrlState('', BASE, PL, DEFAULTS)).toBe('');
    expect(writeReportUrlState('?report=profit-loss&category=finance', BASE, PL, DEFAULTS)).toBe('?report=profit-loss&category=finance');
  });

  it('an untouched (or not yet known) period is absent; a changed one is written as a pair', () => {
    expect(writeReportUrlState('', { ...BASE, dateFrom: '', dateTo: '' }, PL, { orgId: 'ORG1' })).toBe('');
    expect(writeReportUrlState('', { ...BASE, dateFrom: '2026-10-01' }, PL, DEFAULTS)).toBe('?dateFrom=2026-10-01&dateTo=2026-11-17');
  });

  it('writes only the fields that differ, never display names, and clears a field set back to its default', () => {
    const state = { ...BASE, columns: 'month', compare: 'same-last-year', orgId: 'ORG2', splitBy: 'org', bPartnerId: 'A,B', _display_bPartnerId: 'Acme, Beta' };
    const search = writeReportUrlState('?report=profit-loss', state, PL, DEFAULTS);
    expect(Object.fromEntries(new URLSearchParams(search))).toEqual({
      report: 'profit-loss', orgId: 'ORG2', compare: 'same-last-year', columns: 'month', splitBy: 'org', bPartnerId: 'A,B',
    });
    expect(writeReportUrlState(search, BASE, PL, DEFAULTS)).toBe('?report=profit-loss');
  });

  it('a report without Columnas / comparison / org never gets those keys, whatever the state holds', () => {
    const state = { ...BASE, columns: 'month', compare: 'previous', orgId: 'ORG2', splitBy: 'org', productId: 'P1', dateFrom: '2026-03-01' };
    expect(Object.fromEntries(new URLSearchParams(writeReportUrlState('?report=x&columns=month', state, SYNTHETIC, DEFAULTS)))).toEqual({
      report: 'x', columns: 'month', dateFrom: '2026-03-01', dateTo: '2026-11-17', productId: 'P1',
    }); // `columns` is not this report's key: left exactly as found
  });
});

describe('readReportUrlState', () => {
  it('round-trips what writeReportUrlState wrote, for both definitions', () => {
    const state = { ...BASE, dateFrom: '2026-02-01', dateTo: '2026-02-28', columns: 'quarter', compare: 'previous', splitBy: 'product', productId: 'P1', orgId: 'ORG2' };
    expect(readReportUrlState(writeReportUrlState('', state, PL, DEFAULTS), PL, { orgIds: ORGS })).toEqual({
      orgId: 'ORG2', dateFrom: '2026-02-01', dateTo: '2026-02-28', columns: 'quarter', compare: 'previous', splitBy: 'product', productId: 'P1',
    });
    expect(readReportUrlState(writeReportUrlState('', state, SYNTHETIC, DEFAULTS), SYNTHETIC)).toEqual({ dateFrom: '2026-02-01', dateTo: '2026-02-28', productId: 'P1' });
  });

  it('a clean URL restores nothing', () => {
    expect(readReportUrlState('', PL)).toEqual({});
    expect(readReportUrlState('?report=profit-loss', PL)).toEqual({});
    expect(readReportUrlState(undefined, PL)).toEqual({});
  });

  it('only reads the keys of the report: a P&L link means nothing to the synthetic one', () => {
    const link = '?orgId=ORG2&columns=month&compare=previous&splitBy=org&dateFrom=2026-03-01&dateTo=2026-03-31&bPartnerId=B1&productId=P1';
    expect(readReportUrlState(link, SYNTHETIC, { orgIds: ORGS })).toEqual({ dateFrom: '2026-03-01', dateTo: '2026-03-31', productId: 'P1' });
  });

  it('drops a restored splitBy=org when the role reaches one org or none (ETP-6080)', () => {
    expect(readReportUrlState('?splitBy=org', PL, { orgIds: ['O1'] })).toEqual({});
    expect(readReportUrlState('?splitBy=org', PL)).toEqual({});
    expect(readReportUrlState('?splitBy=org', PL, { orgIds: ['O1', 'O2'] })).toEqual({ splitBy: 'org' });
    expect(readReportUrlState('?splitBy=product', PL, { orgIds: ['O1'] })).toEqual({ splitBy: 'product' });
  });

  it('ignores invalid values and falls back to the default', () => {
    const read = (q) => readReportUrlState(q, PL, { orgIds: ORGS });
    expect(read('?columns=week&compare=yesterday&splitBy=drop%20table')).toEqual({});
    expect(read('?dateFrom=2026-02-30&dateTo=2026-03-01')).toEqual({});
    expect(read('?dateFrom=2026-03-05&dateTo=2026-03-01')).toEqual({}); // reversed
    expect(read('?dateFrom=2026-03-01')).toEqual({}); // half a period
    expect(read('?dateFrom=2026-3-1&dateTo=2026-03-31')).toEqual({});
    expect(read("?bPartnerId=A,'B&productId=" + 'x'.repeat(65))).toEqual({});
    expect(read('?columns=total')).toEqual({}); // total is the default, never a restore
  });

  it('a filter holds at most MAX_PICKER_IDS ids: a longer list keeps the first ones', () => {
    const ids = Array.from({ length: 120 }, (_, i) => `ID${i}`);
    const patch = readReportUrlState(`?bPartnerId=${ids.join(',')}`, PL);
    expect(patch.bPartnerId.split(',')).toEqual(ids.slice(0, MAX_PICKER_IDS));
    expect(MAX_PICKER_IDS).toBe(100);
    // Duplicates count once, before the cap.
    expect(readReportUrlState(`?bPartnerId=${[...ids.slice(0, 99), ...ids.slice(0, 99), 'ID200', 'ID201'].join(',')}`, PL).bPartnerId.split(',')).toEqual([...ids.slice(0, 99), 'ID200']);
  });

  it('an org is restored only when the picker can offer it: unknown, 0 and * are ignored', () => {
    expect(readReportUrlState('?orgId=ORG2', PL, { orgIds: ORGS })).toEqual({ orgId: 'ORG2' });
    expect(readReportUrlState('?orgId=0123456789ABCDEF0123456789ABCDEF', PL, { orgIds: ORGS })).toEqual({});
    expect(readReportUrlState('?orgId=0', PL, { orgIds: ORGS })).toEqual({});
    expect(readReportUrlState('?orgId=*', PL, { orgIds: ORGS })).toEqual({});
    expect(readReportUrlState('?orgId=ORG2', PL)).toEqual({}); // no org list to check against
  });

  it('keeps picker ids as strings and takes no display names from the URL', () => {
    const patch = readReportUrlState('?bPartnerId=0123,ABC&_display_bPartnerId=Spoofed', PL);
    expect(patch).toEqual({ bPartnerId: '0123,ABC' });
  });
});

// ETP-6084: the period columns have their own marker, and the Trial Balance's pickers are persisted too.
describe('reportOffers / pickers of a chart-tree report (ETP-6084)', () => {
  const TB = {
    parameters: [
      { name: 'orgId', type: 'search', selector: 'org', hidden: true },
      { name: 'dateFrom', type: 'date' }, { name: 'dateTo', type: 'date' },
      { name: 'compareTo', type: 'toggle' },
      { name: 'fromAccountId', type: 'search', selector: 'account' },
      { name: 'projectId', type: 'search', selector: 'project' },
      { name: 'costCenterId', type: 'search', selector: 'costcenter' },
    ],
  };

  it('offers the comparison without the period columns when only compareTo is declared', () => {
    expect(reportOffers(TB)).toEqual({ columns: false, compare: true, splitBy: false });
    expect(reportOffers(PL)).toEqual({ columns: true, compare: true, splitBy: true });
    expect(urlStateSpec(TB).controls).toEqual(['compare']);
  });

  it('persists the project, cost centre and account pickers', () => {
    expect(urlStateSpec(TB).pickers.map((p) => p.name)).toEqual(['fromAccountId', 'projectId', 'costCenterId']);
    const state = { orgId: 'ORG1', dateFrom: '2026-01-01', dateTo: '2026-11-17', compare: 'previous', fromAccountId: 'A1', projectId: 'P1,P2', costCenterId: '' };
    const search = writeReportUrlState('', state, TB, DEFAULTS);
    expect(Object.fromEntries(new URLSearchParams(search))).toEqual({ compare: 'previous', fromAccountId: 'A1', projectId: 'P1,P2' });
    expect(readReportUrlState(search, TB, { orgIds: ORGS })).toEqual({ compare: 'previous', fromAccountId: 'A1', projectId: 'P1,P2' });
    expect(readReportUrlState('?columns=month', TB, { orgIds: ORGS })).toEqual({}); // not offered: ignored
  });
});

describe('chart-tree options in the URL (ETP-6084)', () => {
  const TB = {
    tree: 'chart',
    amountColumns: [{ field: 'debit', compare: 'optional' }],
    parameters: [
      { name: 'dateFrom', type: 'date' }, { name: 'dateTo', type: 'date' },
      { name: 'compareTo', type: 'toggle' },
      { name: 'bPartnerId', type: 'search', selector: 'bpartner', groupByValue: 'bpartner' },
      { name: 'groupBy', type: 'select' },
      { name: 'openingEntryAmount', type: 'toggle', default: true },
      { name: 'showOnlyAccountsWithValue', type: 'toggle', default: true },
    ],
  };
  const state = { ...BASE, groupBy: 'bpartner', openingEntryAmount: false, showOnlyAccountsWithValue: true, compareMovements: true };

  it('writes only what differs from the defaults and reads it back', () => {
    const search = writeReportUrlState('', state, TB, DEFAULTS);
    expect(Object.fromEntries(new URLSearchParams(search))).toEqual({ groupBy: 'bpartner', openingEntryAmount: 'false', compareMovements: 'true' });
    expect(readReportUrlState(search, TB, { orgIds: ORGS })).toEqual({ groupBy: 'bpartner', openingEntryAmount: false, compareMovements: true });
  });

  it('ignores a grouping the report does not offer and a malformed toggle', () => {
    expect(readReportUrlState('?groupBy=drop&openingEntryAmount=maybe', TB, { orgIds: ORGS })).toEqual({});
  });

  it('a non-chart report keeps its URL: none of these keys are owned or read', () => {
    expect(writeReportUrlState('', state, PL, DEFAULTS)).toBe('');
    expect(readReportUrlState('?groupBy=bpartner&openingEntryAmount=false&compareMovements=true', PL, { orgIds: ORGS })).toEqual({});
  });
});
