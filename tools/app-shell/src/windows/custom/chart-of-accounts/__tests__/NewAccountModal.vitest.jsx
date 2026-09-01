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

import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { toast } from 'sonner';
import NewAccountModal from '../NewAccountModal.jsx';

// Radix Popover + cmdk (used by AccountBadgeSelect) need a few DOM APIs jsdom
// does not implement. The global src/test/setup.js only polyfills
// scrollIntoView/scrollTo/ResizeObserver, not pointer-capture — see the
// dedicated AccountBadgeSelect.vitest.jsx suite for the same requirement.
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

const BASE_URL = 'http://localhost/sws/neo/chart-of-accounts';
const TOKEN = 'test-token';

// '4000' is an explicit summary row (no leaf references it, so no virtual
// duplicate); '5000' only exists as a virtual group derived from a leaf row's
// parentCode4 — covering both parent-option sources without overlap.
// The 5000-prefixed leaf carries an explicit accountType so the
// deriveDefaultAccountType "sibling leaf" fallback (ETP-4884 item 3) has a
// concrete value to find. Deliberately 'L' (Liability), NOT 'E' — 'E' is
// DEFAULT_ACCOUNT_TYPE, so a fixture value of 'E' would let the "sibling
// leaf" test pass trivially against the hardcoded fallback without proving
// the derivation logic actually ran.
const ACCOUNTS = [
  { id: 'acc-4000', searchKey: '4000', name: 'Sales', summaryLevel: 'Y' },
  { id: 'acc-50000001', searchKey: '50000001', name: 'Purchases US', summaryLevel: 'N', parentCode4: '5000', parentCode4Name: 'Purchases', accountType: 'L' },
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

  it('renders parent options sorted by code when open', async () => {
    const user = userEvent.setup();
    render(<NewAccountModal {...baseProps()} />);
    await user.click(within(screen.getByTestId('new-account-modal-parent')).getByRole('button'));

    // cmdk renders options in a portal, already sorted by code ('4000' then '5000').
    const badges = await screen.findAllByText(/^(4000|5000)$/);
    expect(badges.map((b) => b.textContent)).toEqual(['4000', '5000']);
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('Purchases')).toBeInTheDocument();
  });

  it('auto-selects the current record as parent when it is itself a 4-digit summary account', () => {
    render(<NewAccountModal {...baseProps({ currentRecord: { id: 'acc-4000', searchKey: '4000', summaryLevel: 'Y' } })} />);
    const root = screen.getByTestId('new-account-modal-parent');
    expect(within(root).getByText('4000')).toBeInTheDocument();
    expect(within(root).getByText('Sales')).toBeInTheDocument();
    expect(screen.getByTestId('account-code-stub')).toHaveValue('4000');
  });

  it('auto-selects the matching 4-digit parent from the leaf account prefix', () => {
    render(<NewAccountModal {...baseProps({ currentRecord: { id: 'acc-50000001', searchKey: '50000001', summaryLevel: 'N' } })} />);
    const root = screen.getByTestId('new-account-modal-parent');
    expect(within(root).getByText('5000')).toBeInTheDocument();
    expect(within(root).getByText('Purchases')).toBeInTheDocument();
    expect(screen.getByTestId('account-code-stub')).toHaveValue('5000');
  });

  it('falls back to no parent selection when nothing matches', () => {
    render(<NewAccountModal {...baseProps({ currentRecord: { id: 'x', searchKey: '9999', summaryLevel: 'N' } })} />);
    expect(within(screen.getByTestId('new-account-modal-parent')).getByText('selectAccount')).toBeInTheDocument();
  });

  it('falls back to no parent selection when currentRecord is null', () => {
    render(<NewAccountModal {...baseProps({ currentRecord: null })} />);
    expect(within(screen.getByTestId('new-account-modal-parent')).getByText('selectAccount')).toBeInTheDocument();
  });

  it('builds virtual parent groups from allAccounts when no explicit 4-digit summary row exists', async () => {
    const user = userEvent.setup();
    const flatOnly = [
      { id: 'acc-1', searchKey: '60000001', name: 'Leaf', summaryLevel: 'N', parentCode4: '6000', parentCode4Name: 'Expenses' },
    ];
    render(<NewAccountModal {...baseProps({ allAccounts: flatOnly, currentRecord: null })} />);
    await user.click(within(screen.getByTestId('new-account-modal-parent')).getByRole('button'));

    expect(await screen.findByText('6000')).toBeInTheDocument();
    expect(screen.getByText('Expenses')).toBeInTheDocument();
  });

  it('fetches accounts from the API when allAccounts is empty', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ response: { data: ACCOUNTS } }) }),
    );
    render(<NewAccountModal {...baseProps({ allAccounts: [] })} />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/elementValue?_startRow=0&_endRow=9999`,
      expect.objectContaining({ credentials: 'include', headers: { 'Accept-Language': 'es_ES' } }),
    ));
    await user.click(within(screen.getByTestId('new-account-modal-parent')).getByRole('button'));
    expect(await screen.findByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('Purchases')).toBeInTheDocument();
  });

  it('does not fetch accounts when allAccounts already has rows', () => {
    globalThis.fetch = vi.fn();
    render(<NewAccountModal {...baseProps()} />);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('falls back to an empty list when the account fetch fails', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false }));
    render(<NewAccountModal {...baseProps({ allAccounts: [] })} />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await user.click(within(screen.getByTestId('new-account-modal-parent')).getByRole('button'));
    expect(await screen.findByText('noResultsFound')).toBeInTheDocument();
  });

  it('falls back to an empty list when the account fetch throws', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network down')));
    render(<NewAccountModal {...baseProps({ allAccounts: [] })} />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await user.click(within(screen.getByTestId('new-account-modal-parent')).getByRole('button'));
    expect(await screen.findByText('noResultsFound')).toBeInTheDocument();
  });

  it('retries the account fetch on the next open after a failed attempt', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false }));
    const { rerender } = render(<NewAccountModal {...baseProps({ allAccounts: [] })} />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

    // Close, then reopen — a real reload/network blip should not permanently
    // disable the parent-selector fetch for the component's whole mounted life.
    rerender(<NewAccountModal {...baseProps({ allAccounts: [], isOpen: false })} />);
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ response: { data: ACCOUNTS } }) }),
    );
    rerender(<NewAccountModal {...baseProps({ allAccounts: [], isOpen: true })} />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    await user.click(within(screen.getByTestId('new-account-modal-parent')).getByRole('button'));
    expect(await screen.findByText('Sales')).toBeInTheDocument();
  });

  it('selecting a parent fills the code prefix into the code field', async () => {
    const user = userEvent.setup();
    render(<NewAccountModal {...baseProps()} />);
    await user.click(within(screen.getByTestId('new-account-modal-parent')).getByRole('button'));
    await user.click(await screen.findByText('Purchases'));
    expect(screen.getByTestId('account-code-stub')).toHaveValue('5000');
  });

  it('shows validation errors and does not submit when required fields are missing', () => {
    globalThis.fetch = vi.fn();
    render(<NewAccountModal {...baseProps()} />);
    fireEvent.click(screen.getByTestId('new-account-modal-save'));

    // AccountBadgeSelect's own error text is not rendered with role="alert",
    // so only name + code carry that role; the parent error is still verified
    // separately below via its literal text.
    expect(screen.getAllByRole('alert')).toHaveLength(2); // name, code
    expect(within(screen.getByTestId('new-account-modal-parent')).getByText('required')).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('clears the name error as soon as the user types', () => {
    render(<NewAccountModal {...baseProps()} />);
    fireEvent.click(screen.getByTestId('new-account-modal-save'));
    expect(screen.getAllByRole('alert')).toHaveLength(2);

    fireEvent.change(screen.getByTestId('new-account-modal-name'), { target: { value: 'New sub account' } });
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('switching the parent selector updates the code prefix and clears its error', async () => {
    const user = userEvent.setup();
    render(<NewAccountModal {...baseProps({ currentRecord: null })} />);
    fireEvent.click(screen.getByTestId('new-account-modal-save'));
    expect(within(screen.getByTestId('new-account-modal-parent')).getByText('required')).toBeInTheDocument();

    await user.click(within(screen.getByTestId('new-account-modal-parent')).getByRole('button'));
    await user.click(await screen.findByText('Purchases'));

    expect(within(screen.getByTestId('new-account-modal-parent')).getByText('5000')).toBeInTheDocument();
    expect(screen.getByTestId('account-code-stub')).toHaveValue('5000');
    expect(within(screen.getByTestId('new-account-modal-parent')).queryByText('required')).not.toBeInTheDocument();
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
      headers: { 'Accept-Language': 'es_ES', 'Content-Type': 'application/json' },
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

  // ── Searchable parent-account selector (ETP-4884 item 3) ──────────────────

  it('shows a search input in the parent-account selector instead of a plain list', async () => {
    const user = userEvent.setup();
    render(<NewAccountModal {...baseProps()} />);

    await user.click(within(screen.getByTestId('new-account-modal-parent')).getByRole('button'));
    expect(await screen.findByPlaceholderText('search')).toBeInTheDocument();
  });

  it('filters parent-account options as the user types in the search box', async () => {
    const user = userEvent.setup();
    render(<NewAccountModal {...baseProps()} />);

    await user.click(within(screen.getByTestId('new-account-modal-parent')).getByRole('button'));
    const search = await screen.findByPlaceholderText('search');
    await user.type(search, 'Purchases');

    expect(await screen.findByText('Purchases')).toBeInTheDocument();
    expect(screen.queryByText('Sales')).not.toBeInTheDocument();
  });

  // ── Account Type default derived from the parent (ETP-4884 item 3) ────────

  it('defaults Account Type from the selected leaf record when opened from a leaf row', () => {
    // currentRecord is a real leaf (not a 4-digit summary), accountType 'R' (Revenue).
    const currentRecord = { id: 'acc-40000001', searchKey: '40000002', accountType: 'R', summaryLevel: 'N' };
    render(<NewAccountModal {...baseProps({ currentRecord })} />);

    expect(screen.getByTestId('new-account-modal-account-type')).toHaveValue('R');
  });

  it('defaults Account Type from an existing sibling leaf when the parent is a group heading', () => {
    // currentRecord is a virtual group (no accountType of its own) — fall back to
    // scanning `allAccounts` for a leaf already filed under the same 4-digit prefix.
    const currentRecord = { id: 'group-5000', searchKey: '5000', summaryLevel: 'Y', isVirtual: true };
    render(<NewAccountModal {...baseProps({ currentRecord })} />);

    // Fixture's 5000-prefixed leaf ("Purchases US") has accountType 'L' —
    // deliberately different from DEFAULT_ACCOUNT_TYPE ('E') so this test
    // actually proves the derivation ran instead of coincidentally matching
    // the hardcoded fallback.
    expect(screen.getByTestId('new-account-modal-account-type')).toHaveValue('L');
  });

  // ── Bug A: long parent-account names overflow the dialog (ETP-4884) ───────
  //
  // DialogContent (@etendosoftware/app-shell-core, dialog.jsx) uses `display: grid`,
  // which makes the `<div className="flex flex-col gap-5 py-2">` fields wrapper a
  // grid item. Grid items default to `min-width: auto`, so the wrapper grows to fit
  // its widest child's full intrinsic content width instead of respecting the
  // modal's `max-w-md` track — meaning a long account name in AccountBadgeSelect's
  // trigger never actually gets truncated by its own `truncate` class, because the
  // grid-item ANCESTOR expands first. jsdom has no real layout engine, so pixel
  // overflow can't be asserted here — this is a className-level regression test,
  // the same pattern already used for Task 6's styling tests in
  // AccountTreeView.vitest.jsx (asserting `.className` contains a Tailwind class).
  //
  // IMPLEMENTATION NOTE: the fix must add `data-testid="new-account-modal-fields"`
  // to that wrapper div in NewAccountModal.jsx (and give it `min-w-0`) for this
  // test to find it — the testid does not exist in the source yet.
  it('keeps the fields wrapper shrinkable inside the grid dialog so long names can truncate', () => {
    render(<NewAccountModal {...baseProps()} />);
    expect(screen.getByTestId('new-account-modal-fields').className).toContain('min-w-0');
  });

  // ── Bug B: Account Type doesn't update on manual parent change (ETP-4884) ──
  //
  // Today, deriveDefaultAccountType only runs once, in the init useEffect (latched
  // via initDoneRef), when the modal first opens. handleParentChange updates
  // parentAccountId and the searchKey code-prefix, but never touches
  // form.accountType — so manually picking a DIFFERENT parent from the combobox
  // after the modal is already open leaves Account Type stuck at whatever it was
  // initially derived to, instead of re-deriving for the new parent (mirroring what
  // already happens for the code-prefix field, and what happens on initial open).
  it('re-derives Account Type when the user manually switches to a different parent', async () => {
    const user = userEvent.setup();
    // Two virtual-group parents (no explicit summary row, like the 'builds virtual
    // parent groups' test above) each with their own sibling leaf accountType, so
    // switching parents has a known, distinct expected value on each side —
    // '5000'/Purchases → 'L', '6000'/Payroll → 'R'.
    const switchAccounts = [
      { id: 'acc-50000001', searchKey: '50000001', name: 'Purchases US', summaryLevel: 'N', parentCode4: '5000', parentCode4Name: 'Purchases', accountType: 'L' },
      { id: 'acc-60000001', searchKey: '60000001', name: 'Payroll Expense', summaryLevel: 'N', parentCode4: '6000', parentCode4Name: 'Payroll', accountType: 'R' },
    ];
    const currentRecord = { id: 'acc-50000001', searchKey: '50000001', summaryLevel: 'N' };
    render(<NewAccountModal {...baseProps({ allAccounts: switchAccounts, currentRecord })} />);

    // Sanity check: opened defaulted to the '5000' (Purchases) parent, accountType 'L'.
    expect(within(screen.getByTestId('new-account-modal-parent')).getByText('5000')).toBeInTheDocument();
    expect(screen.getByTestId('new-account-modal-account-type')).toHaveValue('L');

    // Manually switch the parent selector to a DIFFERENT parent ('6000' / Payroll).
    await user.click(within(screen.getByTestId('new-account-modal-parent')).getByRole('button'));
    await user.click(await screen.findByText('Payroll'));

    // Account Type must re-derive to 'R' for the new parent — today it stays stuck at 'L'.
    expect(screen.getByTestId('new-account-modal-account-type')).toHaveValue('R');
  });
});
