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

// ETP-4529 — dimensionFields is now resolved via useAccountingDimensionFields, a thin
// wrapper around useDisplayLogic (the same evaluate-display evaluator DetailView uses —
// see DetailView.*.vitest.jsx for the established `vi.mock('@/hooks/useDisplayLogic', ...)`
// convention this reuses). Defaulting to `{ visibility: {} }` reproduces the evaluator's
// fail-open behavior (a field the server never mentions stays visible), so all the
// pre-existing "kept dimensions render" assertions below keep passing unchanged.
vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: vi.fn(() => ({ readOnly: {}, visibility: {} })),
}));

// ETP-4981 — deleteLine/bulkDelete now surface failures via toast.error/
// toastBatchDeleteOutcome instead of silently swallowing them. Mock 'sonner'
// (mirrors DetailView.deleteRow.vitest.js / DetailView.bulkLineDelete.vitest.jsx)
// and @/hooks/useEntity so extractErrorMessage's resolved message is controllable
// per test without exercising its real JSON-parsing logic.
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/hooks/useEntity', () => ({
  extractErrorMessage: vi.fn(),
}));

import { useDisplayLogic } from '@/hooks/useDisplayLogic';
import { toast } from 'sonner';
import { extractErrorMessage } from '@/hooks/useEntity';
import AmortizationLinesTable from '../AmortizationLinesTable.jsx';
// ETP-4576 — the credential comes from the ACTIVE SCHEME, not from a literal the
// test also supplies. The scheme is declared explicitly because src/test/setup.js
// resets to the bearer default before every test: an assertion that leans on that
// default passes by omission rather than by proving anything.
import { declareBearerSession, expectBearerHeader } from '@/test/sessionContract.js';

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

// Helper: find the pencil/trash/dimensions buttons in the actions (last) td of a
// row. ETP-4610 — the hover strip may now also hold a leading "Edit dimensions"
// (Layers) button when the entity has dimension fields configured, so these can
// no longer be found by a fixed positional index; select by their title/testid
// instead (identity i18n mock returns the raw key as the title/aria-label).
function getPencilButton(container, rowId) {
  const row = container.querySelector(`[data-row-id="${rowId}"]`);
  const lastTd = row.querySelector('td:last-child');
  return lastTd.querySelector('[title="editLineTooltip"]');
}

function getTrashButton(container, rowId) {
  const row = container.querySelector(`[data-row-id="${rowId}"]`);
  const lastTd = row.querySelector('td:last-child');
  return lastTd.querySelector('[title="deleteRowTooltip"]');
}

// ETP-4610 — the "Edit dimensions" hover action replacing the old fixed
// DimSummary grid column.
function getDimensionsButton(container, rowId) {
  const row = container.querySelector(`[data-row-id="${rowId}"]`);
  const lastTd = row.querySelector('td:last-child');
  return lastTd.querySelector('[data-testid="line-action-add-dimensions"]');
}

const renderInRouter = (ui, options) =>
  render(ui, { wrapper: MemoryRouter, ...options });

beforeEach(() => {
  global.fetch = mockFetchReturning([LINE_FILLED, LINE_EMPTY]);
  useDisplayLogic.mockReturnValue({ readOnly: {}, visibility: {} });
  // vi.restoreAllMocks() in afterEach does NOT clear call history for vi.fn()s
  // created inside a vi.mock() factory (only vi.spyOn-based mocks are
  // restored) — so toast.* calls from one test's successful delete/bulkDelete
  // path would otherwise leak into the next test's assertions. Clear
  // explicitly, then re-arm extractErrorMessage's default resolved value.
  toast.success.mockClear();
  toast.error.mockClear();
  toast.warning.mockClear();
  extractErrorMessage.mockClear();
  extractErrorMessage.mockResolvedValue('mocked error message');
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
      expect.objectContaining({ }),
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

describe('AmortizationLinesTable — per-line amount formatting', () => {
  it('formats the per-line amortization amount via the shared formatCurrency (grouped, resolved symbol) instead of concatenating the raw currency identifier', async () => {
    global.fetch = mockFetchReturning([{ ...LINE_FILLED, amortizationAmount: 1500.5 }]);
    const { container } = renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    const row = container.querySelector('[data-row-id="line-1"]');
    // Grouped thousands + real resolved symbol (org currency defaults to USD in this test env).
    expect(within(row).getByText('1.500,50 $')).toBeInTheDocument();
    // Never the old bug: ungrouped number + raw currency$_identifier concatenated as a suffix.
    expect(within(row).queryByText(/1500,50/)).toBeNull();
    expect(within(row).queryByText('€')).toBeNull();
  });
});

// ETP-4610 — the permanent "Dimensiones contables" grid column (DimSummary badges /
// "+ Add dimensions" affordance) was removed. The entry point into the dimensions
// expand panel is now a static "Edit dimensions" hover action (Layers icon), shown
// whenever the entity has at least one visible dimension field — regardless of
// whether the specific line already has values set (no adaptive Add/Edit variant,
// matching InlineLinesPanel's generic dimensionsPanel mechanism / docs/feedback.md).
describe('AmortizationLinesTable — "Edit dimensions" hover action', () => {
  it('shows the hover action for a line with dimension values already set', async () => {
    const { container } = renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());
    expect(getDimensionsButton(container, 'line-1')).toBeInTheDocument();
  });

  it('shows the hover action for a line without dimension values (no adaptive variant)', async () => {
    const { container } = renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('Mobiliario')).toBeInTheDocument());
    expect(getDimensionsButton(container, 'line-2')).toBeInTheDocument();
  });

  it('uses the static "Edit dimensions" tooltip (editDimensionsTooltip i18n key) on every line', async () => {
    const { container } = renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());
    expect(getDimensionsButton(container, 'line-1')).toHaveAttribute('title', 'editDimensionsTooltip');
    expect(getDimensionsButton(container, 'line-2')).toHaveAttribute('title', 'editDimensionsTooltip');
  });

  it('clicking the hover action expands the dimensions panel, same as the chevron toggle', async () => {
    const { container } = renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    fireEvent.click(getDimensionsButton(container, 'line-1'));

    await waitFor(() => expect(screen.getByTestId('selector-costcenter')).toBeInTheDocument());
  });

  it('hides the hover action (and Pencil/Trash) when the document is read-only', async () => {
    const { container } = renderInRouter(
      <AmortizationLinesTable {...BASE_PROPS} data={{ id: 'amort-1', processed: 'Y' }} editing={false} />,
    );
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());
    expect(getDimensionsButton(container, 'line-1')).not.toBeInTheDocument();
    expect(getPencilButton(container, 'line-1')).not.toBeInTheDocument();
  });

  it('hides the hover action entirely when every dimension candidate resolves to not-visible', async () => {
    useDisplayLogic.mockReturnValue({
      readOnly: {},
      visibility: { project: false, costcenter: false, eTADASBpartner: false },
    });
    const { container } = renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());
    expect(getDimensionsButton(container, 'line-1')).not.toBeInTheDocument();
    // Pencil/Trash remain — only the dimensions action is config-gated.
    expect(getPencilButton(container, 'line-1')).toBeInTheDocument();
  });

  it('no longer renders a permanent "Accounting dimensions" column header', async () => {
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('A_Asset_ID')).toBeInTheDocument());
    expect(screen.queryByText('amortizationDimensionsTitle')).not.toBeInTheDocument();
  });
});

describe('AmortizationLinesTable — dimension expand', () => {
  it('expands the dimensions panel when the row is clicked', async () => {
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    fireEvent.click(screen.getByText('AS_Module'));

    // ETP-4610 — no more section title/badge column; the expand panel now shows
    // only the read-only Organization field + the dimension selectors.
    await waitFor(() => expect(screen.getByText('GOOrg')).toBeInTheDocument());
  });
});

describe('AmortizationLinesTable — dimension set', () => {
  it('renders ONLY the kept dimensions (Project, Cost Center, Contact) and none of the discarded ones', async () => {
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    // Expand the dimensions panel for the editable line.
    fireEvent.click(screen.getByText('AS_Module'));

    // Kept, visible dimensions render as selector stubs.
    await waitFor(() => expect(screen.getByTestId('selector-project')).toBeInTheDocument());
    expect(screen.getByTestId('selector-costcenter')).toBeInTheDocument();
    expect(screen.getByTestId('selector-eTADASBpartner')).toBeInTheDocument();

    // Product must NOT appear in amortization dimensions.
    expect(screen.queryByTestId('selector-product')).not.toBeInTheDocument();

    // Discarded dimensions (matching decisions.json line-entity visibility) must NOT render.
    expect(screen.queryByTestId('selector-stDimension')).not.toBeInTheDocument();
    expect(screen.queryByTestId('selector-ndDimension')).not.toBeInTheDocument();
    expect(screen.queryByTestId('selector-eTADASSalesRegion')).not.toBeInTheDocument();
    expect(screen.queryByTestId('selector-eTADASActivity')).not.toBeInTheDocument();
    expect(screen.queryByTestId('selector-eTADASSalesCampaign')).not.toBeInTheDocument();
  });
});

describe('AmortizationLinesTable — config-driven dimension visibility (ETP-4529)', () => {
  // NEW behavior under test: before ETP-4529 the 3 dimension candidates always
  // rendered unconditionally (DIMENSION_FIELDS). Now useAccountingDimensionFields
  // calls the same evaluate-display evaluator DetailView uses, and a candidate the
  // server explicitly marks visibility:false is filtered out of BOTH the expand
  // panel (DimensionGrid) and the collapsed row summary (DimSummary).
  it('hides a dimension the evaluator marks not visible, in both the expand panel and the row summary', async () => {
    useDisplayLogic.mockReturnValue({ readOnly: {}, visibility: { project: false } });

    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    // Expand the dimensions panel for the editable line.
    fireEvent.click(screen.getByText('AS_Module'));

    // Project is hidden; the other two config-gated dimensions remain visible.
    await waitFor(() => expect(screen.getByTestId('selector-costcenter')).toBeInTheDocument());
    expect(screen.getByTestId('selector-eTADASBpartner')).toBeInTheDocument();
    expect(screen.queryByTestId('selector-project')).not.toBeInTheDocument();
  });

  it('shows a dimension the evaluator marks visible (same result as the fail-open default)', async () => {
    useDisplayLogic.mockReturnValue({ readOnly: {}, visibility: { project: true } });

    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    fireEvent.click(screen.getByText('AS_Module'));

    await waitFor(() => expect(screen.getByTestId('selector-project')).toBeInTheDocument());
    expect(screen.getByTestId('selector-costcenter')).toBeInTheDocument();
    expect(screen.getByTestId('selector-eTADASBpartner')).toBeInTheDocument();
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
    declareBearerSession('tok');
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

// ETP-4981 — before this fix, a failed DELETE (e.g. the server blocking removal
// of a line whose parent plan is confirmed/posted, returned as 409) produced no
// feedback at all: no toast, and the row visually reappeared after the (skipped)
// refresh with zero explanation. These tests cover the failure paths that had no
// prior coverage — single-row DELETE non-ok, bulk DELETE all-failed, bulk DELETE
// partial failure, and network-level rejection (fetch throws) for both paths.
describe('AmortizationLinesTable — delete failure feedback (ETP-4981)', () => {
  // Builds a fetch mock: GET (mount/refetch) always returns `rows`; DELETE
  // outcome per line id is looked up in `deleteOutcomes` ('ok' | 'fail' |
  // 'reject'), defaulting to 'ok' for any id not listed.
  function mockFetchWithDeleteOutcomes(rows, deleteOutcomes = {}) {
    return vi.fn((url, opts) => {
      if (opts?.method === 'DELETE') {
        const id = String(url).match(/\/lines\/([^/?]+)$/)?.[1];
        const outcome = deleteOutcomes[id] ?? 'ok';
        if (outcome === 'ok') return Promise.resolve({ ok: true });
        // Empty message (like DetailView.deleteRow.vitest.js's "throwing without a
        // message" case) so deleteLine's `err?.message || ui('networkError')`
        // fallback is what's actually under test, not just "any thrown Error".
        if (outcome === 'reject') return Promise.reject(new Error(''));
        return Promise.resolve({ ok: false, status: 409 });
      }
      return Promise.resolve({ ok: true, json: async () => ({ response: { data: rows } }) });
    });
  }

  describe('single delete — deleteLine', () => {
    it('non-ok response (409, confirmed plan): toast.error with the extracted message, row is NOT removed, no success toast', async () => {
      extractErrorMessage.mockResolvedValueOnce('Cannot delete: amortization plan is confirmed');
      global.fetch = mockFetchWithDeleteOutcomes([LINE_FILLED, LINE_EMPTY], { 'line-1': 'fail' });

      const { container } = renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
      await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

      fireEvent.click(getTrashButton(container, 'line-1'));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Cannot delete: amortization plan is confirmed'),
      );
      expect(extractErrorMessage).toHaveBeenCalledTimes(1);
      expect(toast.success).not.toHaveBeenCalled();

      // The row must still be in the DOM — it never vanished (no fetchLines() on failure).
      expect(screen.getByText('AS_Module')).toBeInTheDocument();
      expect(container.querySelector('[data-row-id="line-1"]')).not.toBeNull();
    });

    it('network-level rejection (fetch throws): falls back to ui(networkError) toast, no crash, row stays', async () => {
      global.fetch = mockFetchWithDeleteOutcomes([LINE_FILLED, LINE_EMPTY], { 'line-1': 'reject' });

      const { container } = renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
      await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

      fireEvent.click(getTrashButton(container, 'line-1'));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('networkError'));
      expect(toast.success).not.toHaveBeenCalled();
      // extractErrorMessage is only reached on a non-ok HTTP response, never on a
      // thrown/rejected fetch — the catch block handles this path instead.
      expect(extractErrorMessage).not.toHaveBeenCalled();
      expect(container.querySelector('[data-row-id="line-1"]')).not.toBeNull();
    });
  });

  describe('bulk delete — bulkDelete', () => {
    it('all failed: fires the all-failed toast, leaves selection untouched, does not refetch', async () => {
      global.fetch = mockFetchWithDeleteOutcomes([LINE_FILLED, LINE_EMPTY], {
        'line-1': 'fail',
        'line-2': 'fail',
      });
      const onRefresh = vi.fn();

      renderInRouter(<AmortizationLinesTable {...BASE_PROPS} onRefresh={onRefresh} />);
      await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('checkbox', { name: 'selectAll' }));
      await waitFor(() => expect(screen.getByTitle('delete')).toBeInTheDocument());

      global.fetch.mockClear();
      fireEvent.click(screen.getByTitle('delete'));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('bulkDeleteAllFailed'));
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.warning).not.toHaveBeenCalled();

      // No refetch: only the 2 DELETE calls should have fired, no follow-up GET,
      // and onRefresh (called only on the succeeded.length > 0 branch) is skipped.
      await waitFor(() => {
        const calls = global.fetch.mock.calls;
        expect(calls.length).toBe(2);
        expect(calls.every(([, opts]) => opts?.method === 'DELETE')).toBe(true);
      });
      expect(onRefresh).not.toHaveBeenCalled();

      // Selection left untouched — both rows remain checked (per the documented
      // contract: all failed -> selection state is not modified).
      const rowCheckboxes = screen.getAllByRole('checkbox', { name: 'selectRow' });
      rowCheckboxes.forEach(cb => expect(cb).toHaveAttribute('aria-checked', 'true'));
    });

    it('partial failure: fires the partial toast, keeps only the failed id selected, and refetches', async () => {
      global.fetch = mockFetchWithDeleteOutcomes([LINE_FILLED, LINE_EMPTY], {
        'line-1': 'ok',
        'line-2': 'fail',
      });
      const onRefresh = vi.fn();

      renderInRouter(<AmortizationLinesTable {...BASE_PROPS} onRefresh={onRefresh} />);
      await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('checkbox', { name: 'selectAll' }));
      await waitFor(() => expect(screen.getByTitle('delete')).toBeInTheDocument());

      global.fetch.mockClear();
      fireEvent.click(screen.getByTitle('delete'));

      await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('bulkDeletePartialFailure'));
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();

      // At least one succeeded -> refetch + onRefresh do happen.
      await waitFor(() => expect(onRefresh).toHaveBeenCalled());
      await waitFor(() => {
        const getCalls = global.fetch.mock.calls.filter(([, opts]) => !opts?.method || opts.method === 'GET');
        expect(getCalls.length).toBeGreaterThanOrEqual(1);
      });

      // Only the failed id (line-2) remains selected; the succeeded id (line-1) is cleared.
      await waitFor(() => {
        const rowCheckboxes = screen.getAllByRole('checkbox', { name: 'selectRow' });
        expect(rowCheckboxes[0]).toHaveAttribute('aria-checked', 'false'); // line-1, succeeded
        expect(rowCheckboxes[1]).toHaveAttribute('aria-checked', 'true'); // line-2, failed
      });
    });

    it('network-level rejection for every row (fetch throws, not just non-ok): treated as all-failed, no crash', async () => {
      global.fetch = mockFetchWithDeleteOutcomes([LINE_FILLED, LINE_EMPTY], {
        'line-1': 'reject',
        'line-2': 'reject',
      });
      const onRefresh = vi.fn();

      renderInRouter(<AmortizationLinesTable {...BASE_PROPS} onRefresh={onRefresh} />);
      await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('checkbox', { name: 'selectAll' }));
      await waitFor(() => expect(screen.getByTitle('delete')).toBeInTheDocument());

      fireEvent.click(screen.getByTitle('delete'));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('bulkDeleteAllFailed'));
      expect(onRefresh).not.toHaveBeenCalled();

      // Still both rows selected/present — no crash, no premature clear.
      const rowCheckboxes = screen.getAllByRole('checkbox', { name: 'selectRow' });
      rowCheckboxes.forEach(cb => expect(cb).toHaveAttribute('aria-checked', 'true'));
    });
  });
});
