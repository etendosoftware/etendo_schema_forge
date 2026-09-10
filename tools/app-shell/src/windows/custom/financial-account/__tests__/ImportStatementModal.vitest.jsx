import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * ETP-4954 rewrote this wizard. The file is now parsed IN THE BROWSER, auto-mapped, reviewed
 * row by row, and only then POSTed to the EXISTING `?action=create` endpoint — the same
 * endpoint, and the same payload, the manual form uses. The two round trips it replaced
 * (`?action=preview` and `?action=import`, both fed a base64 copy of the file) are gone from
 * this screen, so `useStatementPreview` / `useStatementImport` are no longer imported at all.
 *
 * The view machine is `empty | error → selected → analyzing → mapping → preview → importing`.
 * `mapping` is the new step: column mapping and the row review queue in one view, and every
 * path to `preview` goes through it.
 *
 * These tests drive the real pipeline (`parseDelimited` → `mapColumns` → `validateRow` +
 * the registered `bank-statement` amount rule → `buildStatementPreview`) against real CSV
 * fixtures, mocking only the network call and the two file-writing side effects. Mocking the
 * pipeline instead would leave the interesting half — which rows survive review — untested.
 */
/**
 * The translator echoes the key, so no assertion below depends on a real locale — EXCEPT for
 * the two row-validation messages, which resolve to distinguishable sentinels.
 *
 * They have to: with a key-echoing translator, `validateBankStatementRow` sees
 * `translate(key) === key` and falls back to its English default, so both the "negative
 * amount" and the "no amount at all" message would be *some* string in the flagged cell and a
 * test could not tell them apart. Since a negative-only row ALSO has no positive amount, a
 * test that only checks "this row is in the Errores tab" passes just as well with the negative
 * rule deleted — verified by mutating `if (value < 0)` to `if (false)`. Naming the message is
 * what makes these tests fail for the right reason.
 */
const UI_MESSAGES = {
  financeAccountStatementsImportErrorNegativeAmount: '[negative-amount]',
  financeAccountStatementsImportErrorNoAmount: '[no-amount]',
  financeAccountStatementsImportErrorInvalidDate: '[invalid-date]',
  // ETP-4954 — the "exactly one side" clause. Needs its own sentinel for the same reason: a
  // row filled on BOTH sides is also a row with no single usable amount, so a test that only
  // asserted "this row is in the Errores tab" would not notice the clause being deleted.
  financeAccountStatementsImportErrorBothAmounts: '[both-amounts]',
};
vi.mock('@/i18n', () => ({
  useUI: () => (key) => UI_MESSAGES[key] ?? key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...a) => toastSuccess(...a), error: (...a) => toastError(...a) },
}));

// We avoid mounting the real Radix dialog (portals + animation) and replace it with a
// transparent pass-through that exposes onOpenChange so we can drive the dialog-close flow
// (the modal has no Cancel button — the X / onOpenChange handles closing). Renders its
// children when `open=true`. Note this only replaces the OUTER dialog: the mapping widget and
// the review queue mount the core's own dialogs, which stay real (and closed).
let lastOnOpenChange = null;
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children, onOpenChange }) => {
    lastOnOpenChange = onOpenChange;
    return open ? <div data-testid="import-modal">{children}</div> : null;
  },
  // className is forwarded so the height-capping and width classes can be asserted.
  DialogContent: ({ children, className }) => (
    <div data-testid="import-dialog-content" className={className}>{children}</div>
  ),
}));

// The one network call the flow makes. `?action=create` is the SAME endpoint the manual
// statement form posts to — the payload assertion below is what pins that.
const createStatement = vi.fn();
const creatingRef = { value: false };
vi.mock('@/hooks/useCreateStatement', () => ({
  useCreateStatement: () => ({
    createStatement,
    creating: creatingRef.value,
    error: null,
  }),
}));

// Writing a file to disk is not something jsdom can do; the two template links and the error
// report all funnel through this one helper, so stubbing it is enough to observe all three.
const downloadBlobAsFile = vi.fn();
vi.mock('@/windows/custom/shared/pdfUtils.js', () => ({
  downloadBlobAsFile: (...a) => downloadBlobAsFile(...a),
}));

// The workbook writer is a heavy, async-only dependency and the one template branch that can
// fail on its own — stubbed so both its outcomes are reachable.
const buildTemplateXlsx = vi.fn();
vi.mock('@etendosoftware/app-shell-core/lib/import/buildTemplateXlsx.js', () => ({
  buildTemplateXlsx: (...a) => buildTemplateXlsx(...a),
}));

// The spreadsheet reader needs a real OOXML container, which a jsdom File cannot be. Stubbed
// so the `.xlsx` branch is reachable; the CSV fixtures below exercise the real parser.
const parseXlsx = vi.fn();
vi.mock('@etendosoftware/app-shell-core/lib/import/parseXlsx.js', () => ({
  parseXlsx: (...a) => parseXlsx(...a),
}));

import { ImportStatementModal } from '../ImportStatementModal.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — real CSV text, since the parse now happens in the browser.
// ─────────────────────────────────────────────────────────────────────────────

/** The Spanish headers the downloadable template writes; all six auto-map. */
const CSV_HEADERS = 'Fecha,Nº de referencia,Descripción,Nombre del contacto,Salida,Entrada';

function csvFile(rows, name = 'extracto.csv') {
  return new File([[CSV_HEADERS, ...rows].join('\n')], name, { type: 'text/csv' });
}

const VALID_ROWS = [
  '01/05/2026,R1,INGRESO 1,,,100',
  '02/05/2026,R2,CARGO 1,,30,',
];

// One clean row and one carrying a negative Entrada — the row that must land in the Errores
// tab instead of being silently dropped (or, worse, netted) the way it was before ETP-4954.
const NEGATIVE_ROWS = [
  '01/05/2026,R1,INGRESO 1,,,100',
  '02/05/2026,R2,DEVOLUCION,,,-20',
];

// One clean row and one filled on BOTH sides (ETP-4954). A bank that exports Salida and
// Entrada as two independent columns produces this whenever it fills both; the read path
// collapses the pair into `cramount - dramount`, so before the rule it imported and then
// displayed as -70,00 EUR.
const BOTH_SIDES_ROWS = [
  '01/05/2026,R1,INGRESO 1,,,100',
  '02/05/2026,R2,AMBAS,,100,30',
];

// Nothing sendable: one row with no amount at all, one with a negative Salida.
const ALL_INVALID_ROWS = [
  '01/05/2026,R1,SIN IMPORTE,,,',
  '02/05/2026,R2,NEGATIVO,,-5,',
];

// Sums land in the 1000-9999 range, where a formatter without explicit grouping silently
// drops the thousands separator.
const GROUPING_ROWS = [
  '01/05/2026,R1,INGRESO 1,,,1500',
  '02/05/2026,R2,CARGO 1,,2500.50,',
];

const MANY_ROWS = Array.from({ length: 120 }, (_, i) => `01/05/2026,R${i + 1},MOV ${i + 1},,,10`);

function defaultProps(overrides = {}) {
  return {
    open: true,
    accountId: 'acc-1',
    accountCurrency: 'EUR',
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    ...overrides,
  };
}

/**
 * `applyAccept: false` because the picker's own `accept` filter is asserted separately, and
 * two tests must hand the component a file it would refuse to offer (a `.xls`, which a real
 * drag-and-drop also gets past `accept`).
 */
function mkUser() {
  return userEvent.setup({ applyAccept: false });
}

function continueButton() {
  return screen.getByText('financeAccountStatementsImportContinue').closest('button');
}

function confirmButton() {
  return screen.getByText('financeAccountStatementsImportConfirm').closest('button');
}

async function pickFile(user, container, file) {
  const input = container.querySelector('input[type="file"]');
  await act(async () => {
    await user.upload(input, file);
  });
}

/** Step 1 → the new `mapping` step: pick a file, then Continue (which parses it locally). */
async function gotoMapping(user, container, file = csvFile(VALID_ROWS)) {
  await pickFile(user, container, file);
  await waitFor(() => expect(continueButton()).toBeEnabled());
  await user.click(continueButton());
  await waitFor(() =>
    expect(screen.getByTestId('ImportColumnMapping__chips')).toBeInTheDocument(),
  );
}

/**
 * Step 1 → `preview`. There is no longer a direct `selected → preview` edge: Continue is
 * clicked TWICE, once to parse and map, once to build the preview from the rows that survived
 * review.
 */
async function gotoPreview(user, container, file = csvFile(VALID_ROWS)) {
  await gotoMapping(user, container, file);
  await user.click(continueButton());
  await waitFor(() =>
    expect(screen.getByText('financeAccountStatementsImportConfirm')).toBeInTheDocument(),
  );
}

describe('ImportStatementModal', () => {
  beforeEach(() => {
    createStatement.mockReset();
    createStatement.mockResolvedValue({ id: 'st-99' });
    downloadBlobAsFile.mockReset();
    buildTemplateXlsx.mockReset();
    buildTemplateXlsx.mockResolvedValue(new Blob(['xlsx-bytes']));
    parseXlsx.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    creatingRef.value = false;
    lastOnOpenChange = null;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Step 1 — upload
  // ───────────────────────────────────────────────────────────────────────────

  it('returns null body when open=false', () => {
    render(<ImportStatementModal {...defaultProps({ open: false })} />);
    expect(screen.queryByTestId('import-modal')).not.toBeInTheDocument();
  });

  it('renders the upload subtitle and a disabled Continue button (no Cancel) in the "empty" view', () => {
    render(<ImportStatementModal {...defaultProps()} />);
    expect(
      screen.getByText('financeAccountStatementsImportSubtitleUpload'),
    ).toBeInTheDocument();
    // Continue is the only footer action and is disabled until a file is selected.
    expect(continueButton()).toBeDisabled();
    // There is no Cancel button — the dialog X handles closing.
    expect(
      screen.queryByText('financeAccountStatementsImportCancel'),
    ).not.toBeInTheDocument();
  });

  // ETP-4954 replaced the Cuaderno 43 family (`.c43`, `.43`, `.nor`) with spreadsheet
  // formats: the import parses the file in the browser so its columns can be mapped, and a
  // fixed-width C43 record has no columns to map.
  //
  // `.xls` IS offered even though it is rejected on selection, and that pairing is the point:
  // left out of `accept`, the OS picker hides the user's own file, so they click "select file",
  // their .xls is not there, and the message telling them to re-save it as .xlsx is unreachable
  // (only a drag-and-drop bypasses `accept`). The rejection itself is covered by
  // "rejects a .xls upload up front with its own message" below — the two together are the behaviour:
  // selectable, then explained.
  it('offers the browser-parseable formats plus .xls, and excludes Cuaderno 43', () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const accept = container.querySelector('input[type="file"]')
      .getAttribute('accept').split(',').map((s) => s.trim());
    expect(accept).toContain('.csv');
    expect(accept).toContain('.txt');
    expect(accept).toContain('.xlsx');
    expect(accept).toContain('.xls');
    expect(accept).not.toContain('.c43');
    expect(accept).not.toContain('.nor');
  });

  it('picking a file goes straight to the "selected" view without calling the backend', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    await pickFile(mkUser(), container, csvFile(VALID_ROWS));

    // The selected-file card is shown with the file name; nothing has been sent.
    await waitFor(() => expect(screen.getByText('extracto.csv')).toBeInTheDocument());
    expect(createStatement).not.toHaveBeenCalled();
    // The local line-count hint (header + 2 rows) is read from the file, not from a backend.
    expect(screen.getByText(/financeAccountStatementsImportLines/)).toBeInTheDocument();
    expect(continueButton()).toBeEnabled();
  });

  // `.xls` is Excel 97-2003, a binary OLE container the OOXML reader cannot open at all.
  // Caught up front so the user gets the one message that fixes it ("save it as .xlsx")
  // instead of the reader's opaque failure.
  it('rejects a .xls upload up front with its own message, not the generic format error', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    await pickFile(
      mkUser(),
      container,
      new File(['legacy'], 'extracto.xls', { type: 'application/vnd.ms-excel' }),
    );

    await waitFor(() =>
      expect(screen.getByText('financeAccountStatementsImportErrorXls')).toBeInTheDocument(),
    );
    expect(screen.queryByText('financeAccountStatementsImportErrorBody')).toBeNull();
    // No file was registered, so Continue stays disabled and nothing was parsed or sent.
    expect(screen.queryByText('extracto.xls')).toBeNull();
    expect(continueButton()).toBeDisabled();
    expect(parseXlsx).not.toHaveBeenCalled();
    expect(createStatement).not.toHaveBeenCalled();
  });

  it('parses a .xlsx upload through the spreadsheet reader and omits the line-count hint', async () => {
    parseXlsx.mockResolvedValue({
      headers: ['Fecha', 'Salida', 'Entrada'],
      rows: [{ Fecha: '01-05-2026', Salida: '', Entrada: '100' }],
    });
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = mkUser();

    await pickFile(user, container, new File(['PK'], 'extracto.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }));
    await waitFor(() => expect(screen.getByText('extracto.xlsx')).toBeInTheDocument());
    // A spreadsheet's rows cannot be counted from a text read, so the hint is omitted rather
    // than reading a nonsense "0 líneas" next to a file that clearly has rows.
    expect(screen.queryByText(/financeAccountStatementsImportLines/)).toBeNull();

    await user.click(continueButton());
    await waitFor(() =>
      expect(screen.getByTestId('ImportColumnMapping__chips')).toBeInTheDocument(),
    );
    expect(parseXlsx).toHaveBeenCalledTimes(1);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Step 1 — the two downloadable templates (ETP-4954)
  // ───────────────────────────────────────────────────────────────────────────

  it('offers a CSV and an XLSX template on step 1', () => {
    render(<ImportStatementModal {...defaultProps()} />);
    expect(screen.getByTestId('import-statement-template-csv')).toBeInTheDocument();
    expect(screen.getByTestId('import-statement-template-xlsx')).toBeInTheDocument();
  });

  // The headers come from the field descriptor's `labelKey`, resolved in the session
  // language — never from a baked-in English string. With a key-returning translator the
  // header IS the key, which is exactly what makes that visible.
  it('downloads a CSV template whose headers come from the i18n keys, date marked required', async () => {
    render(<ImportStatementModal {...defaultProps()} />);
    await mkUser().click(screen.getByTestId('import-statement-template-csv'));

    expect(downloadBlobAsFile).toHaveBeenCalledTimes(1);
    const [blob, filename] = downloadBlobAsFile.mock.calls[0];
    expect(filename).toBe('financeAccountStatementsImportTemplateFileName.csv');
    const text = await blob.text();
    expect(text).toContain('financeAccountStatementsManualColDate *');
    expect(text).toContain('financeAccountStatementsManualColIn');
    // Only the date column carries the required marker.
    expect(text.split('\n')[0].split(',').filter((h) => h.trim().endsWith('*'))).toHaveLength(1);
    // And the sample row travels with it, so the expected value shapes are visible.
    expect(text).toContain('01/08/2026');
  });

  it('downloads an XLSX template through the workbook writer', async () => {
    render(<ImportStatementModal {...defaultProps()} />);
    await mkUser().click(screen.getByTestId('import-statement-template-xlsx'));

    await waitFor(() => expect(downloadBlobAsFile).toHaveBeenCalledTimes(1));
    expect(buildTemplateXlsx).toHaveBeenCalledTimes(1);
    expect(downloadBlobAsFile.mock.calls[0][1])
      .toBe('financeAccountStatementsImportTemplateFileName.xlsx');
  });

  // The workbook writer is the one template branch that can fail on its own; a failure must
  // not leave the link stuck disabled.
  it('toasts and re-enables the XLSX link when the workbook writer fails', async () => {
    buildTemplateXlsx.mockRejectedValue(new Error('writer exploded'));
    render(<ImportStatementModal {...defaultProps()} />);
    await mkUser().click(screen.getByTestId('import-statement-template-xlsx'));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('financeAccountStatementsImportTemplateError'),
    );
    expect(downloadBlobAsFile).not.toHaveBeenCalled();
    expect(screen.getByTestId('import-statement-template-xlsx')).toBeEnabled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Step 2a — the new `mapping` view (column mapping + row review)
  // ───────────────────────────────────────────────────────────────────────────

  it('Continue parses the file locally and opens the mapping + review step', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    await gotoMapping(mkUser(), container);

    expect(
      screen.getByText('financeAccountStatementsImportSubtitleMapping'),
    ).toBeInTheDocument();
    // Every header auto-mapped, and the chip shows the field's session-language name.
    expect(screen.getByTestId('ImportColumnMapping__chip-Fecha'))
      .toHaveTextContent('financeAccountStatementsManualColDate');
    expect(screen.getByTestId('ImportColumnMapping__chip-Entrada'))
      .toHaveTextContent('financeAccountStatementsManualColIn');
    // The review queue lists both parsed rows, all correct.
    expect(screen.getByTestId('ImportReviewQueue__statusFilterCount-all')).toHaveTextContent('2');
    expect(screen.getByTestId('ImportReviewQueue__statusFilterCount-ok')).toHaveTextContent('2');
    expect(screen.getByTestId('ImportReviewQueue__statusFilterCount-error')).toHaveTextContent('0');
    expect(screen.getByTestId('ImportReviewQueue__value-0-description')).toHaveTextContent('INGRESO 1');
    // Nothing has been sent yet — the whole point of the step.
    expect(createStatement).not.toHaveBeenCalled();
    // No error banner when every row is fine.
    expect(screen.queryByTestId('import-review-error-summary')).toBeNull();
  });

  // The rule: a line is valid when it carries at least one amount above zero and NO amount
  // below zero. Before ETP-4954 this row was dropped on the backend without a trace.
  it('puts a row with a negative amount in the errors tab, with the offending cell flagged', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = mkUser();
    await gotoMapping(user, container, csvFile(NEGATIVE_ROWS));

    expect(screen.getByTestId('ImportReviewQueue__statusFilterCount-ok')).toHaveTextContent('1');
    expect(screen.getByTestId('ImportReviewQueue__statusFilterCount-error')).toHaveTextContent('1');
    expect(screen.getByTestId('import-review-error-summary')).toBeInTheDocument();
    // The error is attached to the Entrada cell, not to the row as a whole — and it is the
    // NEGATIVE-amount message, not the "this row has no amount" one that a negative-only row
    // would also earn.
    expect(screen.getByTestId('ImportReviewQueue__fieldError-1-in'))
      .toHaveTextContent('[negative-amount]');

    await user.click(screen.getByTestId('ImportReviewQueue__statusFilter-error'));

    // Only the offending row survives the filter, and its cell is editable.
    expect(screen.getByTestId('ImportReviewQueue__input-1-in')).toHaveValue('-20');
    expect(screen.queryByTestId('ImportReviewQueue__value-0-description')).toBeNull();
  });

  // Fixing a cell has to clear its error in the SAME render, or the row stays in the Errores
  // tab while visibly correct.
  it('clears the error in the same render when the offending cell is fixed', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = mkUser();
    await gotoMapping(user, container, csvFile(NEGATIVE_ROWS));

    const input = screen.getByTestId('ImportReviewQueue__input-1-in');
    await user.clear(input);
    await user.type(input, '20');

    expect(screen.getByTestId('ImportReviewQueue__input-1-in')).toHaveValue('20');
    expect(screen.queryByTestId('ImportReviewQueue__fieldError-1-in')).toBeNull();
    expect(screen.getByTestId('ImportReviewQueue__statusFilterCount-error')).toHaveTextContent('0');
    expect(screen.getByTestId('ImportReviewQueue__statusFilterCount-ok')).toHaveTextContent('2');
    expect(screen.queryByTestId('import-review-error-summary')).toBeNull();
  });

  // From `mapping`, Continue is only meaningful when at least one row will actually be sent —
  // otherwise the preview would be an empty statement.
  it('drops a skipped row from the count that enables Continue', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = mkUser();
    await gotoMapping(user, container);
    expect(continueButton()).toBeEnabled();

    await user.click(screen.getByTestId('ImportReviewQueue__skip-0'));

    // One row left to send, so Continue survives — and the skipped one is now counted as
    // needing attention, not as correct.
    expect(continueButton()).toBeEnabled();
    expect(screen.getByTestId('ImportReviewQueue__statusFilterCount-ok')).toHaveTextContent('1');
    expect(screen.getByTestId('ImportReviewQueue__statusFilterCount-error')).toHaveTextContent('1');
    expect(screen.getByTestId('ImportReviewQueue__skippedLabel-0')).toBeInTheDocument();

    await user.click(screen.getByTestId('ImportReviewQueue__skip-1'));

    expect(continueButton()).toBeDisabled();
  });

  it('un-skipping a row brings it back into the sendable count', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = mkUser();
    await gotoMapping(user, container);

    await user.click(screen.getByTestId('ImportReviewQueue__skip-0'));
    await user.click(screen.getByTestId('ImportReviewQueue__unskip-0'));

    expect(screen.getByTestId('ImportReviewQueue__statusFilterCount-ok')).toHaveTextContent('2');
    expect(continueButton()).toBeEnabled();
  });

  // `validateRow`'s required check only asks whether the cell is BLANK, so this row used to
  // reach the preview reported as Correcta and then went out in the payload with the literal
  // string `"nullT00:00:00Z"` as its date — a silently corrupt line.
  it('holds back a row whose date is well-formed but impossible', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    await gotoMapping(mkUser(), container, csvFile([
      '01/05/2026,R1,INGRESO 1,,,100',
      '31/02/2026,R2,31 DE FEBRERO,,,50',
    ]));

    expect(screen.getByTestId('ImportReviewQueue__statusFilterCount-ok')).toHaveTextContent('1');
    expect(screen.getByTestId('ImportReviewQueue__statusFilterCount-error')).toHaveTextContent('1');
    expect(screen.getByTestId('ImportReviewQueue__fieldError-1-date'))
      .toHaveTextContent('[invalid-date]');
    // Its positive amount is untouched, so only the date cell is flagged.
    expect(screen.queryByTestId('ImportReviewQueue__fieldError-1-in')).toBeNull();
  });

  it('never sends a row whose date cannot be normalized', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = mkUser();
    await gotoPreview(user, container, csvFile([
      '01/05/2026,R1,INGRESO 1,,,100',
      '31/02/2026,R2,31 DE FEBRERO,,,50',
    ]));

    expect(screen.getByTestId('import-discarded-lines')).toBeInTheDocument();
    await user.click(confirmButton());

    await waitFor(() => expect(createStatement).toHaveBeenCalledTimes(1));
    const { lines } = createStatement.mock.calls[0][0];
    expect(lines).toHaveLength(1);
    expect(lines[0].date).toBe('2026-05-01T00:00:00Z');
    // The shape the old bug produced must appear nowhere in the payload.
    expect(JSON.stringify(lines)).not.toContain('null T');
    expect(JSON.stringify(lines)).not.toContain('nullT00:00:00Z');
  });

  it('disables Continue when no row is sendable at all', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    await gotoMapping(mkUser(), container, csvFile(ALL_INVALID_ROWS));

    expect(screen.getByTestId('ImportReviewQueue__statusFilterCount-error')).toHaveTextContent('2');
    expect(continueButton()).toBeDisabled();
    expect(screen.getByTestId('import-review-error-summary')).toBeInTheDocument();
    // Each row is flagged for its own reason, on its own cell.
    expect(screen.getByTestId('ImportReviewQueue__fieldError-0-in'))
      .toHaveTextContent('[no-amount]');
    expect(screen.getByTestId('ImportReviewQueue__fieldError-1-out'))
      .toHaveTextContent('[negative-amount]');
  });

  // Opposite signs are the case that was silently NETTED before ETP-4954: the row DOES carry a
  // positive amount, so a "needs an amount" check alone waves it through, and the negative
  // side then cancelled part of it when the statement was read back as `cr - dr`.
  it('flags a row with opposite signs, which would otherwise have been netted', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    await gotoMapping(mkUser(), container, csvFile(['01/05/2026,R1,NETEADA,,50,-20']));

    expect(screen.getByTestId('ImportReviewQueue__statusFilterCount-error')).toHaveTextContent('1');
    expect(screen.getByTestId('ImportReviewQueue__fieldError-0-in'))
      .toHaveTextContent('[negative-amount]');
    // The positive Salida is untouched, so only the offending cell is flagged.
    expect(screen.queryByTestId('ImportReviewQueue__fieldError-0-out')).toBeNull();
    expect(continueButton()).toBeDisabled();
  });

  /**
   * ETP-4954 (product decision) — the third clause of the amount rule: EXACTLY ONE SIDE.
   *
   * > A statement line must carry an amount on exactly one side: at least one amount above
   * > zero, no amount below zero, and NEVER both sides filled.
   *
   * "Never both" arrived with no coverage anywhere — the whole suite stayed green when it was
   * added, so no fixture had ever fed the wizard a both-sides-positive row. It is trivially
   * reachable from a real file: a bank that exports Salida and Entrada as two independent
   * columns produces such a row whenever it fills both. Before the rule, `100 / 30` imported
   * and then DISPLAYED as −70,00 € (the read path collapses the pair into
   * `cramount - dramount`, so the movement appears in no statement) and `50 / 50` imported and
   * read back as 0,00 €, which is the state the both-zero guard exists to reject.
   *
   * The `[both-amounts]` sentinel is load-bearing: a both-filled row also has no *single*
   * usable amount, so a test that only checked "this row is in the Errores tab" would pass
   * just as well with the clause deleted (the row would then be flagged `[no-amount]`… except
   * it would NOT be, because both sides are above zero — it would be sent). Naming the message
   * is what makes these fail for the right reason.
   */
  describe('ETP-4954 a row filled on both sides', () => {
    it('lands in the errors tab with BOTH amount cells flagged', async () => {
      const { container } = render(<ImportStatementModal {...defaultProps()} />);
      const user = mkUser();
      await gotoMapping(user, container, csvFile(BOTH_SIDES_ROWS));

      expect(screen.getByTestId('ImportReviewQueue__statusFilterCount-ok')).toHaveTextContent('1');
      expect(screen.getByTestId('ImportReviewQueue__statusFilterCount-error')).toHaveTextContent('1');
      expect(screen.getByTestId('import-review-error-summary')).toBeInTheDocument();
      // Both cells carry the error, because either one is a valid thing for the user to clear.
      expect(screen.getByTestId('ImportReviewQueue__fieldError-1-out'))
        .toHaveTextContent('[both-amounts]');
      expect(screen.getByTestId('ImportReviewQueue__fieldError-1-in'))
        .toHaveTextContent('[both-amounts]');

      await user.click(screen.getByTestId('ImportReviewQueue__statusFilter-error'));
      // Only the offending row survives the filter, and both its cells are editable.
      expect(screen.getByTestId('ImportReviewQueue__input-1-out')).toHaveValue('100');
      expect(screen.getByTestId('ImportReviewQueue__input-1-in')).toHaveValue('30');
    });

    // The case that motivated the rule. Two equal sides clear every other clause, so the row
    // was sent — and the saved statement then read back as 0,00 €.
    it('flags two equal sides, which used to import and then read back as 0,00 €', async () => {
      const { container } = render(<ImportStatementModal {...defaultProps()} />);
      await gotoMapping(mkUser(), container, csvFile(['02/05/2026,R2,CINCUENTA,,50,50']));

      expect(screen.getByTestId('ImportReviewQueue__statusFilterCount-error')).toHaveTextContent('1');
      expect(screen.getByTestId('ImportReviewQueue__fieldError-0-out'))
        .toHaveTextContent('[both-amounts]');
      expect(screen.getByTestId('ImportReviewQueue__fieldError-0-in'))
        .toHaveTextContent('[both-amounts]');
      // Nothing sendable, so the wizard cannot advance to the preview at all.
      expect(continueButton()).toBeDisabled();
    });

    it('is excluded from what gets sent, and counted as a discarded line', async () => {
      const { container } = render(<ImportStatementModal {...defaultProps()} />);
      const user = mkUser();
      await gotoPreview(user, container, csvFile(BOTH_SIDES_ROWS));

      expect(screen.getByTestId('import-discarded-lines')).toBeInTheDocument();
      // The offending row is not in the preview at all.
      expect(screen.queryByText('AMBAS')).toBeNull();
      expect(screen.getByText('INGRESO 1')).toBeInTheDocument();

      await user.click(confirmButton());

      await waitFor(() => expect(createStatement).toHaveBeenCalledTimes(1));
      const { lines } = createStatement.mock.calls[0][0];
      expect(lines).toHaveLength(1);
      expect(lines[0].description).toBe('INGRESO 1');
      // Specifically: no line carrying BOTH amounts reaches `?action=create`, which is the
      // shape `BankStatementsHandler.createLines` now answers 400 to.
      expect(lines.filter((l) => l.in > 0 && l.out > 0)).toEqual([]);
    });

    // Clearing either cell is a complete fix, and it has to clear in the SAME render or the row
    // stays in the Errores tab while visibly correct.
    it('clears both cell errors in the same render when one side is emptied', async () => {
      const { container } = render(<ImportStatementModal {...defaultProps()} />);
      const user = mkUser();
      await gotoMapping(user, container, csvFile(BOTH_SIDES_ROWS));

      await user.clear(screen.getByTestId('ImportReviewQueue__input-1-in'));

      expect(screen.queryByTestId('ImportReviewQueue__fieldError-1-in')).toBeNull();
      expect(screen.queryByTestId('ImportReviewQueue__fieldError-1-out')).toBeNull();
      expect(screen.getByTestId('ImportReviewQueue__statusFilterCount-error')).toHaveTextContent('0');
      expect(screen.getByTestId('ImportReviewQueue__statusFilterCount-ok')).toHaveTextContent('2');
    });

    // ── The discriminator ─────────────────────────────────────────────────────
    // Without this the rule could just as well read "reject any row whose two amount cells are
    // both non-blank" — which would reject the template the modal itself hands out (`150,00`
    // out / `0,00` in) and every ordinary file a bank exports with an explicit zero on the
    // unused side. That is the ETP-4995 class of bug: an un-importable template.
    it('accepts an explicit zero on the unused side, in both directions', async () => {
      const { container } = render(<ImportStatementModal {...defaultProps()} />);
      await gotoMapping(mkUser(), container, csvFile([
        // Spanish decimals, quoted so the comma stays inside the cell.
        '01/05/2026,R1,SALIDA CON CERO,,"150,00","0,00"',
        '02/05/2026,R2,ENTRADA CON CERO,,"0,00","150,00"',
        // Dot decimals, the shape an English-convention spreadsheet writes.
        '03/05/2026,R3,SALIDA PUNTO,,150.00,0.00',
      ]));

      expect(screen.getByTestId('ImportReviewQueue__statusFilterCount-ok')).toHaveTextContent('3');
      expect(screen.getByTestId('ImportReviewQueue__statusFilterCount-error')).toHaveTextContent('0');
      expect(screen.queryByTestId('import-review-error-summary')).toBeNull();
      expect(continueButton()).toBeEnabled();
    });
  });

  it('leaves an unrecognized column unmapped instead of guessing', async () => {
    const file = new File(
      ['Fecha,Entrada,Saldo posterior\n01/05/2026,100,1234'],
      'extracto.csv',
      { type: 'text/csv' },
    );
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    await gotoMapping(mkUser(), container, file);

    expect(screen.getByTestId('ImportColumnMapping__chip-Saldo posterior'))
      .toHaveTextContent('financeAccountStatementsImportMapNotImported');
    // The mapping is still complete enough to send: date + one positive amount.
    expect(continueButton()).toBeEnabled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Step 2b — preview
  // ───────────────────────────────────────────────────────────────────────────

  it('Continue from the mapping step builds the preview locally', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    await gotoPreview(mkUser(), container);

    expect(
      screen.getByText('financeAccountStatementsImportSubtitleReview'),
    ).toBeInTheDocument();
    // The summary widget renders its KPI labels.
    expect(screen.getByText('financeAccountStatementsImportKpiLines')).toBeInTheDocument();
    expect(screen.getByText('financeAccountStatementsImportConfirm')).toBeInTheDocument();
    expect(screen.getByText('financeAccountStatementsImportChangeFile')).toBeInTheDocument();
    // Still nothing sent — the user confirms first.
    expect(createStatement).not.toHaveBeenCalled();
    // Both fixture rows made it through, with their own dates.
    expect(screen.getByText('INGRESO 1')).toBeInTheDocument();
    expect(screen.getByText('CARGO 1')).toBeInTheDocument();
    expect(screen.getAllByText('01/05/2026').length).toBeGreaterThan(0);
  });

  it('groups thousands in the preview summary totals (1000-9999 range silently drops the separator without explicit useGrouping)', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    await gotoPreview(mkUser(), container, csvFile(GROUPING_ROWS));

    // Exact output of the canonical `formatCurrency`, not a tolerant regex that the old
    // ungrouped `en-US` rendering would also have satisfied.
    expect(screen.getAllByText('+1.500,00 €').length).toBeGreaterThan(0);
    expect(screen.getAllByText('−2.500,50 €').length).toBeGreaterThan(0);
    expect(screen.queryByText('+1500,00 €')).toBeNull();
    expect(screen.queryByText('−2500,50 €')).toBeNull();
    expect(screen.queryByText('+€1,500.00')).toBeNull();
  });

  // `discardedLines` now counts rows the user is knowingly leaving behind (still invalid, or
  // explicitly skipped) rather than rows the backend silently dropped. Nothing disappears
  // without having been shown first.
  it('warns on the preview about the rows that will NOT be sent', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    await gotoPreview(mkUser(), container, csvFile(NEGATIVE_ROWS));

    expect(screen.getByTestId('import-discarded-lines')).toBeInTheDocument();
    expect(
      screen.getByText('financeAccountStatementsImportDiscardedLines'),
    ).toBeInTheDocument();
    // The invalid row is not in the preview at all.
    expect(screen.queryByText('DEVOLUCION')).toBeNull();
  });

  it('does not warn about discarded lines when every row is sendable', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    await gotoPreview(mkUser(), container);

    expect(screen.queryByTestId('import-discarded-lines')).toBeNull();
  });

  it('caps the modal height and scrolls the body so the footer stays reachable', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    await gotoPreview(mkUser(), container);

    const content = screen.getByTestId('import-dialog-content');
    expect(content.className).toContain('max-h-[90vh]');
    expect(content.className).toContain('flex-col');
    expect(container.querySelector('.overflow-y-auto')).not.toBeNull();
  });

  it('widens the dialog for the mapping and preview steps, each to its own width', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = mkUser();
    const content = () => screen.getByTestId('import-dialog-content');

    expect(content().className).toContain('max-w-[600px]');

    // The mapping step gets its own, much wider cap: ImportReviewQueue's table-fixed layout is
    // ~1150px for six fields, so 720px left it permanently scrolled sideways.
    await gotoMapping(user, container);
    expect(content().className).toContain('max-w-[min(1240px,96vw)]');

    await user.click(continueButton());
    await waitFor(() => expect(content().className).toContain('max-w-[720px]'));

    // Back to step 1 → narrow again.
    await user.click(screen.getByText('financeAccountStatementsImportChangeFile').closest('button'));
    expect(content().className).toContain('max-w-[600px]');
  });

  it('"Mostrar todas" on a 120-line file renders every line inside a scrollable list, footer still visible', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = mkUser();
    await gotoPreview(user, container, csvFile(MANY_ROWS));

    // Collapsed: only the first 5 rows.
    expect(screen.getByText('MOV 5')).toBeInTheDocument();
    expect(screen.queryByText('MOV 6')).toBeNull();

    await user.click(
      screen.getByText('financeAccountStatementsImportShowAll').closest('button'),
    );

    expect(screen.getByText('MOV 120')).toBeInTheDocument();
    const scroller = screen.getByTestId('import-preview-lines-scroll');
    expect(scroller.className).toContain('overflow-y-auto');
    expect(scroller.className).toContain('max-h-');
    // The confirm button lives outside the scrolling body, so it survives.
    expect(confirmButton()).toBeInTheDocument();
  });

  it('"Cambiar archivo" returns to "selected" from both the mapping and the preview step', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = mkUser();

    await gotoMapping(user, container);
    await user.click(screen.getByText('financeAccountStatementsImportChangeFile').closest('button'));
    expect(screen.getByText('extracto.csv')).toBeInTheDocument();
    expect(screen.queryByTestId('ImportColumnMapping__chips')).toBeNull();

    await gotoPreview(user, container);
    await user.click(screen.getByText('financeAccountStatementsImportChangeFile').closest('button'));
    expect(screen.getByText('extracto.csv')).toBeInTheDocument();
    expect(screen.getByText('financeAccountStatementsImportContinue')).toBeInTheDocument();
    expect(screen.queryByText('financeAccountStatementsImportConfirm')).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Step 3 — the send
  // ───────────────────────────────────────────────────────────────────────────

  it('Importar POSTs the ?action=create payload, calls onSuccess, toasts and closes', async () => {
    const props = defaultProps();
    const { container } = render(<ImportStatementModal {...props} />);
    const user = mkUser();
    await gotoPreview(user, container);

    await user.click(confirmButton());

    await waitFor(() => expect(createStatement).toHaveBeenCalledTimes(1));
    const payload = createStatement.mock.calls[0][0];
    // The file's base name is the statement's name, which is what the import has always used.
    expect(payload).toMatchObject({
      accountId: 'acc-1',
      name: 'extracto',
      fileName: 'extracto.csv',
      notes: '',
      // An imported statement arrives processed, the same as before this change.
      process: true,
      // The statement's transaction date is its LAST movement.
      transactionDate: '2026-05-02T00:00:00Z',
    });
    // The rows are sent as data, not as a base64 copy of the file — the two-round-trip
    // `?action=preview` / `?action=import` shape this replaced.
    expect(payload).not.toHaveProperty('contentBase64');
    expect(payload.lines).toEqual([
      {
        date: '2026-05-01T00:00:00Z',
        reference: 'R1',
        description: 'INGRESO 1',
        bpartnerName: '',
        bpartnerId: null,
        glItemId: null,
        in: 100,
        out: 0,
      },
      {
        date: '2026-05-02T00:00:00Z',
        reference: 'R2',
        description: 'CARGO 1',
        bpartnerName: '',
        bpartnerId: null,
        glItemId: null,
        in: 0,
        out: 30,
      },
    ]);

    // onSuccess fired, success toast shown, modal closed (no success screen).
    expect(props.onSuccess).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('financeAccountStatementsImportSuccessToast'),
    );
    expect(props.onClose).toHaveBeenCalledTimes(1);
    // There is no success view / no "Cerrar" / "Ver extracto" buttons.
    expect(
      screen.queryByText('financeAccountStatementsImportViewStatement'),
    ).not.toBeInTheDocument();
  });

  it('sends only the rows that survived review', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = mkUser();
    await gotoMapping(user, container);
    await user.click(screen.getByTestId('ImportReviewQueue__skip-1'));
    await user.click(continueButton());
    await waitFor(() => expect(confirmButton()).toBeInTheDocument());

    await user.click(confirmButton());

    await waitFor(() => expect(createStatement).toHaveBeenCalledTimes(1));
    const { lines, transactionDate } = createStatement.mock.calls[0][0];
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toBe('INGRESO 1');
    // The skipped row must not widen the statement's period either.
    expect(transactionDate).toBe('2026-05-01T00:00:00Z');
  });

  it('uses the partial-import toast when some rows were left behind', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = mkUser();
    await gotoPreview(user, container, csvFile(NEGATIVE_ROWS));

    await user.click(confirmButton());

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        'financeAccountStatementsImportSuccessToastPartial',
      ),
    );
  });

  it('shows an error toast and reverts to the error view when the create call rejects', async () => {
    createStatement.mockRejectedValue(new Error('insert failed'));
    const props = defaultProps();
    const { container } = render(<ImportStatementModal {...props} />);
    const user = mkUser();
    await gotoPreview(user, container);

    await user.click(confirmButton());

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalledWith('financeAccountStatementsImportError');
    // Returns to the error view (drop-zone + error banner visible).
    expect(
      screen.getByText('financeAccountStatementsImportErrorBody'),
    ).toBeInTheDocument();
    // The modal stays open and onClose was not called.
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onSuccess).not.toHaveBeenCalled();
  });

  it('shows the specific message (not the generic format error) when the backend reports no valid lines', async () => {
    const err = new Error('The file contains no valid lines to import');
    err.status = 400;
    err.code = 'NO_VALID_LINES';
    createStatement.mockRejectedValue(err);
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = mkUser();
    await gotoPreview(user, container);

    await user.click(confirmButton());

    await waitFor(() =>
      expect(
        screen.getByText('financeAccountStatementsImportNoValidLines'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('financeAccountStatementsImportErrorBody')).toBeNull();
  });

  it('disables the footer action while a create call is in flight', async () => {
    creatingRef.value = true;
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    await pickFile(mkUser(), container, csvFile(VALID_ROWS));

    await waitFor(() => expect(screen.getByText('extracto.csv')).toBeInTheDocument());
    expect(continueButton()).toBeDisabled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Parse failures — each one gets the message the user can act on
  // ───────────────────────────────────────────────────────────────────────────

  it('reports an empty file when the upload carries headers but no rows', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = mkUser();
    await pickFile(user, container, csvFile([]));
    await waitFor(() => expect(continueButton()).toBeEnabled());
    await user.click(continueButton());

    await waitFor(() =>
      expect(
        screen.getByText('financeAccountStatementsImportErrorEmptyFile'),
      ).toBeInTheDocument(),
    );
    expect(createStatement).not.toHaveBeenCalled();
  });

  // `parseDelimited` rejects a duplicate header outright, since the two columns would be
  // indistinguishable downstream. That complaint is specific and worth showing.
  it('reports an unreadable file when the parser rejects the headers', async () => {
    const file = new File(['Fecha,Fecha\n01/05/2026,02/05/2026'], 'dup.csv', { type: 'text/csv' });
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = mkUser();
    await pickFile(user, container, file);
    await waitFor(() => expect(continueButton()).toBeEnabled());
    await user.click(continueButton());

    await waitFor(() =>
      expect(
        screen.getByText('financeAccountStatementsImportErrorUnreadable'),
      ).toBeInTheDocument(),
    );
  });

  // Anything that is not a parser's own complaint is not something the user can act on, so it
  // falls through to the generic "unsupported format" copy.
  it('falls back to the generic format error when the file cannot be read at all', async () => {
    const file = csvFile(VALID_ROWS);
    file.text = () => Promise.reject(new Error('boom'));
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = mkUser();
    await pickFile(user, container, file);
    await waitFor(() => expect(continueButton()).toBeEnabled());
    await user.click(continueButton());

    await waitFor(() =>
      expect(
        screen.getByText('financeAccountStatementsImportErrorBody'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('financeAccountStatementsImportErrorUnreadable')).toBeNull();
  });

  it('clears the parse error and the review state when a new file is picked', async () => {
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = mkUser();
    await pickFile(user, container, csvFile([]));
    await waitFor(() => expect(continueButton()).toBeEnabled());
    await user.click(continueButton());
    await waitFor(() =>
      expect(screen.getByText('financeAccountStatementsImportErrorEmptyFile')).toBeInTheDocument(),
    );

    await gotoMapping(user, container, csvFile(VALID_ROWS));

    expect(screen.queryByText('financeAccountStatementsImportErrorEmptyFile')).toBeNull();
    expect(screen.getByTestId('ImportReviewQueue__statusFilterCount-all')).toHaveTextContent('2');
  });

  it('closing via the dialog (onOpenChange) calls onClose', () => {
    const onClose = vi.fn();
    render(<ImportStatementModal {...defaultProps({ onClose })} />);
    act(() => {
      lastOnOpenChange?.(false);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ETP-4924 / ETP-4954: the preview step used to build its date cells with a LOCAL
  // formatDate(iso) helper — `new Date(iso)` (absolute-instant parse) piped into an
  // `Intl.DateTimeFormat` with NO explicit `timeZone`. That renders the calendar day of that
  // instant in whatever timezone the HOST happens to be running in. The fix replaced it with
  // `formatCalendarDate` from `@/lib/dateOnly.js`, which extracts the `yyyy-MM-dd` prefix via
  // regex and builds the `Date` through the local-time constructor.
  //
  // Since ETP-4954 the date the preview renders is produced by `normalizeStatementDate` from
  // the FILE's own `dd/MM/yyyy` cell rather than read off a backend payload, so this now
  // covers the whole chain: cell → normalize → format, with no `Date` instant anywhere in it.
  //
  // Mechanism for controlling "the host's effective timezone" from inside Vitest: flipping
  // `process.env.TZ` mid-test. Node re-reads `TZ` lazily on every `Date`/`Intl` construction
  // rather than caching the zone at process start, so this genuinely changes what a raw
  // `new Date(iso)` + unforced `Intl.DateTimeFormat` would render.
  //
  // Polarity note: for a date-only value read as UTC midnight, the OLD bug only reproduces on
  // a host WEST of UTC (negative offset) — the instant reads as ~21:00 the PREVIOUS local day,
  // matching the bug report. Buenos Aires is therefore the actual red/green discriminator;
  // Madrid is kept as a same-answer sanity check for a realistic EU-deployed host.
  describe('date rendering is timezone-independent (ETP-4924)', () => {
    const originalTz = process.env.TZ;

    afterEach(() => {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    it.each([
      ['Europe/Madrid', 'positive UTC offset — sanity check, does not itself shift a date-only value'],
      ['America/Argentina/Buenos_Aires', 'negative UTC offset — the actual discriminator for the historic bug'],
    ])('renders 08/02/2026 (not 07/02/2026) under host TZ=%s (%s)', async (tz) => {
      process.env.TZ = tz;
      const { container } = render(<ImportStatementModal {...defaultProps()} />);
      await gotoPreview(mkUser(), container, csvFile(['08/02/2026,R1,MOV TZ,,,10']));

      // Both the single-day period KPI and the line's own date cell must render the correct
      // calendar day — never the shifted-back-one day.
      expect(screen.getAllByText('08/02/2026').length).toBeGreaterThanOrEqual(2);
      expect(screen.queryByText('07/02/2026')).toBeNull();
    });
  });
});
