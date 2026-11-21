// @covers tools/app-shell/src/components/contract-ui/InlineLinesPanel.jsx
// @covers tools/app-shell/src/lib/coreValidation.js
/**
 * ETP-4557 — inline edit goes through the shared core validator: native attributes reach the
 * editor, an invalid changed value blocks the PATCH and flags the input, a correction saves.
 */
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InlineLinesPanel from '../InlineLinesPanel.jsx';

// Stub TrashIcon / PencilSimpleIcon from @phosphor-icons/react with marker svgs so the tests can
// assert which glyph a row action renders, while every other icon stays real.
vi.mock('@phosphor-icons/react', async (importOriginal) => ({
  ...(await importOriginal()),
  TrashIcon: (props) => <svg data-icon="phosphor-trash" {...props} />,
  PencilSimpleIcon: (props) => <svg data-icon="phosphor-pencil" {...props} />,
}));

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
  withLinesAbsorberColumn: (cols) => cols,
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
  { id: 'L1', etgoEmail: '' },
];

function renderPanel(columns, onUpdateRow = vi.fn().mockResolvedValue()) {
  return render(
    <InlineLinesPanel
      columns={columns}
      data={ROWS}
      entity="lines"
      token="test"
      apiBaseUrl="/api"
      selectorContext={{}}
      onSelectionChange={vi.fn()}
      onUpdateRow={onUpdateRow}
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


import { toast } from 'sonner';

const columns = [{ key: 'etgoEmail', column: 'EM_Etgo_Email', label: 'Email', type: 'string', maxLength: 40 }];

async function commit(row, value) {
  const input = within(row).getByTestId('field-etgoEmail');
  await act(async () => {
    input.focus();
    await userEvent.clear(input);
    if (value) await userEvent.type(input, value);
    input.blur();
  });
}

describe('InlineLinesPanel inline edit — shared core validator (ETP-4557)', () => {
  beforeEach(() => toast.error.mockClear());

  it('renders maxLength and the inferred inputMode on the editor', async () => {
    renderPanel(columns);
    const row = screen.getByTestId('line-row-L1');
    await enterEditMode(row);
    const input = within(row).getByTestId('field-etgoEmail');
    expect(input).toHaveAttribute('maxlength', '40');
    expect(input).toHaveAttribute('inputmode', 'email');
  });

  it('blocks the PATCH for an invalid changed value and flags the input', async () => {
    const onUpdateRow = vi.fn().mockResolvedValue();
    renderPanel(columns, onUpdateRow);
    const row = screen.getByTestId('line-row-L1');
    await enterEditMode(row);
    await commit(row, 'not-an-email');
    expect(onUpdateRow).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('sendModalInvalidEmail');
    expect(within(row).getByTestId('field-etgoEmail')).toHaveAttribute('aria-invalid', 'true');
  });

  it('saves after a valid correction (re-validation clears the block)', async () => {
    const onUpdateRow = vi.fn().mockResolvedValue();
    renderPanel(columns, onUpdateRow);
    const row = screen.getByTestId('line-row-L1');
    await enterEditMode(row);
    await commit(row, 'not-an-email');
    expect(onUpdateRow).not.toHaveBeenCalled();
    await commit(row, 'ok@acme.com');
    expect(onUpdateRow).toHaveBeenCalledTimes(1);
    expect(onUpdateRow.mock.calls[0][1]).toBe('etgoEmail');
    expect(onUpdateRow.mock.calls[0][2]).toBe('ok@acme.com');
  });
});
