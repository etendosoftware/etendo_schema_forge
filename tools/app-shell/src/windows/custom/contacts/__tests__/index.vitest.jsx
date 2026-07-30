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
 *      not lose, BusinessPartnerPage's own default `hidePrint`/`hideEye`/
 *      `hideCounter`/`hideLink` flags (JSX last-prop-wins — see the comment
 *      above the prop in the source).
 *   2. `selectionBarRightActions` — the window's own bespoke delete
 *      affordance (trash + X buttons) that this window relies on INSTEAD of
 *      the generic bulk-delete button — was entirely untested: the confirm
 *      dialog, the sequential per-row DELETE loop, the stop-on-first-error
 *      behavior, and clearSelection()/onDataMutated() firing only after all
 *      rows succeed.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../contacts.css', () => ({}));
vi.mock('../contactsFkResolvers.js', () => ({}));
vi.mock('../contactsImportDescriptor.js', () => ({}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a) => toastError(...a), success: vi.fn() } }));

const extractApiErrorMessage = vi.fn().mockResolvedValue('boom');
vi.mock('@/lib/apiError', () => ({ extractApiErrorMessage: (...a) => extractApiErrorMessage(...a) }));

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
      hideEye: true,
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

  it('clicking the trash button opens a confirm dialog; confirming deletes every row, clears selection and notifies onDataMutated', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderWindow();

    await user.click(screen.getByTestId('Trash2__ef097c').closest('button'));
    expect(screen.getByTestId('DialogTitle__ef097c')).toHaveTextContent('deleteConfirmTitle');

    await user.click(screen.getAllByTestId('Button__ef097c')[1]); // destructive "delete" button

    await waitFor(() => expect(mockClearSelection).toHaveBeenCalledTimes(1));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/contacts/businessPartner/bp-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/contacts/businessPartner/bp-2',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(mockOnDataMutated).toHaveBeenCalledTimes(1);
  });

  it('stops on the first failed DELETE: does not call clearSelection/onDataMutated and toasts an error', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 409 }) // bp-1 fails
      .mockResolvedValueOnce({ ok: true }); // bp-2 would succeed but must never be reached
    const user = userEvent.setup();
    renderWindow();

    await user.click(screen.getByTestId('Trash2__ef097c').closest('button'));
    await user.click(screen.getAllByTestId('Button__ef097c')[1]);

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('boom'));

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(mockClearSelection).not.toHaveBeenCalled();
    expect(mockOnDataMutated).not.toHaveBeenCalled();
  });

  it('Cancel on the confirm dialog closes it without deleting anything', async () => {
    globalThis.fetch = vi.fn();
    const user = userEvent.setup();
    renderWindow();

    await user.click(screen.getByTestId('Trash2__ef097c').closest('button'));
    await user.click(screen.getAllByTestId('Button__ef097c')[0]); // outline "cancel" button

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockClearSelection).not.toHaveBeenCalled();
  });
});
