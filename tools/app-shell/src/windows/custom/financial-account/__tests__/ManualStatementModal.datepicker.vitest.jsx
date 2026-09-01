// ETP-4924 — regression coverage for the bank-statement line date picker bug.
//
// Root cause (diagnosed, not re-diagnosed here): the editable-row wrapper in
// `EditableLines` (ManualStatementModal.jsx) uses `onFocusCapture` /
// `onBlurCapture` with a DOM `e.currentTarget.contains(e.relatedTarget)`
// check to decide whether focus "left the row". That check is DOM-tree based,
// but the row's DateField (and LookupPicker) portal their popovers to
// `document.body` — logically still inside the row in the REACT tree, but
// NOT a DOM descendant of the row wrapper. So any focus movement into the
// portalled calendar (or Escape/Enter handling swallowed by the row's own
// `onKeyDown`) is wrongly treated as "focus left the row", unmounting
// `LineEditHint` mid-interaction and breaking keyboard day selection.
//
// UNLIKE the existing `ManualStatementModal.vitest.jsx` spec, this file does
// NOT mock `@/components/ui/date-field` or `@/components/ui/dialog` — the
// bug lives exactly in the interaction between the row wrapper and the real
// portalled Popover/Calendar/Dialog, so it has zero coverage under the
// existing mocked spec.
//
// Verified against the pre-fix source (the row wrapper's naive
// `e.currentTarget.contains(e.relatedTarget)` check, no `isInPortalLayer`):
// only the "selects the focused day on Enter without triggering save" case
// fails red. The other cases stay green even pre-fix in jsdom — a click that
// blurs the previously-focused portalled element and focuses a new one fires
// both events within the same task, and the pre-fix `onFocusCapture` (which,
// unlike `onBlurCapture`, was NOT guarded and unconditionally re-set
// `focusedId` to this row on ANY focus, portalled or not) immediately
// re-applies `focusedId` in the same React 18 batch, so the transient `null`
// from the buggy blur check never reaches a committed render. That is a
// genuine jsdom/batching limitation (no real layout, no separate paint
// between the blur and the re-focus), not a flaw in these assertions: they
// still correctly encode the fixed behavior, and (verified separately) they
// DO fail against a deliberately-broken `isInPortalLayer` — see the ETP-4924
// entry in `docs/generated-custom-windows/financial-account.md` for the two
// selector/pointer-events mistakes that regressed to exactly that. The
// pixel-level dialog-shift mechanism itself needs a real browser; that
// belongs in Playwright E2E, not here.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatCalendarDate } from '@/lib/dateOnly.js';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...a) => toastSuccess(...a), error: (...a) => toastError(...a) },
}));

const createStatement = vi.fn();
const creatingRef = { value: false };
vi.mock('@/hooks/useCreateStatement', () => ({
  useCreateStatement: () => ({ createStatement, creating: creatingRef.value, error: null }),
}));

const updateStatement = vi.fn();
vi.mock('@/hooks/useStatementActions', () => ({
  useStatementActions: () => ({
    updateStatement, processStatement: vi.fn(), deleteStatement: vi.fn(), busy: false, error: null,
  }),
}));

const linesRef = { value: [], loading: false };
vi.mock('@/hooks/useBankStatementLines', () => ({
  useBankStatementLines: () => ({ lines: linesRef.value, loading: linesRef.loading, reload: vi.fn() }),
}));

// One fixed BPartner result so the LookupPicker dropdown (case 6) has
// something to portal and render — an empty result list never mounts the
// dropdown at all.
vi.mock('@/hooks/useMovementLookups', () => ({
  useBPartnerLookup: () => ({ results: [{ id: 'bp-1', name: 'Acme' }], loading: false }),
  useGLItemLookup: () => ({ results: [], loading: false }),
}));

// Intentionally NOT mocked: '@/components/ui/date-field', '@/components/ui/dialog'.
// The real Radix Popover-inside-Dialog + react-day-picker calendar is exercised.

import { ManualStatementModal } from '../ManualStatementModal.jsx';

function renderModal(overrides = {}) {
  const props = {
    open: true,
    accountId: 'acc-1',
    accountCurrency: 'EUR',
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    ...overrides,
  };
  return { ...render(<ManualStatementModal {...props} />), props };
}

// `EditRow`'s own root div carries `manual-line-editrow`; the sibling
// `LineEditHint` (when mounted) is NOT inside it — it is a sibling under the
// same un-tagged wrapper div that owns the buggy focus handlers. So this
// helper only scopes queries for elements that live inside the row itself
// (date field, lookup inputs); the hint text is asserted at the `screen`
// level on purpose.
function firstEditRow() {
  return screen.getAllByTestId('manual-line-editrow')[0];
}

const HINT_SAVE_TEXT = 'financeAccountStatementsManualLineHintSave';

/** Opens the row's date-field popover by clicking its calendar-icon trigger. */
async function openRowCalendar(user, row) {
  await user.click(within(row).getByLabelText('datePickerOpen'));
  return screen.findByTestId('Calendar__d56af3');
}

/** yyyy-MM-dd for a day in the currently displayed (real, current) month, distinct from today. */
function pickTargetIso() {
  const today = new Date();
  const day = today.getDate() === 10 ? 11 : 10;
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return { iso: `${yyyy}-${mm}-${dd}`, day };
}

describe('ManualStatementModal — line date picker (real Popover/Dialog, ETP-4924)', () => {
  beforeEach(() => {
    createStatement.mockReset().mockResolvedValue({ id: 'stmt-1', name: 'X', lineCount: 1 });
    updateStatement.mockReset().mockResolvedValue({ id: 'stmt-1', name: 'X', lineCount: 1 });
    toastSuccess.mockReset();
    toastError.mockReset();
    creatingRef.value = false;
    linesRef.value = [];
    linesRef.loading = false;
  });

  // Case 1 — opening the calendar must not be treated as "focus left the row".
  it('keeps the row edit hint mounted while the date popover is open', async () => {
    const user = userEvent.setup();
    renderModal();
    const row = firstEditRow();

    await openRowCalendar(user, row);

    expect(screen.getByText(HINT_SAVE_TEXT)).toBeInTheDocument();
  });

  // Case 2 — value-level regression check only. jsdom performs no real layout,
  // so the reported mechanism (LineEditHint's mount/unmount shifting the
  // centered Dialog by ~12px mid-click, making the day-click's mouseup land on
  // the wrong element) cannot be reproduced here — a real cross-browser/layout
  // repro of that pixel shift belongs in Playwright E2E, not this suite. This
  // test may already be green before the fix; that is expected.
  it('commits the picked day to the row date field', async () => {
    const user = userEvent.setup();
    renderModal();
    const row = firstEditRow();
    const dateInput = within(row).getByTestId('manual-line-date');

    const calendar = await openRowCalendar(user, row);
    const { iso, day } = pickTargetIso();
    const dayButton = calendar.querySelector(`[data-day="${iso}"] button`);
    expect(dayButton).toBeTruthy();
    await user.click(dayButton);

    const expected = formatCalendarDate(iso, 'es_ES');
    expect(dateInput.value).toBe(expected);
    expect(dateInput.value).toContain(String(day).padStart(2, '0'));
  });

  // Case 3 — "Limpiar" then a fresh day pick must leave the field with the
  // newly picked date, not empty.
  it('leaves the field with the newly picked date after Clear + pick', async () => {
    const user = userEvent.setup();
    renderModal();
    const row = firstEditRow();
    const dateInput = within(row).getByTestId('manual-line-date');

    const popover = await (async () => {
      await openRowCalendar(user, row);
      return screen.findByTestId('PopoverContent__d56af3');
    })();
    await user.click(within(popover).getByRole('button', { name: 'clear' }));
    expect(dateInput.value).toBe('');

    const calendar = await openRowCalendar(user, row);
    const { iso, day } = pickTargetIso();
    const dayButton = calendar.querySelector(`[data-day="${iso}"] button`);
    expect(dayButton).toBeTruthy();
    await user.click(dayButton);

    const expected = formatCalendarDate(iso, 'es_ES');
    expect(dateInput.value).toBe(expected);
    expect(dateInput.value).not.toBe('');
    expect(dateInput.value).toContain(String(day).padStart(2, '0'));
  });

  // Case 4 — Enter on a focused day button must select that day, and must
  // never bubble up to trigger "Guardar y procesar".
  it('selects the focused day on Enter without triggering save', async () => {
    const user = userEvent.setup();
    renderModal();
    const row = firstEditRow();
    const dateInput = within(row).getByTestId('manual-line-date');
    const initialValue = dateInput.value;

    const calendar = await openRowCalendar(user, row);
    const { iso } = pickTargetIso();
    const dayButton = calendar.querySelector(`[data-day="${iso}"] button`);
    expect(dayButton).toBeTruthy();
    dayButton.focus();
    expect(document.activeElement).toBe(dayButton);

    await user.keyboard('{Enter}');

    const expected = formatCalendarDate(iso, 'es_ES');
    expect(dateInput.value).toBe(expected);
    expect(dateInput.value).not.toBe(initialValue);
    // "Guardar y procesar" / "save as draft" must never fire from this keystroke.
    expect(createStatement).not.toHaveBeenCalled();
    expect(updateStatement).not.toHaveBeenCalled();
  });

  // Case 5 — Escape while the calendar is open must close only the popover,
  // never the surrounding Dialog.
  it('closes only the date popover on Escape, leaving the modal open', async () => {
    const user = userEvent.setup();
    renderModal();
    const row = firstEditRow();

    await openRowCalendar(user, row);
    expect(screen.getByTestId('Calendar__d56af3')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByTestId('Calendar__d56af3')).not.toBeInTheDocument();
    // The modal itself (its name field, always present while open) is still there.
    expect(screen.getByTestId('manual-statement-name')).toBeInTheDocument();
  });

  // Case 6 — same bug class, a different portal: opening the "Contacto"
  // lookup dropdown on a line must not unmount the row's edit hint either.
  it('keeps the row edit hint mounted while a LookupPicker dropdown is open', async () => {
    const user = userEvent.setup();
    renderModal();
    const row = firstEditRow();

    await user.click(within(row).getByTestId('manual-line-contact'));
    // The BPartner mock always returns one result, so the dropdown mounts.
    await screen.findByText('Acme');

    expect(screen.getByText(HINT_SAVE_TEXT)).toBeInTheDocument();
  });
});
