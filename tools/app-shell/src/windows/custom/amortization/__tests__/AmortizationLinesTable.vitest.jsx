import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── mock heavy children so we exercise AmortizationLinesTable's own logic ──
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (col) => col,
}));

vi.mock('@/components/contract-ui', () => ({
  EntityForm: ({ fields }) => (
    <div data-testid="entity-form">{(fields || []).map(f => f.key).join(',')}</div>
  ),
}));

vi.mock('@/components/contract-ui/SelectorInput', () => ({
  default: ({ field, onChange }) => (
    <button
      data-testid={`selector-${field.key}`}
      onClick={() => onChange('new-val', 'New Label')}
    >
      selector-{field.key}
    </button>
  ),
}));

vi.mock('@/components/ui/add-line-button', () => ({
  AddLineButton: ({ onClick, label }) => (
    <button data-testid="add-line-btn" onClick={onClick}>{label}</button>
  ),
}));

// Checkbox re-exports from @etendosoftware/app-shell-core which is not
// available in this test environment. Mock it as a native button with
// role="checkbox" preserving the aria-label and checked/onChange contract.
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, indeterminate, disabled, onChange, 'aria-label': ariaLabel }) => (
    <button
      role="checkbox"
      aria-label={ariaLabel}
      aria-checked={indeterminate ? 'mixed' : Boolean(checked)}
      disabled={disabled}
      onClick={disabled ? undefined : onChange}
    />
  ),
}));

import AmortizationLinesTable from '../AmortizationLinesTable.jsx';

const LINE_FILLED = {
  id: 'line-1',
  asset: 'asset-1',
  'asset$_identifier': 'AS_Module',
  amortizationPercentage: 27.42,
  amortizationAmount: 548.39,
  'currency$_identifier': '€',
  organization: 'org-1',
  'organization$_identifier': 'GOOrg',
  eTADASBpartner: 'bp-1',
  'eTADASBpartner$_identifier': 'Juan Perez',
};

const LINE_EMPTY = {
  id: 'line-2',
  asset: 'asset-2',
  'asset$_identifier': 'Mobiliario',
  amortizationPercentage: 10,
  amortizationAmount: 1200,
};

function mockFetchReturning(rows) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ response: { data: rows } }),
  });
}

const BASE_PROPS = {
  recordId: 'amort-1',
  data: { id: 'amort-1', processed: 'N' },
  token: 'tok',
  apiBaseUrl: 'http://host/neo/amortization',
  api: { labelOverrides: {} },
  editing: true,
  catalogs: {},
};

// Helper: find the pencil button in the actions (last) td of a row.
// The last td holds [pencil, trash] in a flex container.
function getPencilButton(container, rowId) {
  const row = container.querySelector(`[data-row-id="${rowId}"]`);
  const lastTd = row.querySelector('td:last-child');
  const buttons = lastTd.querySelectorAll('button');
  // First button in the last td is the pencil (edit toggle).
  return buttons[0];
}

function getTrashButton(container, rowId) {
  const row = container.querySelector(`[data-row-id="${rowId}"]`);
  const lastTd = row.querySelector('td:last-child');
  const buttons = lastTd.querySelectorAll('button');
  // Second button in the last td is the trash.
  return buttons[1];
}

const renderInRouter = (ui, options) =>
  render(ui, { wrapper: MemoryRouter, ...options });

beforeEach(() => {
  global.fetch = mockFetchReturning([LINE_FILLED, LINE_EMPTY]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AmortizationLinesTable — fetch + render', () => {
  it('fetches lines on mount and renders one row per line', async () => {
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());
    expect(screen.getByText('Mobiliario')).toBeInTheDocument();
    // fetch URL targets the lines sub-endpoint with the parent id
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/lines?parentId=amort-1'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }),
    );
  });

  it('reports the line count via onCountChange', async () => {
    const onCountChange = vi.fn();
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} onCountChange={onCountChange} />);
    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(2));
  });

  it('renders the column headers from labelOverrides', async () => {
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('A_Asset_ID')).toBeInTheDocument());
    expect(screen.getByText('Amortization_Percentage')).toBeInTheDocument();
    expect(screen.getByText('Amortizationamt')).toBeInTheDocument();
  });
});

describe('AmortizationLinesTable — dimension summary', () => {
  it('shows filled-dimension badges for a line with dimensions', async () => {
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('Juan Perez')).toBeInTheDocument());
    // The redesigned summary shows "Label: Value" badges instead of the old n/7 counter.
    // Organization always leads (label = i18n key 'organization', value = 'GOOrg').
    // BPartner badge appears next (label = column key, value = 'Juan Perez').
    expect(screen.getAllByText('GOOrg').length).toBeGreaterThanOrEqual(1);
  });

  it('shows the empty "add dimensions" affordance for a line without dimensions', async () => {
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('Mobiliario')).toBeInTheDocument());
    expect(screen.getAllByText('amortizationDimensionsEmpty').length).toBeGreaterThan(0);
  });
});

describe('AmortizationLinesTable — dimension expand', () => {
  it('expands the dimensions panel when the row is clicked', async () => {
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    fireEvent.click(screen.getByText('AS_Module'));

    // Section title appears in the expanded panel.
    await waitFor(() =>
      expect(screen.getAllByText('amortizationDimensionsTitle').length).toBeGreaterThan(0),
    );
    // GOOrg now appears in both the dimension summary badge AND the expanded panel's
    // read-only Organization field — use getAllByText to handle multiple occurrences.
    expect(screen.getAllByText('GOOrg').length).toBeGreaterThanOrEqual(1);
  });
});

describe('AmortizationLinesTable — inline editing', () => {
  it('shows inline core inputs after clicking the edit pencil', async () => {
    const { container } = renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    fireEvent.click(getPencilButton(container, 'line-1'));

    // Inline editing renders number inputs for percentage/amount.
    await waitFor(() =>
      expect(container.querySelectorAll('input[type="number"]').length).toBeGreaterThan(0),
    );
  });

  it('saves a field via PUT when an inline number input loses focus', async () => {
    const { container } = renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    fireEvent.click(getPencilButton(container, 'line-1'));
    await waitFor(() =>
      expect(container.querySelector('input[type="number"]')).not.toBeNull(),
    );

    const numberInput = container.querySelector('input[type="number"]');
    fireEvent.change(numberInput, { target: { value: '99' } });
    global.fetch.mockClear();
    fireEvent.blur(numberInput);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/lines/line-1'),
        expect.objectContaining({ method: 'PUT' }),
      ),
    );
  });
});

describe('AmortizationLinesTable — add and delete', () => {
  it('renders the Add line button when the document is editable', async () => {
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByTestId('add-line-btn')).toBeInTheDocument());
    expect(screen.getByTestId('add-line-btn')).toHaveTextContent('addLine');
  });

  it('hides the Add line button when the document is processed (read-only)', async () => {
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} data={{ id: 'amort-1', processed: 'Y' }} editing={false} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());
    expect(screen.queryByTestId('add-line-btn')).not.toBeInTheDocument();
  });

  it('opens the inline add-line form when Add line is clicked', async () => {
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByTestId('add-line-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('add-line-btn'));

    // The new flow renders an inline draft row (not an EntityForm modal).
    await waitFor(() => expect(screen.getByTestId('inline-add-row')).toBeInTheDocument());

    // Add line button stays visible while the draft row is open.
    expect(screen.getByTestId('add-line-btn')).toBeInTheDocument();

    // Draft row contains the asset selector and number inputs.
    expect(screen.getByTestId('selector-asset')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Amortization_Percentage')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Amortizationamt')).toBeInTheDocument();
  });
});

describe('AmortizationLinesTable — inline draft row behavior', () => {
  it('shows the hint text while the draft row is open and hides it otherwise', async () => {
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByTestId('add-line-btn')).toBeInTheDocument());

    // Hint absent before opening.
    expect(screen.queryByText('inlineAddHint')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('add-line-btn'));
    await waitFor(() => expect(screen.getByTestId('inline-add-row')).toBeInTheDocument());
    expect(screen.getByText('inlineAddHint')).toBeInTheDocument();
  });

  it('pressing Enter on a number input POSTs the line when asset is set and keeps the row open', async () => {
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByTestId('add-line-btn')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('add-line-btn'));
    await waitFor(() => expect(screen.getByTestId('inline-add-row')).toBeInTheDocument());

    // Select an asset via the mocked SelectorInput.
    fireEvent.click(screen.getByTestId('selector-asset'));

    // Clear fetch history accumulated during mount and asset selection.
    global.fetch.mockClear();

    // Press Enter on the percentage input.
    const pctInput = screen.getByPlaceholderText('Amortization_Percentage');
    fireEvent.keyDown(pctInput, { key: 'Enter' });

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/lines'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    // Draft row stays open for rapid entry (close:false path).
    expect(screen.getByTestId('inline-add-row')).toBeInTheDocument();
  });

  it('pressing Escape on a number input closes the draft row without POSTing', async () => {
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByTestId('add-line-btn')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('add-line-btn'));
    await waitFor(() => expect(screen.getByTestId('inline-add-row')).toBeInTheDocument());

    global.fetch.mockClear();

    const amtInput = screen.getByPlaceholderText('Amortizationamt');
    fireEvent.keyDown(amtInput, { key: 'Escape' });

    await waitFor(() =>
      expect(screen.queryByTestId('inline-add-row')).not.toBeInTheDocument(),
    );

    // No POST should have been issued.
    const postCalls = global.fetch.mock.calls.filter(([, opts]) => opts?.method === 'POST');
    expect(postCalls.length).toBe(0);
  });

  it('outside-click with asset set POSTs and closes the draft row', async () => {
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByTestId('add-line-btn')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('add-line-btn'));
    await waitFor(() => expect(screen.getByTestId('inline-add-row')).toBeInTheDocument());

    // Set an asset in the draft row.
    fireEvent.click(screen.getByTestId('selector-asset'));

    global.fetch.mockClear();

    // Simulate a mousedown outside the draft row.
    fireEvent.mouseDown(document.body);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/lines'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    await waitFor(() =>
      expect(screen.queryByTestId('inline-add-row')).not.toBeInTheDocument(),
    );
  });
});

describe('AmortizationLinesTable — delete', () => {
  it('deletes a line via DELETE when the trash button is clicked', async () => {
    const { container } = renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    global.fetch.mockClear();
    fireEvent.click(getTrashButton(container, 'line-1'));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/lines/line-1'),
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });
});

describe('AmortizationLinesTable — dimension save', () => {
  it('saves a dimension via PUT when a selector value is chosen in the expand panel', async () => {
    const { container } = renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    // Expand the dimensions panel for the editable line.
    fireEvent.click(screen.getByText('AS_Module'));
    await waitFor(() => expect(screen.getByTestId('selector-costcenter')).toBeInTheDocument());

    global.fetch.mockClear();
    fireEvent.click(screen.getByTestId('selector-costcenter'));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/lines/line-1'),
        expect.objectContaining({ method: 'PUT' }),
      ),
    );
  });

  it('renders dimension selectors read-only when the document is processed', async () => {
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} data={{ id: 'amort-1', processed: 'Y' }} editing={false} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());
    fireEvent.click(screen.getByText('AS_Module'));
    // Read-only path renders plain inputs, not SelectorInput stubs.
    await waitFor(() =>
      expect(screen.queryByTestId('selector-costcenter')).not.toBeInTheDocument(),
    );
  });
});

describe('AmortizationLinesTable — empty + error states', () => {
  it('reports zero count and renders no data rows when the fetch returns no rows', async () => {
    global.fetch = mockFetchReturning([]);
    const onCountChange = vi.fn();
    const { container } = renderInRouter(<AmortizationLinesTable {...BASE_PROPS} onCountChange={onCountChange} />);
    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(0));
    expect(container.querySelector('[data-row-id]')).toBeNull();
    // Add line button still available since the document is editable.
    expect(screen.getByTestId('add-line-btn')).toBeInTheDocument();
  });

  it('falls back to empty (no rows) when the fetch rejects', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network'));
    const { container } = renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByTestId('add-line-btn')).toBeInTheDocument());
    expect(container.querySelector('[data-row-id]')).toBeNull();
  });
});

describe('AmortizationLinesTable — onRefresh sync', () => {
  it('create → calls onRefresh after a successful POST', async () => {
    const onRefresh = vi.fn();
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} onRefresh={onRefresh} />);
    await waitFor(() => expect(screen.getByTestId('add-line-btn')).toBeInTheDocument());

    // Open the draft row.
    fireEvent.click(screen.getByTestId('add-line-btn'));
    await waitFor(() => expect(screen.getByTestId('inline-add-row')).toBeInTheDocument());

    // Select an asset so the POST guard passes.
    fireEvent.click(screen.getByTestId('selector-asset'));

    global.fetch.mockClear();

    // Press Enter on the percentage input to submit.
    const pctInput = screen.getByPlaceholderText('Amortization_Percentage');
    fireEvent.keyDown(pctInput, { key: 'Enter' });

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/lines'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('delete → calls onRefresh after a successful DELETE', async () => {
    const onRefresh = vi.fn();
    const { container } = renderInRouter(<AmortizationLinesTable {...BASE_PROPS} onRefresh={onRefresh} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    global.fetch.mockClear();
    fireEvent.click(getTrashButton(container, 'line-1'));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/lines/line-1'),
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );

    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('bulk delete → calls onRefresh after all DELETEs complete', async () => {
    const onRefresh = vi.fn();
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} onRefresh={onRefresh} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    // Select one row.
    const rowCheckboxes = screen.getAllByRole('checkbox', { name: 'selectRow' });
    fireEvent.click(rowCheckboxes[0]);
    await waitFor(() => expect(screen.getByTitle('delete')).toBeInTheDocument());

    global.fetch.mockClear();
    fireEvent.click(screen.getByTitle('delete'));

    await waitFor(() => {
      const deleteCalls = global.fetch.mock.calls.filter(([, opts]) => opts?.method === 'DELETE');
      expect(deleteCalls.length).toBeGreaterThanOrEqual(1);
    });

    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });
});

describe('AmortizationLinesTable — multi-select', () => {
  it('toggling a row checkbox shows the bulk action bar with the correct count', async () => {
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    // Per-row checkboxes have aria-label="selectRow" (i18n returns the key).
    const rowCheckboxes = screen.getAllByRole('checkbox', { name: 'selectRow' });
    expect(rowCheckboxes.length).toBe(2);

    fireEvent.click(rowCheckboxes[0]);

    // The shared LinesSelectionBar is portaled to document.body.
    // Its buttons are identified by title props: deleteTitle="delete", closeTitle="close"
    // (i18n identity mock returns the key as-is).
    await waitFor(() => expect(screen.getByTitle('delete')).toBeInTheDocument());
    expect(screen.getByTitle('close')).toBeInTheDocument();
    // selectedLabel comes from ui('selected', { count }) → identity mock returns "selected".
    expect(screen.getByText('selected')).toBeInTheDocument();
  }, 15_000);

  it('select-all checkbox selects all rows and updates the bar count', async () => {
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    const selectAllCheckbox = screen.getByRole('checkbox', { name: 'selectAll' });
    fireEvent.click(selectAllCheckbox);

    // All row checkboxes must be checked and the shared bar must appear.
    await waitFor(() => {
      const rowCheckboxes = screen.getAllByRole('checkbox', { name: 'selectRow' });
      rowCheckboxes.forEach(cb => expect(cb).toHaveAttribute('aria-checked', 'true'));
    });
    expect(screen.getByTitle('delete')).toBeInTheDocument();
    expect(screen.getByTitle('close')).toBeInTheDocument();
  });

  it('clicking bulk Delete issues a DELETE fetch for each selected row id', async () => {
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    // Select both rows via select-all.
    fireEvent.click(screen.getByRole('checkbox', { name: 'selectAll' }));
    // Wait for the shared LinesSelectionBar delete button to appear in the portal.
    await waitFor(() => expect(screen.getByTitle('delete')).toBeInTheDocument());

    global.fetch.mockClear();
    // Click the delete button inside LinesSelectionBar (identified by its title prop).
    fireEvent.click(screen.getByTitle('delete'));

    await waitFor(() => {
      const deleteCalls = global.fetch.mock.calls.filter(
        ([url, opts]) => opts?.method === 'DELETE',
      );
      expect(deleteCalls.length).toBeGreaterThanOrEqual(2);
      const urls = deleteCalls.map(([url]) => url);
      expect(urls.some(u => u.includes('/lines/line-1'))).toBe(true);
      expect(urls.some(u => u.includes('/lines/line-2'))).toBe(true);
    });
  });

  it('renders selection checkboxes as disabled when the document is read-only', async () => {
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} data={{ id: 'amort-1', processed: 'Y' }} editing={false} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    // Checkboxes are visible but disabled in read-only mode (matches Sales Order behaviour).
    const rowCheckboxes = screen.getAllByRole('checkbox', { name: 'selectRow' });
    expect(rowCheckboxes.length).toBeGreaterThan(0);
    rowCheckboxes.forEach(cb => expect(cb).toBeDisabled());
    expect(screen.getByRole('checkbox', { name: 'selectAll' })).toBeDisabled();
  });
});
