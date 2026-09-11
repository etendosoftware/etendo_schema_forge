// Behavioral replacements for three cases the deleted source-reading suite
// (AmortizationLinesTable.test.js, removed for ETP-4958 — see AmortizationLinesTable.writeQueue.
// vitest.jsx's header comment for the full rationale) only ever asserted as regex matches against
// the file text, with no coverage of what the component actually DOES:
//
// - Escape while inline-editing a line closes edit mode WITHOUT saving. This is the direct
//   complement of the write-queue coverage: it pins down that this particular path never writes.
// - a `neo:processSuccess` window event triggers a refetch of the lines.
// - the trash (delete) hover action is hidden on a read-only/processed document, matching the
//   already-covered pencil and add-line cases.
//
// (`onCountChange` after fetch, the plain DELETE call, and dimension onFieldSave auto-save were
// checked against this list too — all three already have real behavioral coverage in
// AmortizationLinesTable.vitest.jsx, so they are not repeated here.)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (col) => col,
}));

vi.mock('@/components/contract-ui/SelectorInput', () => ({
  default: ({ field, onChange }) => (
    <button data-testid={`selector-${field.key}`} onClick={() => onChange('new-val', 'New Label')}>
      selector-{field.key}
    </button>
  ),
}));

vi.mock('@/components/ui/add-line-button', () => ({
  AddLineButton: ({ onClick, label }) => (
    <button data-testid="add-line-btn" onClick={onClick}>{label}</button>
  ),
}));

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

vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: vi.fn(() => ({ readOnly: {}, visibility: {} })),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/hooks/useEntity', () => ({
  extractErrorMessage: vi.fn(),
}));

import AmortizationLinesTable from '../AmortizationLinesTable.jsx';

const LINE = {
  id: 'line-1',
  asset: 'asset-1',
  'asset$_identifier': 'AS_Module',
  amortizationPercentage: 27.42,
  amortizationAmount: 548.39,
};

const BASE_PROPS = {
  recordId: 'amort-1',
  data: { id: 'amort-1', processed: 'N' },
  token: 'tok',
  apiBaseUrl: 'http://host/neo/amortization',
  api: { labelOverrides: {} },
  editing: true,
  catalogs: {},
};

const renderInRouter = (ui) => render(ui, { wrapper: MemoryRouter });

function mockFetchReturning(rows) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ response: { data: rows } }),
  });
}

function getPencilButton(container, rowId = 'line-1') {
  const row = container.querySelector(`[data-row-id="${rowId}"]`);
  const lastTd = row.querySelector('td:last-child');
  return lastTd.querySelector('[title="editLineTooltip"]');
}

function getTrashButton(container, rowId = 'line-1') {
  const row = container.querySelector(`[data-row-id="${rowId}"]`);
  const lastTd = row.querySelector('td:last-child');
  return lastTd.querySelector('[title="deleteRowTooltip"]');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AmortizationLinesTable — inline edit mode Escape', () => {
  it('Escape on an inline number input closes edit mode WITHOUT sending a PUT', async () => {
    global.fetch = mockFetchReturning([LINE]);
    const { container } = renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    fireEvent.click(getPencilButton(container));
    await waitFor(() => expect(container.querySelector('input[type="number"]')).not.toBeNull());

    const percentageInput = container.querySelectorAll('input[type="number"]')[0];
    fireEvent.change(percentageInput, { target: { value: '99' } });

    global.fetch.mockClear();
    fireEvent.keyDown(percentageInput, { key: 'Escape' });

    // Edit mode closes — the inline inputs are gone, the plain (non-editing) cell is back.
    await waitFor(() => expect(container.querySelector('input[type="number"]')).toBeNull());

    // Escape must never trigger a save: no PUT (or any fetch at all) was issued.
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('AmortizationLinesTable — neo:processSuccess refetch', () => {
  it('re-fetches the lines when a neo:processSuccess event fires for this record', async () => {
    global.fetch = mockFetchReturning([LINE]);
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    global.fetch.mockClear();
    window.dispatchEvent(new CustomEvent('neo:processSuccess', { detail: { recordId: 'amort-1' } }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/lines?parentId=amort-1'),
      expect.anything(),
    ));
  });

  it('ignores a neo:processSuccess event for a DIFFERENT record id', async () => {
    global.fetch = mockFetchReturning([LINE]);
    renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    global.fetch.mockClear();
    window.dispatchEvent(new CustomEvent('neo:processSuccess', { detail: { recordId: 'some-other-record' } }));

    await new Promise((r) => setTimeout(r, 0));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('AmortizationLinesTable — read-only hides delete too', () => {
  it('hides the trash (delete) hover action when the document is read-only/processed', async () => {
    global.fetch = mockFetchReturning([LINE]);
    const { container } = renderInRouter(
      <AmortizationLinesTable {...BASE_PROPS} data={{ id: 'amort-1', processed: 'Y' }} editing={false} />,
    );
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());
    expect(getTrashButton(container)).toBeNull();
  });
});
