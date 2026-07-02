// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...a) => toastSuccess(...a), error: (...a) => toastError(...a) },
}));

vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ children, open, onOpenChange }) =>
    open ? (
      <div data-testid="dialog">
        <button data-testid="dialog-close-x" onClick={() => onOpenChange?.(false)} />
        {children}
      </div>
    ) : null,
  DialogContent: ({ children }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
  DialogFooter: ({ children }) => <div data-testid="dialog-footer">{children}</div>,
}));

// AccountCodeField lives in @generated (artifacts) — stub it as a controlled input
// so we can drive the searchKey value from the test.
vi.mock('@generated/chart-of-accounts/custom/AccountCodeField', () => ({
  default: ({ value, onChange, readOnly }) => (
    <input
      data-testid="account-code-field"
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// --- Import under test ---

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewAccountModal from '../NewAccountModal.jsx';

// --- Fixtures ---

// Flat list as delivered by the NeoHandler: leaves carry parentCode4 /
// parentCode4Name, which the modal turns into virtual 4-digit parent options.
const ACCOUNTS = [
  {
    id: 'acc-1',
    searchKey: '43000001',
    name: 'Client A',
    parentCode4: '4300',
    parentCode4Name: 'Clientes',
    summaryLevel: 'N',
  },
  {
    id: 'acc-2',
    searchKey: '57000001',
    name: 'Bank',
    parentCode4: '5700',
    parentCode4Name: 'Tesoreria',
    summaryLevel: 'N',
  },
];

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onSaved: vi.fn(),
  currentRecord: null,
  allAccounts: ACCOUNTS,
  apiBaseUrl: '/sws/neo/chart-of-accounts',
  token: 'test-token',
};

describe('NewAccountModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when closed', () => {
    render(<NewAccountModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('renders the form when open', () => {
    render(<NewAccountModal {...defaultProps} />);
    expect(screen.getByTestId('new-account-modal-parent')).toBeInTheDocument();
    expect(screen.getByTestId('new-account-modal-name')).toBeInTheDocument();
    expect(screen.getByTestId('account-code-field')).toBeInTheDocument();
  });

  it('builds virtual parent options from parentCode4 of the account rows', () => {
    render(<NewAccountModal {...defaultProps} />);
    const select = screen.getByTestId('new-account-modal-parent');
    // 2 virtual groups + the placeholder option
    expect(select.querySelectorAll('option')).toHaveLength(3);
    expect(screen.getByRole('option', { name: '4300 — Clientes' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '5700 — Tesoreria' })).toBeInTheDocument();
  });

  it('fetches accounts when allAccounts is empty and the modal opens', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          data: [
            {
              id: 'x-1',
              searchKey: '60000001',
              parentCode4: '6000',
              parentCode4Name: 'Compras',
              summaryLevel: 'N',
            },
          ],
        },
      }),
    });
    render(<NewAccountModal {...defaultProps} allAccounts={[]} />);
    await screen.findByRole('option', { name: '6000 — Compras' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/sws/neo/chart-of-accounts/elementValue?_startRow=0&_endRow=9999',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });

  it('selecting a parent fills the code prefix into the code field', async () => {
    const user = userEvent.setup();
    render(<NewAccountModal {...defaultProps} />);
    const select = screen.getByTestId('new-account-modal-parent');
    await user.selectOptions(select, screen.getByRole('option', { name: '4300 — Clientes' }));
    expect(screen.getByTestId('account-code-field')).toHaveValue('4300');
  });

  it('shows validation errors when saving an empty form', async () => {
    const user = userEvent.setup();
    render(<NewAccountModal {...defaultProps} />);
    await user.click(screen.getByTestId('new-account-modal-save'));
    // parent required, name required, code must be 8 digits
    expect(screen.getAllByText('required').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('codeExact8Digits')).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('POSTs the new account and calls onSaved on success', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    globalThis.fetch.mockResolvedValue({ ok: true });
    render(<NewAccountModal {...defaultProps} onSaved={onSaved} />);

    await user.selectOptions(
      screen.getByTestId('new-account-modal-parent'),
      screen.getByRole('option', { name: '4300 — Clientes' }),
    );
    await user.type(screen.getByTestId('new-account-modal-name'), 'New Client');
    // Drive the stubbed AccountCodeField to a valid 8-digit code
    fireEvent.change(screen.getByTestId('account-code-field'), {
      target: { value: '43000099' },
    });
    await user.click(screen.getByTestId('new-account-modal-save'));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/sws/neo/chart-of-accounts/elementValue',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          searchKey: '43000099',
          name: 'New Client',
          accountType: 'E',
        }),
      }),
    );
    expect(toastSuccess).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });

  it('shows an error toast and does not call onSaved when the POST fails', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    });
    render(<NewAccountModal {...defaultProps} onSaved={onSaved} />);

    await user.selectOptions(
      screen.getByTestId('new-account-modal-parent'),
      screen.getByRole('option', { name: '4300 — Clientes' }),
    );
    await user.type(screen.getByTestId('new-account-modal-name'), 'New Client');
    fireEvent.change(screen.getByTestId('account-code-field'), {
      target: { value: '43000099' },
    });
    await user.click(screen.getByTestId('new-account-modal-save'));

    expect(toastError).toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('calls onClose from the cancel button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<NewAccountModal {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByTestId('new-account-modal-cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the dialog is dismissed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<NewAccountModal {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByTestId('dialog-close-x'));
    expect(onClose).toHaveBeenCalled();
  });

  it('auto-selects the parent when currentRecord is a 4-digit summary', () => {
    const currentRecord = {
      id: 'sum-1',
      searchKey: '4300',
      summaryLevel: 'Y',
    };
    // summaryParentOptions comes from the API list; provide a matching summary row.
    const withSummary = [
      { id: 'sum-1', searchKey: '4300', name: 'Clientes', summaryLevel: 'Y' },
      ...ACCOUNTS,
    ];
    render(
      <NewAccountModal
        {...defaultProps}
        allAccounts={withSummary}
        currentRecord={currentRecord}
      />,
    );
    expect(screen.getByTestId('new-account-modal-parent')).toHaveValue('sum-1');
    expect(screen.getByTestId('account-code-field')).toHaveValue('4300');
  });

  it('derives the parent from a leaf record via its 4-digit prefix', () => {
    const currentRecord = {
      id: 'acc-1',
      searchKey: '43000001',
      summaryLevel: 'N',
    };
    render(<NewAccountModal {...defaultProps} currentRecord={currentRecord} />);
    // Virtual group group-4300 should be pre-selected
    expect(screen.getByTestId('new-account-modal-parent')).toHaveValue('group-4300');
    expect(screen.getByTestId('account-code-field')).toHaveValue('4300');
  });

  it('handles null currentRecord without crashing (empty parent)', () => {
    render(<NewAccountModal {...defaultProps} currentRecord={null} />);
    expect(screen.getByTestId('new-account-modal-parent')).toHaveValue('');
  });
});
