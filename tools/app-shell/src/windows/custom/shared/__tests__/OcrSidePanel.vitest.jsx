// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/purchase-invoice/123' }),
}));

vi.mock('@/components/copilot/ocr/ocrDocTypes', () => ({
  matchOcrDocType: () => ({ id: 'purchase-invoice', tableName: 'C_Invoice' }),
  getOcrDocType: () => ({ tableName: 'C_Invoice' }),
}));

vi.mock('@/components/copilot/ocr/listAttachments', () => ({
  fetchMainAttachment: vi.fn().mockResolvedValue(null),
  fetchAttachmentBlobUrl: vi.fn().mockResolvedValue(null),
}));

vi.mock('lucide-react', () => ({
  MoreVertical: (props) => <span data-testid="icon-more" {...props} />,
  FileText: (props) => <span data-testid="icon-file" {...props} />,
  MessageSquare: (props) => <span data-testid="icon-msg" {...props} />,
  History: (props) => <span data-testid="icon-history" {...props} />,
  Loader2: (props) => <span data-testid="icon-loader" {...props} />,
}));

// Lazy components
vi.mock('@/components/copilot/ocr/OcrInlineUploader.jsx', () => ({
  default: () => <div data-testid="ocr-uploader" />,
}));

vi.mock('../PdfViewer.jsx', () => ({
  default: () => <div data-testid="pdf-viewer" />,
}));

// --- Import under test ---

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { fetchMainAttachment, fetchAttachmentBlobUrl } from '@/components/copilot/ocr/listAttachments';
import OcrSidePanel from '../OcrSidePanel.jsx';

// --- Tests ---

const defaultProps = {
  recordId: 'inv-1',
  token: 'test-token',
  apiBaseUrl: '/sws/neo/purchase-invoice',
  isNew: false,
};

describe('OcrSidePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: nothing marked as "main" yet — individual tests override with
    // mockResolvedValueOnce to exercise the resolved/loading states.
    fetchMainAttachment.mockResolvedValue(null);
    fetchAttachmentBlobUrl.mockResolvedValue(null);
  });

  it('renders tab bar with three tabs', () => {
    render(<OcrSidePanel {...defaultProps} />);
    expect(screen.getByText('ocrSidePanelTabFile')).toBeInTheDocument();
    expect(screen.getByText('ocrSidePanelTabMessages')).toBeInTheDocument();
    expect(screen.getByText('ocrSidePanelTabHistory')).toBeInTheDocument();
  });

  it('file tab is active by default', () => {
    render(<OcrSidePanel {...defaultProps} />);
    const fileTab = screen.getByText('ocrSidePanelTabFile');
    expect(fileTab).toHaveAttribute('aria-selected', 'true');
  });

  it('switches to messages tab', () => {
    render(<OcrSidePanel {...defaultProps} />);
    fireEvent.click(screen.getByText('ocrSidePanelTabMessages'));
    const messagesTab = screen.getByText('ocrSidePanelTabMessages');
    expect(messagesTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('ocrSidePanelComingSoon')).toBeInTheDocument();
  });

  it('switches to history tab', () => {
    render(<OcrSidePanel {...defaultProps} />);
    fireEvent.click(screen.getByText('ocrSidePanelTabHistory'));
    const historyTab = screen.getByText('ocrSidePanelTabHistory');
    expect(historyTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('ocrSidePanelComingSoon')).toBeInTheDocument();
  });

  it('renders more button', () => {
    render(<OcrSidePanel {...defaultProps} />);
    expect(screen.getByLabelText('ocrSidePanelMore')).toBeInTheDocument();
  });

  it('shows OCR uploader when isNew=true on file tab', () => {
    render(<OcrSidePanel {...defaultProps} isNew={true} />);
    expect(screen.getByText('ocrSidePanelTitle')).toBeInTheDocument();
  });

  describe('AttachmentsView — main attachment resolution (ETP-4315)', () => {
    it('shows a loading indicator while resolving the main attachment', () => {
      fetchMainAttachment.mockImplementation(() => new Promise(() => {})); // never resolves
      render(<OcrSidePanel {...defaultProps} />);
      // The Loader2 mock spreads incoming props (see lucide-react mock above),
      // so the source's own explicit data-testid (`Loader2__c851a1`) wins over
      // the mock's default `icon-loader` id.
      expect(screen.getByTestId('Loader2__c851a1')).toBeInTheDocument();
    });

    it('shows the empty state when no attachment is marked as main', async () => {
      fetchMainAttachment.mockResolvedValueOnce(null);
      render(<OcrSidePanel {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByText('ocrSidePanelNoAttachments')).toBeInTheDocument();
      });
      expect(fetchAttachmentBlobUrl).not.toHaveBeenCalled();
    });

    it('resolves the single marked attachment and renders its name + PDF viewer', async () => {
      fetchMainAttachment.mockResolvedValueOnce({ id: 'att-1', name: 'invoice.pdf', dataType: 'application/pdf' });
      fetchAttachmentBlobUrl.mockResolvedValueOnce('blob:http://localhost/abc');
      render(<OcrSidePanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('invoice.pdf')).toBeInTheDocument();
      });
      expect(screen.getByTestId('pdf-viewer')).toBeInTheDocument();

      expect(fetchMainAttachment).toHaveBeenCalledWith({
        token: 'test-token',
        tableName: 'C_Invoice',
        recordId: 'inv-1',
        apiBaseUrl: '/sws/neo/purchase-invoice',
      });
      expect(fetchAttachmentBlobUrl).toHaveBeenCalledWith({
        token: 'test-token',
        attachmentId: 'att-1',
        apiBaseUrl: '/sws/neo/purchase-invoice',
      });
    });

    it('renders the resolved attachment name even when no blob URL comes back', async () => {
      fetchMainAttachment.mockResolvedValueOnce({ id: 'att-2', name: 'receipt.pdf' });
      fetchAttachmentBlobUrl.mockResolvedValueOnce(null);
      render(<OcrSidePanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('receipt.pdf')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('pdf-viewer')).not.toBeInTheDocument();
    });
  });
});
