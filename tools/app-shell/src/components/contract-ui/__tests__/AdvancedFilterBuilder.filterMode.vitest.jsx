/**
 * ETP-4681 — regression guard for the Dashboard `?filter=overdue` preload.
 *
 * The invoice list declares `outstandingAmount` as `type: 'custom'` because the
 * cell renders status pills plus a payment button. `type: 'custom'` carries no
 * filter semantics, so the column MUST declare `filterMode: 'numeric'` — without
 * it, `resolveFilterMode` degrades to 'text' mode, whose operator set has no
 * `greaterThan`. The preloaded condition then renders with an EMPTY operator
 * select and a text input instead of "greater than" + a number input.
 *
 * Unlike AdvancedFilterBuilder.vitest.jsx, this suite uses the REAL
 * `resolveFilterMode` — mocking it would defeat the entire point of the test.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/hooks/useDistinctValues.js', () => ({
  useDistinctValues: () => ({
    values: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    search: '',
    setSearch: vi.fn(),
    loadMore: vi.fn(),
  }),
}));

import { AdvancedFilterBuilder } from '../AdvancedFilterBuilder.jsx';

// Radix Select needs a few DOM APIs jsdom does not implement in order to open.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

// Shaped like the real sales/purchase invoice header table columns.
const OUTSTANDING_COLUMN = {
  key: 'outstandingAmount',
  column: 'OutstandingAmt',
  type: 'custom',
  filterMode: 'numeric',
  label: 'Pendiente de pago',
};

const DUE_DATE_COLUMN = {
  key: 'eTGODueDate',
  column: 'EM_Etgo_Due_Date',
  type: 'custom',
  filterMode: 'date',
  label: 'Vencimiento',
};

function makeColumns(overrides = {}) {
  return [
    { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.' },
    {
      key: 'documentStatus',
      column: 'DocStatus',
      type: 'status',
      label: 'Status',
      enumLabels: { DR: 'Draft', CO: 'Completed' },
    },
    { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: 'Total' },
    { ...OUTSTANDING_COLUMN, ...(overrides.outstanding ?? {}) },
    { ...DUE_DATE_COLUMN, ...(overrides.dueDate ?? {}) },
  ];
}

// The Dashboard preload for `/sales-invoice?filter=overdue`.
const OVERDUE_FILTER = {
  rowOperator: 'and',
  conditions: [
    { field: 'documentStatus', operator: 'equals', value: 'CO' },
    { field: 'outstandingAmount', operator: 'greaterThan', value: 0 },
  ],
};

/**
 * Return the condition row wrappers. Each row's remove button is a direct child
 * of the row container, so the button's parent is the row.
 */
function getRows() {
  return screen.getAllByLabelText('Remove condition').map((btn) => btn.parentElement);
}

/**
 * The operator Select is the last combobox in a row: rows after the first open
 * with the and/or connector, then the field select, then the operator select.
 * The value editor for numeric/date/text modes is an <input>, never a combobox.
 */
function getOperatorTrigger(row) {
  const combos = within(row).getAllByRole('combobox');
  return combos[combos.length - 1];
}

/**
 * Radix mounts SelectContent into a detached fragment while closed, so the
 * operator list has to be opened before its items exist in the document.
 */
async function openOperatorOptions(row) {
  const user = userEvent.setup();
  await user.click(getOperatorTrigger(row));
  return screen.getAllByRole('option').map((el) => el.textContent);
}

describe('AdvancedFilterBuilder — custom column with explicit filterMode (ETP-4681)', () => {
  it('renders both preloaded conditions', () => {
    render(<AdvancedFilterBuilder columns={makeColumns()} value={OVERDUE_FILTER} />);
    expect(getRows()).toHaveLength(2);
  });

  it('shows the "greater than" operator label on the outstandingAmount row', () => {
    render(<AdvancedFilterBuilder columns={makeColumns()} value={OVERDUE_FILTER} />);
    const operatorTrigger = getOperatorTrigger(getRows()[1]);
    // OP_LABEL_KEY.greaterThan → 'opGreaterThan'; the mocked ui() returns the key.
    expect(operatorTrigger).toHaveTextContent('opGreaterThan');
    // The placeholder must NOT be showing — that is the reported bug.
    expect(operatorTrigger).not.toHaveTextContent('advancedFilterSelectOp');
  });

  it('renders a number input for the outstandingAmount value', () => {
    render(<AdvancedFilterBuilder columns={makeColumns()} value={OVERDUE_FILTER} />);
    const valueInput = within(getRows()[1]).getByTestId('Input__4eedf1');
    expect(valueInput).toHaveAttribute('type', 'number');
  });

  it('keeps the first row on the enum picker (status column is unaffected)', () => {
    render(<AdvancedFilterBuilder columns={makeColumns()} value={OVERDUE_FILTER} />);
    const operatorTrigger = getOperatorTrigger(getRows()[0]);
    // OP_LABEL_KEY.equals → 'opIs'
    expect(operatorTrigger).toHaveTextContent('opIs');
  });

  it('offers the full numeric operator set on the outstandingAmount row', async () => {
    render(<AdvancedFilterBuilder columns={makeColumns()} value={OVERDUE_FILTER} />);
    const optionLabels = await openOperatorOptions(getRows()[1]);
    for (const key of ['opGreaterThan', 'opGreaterOrEqual', 'opLessThan', 'opLessOrEqual', 'opBetween']) {
      expect(optionLabels).toContain(key);
    }
    // Text-only operators must not leak into a numeric column.
    expect(optionLabels).not.toContain('opContains');
  });

  it('enables the apply button for the preloaded overdue filter', () => {
    render(<AdvancedFilterBuilder columns={makeColumns()} value={OVERDUE_FILTER} />);
    expect(screen.getByText('advancedFilterApply')).not.toBeDisabled();
  });

  it('resolves the due-date custom column to date operators and a date input', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'eTGODueDate', operator: 'greaterThan', value: '2026-07-29' }],
    };
    render(<AdvancedFilterBuilder columns={makeColumns()} value={value} />);
    const row = getRows()[0];
    // Date mode relabels greaterThan → 'opAfter' (OP_LABEL_KEY_DATE).
    expect(getOperatorTrigger(row)).toHaveTextContent('opAfter');
    expect(within(row).getByTestId('Input__4eedf1')).toHaveAttribute('type', 'date');
  });
});

// ── Negative control: this is what locks the fix in ───────────────────────────
// Dropping `filterMode` from the custom column reproduces the original bug.

describe('AdvancedFilterBuilder — custom column WITHOUT filterMode reproduces the bug', () => {
  const brokenColumns = () => {
    const cols = makeColumns();
    return cols.map((c) => {
      if (c.key !== 'outstandingAmount') return c;
      const { filterMode, ...rest } = c;
      return rest;
    });
  };

  it('does not render the greater-than label (operator select comes up empty)', () => {
    render(<AdvancedFilterBuilder columns={brokenColumns()} value={OVERDUE_FILTER} />);
    const operatorTrigger = getOperatorTrigger(getRows()[1]);
    expect(operatorTrigger).not.toHaveTextContent('opGreaterThan');
  });

  it('degrades the value editor to a text input', () => {
    render(<AdvancedFilterBuilder columns={brokenColumns()} value={OVERDUE_FILTER} />);
    const valueInput = within(getRows()[1]).getByTestId('Input__4eedf1');
    expect(valueInput).toHaveAttribute('type', 'text');
  });

  it('offers only text operators, so greaterThan is unreachable', async () => {
    render(<AdvancedFilterBuilder columns={brokenColumns()} value={OVERDUE_FILTER} />);
    const optionLabels = await openOperatorOptions(getRows()[1]);
    expect(optionLabels).toContain('opContains');
    expect(optionLabels).not.toContain('opGreaterThan');
  });
});
