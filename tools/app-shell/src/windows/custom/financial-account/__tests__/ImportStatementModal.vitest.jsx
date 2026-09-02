import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...a) => toastSuccess(...a), error: (...a) => toastError(...a) },
}));

// We avoid mounting the real Radix dialog (portals + animation) and replace
// it with a transparent pass-through that exposes onOpenChange so we can drive
// the dialog-close flow (the modal has no Cancel button anymore — the X /
// onOpenChange handles closing). Renders its children when `open=true`.
let lastOnOpenChange = null;
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children, onOpenChange }) => {
    lastOnOpenChange = onOpenChange;
    return open ? <div data-testid="import-modal">{children}</div> : null;
  },
  // className is forwarded so the height-capping classes can be asserted.
  DialogContent: ({ children, className }) => (
    <div data-testid="import-dialog-content" className={className}>{children}</div>
  ),
}));

// Stub the preview + import hooks so we drive the view machine end-to-end.
const previewStatement = vi.fn();
const importStatement = vi.fn();
const previewingRef = { value: false };
const importingRef = { value: false };
vi.mock('@/hooks/useStatementPreview', () => ({
  useStatementPreview: () => ({
    previewStatement,
    previewing: previewingRef.value,
    error: null,
  }),
}));
vi.mock('@/hooks/useStatementImport', () => ({
  useStatementImport: () => ({
    importStatement,
    importing: importingRef.value,
    error: null,
  }),
}));

import { ImportStatementModal } from '../ImportStatementModal.jsx';

// jsdom does not implement FileReader.readAsDataURL on Files, so we stub it
// minimally for the duration of the test.
class StubFileReader {
  constructor() {
    this.result = null;
    this.onload = null;
    this.onerror = null;
  }
  readAsDataURL() {
    this.result = 'data:text/plain;base64,ZmFrZS1iYXNlNjQ=';
    queueMicrotask(() => this.onload?.());
  }
}

function makeFile(name = 'extracto.c43') {
  return new File(['fake'], name, { type: 'text/plain' });
}

const PREVIEW_DATA = {
  format: 'C43',
  lineCount: 12,
  totalIn: 250.5,
  totalOut: 50,
  periodFrom: '2026-05-01T00:00:00Z',
  periodTo: '2026-05-31T00:00:00Z',
  fileName: 'extracto.c43',
  lines: [
    { lineNo: 1, date: '2026-05-01T00:00:00Z', description: 'INGRESO 1', cramount: 100, dramount: 0 },
    { lineNo: 2, date: '2026-05-02T00:00:00Z', description: 'CARGO 1', cramount: 0, dramount: 30 },
  ],
};

const MANY_LINES = Array.from({ length: 120 }, (_, i) => ({
  lineNo: i + 1,
  date: '2026-05-01T00:00:00Z',
  description: `MOV ${i + 1}`,
  cramount: 10,
  dramount: 0,
}));

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

// Drives the flow up to (and including) the preview view: pick a file, then
// click Continue and wait for previewStatement to resolve.
async function gotoPreview(user, container) {
  const input = container.querySelector('input[type="file"]');
  await act(async () => {
    await user.upload(input, makeFile());
  });
  await waitFor(() =>
    expect(
      screen.getByText('financeAccountStatementsImportContinue').closest('button'),
    ).toBeEnabled(),
  );
  await user.click(
    screen.getByText('financeAccountStatementsImportContinue').closest('button'),
  );
  await waitFor(() =>
    expect(
      screen.getByText('financeAccountStatementsImportConfirm'),
    ).toBeInTheDocument(),
  );
}

describe('ImportStatementModal', () => {
  beforeEach(() => {
    previewStatement.mockReset();
    importStatement.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    previewingRef.value = false;
    importingRef.value = false;
    lastOnOpenChange = null;
    globalThis.FileReader = StubFileReader;
  });

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
    expect(
      screen.getByText('financeAccountStatementsImportContinue').closest('button'),
    ).toBeDisabled();
    // There is no Cancel button anymore — the dialog X handles closing.
    expect(
      screen.queryByText('financeAccountStatementsImportCancel'),
    ).not.toBeInTheDocument();
  });

  it('picking a file goes straight to the "selected" view without calling the backend', async () => {
    const props = defaultProps();
    const { container } = render(<ImportStatementModal {...props} />);

    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      await userEvent.setup().upload(input, makeFile());
    });

    // The selected-file card is shown with the file name; no preview call yet.
    await waitFor(() =>
      expect(screen.getByText('extracto.c43')).toBeInTheDocument(),
    );
    expect(previewStatement).not.toHaveBeenCalled();
    // Continue is now enabled.
    expect(
      screen.getByText('financeAccountStatementsImportContinue').closest('button'),
    ).toBeEnabled();
  });

  it('Continue runs the preview and moves into the "preview" view', async () => {
    previewStatement.mockResolvedValue(PREVIEW_DATA);
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = userEvent.setup();
    await gotoPreview(user, container);

    expect(previewStatement).toHaveBeenCalledTimes(1);
    expect(previewStatement).toHaveBeenCalledWith({
      accountId: 'acc-1',
      fileName: 'extracto.c43',
      contentBase64: 'ZmFrZS1iYXNlNjQ=',
    });
    // Preview view: Review subtitle, summary widget, Importar + Cambiar archivo.
    expect(
      screen.getByText('financeAccountStatementsImportSubtitleReview'),
    ).toBeInTheDocument();
    // The summary widget renders its KPI labels.
    expect(
      screen.getByText('financeAccountStatementsImportKpiLines'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('financeAccountStatementsImportConfirm'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('financeAccountStatementsImportChangeFile'),
    ).toBeInTheDocument();
  });

  it('groups thousands in the preview summary totals (1000-9999 range silently drops the separator without explicit useGrouping)', async () => {
    // totalIn/totalOut are computed from lines' cramount/dramount, not read directly
    // off the preview payload — the fixture lines must sum into the buggy range.
    previewStatement.mockResolvedValue({
      ...PREVIEW_DATA,
      lines: [{ lineNo: 1, date: '2026-05-01T00:00:00Z', description: 'INGRESO 1', cramount: 1500, dramount: 2500.5 }],
    });
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = userEvent.setup();
    await gotoPreview(user, container);

    expect(screen.getAllByText(/\+1\.500,00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/−2\.500,50/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\+1500,00/)).toBeNull();
    expect(screen.queryByText(/−2500,50/)).toBeNull();
  });

  it('transitions to the "error" view when preview rejects', async () => {
    previewStatement.mockRejectedValue(new Error('bad format'));
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = userEvent.setup();

    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      await user.upload(input, makeFile());
    });
    await user.click(
      screen.getByText('financeAccountStatementsImportContinue').closest('button'),
    );

    await waitFor(() => expect(previewStatement).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.getByText('financeAccountStatementsImportErrorBody'),
      ).toBeInTheDocument(),
    );
  });

  it('Importar confirms the import, calls onSuccess, toasts success and closes the modal', async () => {
    previewStatement.mockResolvedValue(PREVIEW_DATA);
    importStatement.mockResolvedValue({ id: 'st-99', lineCount: 12 });
    const props = defaultProps();
    const { container } = render(<ImportStatementModal {...props} />);
    const user = userEvent.setup();

    await gotoPreview(user, container);

    await user.click(
      screen.getByText('financeAccountStatementsImportConfirm').closest('button'),
    );

    await waitFor(() => expect(importStatement).toHaveBeenCalledTimes(1));
    expect(importStatement).toHaveBeenCalledWith({
      accountId: 'acc-1',
      fileName: 'extracto.c43',
      contentBase64: 'ZmFrZS1iYXNlNjQ=',
    });
    // onSuccess fired, success toast shown, modal closed (no success screen).
    expect(props.onSuccess).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        'financeAccountStatementsImportSuccessToast',
      ),
    );
    expect(props.onClose).toHaveBeenCalledTimes(1);
    // There is no success view / no "Cerrar" / "Ver extracto" buttons.
    expect(
      screen.queryByText('financeAccountStatementsImportViewStatement'),
    ).not.toBeInTheDocument();
  });

  it('shows an error toast and reverts to the error view when import rejects', async () => {
    previewStatement.mockResolvedValue(PREVIEW_DATA);
    importStatement.mockRejectedValue(new Error('insert failed'));
    const props = defaultProps();
    const { container } = render(<ImportStatementModal {...props} />);
    const user = userEvent.setup();

    await gotoPreview(user, container);
    await user.click(
      screen.getByText('financeAccountStatementsImportConfirm').closest('button'),
    );

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalledWith('financeAccountStatementsImportError');
    // Returns to the error view (drop-zone + error banner visible).
    expect(
      screen.getByText('financeAccountStatementsImportErrorBody'),
    ).toBeInTheDocument();
    // The modal stays open and onClose was not called.
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('"Cambiar archivo" on the preview view returns to "selected"', async () => {
    previewStatement.mockResolvedValue(PREVIEW_DATA);
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = userEvent.setup();
    await gotoPreview(user, container);

    await user.click(
      screen.getByText('financeAccountStatementsImportChangeFile').closest('button'),
    );

    // Back to "selected": the file card is shown again and Continue reappears.
    expect(screen.getByText('extracto.c43')).toBeInTheDocument();
    expect(
      screen.getByText('financeAccountStatementsImportContinue'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('financeAccountStatementsImportConfirm'),
    ).not.toBeInTheDocument();
  });

  it('caps the modal height and scrolls the body so the footer stays reachable', async () => {
    previewStatement.mockResolvedValue(PREVIEW_DATA);
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = userEvent.setup();
    await gotoPreview(user, container);

    const content = screen.getByTestId('import-dialog-content');
    expect(content.className).toContain('max-h-[90vh]');
    expect(content.className).toContain('flex-col');
    expect(container.querySelector('.overflow-y-auto')).not.toBeNull();
  });

  it('"Mostrar todas" on a 120-line file renders every line inside a scrollable list, footer still visible', async () => {
    previewStatement.mockResolvedValue({ ...PREVIEW_DATA, lineCount: 120, lines: MANY_LINES });
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = userEvent.setup();
    await gotoPreview(user, container);

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
    expect(
      screen.getByText('financeAccountStatementsImportConfirm').closest('button'),
    ).toBeInTheDocument();
  });

  it('warns in step 2 when the backend discarded amount-less lines', async () => {
    previewStatement.mockResolvedValue({ ...PREVIEW_DATA, lineCount: 11, discardedLines: 1 });
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = userEvent.setup();
    await gotoPreview(user, container);

    expect(screen.getByTestId('import-discarded-lines')).toBeInTheDocument();
    expect(
      screen.getByText('financeAccountStatementsImportDiscardedLines'),
    ).toBeInTheDocument();
  });

  it('does not warn about discarded lines when none were dropped', async () => {
    previewStatement.mockResolvedValue({ ...PREVIEW_DATA, discardedLines: 0 });
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = userEvent.setup();
    await gotoPreview(user, container);

    expect(screen.queryByTestId('import-discarded-lines')).toBeNull();
  });

  it('shows the specific message (not the generic format error) when the file has no valid lines', async () => {
    const err = new Error('The file contains no valid lines to import');
    err.status = 400;
    err.code = 'NO_VALID_LINES';
    previewStatement.mockRejectedValue(err);
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = userEvent.setup();

    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      await user.upload(input, makeFile());
    });
    await user.click(
      screen.getByText('financeAccountStatementsImportContinue').closest('button'),
    );

    await waitFor(() =>
      expect(
        screen.getByText('financeAccountStatementsImportNoValidLines'),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText('financeAccountStatementsImportErrorBody'),
    ).toBeNull();
  });

  it('uses the partial-import toast when the backend reports discarded lines', async () => {
    previewStatement.mockResolvedValue({ ...PREVIEW_DATA, lineCount: 11, discardedLines: 1 });
    importStatement.mockResolvedValue({ id: 'st-99', lineCount: 11, discardedLines: 1 });
    const { container } = render(<ImportStatementModal {...defaultProps()} />);
    const user = userEvent.setup();
    await gotoPreview(user, container);

    await user.click(
      screen.getByText('financeAccountStatementsImportConfirm').closest('button'),
    );

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        'financeAccountStatementsImportSuccessToastPartial',
      ),
    );
  });

  it('closing via the dialog (onOpenChange) calls onClose', () => {
    const onClose = vi.fn();
    render(<ImportStatementModal {...defaultProps({ onClose })} />);
    act(() => {
      lastOnOpenChange?.(false);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ETP-4924: the preview step used to build its date cells with a LOCAL
  // formatDate(iso) helper — `new Date(iso)` (absolute-instant parse) piped
  // into an `Intl.DateTimeFormat` with NO explicit `timeZone`. That renders
  // the calendar day of that instant in whatever timezone the HOST happens
  // to be running in. The fix replaced it with `formatCalendarDate` from
  // `@/lib/dateOnly.js`, which extracts the `yyyy-MM-dd` prefix via regex and
  // builds the `Date` through the local-time constructor — the trailing
  // "Z"/time-of-day in the payload is deliberately never interpreted as a
  // UTC instant, so no host timezone can ever shift the displayed day.
  //
  // Mechanism used to control "the host's effective timezone" from inside
  // Vitest: flipping `process.env.TZ` mid-test. Verified empirically first
  // (`node -e "process.env.TZ = '...'; new Date(...).toLocaleDateString(...)"`)
  // that Node (v24, this repo's vitest `forks` pool — see vitest.config.js)
  // re-reads `TZ` lazily on every `Date`/`Intl` construction rather than
  // caching the zone at process start, so this genuinely changes what a raw
  // `new Date(iso)` + unforced `Intl.DateTimeFormat` renders, no special
  // vitest config or fallback needed.
  //
  // Polarity note (found during that same empirical check, and confirmed by
  // reverting the fix — see the "verify not vacuous" step in the PR/task
  // description): for a UTC-MIDNIGHT payload (exactly what the backend sends
  // for a date-only value, e.g. "2026-02-08T00:00:00Z"), the OLD bug only
  // reproduces under a host WEST of UTC (negative offset) — the instant
  // reads as ~21:00 the PREVIOUS local day, i.e. "one day earlier", matching
  // the bug report. A host EAST of UTC (positive offset, e.g. Europe/Madrid)
  // reads the same instant as ~01:00 the SAME local day, so it never
  // reproduced this particular symptom — a positive offset only overflows
  // into the NEXT day for a timestamp near 23:xx UTC, not for a midnight one.
  // Both zones are asserted below: Buenos Aires is the actual red/green
  // discriminator against the historic bug; Madrid is kept as a same-answer
  // sanity check for a realistic EU-deployed host (the class of environment
  // named in the bug report) — it must never regress either, even though it
  // would already have passed under the old, buggy code for this input.
  describe('date rendering is timezone-independent (ETP-4924)', () => {
    const originalTz = process.env.TZ;

    afterEach(() => {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    const TZ_TESTED_LINE = {
      lineNo: 1,
      date: '2026-02-08T00:00:00Z',
      description: 'MOV TZ',
      cramount: 10,
      dramount: 0,
    };

    it.each([
      ['Europe/Madrid', 'positive UTC offset — sanity check, does not itself shift this UTC-midnight payload'],
      ['America/Argentina/Buenos_Aires', 'negative UTC offset — the actual discriminator for the historic bug'],
    ])('renders 08/02/2026 (not 07/02/2026) under host TZ=%s (%s)', async (tz) => {
      process.env.TZ = tz;
      previewStatement.mockResolvedValue({
        ...PREVIEW_DATA,
        periodFrom: '2026-02-08T00:00:00Z',
        periodTo: '2026-02-08T00:00:00Z',
        lines: [TZ_TESTED_LINE],
      });
      const { container } = render(<ImportStatementModal {...defaultProps()} />);
      const user = userEvent.setup();
      await gotoPreview(user, container);

      // Both the single-day period KPI and the line's own date cell must
      // render the correct calendar day — never the shifted-back-one day.
      expect(screen.getAllByText('08/02/2026').length).toBeGreaterThanOrEqual(2);
      expect(screen.queryByText('07/02/2026')).toBeNull();
    });
  });
});
