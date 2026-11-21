// @covers artifacts/remittance/custom/RemittanceConfirmDialog.jsx
//
// «Confirmar» of a remittance, built on ActionChoiceModal (the Figma «PopUps» confirm): re-checks fileReadiness, summarizes, asks the grouping and posts the
// atomic `confirm` (the SEPA file is generated, not downloaded: «Fichero SEPA» offers it). Rendered with the real Radix Dialog,
// remittanceFileApi, fetchLinesTotal, formatCurrency / formatCalendarDate and backendErrors.js;
// only the two `useApiFetch` instances (by base), the API base, `useNavigate`, the browser download
// and the toasts are mocked.
const mockApiFetch = vi.fn();
const mockRootFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: (base) => (base === '/root-base' ? mockRootFetch : mockApiFetch),
}));
vi.mock('@/hooks/useNeoResource.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getApiBase: () => '/root-base',
}));
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({ ...(await importOriginal()), useNavigate: () => mockNavigate }));
const mockDownloadBlobAsFile = vi.fn();
vi.mock('@/windows/custom/shared/pdfUtils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  downloadBlobAsFile: (...args) => mockDownloadBlobAsFile(...args),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const mockDictionary = { 'backendError.remittanceAccountNotBank': 'T:accountNotBank' };
const mockUi = (key, params) => mockDictionary[key] ?? (params ? `${key}:${JSON.stringify(params)}` : key);
vi.mock('@/i18n', () => ({ useUI: () => mockUi, useLocaleSwitch: () => ({ locale: 'es-ES' }) }));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import RemittanceConfirmDialog, { confirmSummary, groupingParam } from '@generated/remittance/custom/RemittanceConfirmDialog.jsx';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';

const API = '/sws/neo/remittance';
const RECORD = { id: 'rem-1', dueDate: '2026-12-15', processed: false };
// What processOverrides.confirm declares (decisions.json).
const CONFIRM = {
  name: 'confirm', label: 'confirm', confirmModal: true,
  params: [{ key: 'grouping', type: 'select', label: 'remittanceGrouping', defaultValue: 'P',
    options: [{ value: 'P', label: 'remittanceGroupingNone' }, { value: 'GGPD', label: 'remittanceGroupingByBpAndDueDate' }] }],
};
const SUMMARY = { invoiceCount: 3, lineCount: 4, totalAmount: 1202.3, currency: 'EUR', dueDate: '2026-12-01' };

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}
const data = (payload) => jsonResponse({ response: { data: payload } });
const fileBytes = () => ({ ok: true, status: 200, blob: async () => new Blob(['<xml/>']) });

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

/** Routes the remittance spec calls: fileReadiness, the lines summary and confirm. */
function routes({ readiness = data({ ready: true, summary: SUMMARY }), lines = data([{ amount: 1202.3, id: 4 }]), confirm = data({ status: 'PR', attachmentId: 'att-1', fileName: 'remesa.xml' }), sepa = data({ accountName: 'Banco', iban: 'ES9121000418450200051332' }) } = {}) {
  mockApiFetch.mockImplementation((url) => {
    if (url.endsWith('/action/fileReadiness')) return readiness.promise ?? Promise.resolve(readiness);
    if (url.endsWith('/action/confirm')) return Promise.resolve(confirm);
    if (url.endsWith('/action/sepaFileData')) return Promise.resolve(sepa);
    if (url.startsWith('/lines?')) return Promise.resolve(lines);
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

const confirmCalls = () => mockApiFetch.mock.calls.filter(([url]) => url.endsWith('/action/confirm'));
const submit = () => screen.getByTestId('action-confirm-modal');

async function renderDialog(props = {}) {
  const onRefresh = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <RemittanceConfirmDialog process={CONFIRM} record={RECORD} apiBaseUrl={API} onRefresh={onRefresh} onClose={onClose} {...props} />,
  );
  await act(async () => {});
  return { ...utils, onRefresh, onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockReset();
  mockRootFetch.mockReset();
  mockRootFetch.mockResolvedValue(fileBytes());
});

describe('helpers', () => {
  it('groupingParam finds the grouping param, or null', () => {
    expect(groupingParam(CONFIRM)).toMatchObject({ key: 'grouping', defaultValue: 'P' });
    expect(groupingParam({ params: [{ key: 'other' }] })).toBeNull();
    expect(groupingParam(undefined)).toBeNull();
  });

  it('confirmSummary uses the readiness summary (invoices) when the backend sends one', () => {
    expect(confirmSummary({ summary: SUMMARY }, { count: 9, total: 1 }, RECORD))
      .toEqual({ countKey: 'remittanceConfirmInvoices', count: 3, total: 1202.3, currency: 'EUR', dueDate: '2026-12-01' });
  });

  it('confirmSummary labels a lines count as receipts when the summary has no invoice count', () => {
    expect(confirmSummary({ summary: { ...SUMMARY, invoiceCount: null, dueDate: null } }, null, RECORD))
      .toEqual({ countKey: 'remittanceConfirmReceipts', count: 4, total: 1202.3, currency: 'EUR', dueDate: '2026-12-15' });
  });

  it('confirmSummary falls back to the lines grid summary and the header due date', () => {
    expect(confirmSummary({ summary: null }, { count: 2, total: 50 }, RECORD))
      .toEqual({ countKey: 'remittanceConfirmReceipts', count: 2, total: 50, currency: null, dueDate: '2026-12-15' });
    expect(confirmSummary(null, null, null))
      .toEqual({ countKey: 'remittanceConfirmReceipts', count: null, total: null, currency: null, dueDate: null });
  });
});

describe('RemittanceConfirmDialog — check', () => {
  it('keeps Confirmar disabled while checking', async () => {
    const pending = deferred();
    routes({ readiness: { promise: pending.promise } });
    await renderDialog();
    expect(screen.getByTestId('remittance-confirm-checking')).toHaveTextContent('remittanceFileReadinessChecking');
    expect(submit()).toBeDisabled();
    await act(async () => { pending.resolve(data({ ready: true, summary: SUMMARY })); });
    expect(submit()).toBeEnabled();
    expect(screen.queryByTestId('remittance-confirm-checking')).toBeNull();
  });

  it('keeps Confirmar disabled when the check fails', async () => {
    routes({ readiness: jsonResponse({}, { ok: false, status: 500 }) });
    await renderDialog();
    expect(screen.getByTestId('remittance-confirm-check-failed')).toHaveTextContent('remittanceFileReadinessLoadError');
    expect(submit()).toBeDisabled();
  });

  it('keeps Confirmar disabled and lists the problems while there are any', async () => {
    routes({ readiness: data({ ready: false, problems: [{ scope: 'line', businessPartnerId: 'bp-1', businessPartnerName: 'Acme', message: 'Sin IBAN' }] }) });
    await renderDialog();
    expect(screen.getByTestId('remittance-confirm-problems')).toHaveTextContent('Sin IBAN');
    expect(submit()).toBeDisabled();
  });

  it('a problem link closes the dialog before navigating', async () => {
    routes({ readiness: data({ ready: false, problems: [{ scope: 'account', accountId: 'acc-1', message: 'Sin IBAN' }] }) });
    const { onClose } = await renderDialog();
    fireEvent.click(screen.getByTestId('remittance-file-problems-account-link'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/financial-account/acc-1?edit=true');
  });

  it('shows ONE info banner about what confirming does (file generated, payments Remesado, invoices uncollected, reactivable) and no other note', async () => {
    routes();
    await renderDialog();
    expect(screen.getByTestId('remittance-confirm-info')).toHaveTextContent('remittanceConfirmInfo');
    expect(screen.queryByTestId('remittance-confirm-effect')).toBeNull();
    expect(screen.queryByTestId('remittance-confirm-file-note')).toBeNull();
    expect(screen.queryByTestId('remittance-confirm-irreversible')).toBeNull();
    expect(screen.getByRole('dialog')).toHaveTextContent('remittanceConfirmTitle');
  });

  it('shows no «Todo listo» line: only the problems, as one warning banner, when there are any', async () => {
    routes();
    const { unmount } = await renderDialog();
    expect(screen.queryByTestId('remittance-confirm-ready')).toBeNull();
    expect(screen.queryByTestId('remittance-confirm-problems-banner')).toBeNull();
    unmount();
    routes({ readiness: data({ ready: false, problems: [{ scope: 'org', organizationId: 'org-1', message: 'x' }] }) });
    await renderDialog();
    expect(screen.getByTestId('remittance-confirm-problems-banner')).toContainElement(screen.getByTestId('remittance-confirm-problems'));
    expect(screen.queryByTestId('remittance-confirm-ready')).toBeNull();
  });

  it('renders the problems with the same block as «Antes de confirmar»: heading, grouped list, links', async () => {
    routes({ readiness: data({ ready: false, problems: [{ scope: 'org', organizationId: 'org-1', message: 'Sin NIF' }] }) });
    await renderDialog();
    const block = screen.getByTestId('remittance-confirm-problems');
    expect(block).toHaveAttribute('role', 'alert');
    expect(block).toHaveTextContent('remittanceFileReadinessProblems');
    expect(block.querySelector('[data-testid="remittance-file-problems-org-link"]')).not.toBeNull();
  });
});

describe('RemittanceConfirmDialog — summary', () => {
  it('shows the invoice count, the total and the due date of the readiness summary', async () => {
    routes();
    await renderDialog();
    expect(screen.getByRole('dialog')).toHaveTextContent('remittanceConfirmInvoices');
    expect(screen.getByTestId('remittance-confirm-count')).toHaveTextContent('3');
    expect(screen.getByTestId('remittance-confirm-total').textContent).toContain(formatCurrency('EUR', 1202.3));
    expect(screen.getByTestId('remittance-confirm-due-date').textContent).toContain(formatCalendarDate('2026-12-01', 'es-ES'));
  });

  it('falls back to the lines count, labelled «Recibos», when the backend sends no summary', async () => {
    routes({ readiness: data({ ready: true }), lines: data([{ amount: 50, id: 2, isGridSummary: true }]) });
    await renderDialog();
    expect(screen.getByRole('dialog')).toHaveTextContent('remittanceConfirmReceipts');
    expect(screen.getByTestId('remittance-confirm-count')).toHaveTextContent('2');
    expect(screen.getByTestId('remittance-confirm-due-date').textContent).toContain(formatCalendarDate('2026-12-15', 'es-ES'));
  });
});

describe('RemittanceConfirmDialog — grouping and confirm', () => {
  it('starts on the param default and posts it', async () => {
    routes();
    await renderDialog();
    expect(screen.getByTestId('remittance-confirm-grouping-P')).toBeChecked();
    expect(screen.getByRole('radiogroup')).toHaveAccessibleName('remittanceGrouping');
    expect(screen.getByRole('dialog')).toHaveTextContent('remittanceGroupingNoneDescription');
    expect(screen.getByRole('dialog')).toHaveTextContent('remittanceGroupingByBpAndDueDateDescription');
    await act(async () => { fireEvent.click(submit()); });
    expect(JSON.parse(confirmCalls()[0][1].body)).toEqual({ fieldValues: { grouping: 'P' } });
    expect(confirmCalls()[0][0]).toBe('/remittance/rem-1/action/confirm');
  });

  it('posts the grouping the user picked', async () => {
    routes();
    await renderDialog();
    fireEvent.click(screen.getByTestId('remittance-confirm-grouping-GGPD'));
    await act(async () => { fireEvent.click(submit()); });
    expect(JSON.parse(confirmCalls()[0][1].body)).toEqual({ fieldValues: { grouping: 'GGPD' } });
  });

  it('Enter on a grouping card confirms with it, but not while the check is pending or has problems', async () => {
    routes();
    await renderDialog();
    await act(async () => { fireEvent.keyDown(screen.getByTestId('remittance-confirm-grouping-GGPD'), { key: 'Enter' }); });
    expect(JSON.parse(confirmCalls()[0][1].body)).toEqual({ fieldValues: { grouping: 'GGPD' } });
  });

  it('Enter does not confirm while problems exist', async () => {
    routes({ readiness: data({ ready: false, problems: [{ scope: 'org', organizationId: 'org-1', message: 'x' }] }) });
    await renderDialog();
    await act(async () => { fireEvent.keyDown(screen.getByTestId('remittance-confirm-grouping-P'), { key: 'Enter' }); });
    expect(confirmCalls()).toHaveLength(0);
  });

  it('a process without a grouping param shows no choice and posts P', async () => {
    routes();
    await renderDialog({ process: { name: 'confirm' } });
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByTestId('remittance-confirm-grouping-P')).toBeInTheDocument();
    await act(async () => { fireEvent.click(submit()); });
    expect(JSON.parse(confirmCalls()[0][1].body)).toEqual({ fieldValues: { grouping: 'P' } });
  });

  const CONFIRMED_RECORD = { ...RECORD, documentNo: 'R-1', name: 'Remesa marzo', financialAccount: 'acc-1', 'remittanceType$_identifier': 'SEPA CORE' };
  const confirmNow = async (props = {}) => {
    routes();
    const view = await renderDialog({ record: CONFIRMED_RECORD, ...props });
    await act(async () => { fireEvent.click(submit()); });
    return view;
  };

  it('on success it switches to «¡Remesa confirmada!» in the same modal: no toast, no auto-download, no refresh yet', async () => {
    const { onRefresh, onClose } = await confirmNow();
    expect(screen.getByTestId('remittance-confirmed-dialog')).toHaveTextContent('remittanceConfirmedTitle');
    expect(screen.getByTestId('remittance-confirmed-subtitle')).toHaveTextContent('remittanceConfirmedSubtitle');
    expect(screen.queryByTestId('remittance-confirm-dialog')).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
    expect(mockRootFetch.mock.calls.some(([url]) => url.includes('/attachments/file/'))).toBe(false);
    expect(mockDownloadBlobAsFile).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('the success card shows the remittance, status chip, invoices, total, type, due date, masked IBAN and file', async () => {
    await confirmNow();
    expect(screen.getByTestId('remittance-confirmed-name')).toHaveTextContent('R-1 · Remesa marzo');
    expect(screen.getByTestId('remittance-confirmed-status')).toHaveTextContent('remittanceStatusPr');
    expect(screen.getByTestId('remittance-confirmed-count')).toHaveTextContent('3');
    expect(screen.getByTestId('remittance-confirmed-total').textContent).toContain(formatCurrency('EUR', 1202.3));
    expect(screen.getByTestId('remittance-confirmed-type')).toHaveTextContent('SEPA CORE');
    expect(screen.getByTestId('remittance-confirmed-due-date').textContent).toContain(formatCalendarDate('2026-12-01', 'es-ES'));
    expect(screen.getByTestId('remittance-confirmed-account')).toHaveTextContent('Banco · ES91 •••• •••• 1332');
    expect(screen.getByTestId('remittance-confirmed-account').textContent).not.toContain('0418');
    // The file name is not shown: the button is the way to the file.
    expect(screen.queryByTestId('remittance-confirmed-file')).toBeNull();
    expect(screen.getByTestId('remittance-confirmed-dialog')).not.toHaveTextContent('remesa.xml');
  });

  it('shows the account\'s bank logo (AccountLogoAvatar) when the account has one, and the generic bank icon when it has none', async () => {
    mockRootFetch.mockImplementation((url) => Promise.resolve(url.includes('/financial-account/account/')
      ? jsonResponse({ response: { data: { providerLogoUrl: 'https://cdn.example/bank.svg', type: 'B' } } })
      : fileBytes()));
    const { unmount } = await confirmNow();
    const row = screen.getByTestId('remittance-confirmed-account');
    expect(row.querySelector('img')).toHaveAttribute('src', 'https://cdn.example/bank.svg');
    unmount();
    mockRootFetch.mockReset();
    mockRootFetch.mockResolvedValue(fileBytes());
    await confirmNow();
    const plain = screen.getByTestId('remittance-confirmed-account');
    expect(plain.querySelector('img')).toBeNull();
    expect(plain.querySelector('svg')).not.toBeNull();
  });

  it('lays the card out like the sibling pickers: rows with separators, label left and value right', async () => {
    await confirmNow();
    const card = screen.getByTestId('remittance-confirmed-summary');
    expect(card.className).toContain('divide-y');
    const row = screen.getByTestId('remittance-confirmed-total');
    expect(row.className).toContain('min-h-14');
    expect(row.className).toContain('justify-between');
    expect(row.children[0].className).toContain('text-[hsl(var(--muted-foreground))]');
    expect(row.children[1].className).toContain('justify-end');
  });

  it('the success step uses one neutral subtitle (the status is PR for collections and payments alike)', async () => {
    routes({ confirm: data({ status: 'PR', attachmentId: 'att-1', fileName: 'p.xml' }) });
    await renderDialog({ record: CONFIRMED_RECORD });
    await act(async () => { fireEvent.click(submit()); });
    expect(screen.getByTestId('remittance-confirmed-subtitle')).toHaveTextContent('remittanceConfirmedSubtitle');
    expect(screen.queryByText('remittanceConfirmedSubtitlePayment')).toBeNull();
  });

  it('«Descargar fichero» downloads through the root apiFetch and keeps the modal open', async () => {
    const { onRefresh, onClose } = await confirmNow();
    await act(async () => { fireEvent.click(screen.getByTestId('action-confirm-modal')); });
    expect(mockRootFetch).toHaveBeenCalledWith('/sws/neo/attachments/file/att-1');
    expect(mockDownloadBlobAsFile).toHaveBeenCalledWith(expect.any(Blob), 'remesa.xml');
    expect(screen.getByTestId('remittance-confirmed-dialog')).toBeInTheDocument();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a failed download shows the translated error and leaves the button usable', async () => {
    mockRootFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await confirmNow();
    await act(async () => { fireEvent.click(screen.getByTestId('action-confirm-modal')); });
    expect(screen.getByRole('alert')).toHaveTextContent('remittanceFileDownloadError');
    expect(mockDownloadBlobAsFile).not.toHaveBeenCalled();
    expect(screen.getByTestId('action-confirm-modal')).toBeEnabled();
  });

  it.each([
    ['«Cerrar»', () => fireEvent.click(screen.getByText('close'))],
    ['the × button', () => fireEvent.click(screen.getAllByRole('button', { name: 'close' })[0])],
    ['Esc', () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })],
    ['a click on the backdrop', () => fireEvent.click(screen.getByRole('dialog').parentElement)],
  ])('leaving through %s refreshes the page and closes, once each', async (_name, leave) => {
    const { onRefresh, onClose } = await confirmNow();
    leave();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a confirm that attached no file still succeeds, with its own toast', async () => {
    routes({ confirm: data({ status: 'CT' }) });
    const { onRefresh, onClose } = await renderDialog();
    await act(async () => { fireEvent.click(submit()); });
    expect(mockRootFetch).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('remittanceConfirmSuccessNoFile');
    expect(onRefresh).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('a 422 ETGO_RemittanceFileNotReady lists error.problems and stays open', async () => {
    routes({ confirm: jsonResponse({ error: {
      message: 'No se puede generar el fichero.', messageKeys: ['ETGO_RemittanceFileNotReady'],
      problems: [{ scope: 'org', organizationId: 'org-1', message: 'La organización no tiene NIF' }],
    } }, { ok: false, status: 422 }) });
    const { onRefresh, onClose } = await renderDialog();
    await act(async () => { fireEvent.click(submit()); });
    expect(screen.getByTestId('remittance-confirm-problems')).toHaveTextContent('La organización no tiene NIF');
    expect(toast.error).toHaveBeenCalledWith('No se puede generar el fichero.');
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(submit()).toBeDisabled();
  });

  it('any other refusal is toasted translated and the dialog stays usable', async () => {
    routes({ confirm: jsonResponse({ error: { message: 'raw', messageKeys: ['ETGO_RemittanceAccountNotBank'] } }, { ok: false, status: 422 }) });
    const { onClose } = await renderDialog();
    await act(async () => { fireEvent.click(submit()); });
    expect(toast.error).toHaveBeenCalledWith('T:accountNotBank');
    expect(onClose).not.toHaveBeenCalled();
    expect(submit()).toBeEnabled();
  });

  it('Cancelar closes without confirming', async () => {
    routes();
    const { onClose } = await renderDialog();
    fireEvent.click(screen.getByText('cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(confirmCalls()).toHaveLength(0);
  });
});
