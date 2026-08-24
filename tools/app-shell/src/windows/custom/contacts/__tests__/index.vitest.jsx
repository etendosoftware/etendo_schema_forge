/**
 * ETP-4656 — `contacts/index.jsx` (ContactsWindow) had NO direct test file
 * before this: it's normally exercised indirectly through the sibling
 * component test suites (ContactsTable.vitest.jsx etc.), which never mount
 * the actual window shell.
 *
 * This closes two real gaps:
 *   1. The `listViewOptions` object this window forwards to the generated
 *      `BusinessPartnerPage` — specifically `hideBulkDelete: true` — is the
 *      ONLY thing that suppresses ListView's generic "Delete selected"
 *      toolbar action for this window (ListView.bulkDelete.vitest.jsx proves
 *      the mechanism works generically, but nothing previously asserted that
 *      *this* window actually sets the flag). Also asserts it must REPLACE,
 *      not lose, BusinessPartnerPage's own default `hidePrint`/`hideCounter`/
 *      `hideLink` flags (JSX last-prop-wins — see the comment
 *      above the prop in the source).
 *   2. `selectionBarRightActions` — the window's own bespoke delete
 *      affordance (trash + X buttons) that this window relies on INSTEAD of
 *      the generic bulk-delete button — was entirely untested.
 *
 * ETP-4656 (QA fix, this file's rewrite): the original version of this test
 * asserted a BUG — a sequential per-row DELETE loop that stopped on the
 * first failure (never even attempting the remaining rows) and toasted the
 * raw, untranslated backend error message. `handleBulkDeleteConfirm` was
 * rewritten to match every other bulk-delete consumer in the app (see
 * `useBulkRowDelete.vitest.jsx`): parallel deletes via `runBatchDelete`
 * (`Promise.allSettled` — every row is always attempted), backend errors
 * translated through `extractErrorMessage` (FK-violation → a translated
 * message), and exactly one 3-outcome toast via `toastBatchDeleteOutcome`.
 * On confirm, the window now calls `reselectFailed(succeeded, failed)`
 * (handed to it by `selectionBarRightActions`) instead of unconditionally
 * clearing the selection / notifying `onDataMutated`.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../contacts.css', () => ({}));
vi.mock('../contactsFkResolvers.js', () => ({}));
vi.mock('../contactsImportDescriptor.js', () => ({}));

// `ui('bulkDeleteAllSucceeded'|'bulkDeletePartialFailure'|'bulkDeleteAllFailed', params)`
// needs real interpolation to assert the toasted text — same convention (and
// same wording) as `useBulkRowDelete.vitest.jsx`, for consistency across the
// suite. Every other key falls back to identity (returns the key itself),
// matching this file's pre-existing assertions (e.g. `deleteConfirmTitle`).
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    const map = {
      bulkDeleteAllSucceeded: '{count} record(s) deleted successfully.',
      bulkDeletePartialFailure: '{succeeded} of {total} record(s) deleted. {failed} could not be deleted.',
      bulkDeleteAllFailed: 'None of the {count} selected record(s) could be deleted.',
    };
    let text = map[key] || key;
    if (params) {
      Object.keys(params).forEach((p) => { text = text.replace(`{${p}}`, params[p]); });
    }
    return text;
  },
}));

const toastSuccess = vi.fn();
const toastWarning = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a) => toastSuccess(...a),
    warning: (...a) => toastWarning(...a),
    error: (...a) => toastError(...a),
  },
}));

// Mirrors `@/hooks/useEntity`'s real `extractErrorMessage` contract exactly
// (same mock shape `useBulkRowDelete.vitest.jsx` uses): reads the backend's
// translated message off the JSON body.
vi.mock('@/hooks/useEntity', () => ({
  extractErrorMessage: async (res) => {
    try {
      const body = await res.json();
      return body.message || null;
    } catch {
      return null;
    }
  },
}));

vi.mock('../ContactsBusinessPartnerForm', () => ({ default: () => null }));
vi.mock('../ContactsPeriodButton', () => ({ default: () => null }));
vi.mock('../ContactsSummaryWidget', () => ({ default: () => null }));

// Captures the exact props ContactsWindow hands to the generated
// BusinessPartnerPage, and exposes a trigger to invoke
// `selectionBarRightActions` with a controllable fixture.
let capturedProps = null;
const MOCK_ROWS = [{ id: 'bp-1' }, { id: 'bp-2' }];
const mockClearSelection = vi.fn();
const mockOnDataMutated = vi.fn();
const mockReselectFailed = vi.fn();

vi.mock('@generated/contacts/generated/web/contacts/BusinessPartnerPage', () => ({
  default: (props) => {
    capturedProps = props;
    return (
      <div data-testid="business-partner-page">
        {props.selectionBarRightActions?.({
          selectedRows: MOCK_ROWS,
          clearSelection: mockClearSelection,
          token: 'test-token',
          apiBaseUrl: '/api/contacts',
          onDataMutated: mockOnDataMutated,
          reselectFailed: mockReselectFailed,
        })}
      </div>
    );
  },
}));

import ContactsWindow from '../index.jsx';

function renderWindow(props = {}) {
  return render(
    <ContactsWindow token="test-token" apiBaseUrl="/api/contacts" windowName="contacts" {...props} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedProps = null;
});

describe('ContactsWindow — listViewOptions.hideBulkDelete opt-out (ETP-4656)', () => {
  it('passes hideBulkDelete: true, alongside the pre-existing hide* flags, to BusinessPartnerPage', () => {
    renderWindow();

    expect(capturedProps.listViewOptions).toEqual({
      hidePrint: true,
      hideCounter: true,
      hideLink: true,
      hideBulkDelete: true,
    });
  });

  it('also opts into enableSecondaryRowDelete and a custom selectionBarRightActions renderer', () => {
    renderWindow();

    expect(capturedProps.enableSecondaryRowDelete).toBe(true);
    expect(typeof capturedProps.selectionBarRightActions).toBe('function');
  });
});

describe('ContactsWindow — bespoke selectionBarRightActions delete affordance', () => {
  it('renders a trash button and a clear-selection (X) button', () => {
    renderWindow();

    const page = screen.getByTestId('business-partner-page');
    expect(page.querySelector('[data-testid="Trash2__ef097c"]')).toBeTruthy();
    expect(page.querySelector('[data-testid="X__ef097c"]')).toBeTruthy();
  });

  it('clicking the X button clears the selection directly (no confirm dialog)', async () => {
    const user = userEvent.setup();
    renderWindow();

    await user.click(screen.getByTestId('X__ef097c').closest('button'));

    expect(mockClearSelection).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('Dialog__ef097c')).not.toBeInTheDocument();
  });

  it('clicking the trash button opens a confirm dialog; confirming when every row succeeds toasts a single success message and reselects nothing as failed', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderWindow();

    await user.click(screen.getByTestId('Trash2__ef097c').closest('button'));
    expect(screen.getByTestId('DialogTitle__ef097c')).toHaveTextContent('deleteConfirmTitle');

    await user.click(screen.getAllByTestId('Button__ef097c')[1]); // destructive "delete" button

    await waitFor(() => expect(mockReselectFailed).toHaveBeenCalledTimes(1));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/contacts/businessPartner/bp-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/contacts/businessPartner/bp-2',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(toastSuccess).toHaveBeenCalledWith('2 record(s) deleted successfully.');
    expect(toastWarning).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(mockReselectFailed).toHaveBeenCalledWith(MOCK_ROWS, []);
    // The old bug's unconditional clearSelection()/onDataMutated() calls from
    // the confirm handler are gone — outcome handling now flows exclusively
    // through `reselectFailed`.
    expect(mockClearSelection).not.toHaveBeenCalled();
    expect(mockOnDataMutated).not.toHaveBeenCalled();
  });

  it('attempts BOTH rows even when the first one fails, translates the FK-violation error, and reselects only the failed row', async () => {
    // Regression guard for the QA-reported bug: bp-1 fails but bp-2 MUST still
    // be attempted (no more stop-on-first-failure).
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.endsWith('/bp-1')) {
        return Promise.resolve({ ok: false, json: async () => ({ message: 'FK violation' }) });
      }
      return Promise.resolve({ ok: true }); // bp-2 succeeds
    });
    const user = userEvent.setup();
    renderWindow();

    await user.click(screen.getByTestId('Trash2__ef097c').closest('button'));
    await user.click(screen.getAllByTestId('Button__ef097c')[1]);

    await waitFor(() => expect(mockReselectFailed).toHaveBeenCalledTimes(1));

    // Both rows were attempted — the core regression fix.
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/contacts/businessPartner/bp-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/contacts/businessPartner/bp-2',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    // Exactly one combined outcome toast (partial failure), not the old raw
    // untranslated backend error.
    expect(toastWarning).toHaveBeenCalledWith('1 of 2 record(s) deleted. 1 could not be deleted.');
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();

    // Only the failed row (bp-1) is handed back for reselection; bp-2 is
    // reported as succeeded.
    expect(mockReselectFailed).toHaveBeenCalledWith([{ id: 'bp-2' }], [{ id: 'bp-1' }]);
    expect(mockClearSelection).not.toHaveBeenCalled();
    expect(mockOnDataMutated).not.toHaveBeenCalled();
  });

  it('when every row fails, fires the all-failed toast and reselects every row as failed', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'FK violation' }),
    });
    const user = userEvent.setup();
    renderWindow();

    await user.click(screen.getByTestId('Trash2__ef097c').closest('button'));
    await user.click(screen.getAllByTestId('Button__ef097c')[1]);

    await waitFor(() => expect(mockReselectFailed).toHaveBeenCalledTimes(1));

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(toastError).toHaveBeenCalledWith('None of the 2 selected record(s) could be deleted.');
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastWarning).not.toHaveBeenCalled();
    expect(mockReselectFailed).toHaveBeenCalledWith([], MOCK_ROWS);
  });

  it('Cancel on the confirm dialog closes it without deleting anything', async () => {
    globalThis.fetch = vi.fn();
    const user = userEvent.setup();
    renderWindow();

    await user.click(screen.getByTestId('Trash2__ef097c').closest('button'));
    await user.click(screen.getAllByTestId('Button__ef097c')[0]); // outline "cancel" button

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockClearSelection).not.toHaveBeenCalled();
    expect(mockReselectFailed).not.toHaveBeenCalled();
  });
});
