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
  listAttachments: vi.fn().mockResolvedValue([]),
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

import { render, screen, fireEvent } from '@testing-library/react';
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
});
