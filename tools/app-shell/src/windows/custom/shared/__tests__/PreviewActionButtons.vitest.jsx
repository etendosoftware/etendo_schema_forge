// Mocks must come before imports
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, onClick, disabled, ...rest }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock('../PdfViewer.jsx', () => ({
  default: ({ url }) => <div data-testid="pdf-viewer" data-url={url} />,
}));

vi.mock('lucide-react', () => ({
  Edit2: ({ className }) => <span data-testid="icon-edit2" className={className} />,
  Mail: ({ className }) => <span data-testid="icon-mail" className={className} />,
  Download: ({ className }) => <span data-testid="icon-download" className={className} />,
  Loader2: ({ className }) => <span data-testid="icon-loader2" className={className} />,
  AlertCircle: ({ className }) => <span data-testid="icon-alert-circle" className={className} />,
}));

import { render, screen, fireEvent } from '@testing-library/react';
import PreviewActionButtons, { PreviewEmptyPanel, PreviewPdfPanel } from '../PreviewActionButtons.jsx';

// ── PreviewActionButtons ───────────────────────────────────────────────────────

describe('PreviewActionButtons', () => {
  const defaults = {
    triggerEdit: vi.fn(),
    onEmail: vi.fn(),
    onDownloadPdf: vi.fn(),
    hasPdf: true,
    sendLabel: 'Send',
    downloadLabel: 'Download',
    editLabel: 'Edit',
  };

  beforeEach(() => vi.clearAllMocks());

  it('renders all three buttons with their labels', () => {
    render(<PreviewActionButtons {...defaults} />);
    expect(screen.getByText('Send')).toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('calls onEmail when the send button is clicked', () => {
    render(<PreviewActionButtons {...defaults} />);
    fireEvent.click(screen.getByText('Send'));
    expect(defaults.onEmail).toHaveBeenCalledTimes(1);
  });

  it('calls triggerEdit when the edit button is clicked', () => {
    render(<PreviewActionButtons {...defaults} />);
    fireEvent.click(screen.getByText('Edit'));
    expect(defaults.triggerEdit).toHaveBeenCalledTimes(1);
  });

  it('calls onDownloadPdf when hasPdf=true and download is clicked', () => {
    render(<PreviewActionButtons {...defaults} hasPdf={true} />);
    fireEvent.click(screen.getByText('Download'));
    expect(defaults.onDownloadPdf).toHaveBeenCalledTimes(1);
  });

  it('disables the download button when hasPdf=false', () => {
    render(<PreviewActionButtons {...defaults} hasPdf={false} />);
    const downloadBtn = screen.getByText('Download').closest('button');
    expect(downloadBtn).toBeDisabled();
  });

  it('does not call onDownloadPdf when hasPdf=false', () => {
    render(<PreviewActionButtons {...defaults} hasPdf={false} />);
    fireEvent.click(screen.getByText('Download'));
    expect(defaults.onDownloadPdf).not.toHaveBeenCalled();
  });

  // ── ETP-4789: Download PDF must also be gated when onDownloadPdf is absent ──
  // Before this fix, the download button was only gated by hasPdf. Callers
  // (window components) gate visibility by documentStatus via a status-aware
  // onSendable-style prop passed as onDownloadPdf itself: `undefined` means
  // "not allowed to download right now", mirroring the existing `onEmail &&
  // (...)` gate above. These tests must FAIL against the current
  // `disabled={!hasPdf}` / `onClick={hasPdf ? onDownloadPdf : undefined}` source.

  it('disables the download button when onDownloadPdf is undefined, even if hasPdf=true (ETP-4789)', () => {
    render(<PreviewActionButtons {...defaults} hasPdf={true} onDownloadPdf={undefined} />);
    const downloadBtn = screen.getByText('Download').closest('button');
    expect(downloadBtn).toBeDisabled();
  });

  it('keeps the download button enabled when hasPdf=true and onDownloadPdf is provided (no regression)', () => {
    render(<PreviewActionButtons {...defaults} hasPdf={true} />);
    const downloadBtn = screen.getByText('Download').closest('button');
    expect(downloadBtn).not.toBeDisabled();
  });

  it('does not throw when the download button is clicked while onDownloadPdf is undefined (ETP-4789)', () => {
    render(<PreviewActionButtons {...defaults} hasPdf={true} onDownloadPdf={undefined} />);
    expect(() => fireEvent.click(screen.getByText('Download'))).not.toThrow();
  });
});

// ── PreviewEmptyPanel ─────────────────────────────────────────────────────────

describe('PreviewEmptyPanel', () => {
  it('renders icon and text', () => {
    render(<PreviewEmptyPanel icon="📄" text="No document" />);
    expect(screen.getByText('📄')).toBeInTheDocument();
    expect(screen.getByText('No document')).toBeInTheDocument();
  });

  it('renders without crashing when props are undefined', () => {
    const { container } = render(<PreviewEmptyPanel />);
    expect(container.firstChild).not.toBeNull();
  });
});

// ── PreviewPdfPanel ───────────────────────────────────────────────────────────

describe('PreviewPdfPanel', () => {
  it('shows spinner and generatingText when pdfLoading=true', () => {
    render(
      <PreviewPdfPanel
        pdfLoading={true}
        pdfError={null}
        pdfUrl={null}
        generatingText="Generating PDF…"
        errorText="Error occurred"
      />,
    );
    expect(screen.getByTestId('icon-loader2')).toBeInTheDocument();
    expect(screen.getByText('Generating PDF…')).toBeInTheDocument();
  });

  it('does not show PdfViewer or error while loading', () => {
    render(
      <PreviewPdfPanel
        pdfLoading={true}
        pdfError="Something went wrong"
        pdfUrl="blob:http://localhost/1"
        generatingText="Generating…"
        errorText="Error"
      />,
    );
    expect(screen.queryByTestId('pdf-viewer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('icon-alert-circle')).not.toBeInTheDocument();
  });

  it('shows AlertCircle and errorText when pdfError is set and not loading', () => {
    render(
      <PreviewPdfPanel
        pdfLoading={false}
        pdfError="Template not found"
        pdfUrl={null}
        generatingText="Generating…"
        errorText="Could not generate PDF"
      />,
    );
    expect(screen.getByTestId('icon-alert-circle')).toBeInTheDocument();
    expect(screen.getByText('Could not generate PDF')).toBeInTheDocument();
    expect(screen.getByText('Template not found')).toBeInTheDocument();
  });

  it('renders PdfViewer with the url when pdfUrl is set and not loading', () => {
    render(
      <PreviewPdfPanel
        pdfLoading={false}
        pdfError={null}
        pdfUrl="blob:http://localhost/test-pdf"
        generatingText="Generating…"
        errorText="Error"
      />,
    );
    expect(screen.getByTestId('pdf-viewer')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-viewer')).toHaveAttribute('data-url', 'blob:http://localhost/test-pdf');
  });

  it('renders without crashing when all props are null', () => {
    const { container } = render(
      <PreviewPdfPanel
        pdfLoading={false}
        pdfError={null}
        pdfUrl={null}
        generatingText={null}
        errorText={null}
      />,
    );
    expect(container.firstChild).not.toBeNull();
  });

  it('renders without crashing when all props are undefined', () => {
    const { container } = render(<PreviewPdfPanel />);
    expect(container.firstChild).not.toBeNull();
  });
});
