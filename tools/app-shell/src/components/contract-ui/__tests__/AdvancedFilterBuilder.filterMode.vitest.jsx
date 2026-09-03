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
 * It also drives the REAL Radix Select (with the jsdom polyfills in `beforeAll`)
 * instead of swapping in a native <select>, so the operator lists asserted below
 * are the ones a user actually sees when opening the dropdown.
 *
 * Mocking note (post-ETP-4705): the local AdvancedFilterBuilder.jsx is now a
 * 2-line shim re-exporting the component from `@etendosoftware/app-shell-core`,
 * so the component that renders is the CORE one and its internal imports are
 * relative to the core package (`../../i18n/index.js`,
 * `../../hooks/useDistinctValues.js`). Vitest matches mocks by RESOLVED module
 * id, so the functional-path mocks (`@/i18n`, `@/hooks/...`) no longer bind —
 * the core package's exports map routes the subpath specifiers below to those
 * very files, which is why the core-subpath mocks are the ones that take effect.
 * Same pattern as AdvancedFilterBuilder.vitest.jsx /
 * AdvancedFilterBuilder.cross-window.vitest.jsx. `lib/gridQuery.js` is
 * deliberately NOT mocked on either path.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Function declarations (not const arrows): `vi.mock` calls are hoisted above
// every other statement in the module, so the factories must be hoisted too.
function uiMocks() {
  return {
    LocaleProvider: ({ children }) => children,
    useLabel: () => (key) => key,
    useMenuLabel: () => (key) => key,
    useUI: () => (key) => key,
    useLocale: () => ({ genericLabels: {}, statuses: {} }),
    useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
    useLocaleState: () => ({ locale: 'en_US', setLocale: vi.fn() }),
    getStoredLocale: () => 'en_US',
    resolveLabel: (key) => key,
    resolveUI: (key) => key,
  };
}

function distinctValuesMock() {
  return {
    useDistinctValues: () => ({
      values: [],
      loading: false,
      loadingMore: false,
      hasMore: false,
      search: '',
      setSearch: vi.fn(),
      loadMore: vi.fn(),
    }),
  };
}

// Functional-path mocks: inert while AdvancedFilterBuilder.jsx is a core shim,
// kept so this suite keeps working if the component ever moves back in-repo.
vi.mock('@/i18n', uiMocks);
vi.mock('@/hooks/useDistinctValues.js', distinctValuesMock);

// Core-path mocks: these are the ones the rendered component actually resolves.
vi.mock('@etendosoftware/app-shell-core/i18n', uiMocks);
vi.mock('@etendosoftware/app-shell-core/hooks/useDistinctValues.js', distinctValuesMock);

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
  label: 'Saldo pendiente',
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

  // The numeric editor is NOT an <input type="number">: the grid renders amounts
  // with a locale decimal comma ("1.646,49 €") and a number input refuses that
  // character in most browsers, so the user could only ever type the value back
  // in a format they never see. It is a text input carrying
  // `inputMode="decimal"` (numeric keypad on mobile, comma allowed), and the
  // builder normalizes to canonical dot-decimal at apply time — so `inputMode`,
  // not `type`, is the attribute that says "numeric" here.
  it('renders the numeric editor for the outstandingAmount value', () => {
    render(<AdvancedFilterBuilder columns={makeColumns()} value={OVERDUE_FILTER} />);
    const valueInput = within(getRows()[1]).getByTestId('Input__4eedf1');
    expect(valueInput).toHaveAttribute('type', 'text');
    expect(valueInput).toHaveAttribute('inputMode', 'decimal');
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

  it('resolves the due-date custom column to date operators and a date editor', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'eTGODueDate', operator: 'greaterThan', value: '2026-07-29' }],
    };
    render(<AdvancedFilterBuilder columns={makeColumns()} value={value} />);
    const row = getRows()[0];
    // Date mode relabels greaterThan → 'opAfter' (OP_LABEL_KEY_DATE).
    expect(getOperatorTrigger(row)).toHaveTextContent('opAfter');
    // Date mode renders the locale-masked DateField (calendar button + masked
    // text input), not the plain <Input> used by text/numeric mode. The absence
    // of `Input__4eedf1` is the load-bearing half: it proves the column did NOT
    // degrade to text mode, which is exactly the ETP-4681 bug shape.
    const dateEditor = within(row).getByTestId('AdvancedFilterBuilder__DateField');
    expect(within(row).queryByTestId('Input__4eedf1')).not.toBeInTheDocument();
    // The preloaded ISO value is shown formatted for the mocked en_US locale,
    // proving the value round-tripped through the date editor rather than being
    // dropped or rendered raw.
    expect(dateEditor).toHaveValue('07/29/2026');
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

  // Both editors are `type="text"`, so that attribute alone cannot tell them
  // apart — the absence of `inputMode` is what makes this one a PLAIN text box.
  // Asserted against its numeric counterpart above so the two stay distinct.
  it('degrades the value editor to a plain text input (no numeric input mode)', () => {
    render(<AdvancedFilterBuilder columns={brokenColumns()} value={OVERDUE_FILTER} />);
    const valueInput = within(getRows()[1]).getByTestId('Input__4eedf1');
    expect(valueInput).toHaveAttribute('type', 'text');
    expect(valueInput).not.toHaveAttribute('inputMode');
  });

  it('offers only text operators, so greaterThan is unreachable', async () => {
    render(<AdvancedFilterBuilder columns={brokenColumns()} value={OVERDUE_FILTER} />);
    const optionLabels = await openOperatorOptions(getRows()[1]);
    expect(optionLabels).toContain('opContains');
    expect(optionLabels).not.toContain('opGreaterThan');
  });
});
