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

// --- Import under test ---

import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { toast } from 'sonner';
import NewAccountModal from '@generated/chart-of-accounts/custom/NewAccountModal.jsx';

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
    expect(screen.getByTestId('account-code-suffix-input')).toBeInTheDocument();
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
    expect(screen.getByTestId('account-code-prefix')).toHaveTextContent('4000');
  });

  it('auto-selects the matching 4-digit parent from the leaf account prefix', () => {
    render(<NewAccountModal {...baseProps({ currentRecord: { id: 'acc-50000001', searchKey: '50000001', summaryLevel: 'N' } })} />);
    const root = screen.getByTestId('new-account-modal-parent');
    expect(within(root).getByText('5000')).toBeInTheDocument();
    expect(within(root).getByText('Purchases')).toBeInTheDocument();
    expect(screen.getByTestId('account-code-prefix')).toHaveTextContent('5000');
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
    expect(screen.getByTestId('account-code-prefix')).toHaveTextContent('5000');
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
    expect(screen.getByTestId('account-code-prefix')).toHaveTextContent('5000');
    expect(within(screen.getByTestId('new-account-modal-parent')).queryByText('required')).not.toBeInTheDocument();
  });

  it('submits the correct POST body and calls onSaved on success', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));
    const onSaved = vi.fn();
    render(<NewAccountModal {...baseProps({ onSaved, currentRecord: { id: 'acc-4000', searchKey: '4000', summaryLevel: 'Y' } })} />);

    fireEvent.change(screen.getByTestId('new-account-modal-name'), { target: { value: '  US Sales  ' } });
    fireEvent.change(screen.getByTestId('account-code-suffix-input'), { target: { value: '1234' } });

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
    fireEvent.change(screen.getByTestId('account-code-suffix-input'), { target: { value: '1234' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('new-account-modal-save'));
    });

    expect(toast.error).toHaveBeenCalledWith('Error 400');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows an error toast when the save request throws a network error', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('offline')));
    render(<NewAccountModal {...baseProps({ currentRecord: { id: 'acc-4000', searchKey: '4000', summaryLevel: 'Y' } })} />);

    fireEvent.change(screen.getByTestId('new-account-modal-name'), { target: { value: 'US Sales' } });
    fireEvent.change(screen.getByTestId('account-code-suffix-input'), { target: { value: '1234' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('new-account-modal-save'));
    });

    expect(toast.error).toHaveBeenCalledWith('offline');
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

  // ── ETP-5399 QA finding #1: the chosen Account Type must be what gets saved ──

  it('submits the Account Type the user picked, not the derived default', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));
    render(<NewAccountModal {...baseProps({ currentRecord: { id: 'acc-4000', searchKey: '4000', summaryLevel: 'Y' } })} />);

    fireEvent.change(screen.getByTestId('new-account-modal-name'), { target: { value: 'Capital social 2' } });
    fireEvent.change(screen.getByTestId('account-code-suffix-input'), { target: { value: '0001' } });
    fireEvent.change(screen.getByTestId('new-account-modal-account-type'), { target: { value: 'L' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('new-account-modal-save'));
    });

    const [, init] = globalThis.fetch.mock.calls.at(-1);
    expect(JSON.parse(init.body)).toEqual({ searchKey: '40000001', name: 'Capital social 2', accountType: 'L' });
  });

  it('keeps a user-picked Account Type when the parent is changed afterwards', async () => {
    const user = userEvent.setup();
    const switchAccounts = [
      { id: 'acc-50000001', searchKey: '50000001', name: 'Purchases US', summaryLevel: 'N', parentCode4: '5000', parentCode4Name: 'Purchases', accountType: 'L' },
      { id: 'acc-60000001', searchKey: '60000001', name: 'Payroll Expense', summaryLevel: 'N', parentCode4: '6000', parentCode4Name: 'Payroll', accountType: 'R' },
    ];
    const currentRecord = { id: 'acc-50000001', searchKey: '50000001', summaryLevel: 'N' };
    render(<NewAccountModal {...baseProps({ allAccounts: switchAccounts, currentRecord })} />);

    // The user picks Asset first...
    fireEvent.change(screen.getByTestId('new-account-modal-account-type'), { target: { value: 'A' } });
    // ...then switches the parent to one whose derived default would be 'R'.
    await user.click(within(screen.getByTestId('new-account-modal-parent')).getByRole('button'));
    await user.click(await screen.findByText('Payroll'));

    expect(screen.getByTestId('account-code-prefix')).toHaveTextContent('6000');
    expect(screen.getByTestId('new-account-modal-account-type')).toHaveValue('A');
  });

  it('forgets a previous session\'s manual Account Type on the next open', async () => {
    const user = userEvent.setup();
    const switchAccounts = [
      { id: 'acc-50000001', searchKey: '50000001', name: 'Purchases US', summaryLevel: 'N', parentCode4: '5000', parentCode4Name: 'Purchases', accountType: 'L' },
      { id: 'acc-60000001', searchKey: '60000001', name: 'Payroll Expense', summaryLevel: 'N', parentCode4: '6000', parentCode4Name: 'Payroll', accountType: 'R' },
    ];
    const currentRecord = { id: 'acc-50000001', searchKey: '50000001', summaryLevel: 'N' };
    const props = baseProps({ allAccounts: switchAccounts, currentRecord });
    const { rerender } = render(<NewAccountModal {...props} />);
    fireEvent.change(screen.getByTestId('new-account-modal-account-type'), { target: { value: 'A' } });

    rerender(<NewAccountModal {...props} isOpen={false} />);
    rerender(<NewAccountModal {...props} isOpen />);

    // Fresh session: the type is derived again, and a parent change re-derives it.
    expect(screen.getByTestId('new-account-modal-account-type')).toHaveValue('L');
    await user.click(within(screen.getByTestId('new-account-modal-parent')).getByRole('button'));
    await user.click(await screen.findByText('Payroll'));
    expect(screen.getByTestId('new-account-modal-account-type')).toHaveValue('R');
  });

  it('opens the parent selector in modal mode so its list can scroll inside the dialog', async () => {
    const user = userEvent.setup();
    render(<NewAccountModal {...baseProps()} />);
    await user.click(within(screen.getByTestId('new-account-modal-parent')).getByRole('button'));
    await screen.findByText('Purchases');
    // Radix Popover in modal mode blocks pointer events outside its content.
    expect(document.body.style.pointerEvents).toBe('none');
  });

  it('uses the wider dialog so long parent names are not cut off', () => {
    render(<NewAccountModal {...baseProps()} />);
    expect(screen.getByTestId('new-account-modal').className).toContain('max-w-xl');
  });

  // ── ElementLevel-based structural resolution (ETP-5399) ────────────────────
  //
  // `resolveInsertionCandidates` / `deriveDefaultParentId` / `deriveDefaultAccountType`
  // are not exported — driven here through `currentRecord` shapes that mirror what
  // AccountTreeView's live tree (real leaf rows + virtual folder nodes carrying
  // `elementLevel`/`children`/`insertionChildren`) actually hands to this modal.

  describe('ElementLevel-based structural resolution (ETP-5399)', () => {
    // Every fixture in this block needs its own `virtualParentOptions` entries —
    // built from a LEAF's `insertionChildren[0]`, never from the folder node itself.
    const structuralAccounts = [
      // Backs the '4300A' parent option (letter-suffixed Breakdown, ETP-5399's exact
      // regression target) — accountType 'A' (Asset), deliberately not the 'E' default,
      // so the sibling-match test actually proves the derivation ran.
      {
        id: 'acc-43000001',
        searchKey: '43000001',
        name: 'Provision leaf',
        summaryLevel: 'N',
        accountType: 'A',
        parentCode4: '430A', // legacy shallow prefix — must NOT be what the type match uses
        insertionChildren: [{ id: 'group-4300A', value: '4300A', name: 'Clientes (euros) a largo plazo', elementLevel: 'D' }],
      },
      // Backs the '1603' parent option (single-child Breakdown drill-down case).
      {
        id: 'acc-16030001',
        searchKey: '16030001',
        name: 'Fiscal deposit leaf',
        summaryLevel: 'N',
        accountType: 'L',
        insertionChildren: [{ id: 'group-1603', value: '1603', name: 'Fiscal deposits', elementLevel: 'D' }],
      },
      // A plain 4-digit numeric summary — backs the zero-children self-fallback case.
      { id: 'acc-9100', searchKey: '9100', name: 'New Branch', summaryLevel: 'Y' },
    ];

    it('does not guess a default parent when a node fans out into multiple real Breakdown children (the "430A" family)', () => {
      // Structurally: '430A' itself is one level too shallow (elementLevel 'C', not
      // 'D') and fans into 3 REAL Breakdown-level children — exactly the family this
      // ticket targets. Clicking it must offer no silent single guess.
      const currentRecord = {
        id: 'acc-430A',
        searchKey: '430A',
        elementLevel: 'C',
        children: [
          { id: 'acc-4300A', searchKey: '4300A', name: 'Provisiones a largo plazo', elementLevel: 'D' },
          { id: 'acc-4304A', searchKey: '4304A', name: 'Provisiones a corto plazo A', elementLevel: 'D' },
          { id: 'acc-4309A', searchKey: '4309A', name: 'Provisiones a corto plazo B', elementLevel: 'D' },
        ],
      };
      render(<NewAccountModal {...baseProps({ allAccounts: structuralAccounts, currentRecord })} />);

      expect(within(screen.getByTestId('new-account-modal-parent')).getByText('selectAccount')).toBeInTheDocument();
      expect(screen.getByTestId('account-code-prefix')).toBeEmptyDOMElement();
    });

    it('selects structural parent 4300A and submits an 8-digit code with numeric prefix 4300', async () => {
      const user = userEvent.setup();
      const onSaved = vi.fn();
      globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));
      const currentRecord = {
        id: 'acc-430A',
        searchKey: '430A',
        elementLevel: 'C',
        children: [
          { id: 'acc-4300A', searchKey: '4300A', name: 'Clientes (euros) a largo plazo', elementLevel: 'D' },
          { id: 'acc-4304A', searchKey: '4304A', name: 'Clientes a corto plazo A', elementLevel: 'D' },
          { id: 'acc-4309A', searchKey: '4309A', name: 'Clientes a corto plazo B', elementLevel: 'D' },
        ],
      };
      render(<NewAccountModal {...baseProps({ allAccounts: structuralAccounts, currentRecord, onSaved })} />);

      await user.click(within(screen.getByTestId('new-account-modal-parent')).getByRole('button'));
      await user.type(await screen.findByPlaceholderText('search'), 'clientes (euros) a largo');

      expect(await screen.findByText('4300A')).toBeInTheDocument();
      const candidateName = screen.getByText('Clientes (euros) a largo plazo');
      expect(candidateName).toBeInTheDocument();
      await user.click(candidateName);

      const parent = screen.getByTestId('new-account-modal-parent');
      expect(within(parent).getByText('4300A')).toBeInTheDocument();
      expect(screen.getByTestId('account-code-prefix')).toHaveTextContent('4300');
      expect(screen.getByTestId('account-code-suffix-input')).toHaveAttribute('maxLength', '4');

      await user.type(screen.getByTestId('new-account-modal-name'), 'Customer provision');
      await user.type(screen.getByTestId('account-code-suffix-input'), '1000');
      expect(screen.getByTestId('account-code-suffix-input')).toHaveValue('1000');

      await user.click(screen.getByTestId('new-account-modal-save'));

      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/elementValue`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Accept-Language': 'es_ES', 'Content-Type': 'application/json' },
          body: JSON.stringify({ searchKey: '43001000', name: 'Customer provision', accountType: 'A' }),
        }),
      ));
      expect(onSaved).toHaveBeenCalled();
    });

    it('auto-selects the single candidate when a node has exactly one real child (drills down to the Breakdown level)', () => {
      const currentRecord = {
        id: 'acc-160B',
        searchKey: '160B',
        elementLevel: 'C',
        children: [
          { id: 'acc-1603', searchKey: '1603', name: 'Fiscal deposits', elementLevel: 'D' },
        ],
      };
      render(<NewAccountModal {...baseProps({ allAccounts: structuralAccounts, currentRecord })} />);

      const root = screen.getByTestId('new-account-modal-parent');
      expect(within(root).getByText('1603')).toBeInTheDocument();
      expect(within(root).getByText('Fiscal deposits')).toBeInTheDocument();
      expect(screen.getByTestId('account-code-prefix')).toHaveTextContent('1603');
    });

    it('reuses a Subaccount-level leaf\'s own insertionChildren instead of walking local tree structure', () => {
      const currentRecord = {
        id: 'acc-43000002',
        searchKey: '43000002',
        elementLevel: 'S',
        insertionChildren: [{ id: 'group-4300A', value: '4300A', name: 'Provisiones a largo plazo' }],
      };
      render(<NewAccountModal {...baseProps({ allAccounts: structuralAccounts, currentRecord })} />);

      const root = screen.getByTestId('new-account-modal-parent');
      expect(within(root).getByText('4300A')).toBeInTheDocument();
      expect(screen.getByTestId('account-code-prefix')).toHaveTextContent('4300');
    });

    it('falls back to the node itself when it has zero real children (first-ever subaccount under a new branch)', () => {
      const currentRecord = {
        id: 'acc-9100',
        searchKey: '9100',
        elementLevel: 'C',
        children: [],
      };
      render(<NewAccountModal {...baseProps({ allAccounts: structuralAccounts, currentRecord })} />);

      const root = screen.getByTestId('new-account-modal-parent');
      expect(within(root).getByText('9100')).toBeInTheDocument();
      expect(screen.getByTestId('account-code-prefix')).toHaveTextContent('9100');
    });

    it('derives Account Type from a sibling\'s resolved insertionChildren value, not its legacy parentCode4', () => {
      // The '4300A' Breakdown node itself (elementLevel 'D' -> single candidate: itself).
      const currentRecord = {
        id: 'group-4300A',
        searchKey: '4300A',
        elementLevel: 'D',
        isVirtual: true,
      };
      render(<NewAccountModal {...baseProps({ allAccounts: structuralAccounts, currentRecord })} />);

      // The only sibling leaf's legacy `parentCode4` is '430A' (one level too
      // shallow) — matching against that would miss and fall back to the 'E'
      // default. Matching against `insertionChildren[0].value` ('4300A') finds it.
      expect(screen.getByTestId('new-account-modal-account-type')).toHaveValue('A');
    });

    it('legacy fallback: a bare {searchKey, summaryLevel} shape with a letter-suffixed 4-char code is no longer treated as a terminal parent', () => {
      // No `elementLevel`, no `children` — forces the legacy heuristic path. The
      // numeric-only guard (`/^\\d+$/`) must reject '430A' as a self-match, closing
      // the original bug even for callers/fixtures that predate structural data.
      const currentRecord = { id: 'acc-430A-legacy', searchKey: '430A', summaryLevel: 'Y' };
      render(<NewAccountModal {...baseProps({ allAccounts: structuralAccounts, currentRecord })} />);

      // No 4-digit summary named exactly '430A' exists among parentOptions either,
      // so the prefix4 lookup also comes up empty — no default selection at all.
      expect(within(screen.getByTestId('new-account-modal-parent')).getByText('selectAccount')).toBeInTheDocument();
    });

    it('legacy fallback: a bare numeric 4-digit summary record still self-selects as parent', () => {
      // Positive control for the legacy path, using a code not present in ACCOUNTS
      // (kept independent from the other describe block's fixtures).
      const legacyAccounts = [
        ...structuralAccounts,
        { id: 'acc-9200', searchKey: '9200', name: 'Legacy Branch', summaryLevel: 'Y' },
      ];
      const currentRecord = { id: 'acc-9200', searchKey: '9200', summaryLevel: 'Y' };
      render(<NewAccountModal {...baseProps({ allAccounts: legacyAccounts, currentRecord })} />);

      const root = screen.getByTestId('new-account-modal-parent');
      expect(within(root).getByText('9200')).toBeInTheDocument();
      expect(screen.getByTestId('account-code-prefix')).toHaveTextContent('9200');
    });
  });
});
