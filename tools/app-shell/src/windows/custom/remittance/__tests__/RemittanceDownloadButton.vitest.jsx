// @covers artifacts/remittance/custom/RemittanceDownloadButton.jsx
// @covers artifacts/remittance/custom/remittanceFileApi.js
//
// ETP-6247 — «Descargar fichero» in the detail's top bar. Real remittanceFileApi and backendErrors; only the
// two `useApiFetch` instances (by base), the API base, the browser download and the toasts are mocked.
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
const mockUi = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);
vi.mock('@/i18n', () => ({ useUI: () => mockUi }));

import { act, fireEvent, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import RemittanceDownloadButton from '@generated/remittance/custom/RemittanceDownloadButton.jsx';

const json = (body, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => body });
const readiness = (latestFile) => json({ response: { data: { latestFile } } });
const fileBytes = () => ({ ok: true, status: 200, blob: async () => new Blob(['<xml/>']) });
const renderButton = (status) => render(<RemittanceDownloadButton data={{ id: 'rem-1', remittanceStatus: status }} apiBaseUrl="/sws/neo/remittance" />);
const click = async () => { await act(async () => { fireEvent.click(screen.getByTestId('remittance-file-download')); }); };

beforeEach(() => { vi.clearAllMocks(); mockApiFetch.mockReset(); mockRootFetch.mockReset(); });

describe('RemittanceDownloadButton', () => {
  it.each([['PR'], ['SB'], ['CT'], ['PT'], ['CP'], ['PP']])('is offered on a %s remittance', (status) => {
    renderButton(status);
    // Icon-only (the standard topbar action chrome): the label is the accessible name, with a tooltip.
    expect(screen.getByTestId('remittance-file-download')).toHaveAttribute('aria-label', 'remittanceFileDownload');
    expect(screen.getByTestId('remittance-file-download')).toHaveTextContent('');
    expect(screen.getByTestId('remittance-file-download')).toHaveClass('h-10', 'w-10');
  });

  it.each([['PE'], ['AN'], [undefined]])('is not offered on %s', (status) => {
    const { container } = renderButton(status);
    expect(container).toBeEmptyDOMElement();
  });

  it('is not offered without a record id', () => {
    const { container } = render(<RemittanceDownloadButton data={{ remittanceStatus: 'PR' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('downloads the main file named by fileReadiness and nothing else', async () => {
    mockApiFetch.mockResolvedValue(readiness({ attachmentId: 'att-1', fileName: 'remesa.xml' }));
    mockRootFetch.mockResolvedValue(fileBytes());
    renderButton('PR');
    await click();
    expect(mockApiFetch.mock.calls[0][0]).toBe('/remittance/rem-1/action/fileReadiness');
    expect(mockRootFetch).toHaveBeenCalledWith('/sws/neo/attachments/file/att-1');
    expect(mockDownloadBlobAsFile).toHaveBeenCalledWith(expect.any(Blob), 'remesa.xml');
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByTestId('remittance-file-download')).toBeEnabled();
  });

  it('falls back to the newest .xml attachment when fileReadiness names no file', async () => {
    mockApiFetch.mockResolvedValue(readiness(null));
    mockRootFetch.mockImplementation((url) => Promise.resolve(url.startsWith('/sws/neo/attachments/file/')
      ? fileBytes()
      : json({ items: [{ id: 'a1', name: 'old.xml', uploadedAt: '2026-11-01T10:00:00Z' }, { id: 'a2', name: 'new.xml', uploadedAt: '2026-11-10T10:00:00Z' }] })));
    renderButton('CT');
    await click();
    expect(mockRootFetch).toHaveBeenCalledWith('/sws/neo/attachments/REM_Remittance/rem-1');
    expect(mockDownloadBlobAsFile).toHaveBeenCalledWith(expect.any(Blob), 'new.xml');
  });

  it('falls back to the attachments too when fileReadiness is refused', async () => {
    mockApiFetch.mockResolvedValue(json({}, { ok: false, status: 422 }));
    mockRootFetch.mockImplementation((url) => Promise.resolve(url.startsWith('/sws/neo/attachments/file/') ? fileBytes() : json({ items: [{ id: 'a1', name: 'only.xml' }] })));
    renderButton('SB');
    await click();
    expect(mockDownloadBlobAsFile).toHaveBeenCalledWith(expect.any(Blob), 'only.xml');
  });

  it('toasts that there is no file when none is found', async () => {
    mockApiFetch.mockResolvedValue(readiness(null));
    mockRootFetch.mockResolvedValue(json({ items: [] }));
    renderButton('PR');
    await click();
    expect(toast.error).toHaveBeenCalledWith('remittanceFileNone');
    expect(mockDownloadBlobAsFile).not.toHaveBeenCalled();
  });

  it('toasts a failed download with the translated fallback and leaves the button usable', async () => {
    mockApiFetch.mockResolvedValue(readiness({ attachmentId: 'att-1', fileName: 'remesa.xml' }));
    mockRootFetch.mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('no json'); } });
    renderButton('PR');
    await click();
    expect(toast.error).toHaveBeenCalledWith('remittanceFileDownloadError');
    expect(screen.getByTestId('remittance-file-download')).toBeEnabled();
  });

  it('is disabled with a spinner while it runs', async () => {
    let finish;
    mockApiFetch.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderButton('PR');
    fireEvent.click(screen.getByTestId('remittance-file-download'));
    expect(screen.getByTestId('remittance-file-download')).toBeDisabled();
    expect(screen.getByTestId('Loader2__download')).toBeInTheDocument();
    mockRootFetch.mockResolvedValue(json({ items: [] }));
    await act(async () => { finish(readiness(null)); });
    expect(screen.getByTestId('remittance-file-download')).toBeEnabled();
  });
});
