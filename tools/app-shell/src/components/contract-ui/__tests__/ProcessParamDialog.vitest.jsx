/**
 * Unit tests for ProcessParamDialog (ETP-4248).
 *
 * The dialog collects parameter values before invoking a process.
 * It pre-populates the first option for each select-type param on open,
 * disables Confirm until all required params have a value, and passes
 * the collected values to onConfirm.
 */

// --- MOCKS BEFORE IMPORTS ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ children, open }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => (
    <h2 data-testid="process-param-dialog-title">{children}</h2>
  ),
  DialogFooter: ({ children }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }) => <label {...props}>{children}</label>,
}));

// Radix Select cannot run in JSDOM — replace with a native <select> that
// honours value/onValueChange and renders options via SelectItem.
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }) => (
    <div>
      <select
        value={value ?? ''}
        onChange={(e) => onValueChange?.(e.target.value)}
        data-testid="select-control"
      >
        {children}
      </select>
    </div>
  ),
  SelectTrigger: ({ children, ...props }) => <span {...props}>{children}</span>,
  SelectValue: () => null,
  SelectContent: ({ children }) => <>{children}</>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
}));

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProcessParamDialog } from '../ProcessParamDialog.jsx';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const noop = () => {};

const SELECT_PARAM = {
  key: 'period',
  label: 'period',
  type: 'select',
  options: [
    { value: 'Y', label: 'Open' },
    { value: 'N', label: 'Closed' },
  ],
};

const REQUIRED_SELECT_PARAM = { ...SELECT_PARAM, required: true };

// A required select with no options — useEffect cannot pre-populate it,
// so values['period'] stays undefined → canConfirm = false.
const REQUIRED_EMPTY_OPTIONS_PARAM = {
  key: 'action',
  label: 'action',
  type: 'select',
  options: [],
  required: true,
};

const HIDDEN_PARAM = {
  key: 'hidden',
  label: 'hidden',
  type: 'select',
  options: [{ value: 'X', label: 'X' }],
  hidden: true,
};

function buildProcess(params = []) {
  return { name: 'testProcess', label: 'testProcess', params };
}

function renderDialog(props = {}) {
  const defaults = {
    open: false,
    onOpenChange: vi.fn(),
    process: null,
    onConfirm: vi.fn(),
  };
  return render(<ProcessParamDialog {...defaults} {...props} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProcessParamDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when process is null and open is false', () => {
    const { container } = renderDialog({ open: false, process: null });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when open is false even if process is provided', () => {
    const { container } = renderDialog({
      open: false,
      process: buildProcess([SELECT_PARAM]),
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the dialog title through ui() when open is true', () => {
    renderDialog({ open: true, process: buildProcess([]) });
    // useUI returns the key as-is → ui('testProcess') = 'testProcess'
    expect(screen.getByTestId('process-param-dialog-title')).toHaveTextContent(
      'testProcess',
    );
  });

  it('renders the param label and select options', () => {
    renderDialog({ open: true, process: buildProcess([SELECT_PARAM]) });
    // Label: ui('period') = 'period'
    expect(screen.getByText('period')).toBeInTheDocument();
    // Options inside the mocked native <select>
    expect(screen.getByRole('option', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Closed' })).toBeInTheDocument();
  });

  it('disables Confirm when a required param has no value (empty options list)', () => {
    renderDialog({
      open: true,
      process: buildProcess([REQUIRED_EMPTY_OPTIONS_PARAM]),
    });
    // No options → useEffect sets no initial value → canConfirm = false
    expect(screen.getByTestId('process-param-confirm')).toBeDisabled();
  });

  it('enables Confirm when a required select param is pre-populated with the first option', () => {
    renderDialog({
      open: true,
      process: buildProcess([REQUIRED_SELECT_PARAM]),
    });
    // useEffect: first option value 'Y' is set → canConfirm = true
    expect(screen.getByTestId('process-param-confirm')).not.toBeDisabled();
  });

  it('calls onConfirm with the collected values when Confirm is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderDialog({
      open: true,
      process: buildProcess([REQUIRED_SELECT_PARAM]),
      onConfirm,
    });
    await user.click(screen.getByTestId('process-param-confirm'));
    // useEffect pre-populates 'Y' for the required select
    expect(onConfirm).toHaveBeenCalledWith({ period: 'Y' });
  });

  it('calls onOpenChange(false) when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({
      open: true,
      process: buildProcess([SELECT_PARAM]),
      onOpenChange,
    });
    await user.click(screen.getByTestId('process-param-cancel'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not render hidden params', () => {
    renderDialog({
      open: true,
      process: buildProcess([HIDDEN_PARAM]),
    });
    // Hidden param label must not appear
    expect(screen.queryByText('hidden')).not.toBeInTheDocument();
    // No select control rendered for the hidden param
    expect(screen.queryByTestId('select-control')).not.toBeInTheDocument();
  });

  it('hidden params do not affect canConfirm even if required', () => {
    // A hidden required param should not block confirmation
    const hiddenRequired = { ...HIDDEN_PARAM, required: true };
    renderDialog({
      open: true,
      process: buildProcess([hiddenRequired]),
    });
    // visibleParams is empty (all hidden) → canConfirm = vacuously true
    expect(screen.getByTestId('process-param-confirm')).not.toBeDisabled();
  });
});
