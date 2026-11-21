// @covers artifacts/remittance/custom/RemittanceRegenerateDialog.jsx
// @covers artifacts/remittance/custom/remittanceFileApi.js
//
// ETP-6247 — «Regenerar fichero» of the detail kebab (PR and SB): a simple confirmation, then generateFile
// and the download of the new file. Real ConfirmDialog, remittanceFileApi and backendErrors.
const mockApiFetch = vi.fn();
const mockRootFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: (base) => (base === '/root-base' ? mockRootFetch : mockApiFetch),
}));
vi.mock('@/hooks/useNeoResource.js', async (importOriginal) => ({ ...(await importOriginal()), getApiBase: () => '/root-base' }));
const mockDownloadBlobAsFile = vi.fn();
vi.mock('@/windows/custom/shared/pdfUtils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  downloadBlobAsFile: (...args) => mockDownloadBlobAsFile(...args),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
const mockDictionary = { 'backendError.remittanceFileNotProcessed': 'T:fileNotProcessed' };
const mockUi = (key, params) => mockDictionary[key] ?? (params ? `${key}:${JSON.stringify(params)}` : key);
vi.mock('@/i18n', () => ({ useUI: () => mockUi }));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import RemittanceRegenerateDialog from '@generated/remittance/custom/RemittanceRegenerateDialog.jsx';

const json = (body, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => body });
const readiness = (latestFile) => json({ response: { data: { latestFile } } });
const fileBytes = () => ({ ok: true, status: 200, blob: async () => new Blob(['<xml/>']) });
const generateCalls = () => mockApiFetch.mock.calls.filter(([url]) => url.endsWith('/action/generateFile'));

function routes({ latest = { attachmentId: 'att-1', fileName: 'remesa.xml' }, generate = json({ response: { data: { attachmentId: 'att-2', fileName: 'remesa-2.xml' } } }) } = {}) {
  mockApiFetch.mockImplementation((url) => Promise.resolve(url.endsWith('/action/generateFile') ? generate : readiness(latest)));
  mockRootFetch.mockImplementation((url) => Promise.resolve(url.includes('/attachments/file/') ? fileBytes() : json({ items: [] })));
}

async function renderDialog() {
  const onRefresh = vi.fn();
  const onClose = vi.fn();
  render(<RemittanceRegenerateDialog record={{ id: 'rem-1' }} apiBaseUrl="/api" onRefresh={onRefresh} onClose={onClose} />);
  await act(async () => {});
  return { onRefresh, onClose };
}
const confirmButton = (name) => screen.getByRole('button', { name });

beforeEach(() => { vi.clearAllMocks(); mockApiFetch.mockReset(); mockRootFetch.mockReset(); });

describe('RemittanceRegenerateDialog', () => {
  it('asks first, naming the consequence, and posts nothing until confirmed', async () => {
    routes();
    await renderDialog();
    expect(screen.getByRole('dialog')).toHaveTextContent('remittanceFileRegenerateConfirmTitle');
    expect(screen.getByRole('dialog')).toHaveTextContent('remittanceFileRegenerateConfirmBody');
    expect(generateCalls()).toHaveLength(0);
  });

  it('confirming posts generateFile, downloads the new file, toasts, refreshes and closes', async () => {
    routes();
    const { onRefresh, onClose } = await renderDialog();
    await act(async () => { fireEvent.click(confirmButton('remittanceFileRegenerate')); });
    expect(generateCalls()).toHaveLength(1);
    expect(mockRootFetch).toHaveBeenCalledWith('/sws/neo/attachments/file/att-2');
    expect(mockDownloadBlobAsFile).toHaveBeenCalledWith(expect.any(Blob), 'remesa-2.xml');
    expect(toast.success).toHaveBeenCalledWith('remittanceFileRegenerated:{"fileName":"remesa-2.xml"}');
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('with no file yet the words are «Generar fichero» (title, body, toast)', async () => {
    routes({ latest: null, generate: json({ response: { data: { attachmentId: 'att-1', fileName: 'remesa.xml' } } }) });
    await renderDialog();
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('remittanceFileGenerateConfirmTitle'));
    expect(screen.getByRole('dialog')).toHaveTextContent('remittanceFileGenerateConfirmBody');
    await act(async () => { fireEvent.click(confirmButton('remittanceFileGenerate')); });
    expect(toast.success).toHaveBeenCalledWith('remittanceFileGenerated:{"fileName":"remesa.xml"}');
  });

  it('cancelling regenerates nothing', async () => {
    routes();
    const { onClose } = await renderDialog();
    fireEvent.click(confirmButton('cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(generateCalls()).toHaveLength(0);
  });

  it('a translated refusal is toasted and keeps the confirmation open and usable', async () => {
    routes({ generate: json({ error: { message: 'raw', messageKeys: ['ETGO_RemittanceFileNotProcessed'] } }, { ok: false, status: 422 }) });
    const { onRefresh, onClose } = await renderDialog();
    await act(async () => { fireEvent.click(confirmButton('remittanceFileRegenerate')); });
    expect(toast.error).toHaveBeenCalledWith('T:fileNotProcessed');
    expect(toast.success).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('a 422 ETGO_RemittanceFileHasReturns toasts the backend sentence and stays open', async () => {
    routes({ generate: json({ error: { message: 'No se puede regenerar: hay recibos devueltos.', messageKeys: ['ETGO_RemittanceFileHasReturns'] } }, { ok: false, status: 422 }) });
    await renderDialog();
    await act(async () => { fireEvent.click(confirmButton('remittanceFileRegenerate')); });
    expect(toast.error).toHaveBeenCalledWith('No se puede regenerar: hay recibos devueltos.');
    expect(mockDownloadBlobAsFile).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('a refused generation with no file yet falls back to the «could not be generated» text', async () => {
    routes({ latest: null, generate: json({}, { ok: false, status: 500 }) });
    await renderDialog();
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('remittanceFileGenerateConfirmTitle'));
    await act(async () => { fireEvent.click(confirmButton('remittanceFileGenerate')); });
    expect(toast.error).toHaveBeenCalledWith('remittanceFileGenerateError');
  });
});
