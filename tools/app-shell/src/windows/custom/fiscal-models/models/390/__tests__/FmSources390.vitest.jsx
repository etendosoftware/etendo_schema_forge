// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/FmSources390.jsx
//
// ETP-5716 — Modelo 390 Facturas tab: rows of a mocked `GET /fiscal390/sources`, the box tag
// (the box filter only comes from "Ver facturas"; no Casilla select), the Tipo / Impuesto / search filters (sent to the backend), the totals of what is
// filtered (with a box: the box total and the "matches the box" check), pagination, the CSV
// export (all filtered rows, cells neutralized by csvField) and the submitted-declaration note.
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../../fiscalModelsUtils.js', () => ({
  formatAmount: (n) => (n == null ? '—' : String(n)),
  triggerDownload: vi.fn(),
}));
vi.mock('../../../FmCommon.jsx', () => ({
  EmptyState: ({ title, sub, 'data-testid': testId }) => React.createElement('div', { 'data-testid': testId }, title, sub),
}));
vi.mock('../fm390Api.js', () => ({ fetchSources390: vi.fn() }));

import FmSources390 from '../FmSources390.jsx';
import { fetchSources390 } from '../fm390Api.js';
import { triggerDownload } from '../../../fiscalModelsUtils.js';
import { toast } from 'sonner';
import { emptySourcesFilter, sourcesFilterForBox } from '../sources390.js';

const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);
const DECL = { id: 'd1', model: '390', year: 2026, period: '0A' };

const row = (id, over = {}) => ({
  id, ref: `F-${id}`, date: '2026-03-10', accountingDate: '2026-03-11', type: 'sales', party: 'Acme',
  taxId: 'S21', tax: 'IVA 21%', rate: '21', base: '100.00', vat: '21.00', total: '121.00',
  boxes: '5,6', boxAmounts: { 5: '100.00', 6: '21.00' }, ...over,
});

const response = (over = {}) => ({
  rows: [row('IT1'), row('IT2', { type: 'purchase', party: 'Supplier', taxId: 'P10', tax: 'IVA 10%' })],
  count: 2, page: 1, pageSize: 25,
  totals: { base: '200.00', vat: '42.00', total: '242.00' },
  boxes: { 5: '200.00', 6: '42.00', 99: '100.00' },
  taxes: [{ id: 'P10', name: 'IVA 10%', rate: '10' }, { id: 'S21', name: 'IVA 21%', rate: '21' }],
  submitted: false,
  ...over,
});

function Harness({ initial = emptySourcesFilter(), onChange, ...rest }) {
  const [filter, setFilter] = useState(initial);
  return (
    <FmSources390
      decl={DECL}
      token="tok"
      apiBaseUrl="http://host/sws/neo/fiscal-models"
      filter={filter}
      onFilterChange={(f) => { onChange?.(f); setFilter(f); }}
      t={t}
      {...rest}
    />
  );
}

const lastParams = () => fetchSources390.mock.calls.at(-1)[1].params;

beforeEach(() => {
  vi.clearAllMocks();
  fetchSources390.mockResolvedValue(response());
});

describe('FmSources390 — rows and totals', () => {
  it('lists the rows with the 303 columns plus Impuesto, and the filtered totals', async () => {
    render(<Harness />);
    await screen.findByTestId('FmSources390__row_IT1');
    expect(screen.getByText('fm.m390.sources.col.tax')).toBeTruthy();
    expect(screen.getByTestId('FmSources390__row_IT2').textContent).toContain('IVA 10%');
    expect(screen.getByTestId('FmSources390__row_IT2').textContent).toContain('fm.m390.sources.type.purchase');
    expect(screen.getByTestId('FmSources390__row_IT1').textContent).toContain('05, 06');
    expect(screen.getByTestId('FmSources390__totalBase').textContent).toBe('200');
    expect(screen.getByTestId('FmSources390__totalVat').textContent).toBe('42');
    expect(screen.getByTestId('FmSources390__totalTotal').textContent).toBe('242');
    expect(screen.getByTestId('FmSources390__totals').textContent).toContain('"count":2');
    expect(lastParams()).toEqual({ page: '1', pageSize: '25' });
  });

  it('shows the empty state when the year has no invoice lines', async () => {
    fetchSources390.mockResolvedValue(response({ rows: [], count: 0, boxes: {}, taxes: [] }));
    render(<Harness />);
    expect(await screen.findByTestId('FmSources390__empty')).toBeTruthy();
  });

  it('shows a no-match row when the filters leave nothing', async () => {
    fetchSources390.mockResolvedValue(response({ rows: [], count: 0 }));
    render(<Harness initial={{ ...emptySourcesFilter(), q: 'zzz' }} />);
    expect(await screen.findByTestId('FmSources390__noMatch')).toBeTruthy();
  });

  it('shows the server error', async () => {
    fetchSources390.mockRejectedValue(Object.assign(new Error('x'), { serverMessage: 'No tax report' }));
    render(<Harness />);
    expect((await screen.findByTestId('FmSources390__error')).textContent).toBe('No tax report');
  });
});

describe('FmSources390 — filters', () => {
  it('has no Casilla select and no box tag without a box filter', async () => {
    render(<Harness />);
    await screen.findByTestId('FmSources390__row_IT1');
    expect(screen.queryByTestId('FmSources390__boxFilter')).toBeNull();
    expect(screen.queryByTestId('FmSources390__chips')).toBeNull();
    expect(screen.queryByTestId('FmSources390__boxTag')).toBeNull();
  });

  it('a box filter shows a removable "Casilla [nn]" tag that clears only the box', async () => {
    const onChange = vi.fn();
    render(<Harness initial={{ box: 21, type: 'sales', tax: 'S21', q: '' }} onChange={onChange} />);
    const tag = await screen.findByTestId('FmSources390__boxTag');
    expect(tag.textContent).toContain('fm.m390.sources.box_tag:{"box":"21"}');
    expect(tag.getAttribute('aria-label')).toBe('fm.m390.sources.box_tag_clear:{"box":"21"}');
    await waitFor(() => expect(lastParams().box).toBe('21'));
    fireEvent.click(tag);
    expect(onChange).toHaveBeenLastCalledWith({ box: null, type: 'sales', tax: 'S21', q: '' });
    await waitFor(() => expect(lastParams()).toMatchObject({ type: 'sales', tax: 'S21' }));
    expect(lastParams().box).toBeUndefined();
    expect(screen.queryByTestId('FmSources390__boxTag')).toBeNull();
  });

  it('Tipo and Impuesto selects are sent to the backend, keeping the box filter', async () => {
    render(<Harness initial={sourcesFilterForBox(99)} />);
    await screen.findByTestId('FmSources390__row_IT1');
    await waitFor(() => expect(lastParams().box).toBe('99'));
    fireEvent.change(screen.getByTestId('FmSources390__typeFilter'), { target: { value: 'purchase' } });
    await waitFor(() => expect(lastParams().type).toBe('purchase'));
    fireEvent.change(screen.getByTestId('FmSources390__taxFilter'), { target: { value: 'P10' } });
    await waitFor(() => expect(lastParams()).toMatchObject({ box: '99', type: 'purchase', tax: 'P10' }));
  });

  it('the search is sent after typing (debounced) and on Enter', async () => {
    render(<Harness />);
    await screen.findByTestId('FmSources390__row_IT1');
    fireEvent.change(screen.getByTestId('FmSources390__search'), { target: { value: 'acme' } });
    await waitFor(() => expect(lastParams().q).toBe('acme'));
    fireEvent.change(screen.getByTestId('FmSources390__search'), { target: { value: 'beta' } });
    fireEvent.keyDown(screen.getByTestId('FmSources390__search'), { key: 'Enter' });
    await waitFor(() => expect(lastParams().q).toBe('beta'));
  });

  it('"Limpiar filtros" resets every filter and the search box', async () => {
    const onChange = vi.fn();
    render(<Harness initial={{ box: 5, type: 'sales', tax: 'S21', q: 'acme' }} onChange={onChange} />);
    fireEvent.click(await screen.findByTestId('FmSources390__clear'));
    expect(onChange).toHaveBeenLastCalledWith(emptySourcesFilter());
    await waitFor(() => expect(screen.getByTestId('FmSources390__search').value).toBe(''));
  });
});

describe('FmSources390 — box filter totals', () => {
  it('opened from "Ver facturas": box column, box total and the match check', async () => {
    fetchSources390.mockResolvedValue(response({
      totals: { base: '200.00', vat: '42.00', total: '242.00', box: '42.00' },
    }));
    render(<Harness initial={sourcesFilterForBox(6)} />);
    await screen.findByTestId('FmSources390__row_IT1');
    expect(lastParams().box).toBe('6');
    expect(screen.getByText(/fm\.m390\.sources\.col\.box_amount/)).toBeTruthy();
    expect(screen.getByTestId('FmSources390__totalBox').textContent).toBe('42');
    expect(screen.getByTestId('FmSources390__boxMatch')).toBeTruthy();
  });

  it('warns when the filtered total does not match the box', async () => {
    fetchSources390.mockResolvedValue(response({
      totals: { base: '200.00', vat: '42.00', total: '242.00', box: '40.00' },
    }));
    render(<Harness initial={sourcesFilterForBox(6)} />);
    expect(await screen.findByTestId('FmSources390__boxMismatch')).toBeTruthy();
  });
});

describe('FmSources390 — pagination', () => {
  it('pages through the rows and resets to page 1 on a filter change', async () => {
    fetchSources390.mockResolvedValue(response({ count: 60 }));
    render(<Harness />);
    expect((await screen.findByTestId('FmSources390__page')).textContent).toContain('"pages":3');
    expect(screen.getByTestId('FmSources390__prev').disabled).toBe(true);
    fireEvent.click(screen.getByTestId('FmSources390__next'));
    await waitFor(() => expect(lastParams().page).toBe('2'));
    fireEvent.change(screen.getByTestId('FmSources390__typeFilter'), { target: { value: 'sales' } });
    await waitFor(() => expect(lastParams()).toMatchObject({ type: 'sales', page: '1' }));
  });

  it('has no pager for a single page', async () => {
    render(<Harness />);
    await screen.findByTestId('FmSources390__row_IT1');
    expect(screen.queryByTestId('FmSources390__pager')).toBeNull();
  });
});

describe('FmSources390 — CSV export', () => {
  it('downloads every filtered row (pageSize 0) with formula-like cells neutralized', async () => {
    render(<Harness initial={sourcesFilterForBox(5)} />);
    await screen.findByTestId('FmSources390__row_IT1');
    fetchSources390.mockResolvedValueOnce(response({ rows: [row('IT1', { party: '=cmd|calc' })] }));
    fireEvent.click(screen.getByTestId('FmSources390__exportCsv'));
    await waitFor(() => expect(triggerDownload).toHaveBeenCalled());
    expect(lastParams()).toMatchObject({ box: '5', page: '1', pageSize: '0' });
    const [blob, name] = triggerDownload.mock.calls[0];
    expect(name).toBe('facturas_390_2026_casilla_05.csv');
    const text = await blob.text();
    expect(text).toContain("'=cmd|calc");
    expect(text).toContain('IVA 21%');
  });

  it('reports a failed export', async () => {
    render(<Harness />);
    await screen.findByTestId('FmSources390__row_IT1');
    fetchSources390.mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(screen.getByTestId('FmSources390__exportCsv'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('fm.m390.sources.export_error'));
    expect(triggerDownload).not.toHaveBeenCalled();
  });
});

describe('FmSources390 — submitted declaration', () => {
  it('shows the "detail not kept" note and does not request the rows', () => {
    render(<Harness isSubmitted />);
    expect(screen.getByTestId('FmSources390__submitted').textContent).toBe('fm.snapshot.invoice_detail_not_kept');
    expect(fetchSources390).not.toHaveBeenCalled();
  });
});
