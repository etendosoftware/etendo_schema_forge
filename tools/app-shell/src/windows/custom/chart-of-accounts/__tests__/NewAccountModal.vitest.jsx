// @vitest-environment jsdom

// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Render the dialog inline (no portal / pointer-events friction) — same pattern
// used by AddPaymentModal.vitest.jsx.
vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ open, children, onOpenChange }) =>
    open ? (
      <div data-testid="dialog">
        <button type="button" data-testid="dialog-overlay-close" onClick={() => onOpenChange(false)} />
        {children}
      </div>
    ) : null,
  DialogContent: ({ children, ...rest }) => <div {...rest}>{children}</div>,
  DialogHeader: ({ children, ...rest }) => <div {...rest}>{children}</div>,
  DialogTitle: ({ children, ...rest }) => <div {...rest}>{children}</div>,
  DialogFooter: ({ children, ...rest }) => <div {...rest}>{children}</div>,
}));

// Stub the generated AccountCodeField — expose a single input so tests can
// drive onChange(fullCode) directly without depending on its own split-field logic.
vi.mock('@generated/chart-of-accounts/custom/AccountCodeField', () => ({
  default: ({ value, onChange }) => (
    <input
      data-testid="account-code-stub"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// --- Import under test ---

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import NewAccountModal from '../NewAccountModal.jsx';

const BASE_URL = 'http://localhost/sws/neo/chart-of-accounts';
const TOKEN = 'test-token';

// '4000' is an explicit summary row (no leaf references it, so no virtual
// duplicate); '5000' only exists as a virtual group derived from a leaf row's
// parentCode4 — covering both parent-option sources without overlap.
const ACCOUNTS = [
  { id: 'acc-4000', searchKey: '4000', name: 'Sales', summaryLevel: 'Y' },
  { id: 'acc-50000001', searchKey: '50000001', name: 'Purchases US', summaryLevel: 'N', parentCode4: '5000', parentCode4Name: 'Purchases' },
];

function baseProps(overrides = {}) {
  return {
    isOpen: true,
    onClose: vi.fn(),
    onSaved: vi.fn(),
    currentRecord: null,
    allAccounts: ACCOUNTS,
    apiBaseUrl: BASE_URL,
    token: TOKEN,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NewAccountModal', () => {
  it('does not render when closed', () => {
    render(<NewAccountModal {...baseProps({ isOpen: false })} />);
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('renders the form fields when open', () => {
    render(<NewAccountModal {...baseProps()} />);
    expect(screen.getByText('newSubAccount')).toBeInTheDocument();
    expect(screen.getByTestId('new-account-modal-parent')).toBeInTheDocument();
    expect(screen.getByTestId('new-account-modal-name')).toBeInTheDocument();
    expect(screen.getByTestId('account-code-stub')).toBeInTheDocument();
  });

  it('renders parent options sorted by code when open', () => {
    render(<NewAccountModal {...baseProps()} />);
    const select = screen.getByTestId('new-account-modal-parent');
    const optionTexts = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(optionTexts).toEqual([
      'selectParentAccount',
      '4000 — Sales',
      '5000 — Purchases',
    ]);
  });

  it('auto-selects the current record as parent when it is itself a 4-digit summary account', () => {
    render(<NewAccountModal {...baseProps({ currentRecord: { id: 'acc-4000', searchKey: '4000', summaryLevel: 'Y' } })} />);
    expect(screen.getByTestId('new-account-modal-parent')).toHaveValue('acc-4000');
    expect(screen.getByTestId('account-code-stub')).toHaveValue('4000');
  });

  it('auto-selects the matching 4-digit parent from the leaf account prefix', () => {
    render(<NewAccountModal {...baseProps({ currentRecord: { id: 'acc-50000001', searchKey: '50000001', summaryLevel: 'N' } })} />);
    expect(screen.getByTestId('new-account-modal-parent')).toHaveValue('group-5000');
    expect(screen.getByTestId('account-code-stub')).toHaveValue('5000');
  });

  it('falls back to no parent selection when nothing matches', () => {
    render(<NewAccountModal {...baseProps({ currentRecord: { id: 'x', searchKey: '9999', summaryLevel: 'N' } })} />);
    expect(screen.getByTestId('new-account-modal-parent')).toHaveValue('');
  });

  it('falls back to no parent selection when currentRecord is null', () => {
    render(<NewAccountModal {...baseProps({ currentRecord: null })} />);
    expect(screen.getByTestId('new-account-modal-parent')).toHaveValue('');
  });

  it('builds virtual parent groups from allAccounts when no explicit 4-digit summary row exists', () => {
    const flatOnly = [
      { id: 'acc-1', searchKey: '60000001', name: 'Leaf', summaryLevel: 'N', parentCode4: '6000', parentCode4Name: 'Expenses' },
    ];
    render(<NewAccountModal {...baseProps({ allAccounts: flatOnly, currentRecord: null })} />);
    const select = screen.getByTestId('new-account-modal-parent');
    const optionTexts = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(optionTexts).toContain('6000 — Expenses');
  });

  it('fetches accounts from the API when allAccounts is empty', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ response: { data: ACCOUNTS } }) }),
    );
    render(<NewAccountModal {...baseProps({ allAccounts: [] })} />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/elementValue?_startRow=0&_endRow=9999`,
      expect.objectContaining({ headers: { Authorization: `Bearer ${TOKEN}` } }),
    ));
    await waitFor(() => {
      const select = screen.getByTestId('new-account-modal-parent');
      expect(select.querySelectorAll('option').length).toBeGreaterThan(1);
    });
  });

  it('does not fetch accounts when allAccounts already has rows', () => {
    globalThis.fetch = vi.fn();
    render(<NewAccountModal {...baseProps()} />);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('falls back to an empty list when the account fetch fails', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false }));
    render(<NewAccountModal {...baseProps({ allAccounts: [] })} />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const select = screen.getByTestId('new-account-modal-parent');
    expect(select.querySelectorAll('option').length).toBe(1); // only the placeholder
  });

  it('falls back to an empty list when the account fetch throws', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network down')));
    render(<NewAccountModal {...baseProps({ allAccounts: [] })} />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const select = screen.getByTestId('new-account-modal-parent');
    expect(select.querySelectorAll('option').length).toBe(1);
  });

  it('selecting a parent fills the code prefix into the code field', async () => {
    const user = userEvent.setup();
    render(<NewAccountModal {...baseProps()} />);
    const select = screen.getByTestId('new-account-modal-parent');
    await user.selectOptions(select, screen.getByRole('option', { name: '5000 — Purchases' }));
    expect(screen.getByTestId('account-code-stub')).toHaveValue('5000');
  });

  it('shows validation errors and does not submit when required fields are missing', () => {
    globalThis.fetch = vi.fn();
    render(<NewAccountModal {...baseProps()} />);
    fireEvent.click(screen.getByTestId('new-account-modal-save'));

    expect(screen.getAllByRole('alert')).toHaveLength(3); // parent, name, code
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('clears the name error as soon as the user types', () => {
    render(<NewAccountModal {...baseProps()} />);
    fireEvent.click(screen.getByTestId('new-account-modal-save'));
    expect(screen.getAllByRole('alert')).toHaveLength(3);

    fireEvent.change(screen.getByTestId('new-account-modal-name'), { target: { value: 'New sub account' } });
    expect(screen.getAllByRole('alert')).toHaveLength(2);
  });

  it('switching the parent selector updates the code prefix and clears its error', () => {
    render(<NewAccountModal {...baseProps({ currentRecord: null })} />);
    fireEvent.click(screen.getByTestId('new-account-modal-save'));
    expect(screen.getAllByRole('alert')).toHaveLength(3); // no parent selected yet

    fireEvent.change(screen.getByTestId('new-account-modal-parent'), { target: { value: 'group-5000' } });

    expect(screen.getByTestId('new-account-modal-parent')).toHaveValue('group-5000');
    expect(screen.getByTestId('account-code-stub')).toHaveValue('5000');
    expect(screen.getAllByRole('alert')).toHaveLength(2); // parent error cleared
  });

  it('submits the correct POST body and calls onSaved on success', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));
    const onSaved = vi.fn();
    render(<NewAccountModal {...baseProps({ onSaved, currentRecord: { id: 'acc-4000', searchKey: '4000', summaryLevel: 'Y' } })} />);

    fireEvent.change(screen.getByTestId('new-account-modal-name'), { target: { value: '  US Sales  ' } });
    fireEvent.change(screen.getByTestId('account-code-stub'), { target: { value: '40001234' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('new-account-modal-save'));
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(`${BASE_URL}/elementValue`, expect.objectContaining({
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchKey: '40001234', name: 'US Sales', accountType: 'E' }),
    }));
    expect(toast.success).toHaveBeenCalledWith('newSubAccountSuccess');
    expect(onSaved).toHaveBeenCalled();
  });

  it('shows an error toast and does not call onSaved when the server rejects the request', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 400, text: async () => 'Duplicate code' }));
    const onSaved = vi.fn();
    render(<NewAccountModal {...baseProps({ onSaved, currentRecord: { id: 'acc-4000', searchKey: '4000', summaryLevel: 'Y' } })} />);

    fireEvent.change(screen.getByTestId('new-account-modal-name'), { target: { value: 'US Sales' } });
    fireEvent.change(screen.getByTestId('account-code-stub'), { target: { value: '40001234' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('new-account-modal-save'));
    });

    expect(toast.error).toHaveBeenCalledWith('newSubAccountError');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows an error toast when the save request throws a network error', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('offline')));
    render(<NewAccountModal {...baseProps({ currentRecord: { id: 'acc-4000', searchKey: '4000', summaryLevel: 'Y' } })} />);

    fireEvent.change(screen.getByTestId('new-account-modal-name'), { target: { value: 'US Sales' } });
    fireEvent.change(screen.getByTestId('account-code-stub'), { target: { value: '40001234' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('new-account-modal-save'));
    });

    expect(toast.error).toHaveBeenCalledWith('newSubAccountError');
  });

  it('calls onClose when the cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<NewAccountModal {...baseProps({ onClose })} />);
    fireEvent.click(screen.getByTestId('new-account-modal-cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the dialog reports a close via onOpenChange', () => {
    const onClose = vi.fn();
    render(<NewAccountModal {...baseProps({ onClose })} />);
    fireEvent.click(screen.getByTestId('dialog-overlay-close'));
    expect(onClose).toHaveBeenCalled();
  });
});
