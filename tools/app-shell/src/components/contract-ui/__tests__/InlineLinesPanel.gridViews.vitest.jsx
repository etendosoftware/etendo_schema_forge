// @covers tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InlineLinesPanel from '../InlineLinesPanel.jsx';
import { gridViewColumnId } from '@/hooks/useGridView.js';

const boundary = vi.hoisted(() => ({ enabled: true, apiFetch: vi.fn() }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => boundary.apiFetch }));
vi.mock('@/lib/flags', () => ({ GRID_COLUMN_VIEWS: 'grid-column-views', useFeatureFlag: () => boundary.enabled }));
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US' }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/ui/custom-icons', async (importOriginal) => ({
  ...(await importOriginal()),
  IconicTrashIcon: (props) => <svg {...props} />,
  IconicEditIcon: (props) => <svg {...props} />,
}));
vi.mock('../InlineSearchCombo.jsx', () => ({ InlineSearchCombo: () => null }));
vi.mock('../SelectorInput.jsx', () => ({ SelectorInput: () => null, default: () => null }));
vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));

const columns = [
  { key: 'description', column: 'Description', label: 'description', type: 'string' },
  { key: 'quantity', column: 'Qty', label: 'quantity', type: 'number' },
  { key: 'debit', label: 'debit', type: 'amount' },
  { key: 'credit', label: 'credit', type: 'amount' },
  { key: 'secret', label: 'secret', type: 'string', hidden: true },
  { key: 'project', label: 'project', type: 'string' },
];
const rows = [{ id: 'line-1', description: 'Item', quantity: 2, debit: 10, credit: 0 }];
const balanceFooter = { debitField: 'debit', creditField: 'credit', debitTotal: '10,00', creditTotal: '0,00' };
const response = (body, status = 200) => ({ ok: true, status, json: async () => body });
function savedView(items) {
  return { version: 1, surface: 'list', columns: items.map(([key, values]) => ({
    id: gridViewColumnId(columns.find((column) => column.key === key)), ...values,
  })) };
}
function panel(props = {}) {
  return render(<InlineLinesPanel columns={columns} data={rows} specName="sales-order" entity="lines"
    apiBaseUrl="/sws/neo/sales-order" hiddenColumns={['project']} balanceFooter={balanceFooter}
    onUpdateRow={vi.fn().mockResolvedValue()} onDeleteRow={vi.fn()} {...props} />);
}
function headerOrder(container) {
  return [...container.querySelectorAll('[data-testid^="column-header-"]')].map((node) => node.dataset.testid);
}

describe('InlineLinesPanel personal grid views', () => {
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

  it.each([{ flag: false, specName: 'sales-order' }, { flag: true, specName: undefined }])(
    'keeps default columns and performs no view request when scope or flag is absent: %j', ({ flag, specName }) => {
      boundary.enabled = flag;
      panel({ specName });
      expect(boundary.apiFetch).not.toHaveBeenCalled();
      expect(screen.queryByTestId('grid-view-controls')).toBeNull();
      expect(screen.getByTestId('column-header-description')).toBeInTheDocument();
      expect(screen.queryByTestId('column-header-secret')).toBeNull();
      expect(screen.queryByTestId('column-header-project')).toBeNull();
    },
  );

  it('loads personal order, visibility and width without restoring policy-hidden columns', async () => {
    boundary.apiFetch.mockResolvedValue(response(savedView([
      ['quantity', { order: 0, width: 310 }], ['description', { order: 1, visible: false }],
      ['secret', { order: 2, visible: true }], ['project', { order: 3, visible: true }],
    ])));
    const { container } = panel();
    await waitFor(() => expect(screen.queryByTestId('column-header-description')).toBeNull());
    expect(boundary.apiFetch).toHaveBeenCalledWith('/sws/neo/grid-views/sales-order/lines', { baseUrl: '' });
    expect(headerOrder(container)[0]).toBe('column-header-quantity');
    expect(screen.getByTestId('column-header-quantity').style.flex).toContain('310px');
    expect(screen.queryByTestId('column-header-secret')).toBeNull();
    expect(screen.queryByTestId('column-header-project')).toBeNull();
    expect(screen.getByTestId('balance-footer-debit')).toHaveTextContent('10,00');
    expect(screen.getByTestId('balance-footer-credit')).toHaveTextContent('0,00');
  });

  it('saves keyboard reorder, resize and user visibility explicitly while preserving row editing', async () => {
    const user = userEvent.setup();
    const onUpdateRow = vi.fn().mockResolvedValue();
    const onSelectionChange = vi.fn();
    const { container } = panel({ onUpdateRow, onSelectionChange });
    await waitFor(() => expect(screen.getByTestId('grid-view-columns-trigger')).toBeEnabled());
    const quantityHeader = screen.getByTestId('column-header-quantity');
    fireEvent.keyDown(within(quantityHeader).getByRole('button'), { key: 'ArrowLeft', altKey: true, shiftKey: true });
    fireEvent.keyDown(within(quantityHeader).getByRole('separator'), { key: 'ArrowRight' });
    expect(headerOrder(container)[0]).toBe('column-header-quantity');
    expect(boundary.apiFetch).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId('grid-view-columns-trigger'));
    await user.click(screen.getByTestId('grid-view-column-description'));
    expect(screen.queryByTestId('column-header-description')).toBeNull();
    await user.click(screen.getByTestId('grid-view-save'));
    await waitFor(() => expect(boundary.apiFetch).toHaveBeenCalledTimes(2));
    const [url, request] = boundary.apiFetch.mock.calls[1];
    expect(url).toBe('/sws/neo/grid-views/sales-order/lines');
    expect(request.method).toBe('PUT');
    const saved = JSON.parse(request.body);
    expect(saved.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: gridViewColumnId(columns[0]), visible: false }),
      expect.objectContaining({ id: gridViewColumnId(columns[1]), order: 0, width: 162 }),
    ]));
    const row = screen.getByTestId('line-row-line-1');
    await userEvent.click(within(row).getByRole('checkbox'));
    expect(onSelectionChange).toHaveBeenLastCalledWith([rows[0]]);
    // Match the row-selection suite: a fresh pointer re-enters the selected row's action strip.
    await userEvent.hover(row);
    await userEvent.click(within(row).getByRole('button', { name: 'editLineTooltip' }));
    const quantityInput = await within(row).findByTestId('field-quantity');
    fireEvent.change(quantityInput, { target: { value: '3' } });
    fireEvent.blur(quantityInput);
    await waitFor(() => expect(onUpdateRow).toHaveBeenCalledWith(rows[0], 'quantity', '3', {
      column: 'Qty', identifier: undefined, selectedItem: undefined,
    }));
  });

  it('keeps footer columns locked and suspends personal layout while the add-row portal is active', async () => {
    boundary.apiFetch.mockResolvedValue(response(savedView([
      ['description', { visible: false, width: 390, order: 1 }],
      ['quantity', { order: 0 }], ['debit', { visible: false, width: 1, order: -1 }],
    ])));
    const { container, rerender } = panel();
    await waitFor(() => expect(screen.getByTestId('grid-view-columns-trigger')).toBeEnabled());
    expect(headerOrder(container)).toEqual(['column-header-quantity', 'column-header-debit', 'column-header-credit']);
    expect(screen.getByTestId('column-header-debit')).toBeInTheDocument();
    expect(within(screen.getByTestId('column-header-debit')).queryByRole('separator')).toBeNull();
    rerender(<InlineLinesPanel columns={columns} data={rows} specName="sales-order" entity="lines"
      apiBaseUrl="/sws/neo/sales-order" balanceFooter={balanceFooter} lineFormActive />);
    expect(screen.getByTestId('inline-add-row-host')).toBeInTheDocument();
    expect(screen.getByTestId('column-header-description')).toBeInTheDocument();
    expect(screen.queryByTestId('balance-footer-row')).toBeNull();
    expect(screen.getByTestId('grid-view-columns-trigger')).toBeDisabled();
    rerender(<InlineLinesPanel columns={columns} data={rows} specName="sales-order" entity="lines"
      apiBaseUrl="/sws/neo/sales-order" balanceFooter={balanceFooter} />);
    await waitFor(() => expect(screen.getByTestId('grid-view-columns-trigger')).toBeEnabled());
    expect(screen.queryByTestId('inline-add-row-host')).toBeNull();
    expect(screen.queryByTestId('column-header-description')).toBeNull();
    expect(screen.getByTestId('balance-footer-row')).toBeInTheDocument();
  });

  it('keeps dimension expansion outside the personal column picker', async () => {
    const user = userEvent.setup();
    panel({ columns: [...columns, {
      key: 'dimensions', type: 'dimensionsPanel',
      dimensionFields: [{ key: 'costcenter', column: 'C_Costcenter_ID', label: 'costcenter', type: 'selector' }],
    }] });
    await waitFor(() => expect(screen.getByTestId('grid-view-columns-trigger')).toBeEnabled());
    expect(screen.queryByTestId('column-header-dimensions')).toBeNull();
    await user.click(screen.getByTestId('dimensions-panel-toggle'));
    expect(screen.getByTestId('dimensions-panel-line-1')).toBeInTheDocument();
    await user.click(screen.getByTestId('grid-view-columns-trigger'));
    expect(screen.queryByTestId('grid-view-column-dimensions')).toBeNull();
    expect(screen.queryByTestId('grid-view-column-secret')).toBeNull();
    expect(screen.queryByTestId('grid-view-column-project')).toBeNull();
    expect(screen.getByTestId('grid-view-column-debit')).toHaveAttribute('data-disabled');
  });
});
