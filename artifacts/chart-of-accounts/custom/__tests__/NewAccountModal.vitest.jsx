// @vitest-environment jsdom
//
// Vitest tests for NewAccountModal.jsx — scoped to the ETP-5101 follow-up changes:
//   1. the `lastUsedSuffix` useMemo (highest existing 4-digit suffix under the selected
//      parent prefix, passed as AccountCodeField's new `placeholder` prop).
//   2. the more informative "account already exists" error toast (handleSave now runs
//      the backend error through parseBackendErrorMessage/translateBackendError instead
//      of always showing the generic `newSubAccountError` message).
//
// Run from tools/app-shell/ (the artifacts tree is outside Vitest's default `include`
// root — see docs/feedback.md's ETP-4841 entry for the widened-config workaround):
//   npx vitest run --config <config extending vitest.config.js with test.include
//   widened to this file's path>
//
// Unlike the orphaned tools/app-shell/src/windows/custom/chart-of-accounts/__tests__/
// copy (ETP-5080, dead code — never collected, not imported anywhere live), this file
// does NOT mock @generated/chart-of-accounts/custom/AccountCodeField: letting the real
// component render lets these tests assert on the actual `placeholder` HTML attribute
// of the suffix input, proving the two files are wired together correctly end to end,
// not just that NewAccountModal computes the right in-memory value.

// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Render the dialog inline (no portal / pointer-events friction) — same pattern
// used by AddPaymentModal.vitest.jsx and the orphaned NewAccountModal.vitest.jsx copy.
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

import { render, screen, fireEvent, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { toast } from 'sonner';
import NewAccountModal from '../NewAccountModal.jsx';

// Radix Popover + cmdk (used by AccountBadgeSelect) need a few DOM APIs jsdom does not
// implement — same requirement as the orphaned copy and AccountBadgeSelect.vitest.jsx.
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

const BASE_URL = 'http://localhost/sws/neo/chart-of-accounts';
const TOKEN = 'test-token';

// '2000' has three leaf siblings with non-sequential suffixes (0001, 0004, 0002) so the
// "highest" computation actually has to compare rather than coincidentally pick the last
// or first entry. It deliberately has NO explicit summary row of its own (only the
// virtual group derived from its leaves' parentCode4) — an explicit '2000' summary row
// PLUS these leaves would render two identically-labelled "Liabilities" options in the
// selector (NewAccountModal.jsx does not dedupe virtual groups against explicit summary
// rows), same pitfall the orphaned copy's own fixture comment calls out. '5000' is an
// explicit summary row with NO leaf accounts filed under it yet — covers the "prefix
// selected but nothing exists" fallback branch.
// '3000' has a single leaf already sitting at the maximum possible suffix ('9999') —
// covers the clamp branch: the hinted suffix must stay '9999' (never roll over into a
// 5th digit as '10000', and never wrap back to '0000').
const ACCOUNTS = [
  { id: 'acc-20000001', searchKey: '20000001', name: 'Loan A', summaryLevel: 'N', parentCode4: '2000', parentCode4Name: 'Liabilities', accountType: 'L' },
  { id: 'acc-20000004', searchKey: '20000004', name: 'Loan B', summaryLevel: 'N', parentCode4: '2000', parentCode4Name: 'Liabilities', accountType: 'L' },
  { id: 'acc-20000002', searchKey: '20000002', name: 'Loan C', summaryLevel: 'N', parentCode4: '2000', parentCode4Name: 'Liabilities', accountType: 'L' },
  { id: 'acc-5000', searchKey: '5000', name: 'Empty Group', summaryLevel: 'Y' },
  { id: 'acc-30009999', searchKey: '30009999', name: 'Maxed Out', summaryLevel: 'N', parentCode4: '3000', parentCode4Name: 'Maxed Group', accountType: 'A' },
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

async function selectParent(name) {
  const user = userEvent.setup();
  await user.click(within(screen.getByTestId('new-account-modal-parent')).getByRole('button'));
  await user.click(await screen.findByText(name));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NewAccountModal', () => {
  it('renders the form fields when open', () => {
    render(<NewAccountModal {...baseProps()} />);
    expect(screen.getByTestId('new-account-modal-parent')).toBeInTheDocument();
    expect(screen.getByTestId('account-code-suffix-input')).toBeInTheDocument();
  });

  // ── lastUsedSuffix → AccountCodeField placeholder (ETP-5101) ────────────────

  describe('lastUsedSuffix placeholder hint', () => {
    it('hints the next available 4-digit suffix (highest existing + 1) under the selected prefix', async () => {
      render(<NewAccountModal {...baseProps()} />);
      await selectParent('Liabilities');

      // Siblings are 0001 / 0004 / 0002 under '2000' — the highest is 0004, so the hinted
      // (next available, not-yet-taken) suffix is 0004 + 1 = 0005. Confirms the fix picks
      // the true max via comparison rather than coincidentally the last-inserted (0002) or
      // first (0001) fixture entry, and that it advances past the highest rather than
      // echoing it back as if it were free.
      expect(screen.getByTestId('account-code-suffix-input')).toHaveAttribute('placeholder', '0005');
    });

    it('falls back to AccountCodeField’s own default when no parent is selected yet', () => {
      render(<NewAccountModal {...baseProps({ currentRecord: null })} />);

      // No parent auto-selected (currentRecord is null) — selectedParentCodePrefix is ''
      // so lastUsedSuffix must be undefined, letting AccountCodeField fall back to its
      // own ui('codeSuffixPlaceholder') default (echoed as the key by the mocked useUI).
      expect(screen.getByTestId('account-code-suffix-input')).toHaveAttribute('placeholder', 'codeSuffixPlaceholder');
    });

    it('falls back to AccountCodeField’s own default when the selected prefix has no accounts yet', async () => {
      render(<NewAccountModal {...baseProps()} />);
      await selectParent('Empty Group');

      // '5000' is a valid, selected prefix but has zero leaf accounts filed under it —
      // lastUsedSuffix must return undefined (not '0000' or any other placeholder value).
      expect(screen.getByTestId('account-code-suffix-input')).toHaveAttribute('placeholder', 'codeSuffixPlaceholder');
    });

    it('clamps the hint at 9999 when the highest existing suffix is already 9999', async () => {
      render(<NewAccountModal {...baseProps()} />);
      await selectParent('Maxed Group');

      // '3000' has a single leaf at '30009999' — max + 1 would be 10000, so the clamp
      // (Math.min(max + 1, 9999)) must keep the hint at '9999' rather than rolling over
      // into a 5th digit or wrapping back to '0000'.
      expect(screen.getByTestId('account-code-suffix-input')).toHaveAttribute('placeholder', '9999');
    });
  });

  // ── handleSave error toast — backend detail vs generic fallback (ETP-5101) ──

  describe('save error toast', () => {
    it('shows the backend’s specific "already exists" message instead of the generic toast', async () => {
      globalThis.fetch = vi.fn(() => Promise.resolve({
        ok: false,
        status: 409,
        json: async () => ({ error: { message: 'Account 20000005 already exists.' } }),
      }));
      render(<NewAccountModal {...baseProps({ currentRecord: { id: 'acc-5000', searchKey: '5000', summaryLevel: 'Y' } })} />);

      fireEvent.change(screen.getByTestId('new-account-modal-name'), { target: { value: 'Loan D' } });
      fireEvent.change(screen.getByTestId('account-code-suffix-input'), { target: { value: '0005' } });

      await act(async () => {
        fireEvent.click(screen.getByTestId('new-account-modal-save'));
      });

      // Mocked useUI echoes keys, so a resolved-but-untranslated parameterized match
      // falls back to the raw backend message unchanged — still the specific message,
      // not the generic 'newSubAccountError' fallback.
      expect(toast.error).toHaveBeenCalledWith('Account 20000005 already exists.');
    });

    it('shows an unrecognized backend message verbatim rather than swallowing it into the generic toast', async () => {
      globalThis.fetch = vi.fn(() => Promise.resolve({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'Some unexpected backend failure' } }),
      }));
      render(<NewAccountModal {...baseProps({ currentRecord: { id: 'acc-5000', searchKey: '5000', summaryLevel: 'Y' } })} />);

      fireEvent.change(screen.getByTestId('new-account-modal-name'), { target: { value: 'Loan D' } });
      fireEvent.change(screen.getByTestId('account-code-suffix-input'), { target: { value: '0005' } });

      await act(async () => {
        fireEvent.click(screen.getByTestId('new-account-modal-save'));
      });

      expect(toast.error).toHaveBeenCalledWith('Some unexpected backend failure');
    });

    it('falls back to the generic toast when the backend body carries no error message at all', async () => {
      globalThis.fetch = vi.fn(() => Promise.resolve({
        ok: false,
        status: 500,
        json: async () => ({}),
      }));
      render(<NewAccountModal {...baseProps({ currentRecord: { id: 'acc-5000', searchKey: '5000', summaryLevel: 'Y' } })} />);

      fireEvent.change(screen.getByTestId('new-account-modal-name'), { target: { value: 'Loan D' } });
      fireEvent.change(screen.getByTestId('account-code-suffix-input'), { target: { value: '0005' } });

      await act(async () => {
        fireEvent.click(screen.getByTestId('new-account-modal-save'));
      });

      // parseBackendErrorMessage finds nothing → handleSave's `msg || 'Error ${status}'`
      // fallback kicks in, so the toast still isn't the bare generic string — it names
      // the HTTP status.
      expect(toast.error).toHaveBeenCalledWith('Error 500');
    });
  });
});
