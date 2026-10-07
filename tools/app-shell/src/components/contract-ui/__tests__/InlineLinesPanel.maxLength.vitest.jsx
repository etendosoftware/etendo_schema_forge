// @covers tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx
/**
 * ETP-5323 — InlineLinesPanel's EditCell text fallback (the one used for a plain
 * `type: 'string'` column, e.g. C_OrderLine.Description) must apply the generated
 * column's `maxLength` as a hard client-side stop, so a user cannot even type past
 * the AD column's DB length (e.g. 2000 chars) before the backend gets a chance to
 * reject the PATCH with a "Value too long" validation error.
 *
 * Mirrors InlineLinesPanel.vitest.jsx's mock setup (kept in its own file — that
 * spec is already very large — following the sibling-file convention used across
 * this directory, e.g. InlineLinesPanel.cellBadges.vitest.jsx).
 */
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InlineLinesPanel, { editTextMaxLength } from '../InlineLinesPanel.jsx';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/i18n', () => ({
  useLabel: () => () => '',
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => {
    const idKey = `${key}$_identifier`;
    return row[idKey] || row[key] || '';
  },
}));

vi.mock('@/lib/resolveColumnLabel.js', () => ({
  resolveColumnLabel: (col) => col.label || col.key,
}));

vi.mock('@/lib/linesColumnWidth.js', () => ({
  columnFlex: () => '1 0 100px',
  columnMinWidthPx: () => 100,
  isLineGridColumn: (col) => col?.type !== 'dimensionsPanel',
}));

vi.mock('../InlineSearchCombo.jsx', () => ({
  InlineSearchCombo: () => <span data-testid="inline-combo" />,
}));
vi.mock('../SelectorInput.jsx', () => ({
  SelectorInput: () => <span data-testid="selector-input" />,
  default: () => <div data-testid="dimension-field" />,
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({
  default: () => null,
}));
vi.mock('./quickActionsStyle.js', () => ({
  QUICK_ACTIONS_PILL_CLASS: 'pill',
}));

// Within every limit used below (8 chars), so the AD limit itself is what each case checks.
const ROWS = [
  { id: 'L1', description: 'Existing' },
];

function renderPanel(columns, data = ROWS) {
  return render(
    <InlineLinesPanel
      columns={columns}
      data={data}
      entity="lines"
      token="test"
      apiBaseUrl="/api"
      selectorContext={{}}
      onSelectionChange={vi.fn()}
      onUpdateRow={vi.fn().mockResolvedValue()}
      onDeleteRow={vi.fn().mockResolvedValue()}
    />,
  );
}

async function enterEditMode(row) {
  await act(async () => {
    await userEvent.hover(row);
  });
  const actions = within(row).getByTestId('line-actions');
  const editBtn = within(actions).getAllByRole('button')[0]; // pencil is first
  await act(async () => {
    await userEvent.click(editBtn);
  });
}

describe('InlineLinesPanel EditCell — text maxLength (ETP-5323)', () => {
  it('applies the column maxLength as the HTML attribute on the edit-mode text input', async () => {
    const columns = [
      { key: 'description', label: 'Description', type: 'string', maxLength: 2000 },
    ];
    renderPanel(columns);
    const row = screen.getByTestId('line-row-L1');
    await enterEditMode(row);

    const input = within(row).getByTestId('field-description');
    expect(input).toHaveAttribute('maxlength', '2000');
  });

  it('does not add a maxlength attribute when the column declares none (regression guard)', async () => {
    const columns = [
      { key: 'description', label: 'Description', type: 'string' },
    ];
    renderPanel(columns);
    const row = screen.getByTestId('line-row-L1');
    await enterEditMode(row);

    const input = within(row).getByTestId('field-description');
    expect(input).not.toHaveAttribute('maxlength');
  });

  it('prevents typing past the configured maxLength (native browser enforcement)', async () => {
    const columns = [
      { key: 'description', label: 'Description', type: 'string', maxLength: 10 },
    ];
    renderPanel(columns);
    const row = screen.getByTestId('line-row-L1');
    await enterEditMode(row);

    const input = within(row).getByTestId('field-description');
    await act(async () => {
      input.focus();
      await userEvent.clear(input);
      await userEvent.type(input, 'This description is way longer than ten characters');
    });

    // jsdom + userEvent respect the native maxLength attribute on a real <input>.
    expect(input.value.length).toBeLessThanOrEqual(10);
    expect(input.value).toBe('This descr');
  });
});

// ETP-5657 — a limit below the value the row ALREADY holds used to freeze the cell: the browser
// refuses every insertion while the value is at or over maxLength, so deleting a character still
// left it uneditable (the Exchange rates `rate`, AD length 10, holding 0.68027210884).
describe('editTextMaxLength (ETP-5657)', () => {
  it('is undefined when the column declares no limit', () => {
    expect(editTextMaxLength(undefined, 'abc')).toBeUndefined();
    expect(editTextMaxLength(null, 'abc')).toBeUndefined();
    expect(editTextMaxLength(0, 'abc')).toBeUndefined();
    expect(editTextMaxLength('', 'abc')).toBeUndefined();
  });

  it('is the limit for a value within it', () => {
    expect(editTextMaxLength(10, 'Existing')).toBe(10);
    expect(editTextMaxLength(10, '0123456789')).toBe(10);
  });

  it('is the value length for a stored value longer than the limit', () => {
    expect(editTextMaxLength(10, 'Existing description')).toBe(20);
    expect(editTextMaxLength(10, 0.68027210884)).toBe(13);
  });

  it('is the limit for a null or undefined value', () => {
    expect(editTextMaxLength(10, null)).toBe(10);
    expect(editTextMaxLength(10, undefined)).toBe(10);
  });

  it('accepts a numeric-string limit', () => {
    expect(editTextMaxLength('10', 'abc')).toBe(10);
  });
});

describe('InlineLinesPanel EditCell — a stored value longer than the limit stays editable (ETP-5657)', () => {
  const COLUMNS = [{ key: 'description', label: 'Description', type: 'string', maxLength: 10 }];
  const LONG = 'Existing description'; // 20 chars, over the 10-char limit

  it('raises the attribute to the stored length instead of freezing the cell', async () => {
    renderPanel(COLUMNS, [{ id: 'L1', description: LONG }]);
    const row = screen.getByTestId('line-row-L1');
    await enterEditMode(row);
    expect(within(row).getByTestId('field-description')).toHaveAttribute('maxlength', '20');
  });

  it('accepts deleting one character and typing one back', async () => {
    renderPanel(COLUMNS, [{ id: 'L1', description: LONG }]);
    const row = screen.getByTestId('line-row-L1');
    await enterEditMode(row);

    const input = within(row).getByTestId('field-description');
    expect(input).toHaveValue(LONG);
    await act(async () => {
      input.focus();
      input.setSelectionRange(LONG.length, LONG.length);
      await userEvent.keyboard('{Backspace}');
    });
    expect(input).toHaveValue('Existing descriptio');
    await act(async () => {
      await userEvent.type(input, 'N');
    });
    expect(input).toHaveValue('Existing descriptioN');
  });

  it('still refuses growth past the stored length', async () => {
    renderPanel(COLUMNS, [{ id: 'L1', description: LONG }]);
    const row = screen.getByTestId('line-row-L1');
    await enterEditMode(row);

    const input = within(row).getByTestId('field-description');
    await act(async () => {
      input.focus();
      input.setSelectionRange(LONG.length, LONG.length);
      await userEvent.type(input, 'XYZ');
    });
    expect(input).toHaveValue(LONG);
  });
});
