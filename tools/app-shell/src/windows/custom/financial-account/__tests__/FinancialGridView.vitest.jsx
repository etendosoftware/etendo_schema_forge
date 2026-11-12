// @covers tools/app-shell/src/windows/custom/financial-account/FinancialGridView.jsx
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { gridViewColumnId } from '@/hooks/useGridView.js';
import { FinancialGridRow, FinancialGridView } from '../FinancialGridView.jsx';

const boundary = vi.hoisted(() => ({ enabled: true, apiFetch: vi.fn() }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => boundary.apiFetch }));
vi.mock('@/lib/flags', () => ({ GRID_COLUMN_VIEWS: 'grid-column-views', useFeatureFlag: () => boundary.enabled }));
vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

const columns = [
  { key: 'expand', gridConfigurable: false, gridTrack: '40px' },
  { key: 'selection', gridConfigurable: false, gridTrack: '40px' },
  { key: 'date', label: 'date', gridTrack: '104px' },
  { key: 'description', label: 'description', gridTrack: 'minmax(0,1fr)', gridDefaultWidthPx: 120 },
  { key: 'amount', label: 'amount', gridConfigurable: false, gridTrack: '130px' },
  { key: 'reference', label: 'reference' },
  { key: 'actions', gridConfigurable: false, gridTrack: '40px' },
];
const rows = [{ id: 'txn-stable' }];
const response = (body, status = 200) => ({ ok: true, status, json: async () => body });
function savedView(entries) {
  return { version: 1, surface: 'list', columns: entries.map(([key, values]) => ({
    id: gridViewColumnId(columns.find((column) => column.key === key)), ...values,
  })) };
}
function Grid({ entity = 'transaction', onSelect = vi.fn(), onExpand = vi.fn(), onAction = vi.fn() }) {
  return <FinancialGridView spec="financial-account" entity={entity} columns={columns} data={rows}>
    <FinancialGridRow header data-testid="header" role="row">
      {columns.map((column) => <span key={column.key} data-testid={`header-${column.key}`}>{column.key}</span>)}
    </FinancialGridRow>
    <FinancialGridRow data-testid="data-row" role="row">
      <span><button type="button" onClick={onExpand}>expand</button></span>
      <span><input aria-label="selection" type="checkbox" onChange={onSelect} /></span>
      <span data-testid="cell-date">2026-10-26</span>
      <span data-testid="cell-description">row-description</span>
      <span data-testid="cell-amount">100</span>
      <span data-testid="cell-reference">REF-1</span>
      <span><button type="button" onClick={onAction}>action</button></span>
    </FinancialGridRow>
    <div data-testid="dimensions-panel" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <span>project-dimension</span><span>cost-center-dimension</span>
    </div>
    <table><tbody>
      <FinancialGridRow as="tr" data-testid="expanded-row"><td colSpan={columns.length}><div>nested-content</div></td></FinancialGridRow>
      <FinancialGridRow as="tr" data-testid="group-row"><td>group-label</td><td>group-total</td></FinancialGridRow>
    </tbody></table>
  </FinancialGridView>;
}
const order = () => [...screen.getByTestId('header').children].map((cell) => cell.dataset.testid);

describe('financial-account personal column layouts', () => {
  beforeAll(() => {
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    boundary.enabled = true;
    boundary.apiFetch.mockReset().mockResolvedValue(response(null, 204));
  });

  it('keeps the default layout and makes no preferences request with the flag off', () => {
    boundary.enabled = false;
    render(<Grid />);
    expect(boundary.apiFetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId('grid-view-controls')).toBeNull();
    expect(order()).toEqual(columns.map((column) => `header-${column.key}`));
  });

  it('pins structural slots against saved order, visibility and width while preserving nested layouts and interactions', async () => {
    boundary.apiFetch.mockResolvedValue(response(savedView([
      ['actions', { order: -5, visible: false, width: 999 }],
      ['expand', { order: 10, visible: false, width: 999 }],
      ['selection', { order: 9, visible: false }],
      ['reference', { order: -4 }],
      ['description', { order: 0 }],
      ['date', { order: 1, visible: false }],
      ['amount', { order: 20, visible: false }],
    ])));
    const onSelect = vi.fn();
    const onExpand = vi.fn();
    const onAction = vi.fn();
    render(<Grid onSelect={onSelect} onExpand={onExpand} onAction={onAction} />);
    await waitFor(() => expect(screen.getByTestId('grid-view-columns-trigger')).toBeEnabled());
    expect(boundary.apiFetch).toHaveBeenCalledWith('/sws/neo/grid-views/financial-account/transaction', { baseUrl: '' });
    expect(order()).toEqual(['header-expand', 'header-selection', 'header-description', 'header-amount', 'header-reference', 'header-actions']);
    expect(screen.queryByTestId('cell-date')).toBeNull();
    expect(screen.getByTestId('dimensions-panel').style.gridTemplateColumns).toBe('1fr 1fr');
    expect(screen.getByTestId('dimensions-panel')).toHaveTextContent('project-dimensioncost-center-dimension');
    expect(screen.getByTestId('expanded-row').firstElementChild).toHaveAttribute('colspan', '6');
    expect(screen.getByTestId('group-row').children).toHaveLength(2);
    expect(screen.getByTestId('header-expand').style.width).toBe('');
    expect(within(screen.getByTestId('header-actions')).queryByRole('separator')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'selection' }));
    fireEvent.click(screen.getByRole('button', { name: 'expand' }));
    fireEvent.click(screen.getByRole('button', { name: 'action' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('saves visibility, keyboard order and width explicitly without moving through structural anchors', async () => {
    const user = userEvent.setup();
    render(<Grid />);
    await waitFor(() => expect(screen.getByTestId('grid-view-columns-trigger')).toBeEnabled());
    const descriptionHeader = screen.getByTestId('header-description');
    fireEvent.keyDown(within(descriptionHeader).getByRole('button'), { key: 'ArrowLeft', altKey: true, shiftKey: true });
    expect(order().slice(0, 4)).toEqual(['header-expand', 'header-selection', 'header-description', 'header-date']);
    fireEvent.keyDown(within(descriptionHeader).getByRole('button'), { key: 'ArrowLeft', altKey: true, shiftKey: true });
    expect(order()[1]).toBe('header-selection');
    fireEvent.keyDown(within(descriptionHeader).getByRole('separator'), { key: 'ArrowRight' });
    expect(descriptionHeader.style.width).toBe('130px');
    await user.click(screen.getByTestId('grid-view-columns-trigger'));
    expect(screen.getByTestId('grid-view-column-selection')).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByTestId('grid-view-column-date'));
    expect(screen.queryByTestId('cell-date')).toBeNull();
    expect(boundary.apiFetch).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId('grid-view-save'));
    await waitFor(() => expect(boundary.apiFetch).toHaveBeenCalledTimes(2));
    const [url, request] = boundary.apiFetch.mock.calls[1];
    expect(url).toBe('/sws/neo/grid-views/financial-account/transaction');
    expect(request.method).toBe('PUT');
    expect(JSON.parse(request.body).columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: gridViewColumnId(columns[2]), visible: false }),
      expect.objectContaining({ id: gridViewColumnId(columns[3]), width: 130 }),
    ]));
  });

  it('uses entity identity rather than row IDs and loads a new entity before applying its preferences', async () => {
    boundary.apiFetch.mockImplementation((url) => Promise.resolve(response(url.endsWith('/transaction')
      ? savedView([['description', { visible: false }]]) : null, url.endsWith('/transaction') ? 200 : 204)));
    const { rerender } = render(<Grid />);
    await waitFor(() => expect(screen.queryByTestId('cell-description')).toBeNull());
    rerender(<Grid entity="statementLine" />);
    await waitFor(() => expect(boundary.apiFetch).toHaveBeenCalledWith('/sws/neo/grid-views/financial-account/statementLine', { baseUrl: '' }));
    await waitFor(() => expect(screen.getByTestId('cell-description')).toBeInTheDocument());
    expect(boundary.apiFetch.mock.calls.every(([url]) => !url.includes('txn-stable'))).toBe(true);
  });

  it('leaves the original grid usable and reports a failed preferences load', async () => {
    boundary.apiFetch.mockRejectedValue(new Error('unavailable'));
    render(<Grid />);
    await waitFor(() => expect(screen.getByTestId('grid-view-status')).toHaveTextContent('gridViewLoadFailed'));
    expect(order()).toEqual(columns.map((column) => `header-${column.key}`));
    expect(screen.getByTestId('cell-description')).toHaveTextContent('row-description');
    expect(screen.getByTestId('grid-view-save')).toBeDisabled();
  });
});
