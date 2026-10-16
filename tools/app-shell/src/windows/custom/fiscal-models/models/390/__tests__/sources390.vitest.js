// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/sources390.js
//
// ETP-5716 — Modelo 390 Facturas tab helpers: the "Ver facturas" filter, the request parameters,
// the box chips and the CSV export (every cell through the canonical `csvField`, so a value that
// a spreadsheet would run as a formula is neutralized).
import { describe, it, expect } from 'vitest';
import {
  SOURCES_PAGE_SIZE, emptySourcesFilter, sourcesFilterForBox, hasSourcesFilter, sourcesQueryParams,
  pageCount, boxLabel, sourceBoxes, rowBoxAmount, sourceTypeLabel, buildSources390Csv,
  sourcesCsvFileName,
} from '../sources390.js';

const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);

const ROW = {
  id: 'IT1', ref: 'F001', date: '2026-01-15', accountingDate: '2026-01-16', type: 'sales',
  party: 'Acme', tax: 'IVA 21%', rate: '21', base: '1000.00', vat: '210.00', total: '1210.00',
  boxes: '5,6,99', boxAmounts: { 5: '1000.00', 6: '210.00', 99: '1000.00' },
};

describe('sourcesFilterForBox — the "Ver facturas" filter', () => {
  it('filters by the box only, whatever its spelling', () => {
    expect(sourcesFilterForBox(5)).toEqual({ box: 5, type: '', tax: '', q: '' });
    expect(sourcesFilterForBox('05').box).toBe(5);
    expect(sourcesFilterForBox('[86]').box).toBe(86);
  });

  it('ignores an invalid box', () => {
    expect(sourcesFilterForBox('abc').box).toBeNull();
    expect(sourcesFilterForBox(null).box).toBeNull();
    expect(sourcesFilterForBox(0).box).toBeNull();
  });
});

describe('hasSourcesFilter', () => {
  it('is false for the empty filter and a blank search', () => {
    expect(hasSourcesFilter(emptySourcesFilter())).toBe(false);
    expect(hasSourcesFilter({ ...emptySourcesFilter(), q: '   ' })).toBe(false);
  });
  it('is true as soon as one filter is set', () => {
    expect(hasSourcesFilter(sourcesFilterForBox(5))).toBe(true);
    expect(hasSourcesFilter({ ...emptySourcesFilter(), type: 'sales' })).toBe(true);
    expect(hasSourcesFilter({ ...emptySourcesFilter(), tax: 'T1' })).toBe(true);
    expect(hasSourcesFilter({ ...emptySourcesFilter(), q: 'acme' })).toBe(true);
  });
});

describe('sourcesQueryParams', () => {
  it('sends only the filters that are set, plus the page', () => {
    expect(sourcesQueryParams(emptySourcesFilter())).toEqual({ page: '1', pageSize: String(SOURCES_PAGE_SIZE) });
    expect(sourcesQueryParams({ box: 5, type: 'purchase', tax: 'T1', q: ' acme ' }, { page: 3 }))
      .toEqual({ box: '5', type: 'purchase', tax: 'T1', q: 'acme', page: '3', pageSize: String(SOURCES_PAGE_SIZE) });
  });
  it('asks for every row with pageSize 0 (CSV export)', () => {
    expect(sourcesQueryParams(sourcesFilterForBox(5), { page: 1, pageSize: 0 }).pageSize).toBe('0');
  });
});

describe('paging and boxes', () => {
  it('pageCount is at least 1', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
  });
  it('boxLabel pads to two digits', () => {
    expect(boxLabel(5)).toBe('05');
    expect(boxLabel(108)).toBe('108');
  });
  it('sourceBoxes sorts the payload boxes numerically', () => {
    expect(sourceBoxes({ 99: '1.00', 5: '2.00', 33: '3.00' }).map(b => b.box)).toEqual([5, 33, 99]);
    expect(sourceBoxes(undefined)).toEqual([]);
  });
  it('rowBoxAmount reads the contribution of a row to a box', () => {
    expect(rowBoxAmount(ROW, 6)).toBe('210.00');
    expect(rowBoxAmount(ROW, 7)).toBeNull();
    expect(rowBoxAmount(ROW, null)).toBeNull();
  });
  it('sourceTypeLabel translates the type', () => {
    expect(sourceTypeLabel('sales', t)).toBe('fm.m390.sources.type.sales');
    expect(sourceTypeLabel('purchase', t)).toBe('fm.m390.sources.type.purchase');
  });
});

describe('buildSources390Csv', () => {
  it('writes a BOM, a translated header and one line per row with Impuesto, amounts and boxes', () => {
    const csv = buildSources390Csv([ROW], t);
    expect(csv.startsWith('﻿')).toBe(true);
    const [header, line] = csv.slice(1).trim().split('\r\n');
    expect(header.split(',')).toContain('fm.m390.sources.col.tax');
    expect(line).toBe('2026-01-15,2026-01-16,F001,fm.m390.sources.type.sales,Acme,IVA 21%,21,1000.00,210.00,1210.00,05 06 99');
  });

  it('adds the box contribution column with a box filter', () => {
    const csv = buildSources390Csv([ROW], t, { box: 6 });
    const [header, line] = csv.slice(1).trim().split('\r\n');
    expect(header).toContain('fm.m390.sources.col.box_amount');
    expect(line.endsWith(',210.00')).toBe(true);
  });

  it('neutralizes formula-like values and quotes commas (csvField)', () => {
    const csv = buildSources390Csv([{ ...ROW, party: '=HYPERLINK("http://x")', ref: '@SUM(A1)', tax: 'IVA, 21%', base: '-100.00' }], t);
    const line = csv.slice(1).trim().split('\r\n')[1];
    expect(line).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(line).toContain("'@SUM(A1)");
    expect(line).toContain('"IVA, 21%"');
    expect(line).toContain("'-100.00");
  });

  it('writes only the header for no rows', () => {
    expect(buildSources390Csv([], t).slice(1).trim().split('\r\n')).toHaveLength(1);
  });

  it('names the file after the year and the box', () => {
    expect(sourcesCsvFileName(2026)).toBe('facturas_390_2026.csv');
    expect(sourcesCsvFileName(2026, 5)).toBe('facturas_390_2026_casilla_05.csv');
  });
});
