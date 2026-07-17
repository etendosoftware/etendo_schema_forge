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
  DialogContent: ({ children }) => <div>{children}</div>,
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

  it('closing via the dialog (onOpenChange) calls onClose', () => {
    const onClose = vi.fn();
    render(<ImportStatementModal {...defaultProps({ onClose })} />);
    act(() => {
      lastOnOpenChange?.(false);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
