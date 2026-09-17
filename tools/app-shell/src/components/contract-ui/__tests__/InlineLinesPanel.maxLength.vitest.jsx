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
import InlineLinesPanel from '../InlineLinesPanel.jsx';

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

const ROWS = [
  { id: 'L1', description: 'Existing description' },
];

function renderPanel(columns) {
  return render(
    <InlineLinesPanel
      columns={columns}
      data={ROWS}
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
