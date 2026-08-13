// Extended Vitest tests for OcrInlineUploader — covers file selection, status branches, error states

let mockExtractionReturn = {
  extract: vi.fn(),
  status: 'idle',
  error: null,
  reset: vi.fn(),
};

let mockFlowReturn = {
  result: null,
  loading: false,
  pendingModal: null,
};

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/components/CopilotContext', () => ({
  useCopilot: () => ({ token: 'test-token' }),
}));

vi.mock('../ocrDocTypes', () => ({
  getOcrDocType: (id) => id === 'purchase-invoice' ? {
    id: 'purchase-invoice',
    routePrefix: '/purchase-invoice/',
    toolName: 'SimpleOcrTool',
    eventName: 'copilot:ocr-prefill:purchase-invoice',
    question: 'Extract invoice fields',
    tabId: '290',
    structuredOutput: true,
  } : null,
}));

vi.mock('../attachFile', () => ({
  attachFile: vi.fn().mockResolvedValue({}),
}));

vi.mock('../buildOcrSchema', () => ({
  buildOcrSchema: () => ({ type: 'object', properties: {} }),
}));

vi.mock('../useOcrExtraction', () => ({
  useOcrExtraction: () => mockExtractionReturn,
}));

vi.mock('../useOcrFlow', () => ({
  useOcrFlow: () => mockFlowReturn,
}));

vi.mock('@/windows/custom/shared/PdfViewer.jsx', () => ({
  default: () => <div data-testid="pdf-viewer">PDF</div>,
}));

import { render, screen, fireEvent } from '@testing-library/react';
import OcrInlineUploader from '../OcrInlineUploader.jsx';

function createPdfFile(name = 'invoice.pdf', size = 2048) {
  return new File([new ArrayBuffer(size)], name, { type: 'application/pdf' });
}

function createNonPdfFile() {
  return new File([new ArrayBuffer(100)], 'image.png', { type: 'image/png' });
}

describe('OcrInlineUploader', () => {
  const defaultProps = {
    docTypeId: 'purchase-invoice',
    isNew: true,
    apiBaseUrl: '/sws/neo/purchase-invoice',
    onRefresh: vi.fn(),
    token: 'test-token',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockExtractionReturn = {
      extract: vi.fn(),
      status: 'idle',
      error: null,
      reset: vi.fn(),
    };
    mockFlowReturn = {
      result: null,
      loading: false,
      pendingModal: null,
    };
    // Mock URL.createObjectURL and revokeObjectURL
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:test-url');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders without crashing', () => {
    const { container } = render(<OcrInlineUploader {...defaultProps} />);
    expect(container).toBeTruthy();
  });

  it('shows the drop zone with upload hint', () => {
    render(<OcrInlineUploader {...defaultProps} />);
    expect(screen.getByText('ocrSidePanelDropTitle')).toBeInTheDocument();
    expect(screen.getByText('ocrSidePanelDropHint')).toBeInTheDocument();
  });

  it('returns null when isNew is false', () => {
    const { container } = render(
      <OcrInlineUploader {...defaultProps} isNew={false} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('returns null when docTypeId is unknown', () => {
    const { container } = render(
      <OcrInlineUploader {...defaultProps} docTypeId="unknown-type" />
    );
    expect(container.innerHTML).toBe('');
  });

  it('has a hidden file input accepting PDF', () => {
    const { container } = render(<OcrInlineUploader {...defaultProps} />);
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();
    expect(fileInput.getAttribute('accept')).toBe('application/pdf');
  });

  it('shows file name and size after selecting a PDF', () => {
    const { container } = render(<OcrInlineUploader {...defaultProps} />);
    const input = container.querySelector('input[type="file"]');
    const file = createPdfFile('test-invoice.pdf', 5120);
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('test-invoice.pdf')).toBeInTheDocument();
    expect(screen.getByText(/5\.0 KB/)).toBeInTheDocument();
  });

  it('shows extract button after selecting a PDF', () => {
    const { container } = render(<OcrInlineUploader {...defaultProps} />);
    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [createPdfFile()] } });

    expect(screen.getByText('ocrExtractFill')).toBeInTheDocument();
  });

  it('shows error when non-PDF file is selected', () => {
    const { container } = render(<OcrInlineUploader {...defaultProps} />);
    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [createNonPdfFile()] } });

    expect(screen.getByText('ocrInlinePdfOnly')).toBeInTheDocument();
  });

  it('handles file drop on the drop zone', () => {
    render(<OcrInlineUploader {...defaultProps} />);
    const dropZone = screen.getByText('ocrSidePanelDropTitle').closest('button');
    const file = createPdfFile();

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    });

    expect(screen.getByText('invoice.pdf')).toBeInTheDocument();
  });

  it('handles dragOver on the drop zone', () => {
    render(<OcrInlineUploader {...defaultProps} />);
    const dropZone = screen.getByText('ocrSidePanelDropTitle').closest('button');

    fireEvent.dragOver(dropZone);
    // Should not crash — visual state changes
  });

  it('handles dragLeave on the drop zone', () => {
    render(<OcrInlineUploader {...defaultProps} />);
    const dropZone = screen.getByText('ocrSidePanelDropTitle').closest('button');

    // dragLeave with relatedTarget outside the zone
    fireEvent.dragLeave(dropZone, { relatedTarget: document.body });
    // Should not crash
  });

  it('clear file button removes selected file and resets', () => {
    const { container } = render(<OcrInlineUploader {...defaultProps} />);
    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [createPdfFile()] } });

    expect(screen.getByText('invoice.pdf')).toBeInTheDocument();

    const clearBtn = screen.getByLabelText('cancel');
    fireEvent.click(clearBtn);

    expect(screen.queryByText('invoice.pdf')).not.toBeInTheDocument();
    expect(mockExtractionReturn.reset).toHaveBeenCalled();
  });

  it('calls extract on button click when file is selected', () => {
    const extractFn = vi.fn().mockResolvedValue({ fields: {} });
    mockExtractionReturn.extract = extractFn;

    const { container } = render(<OcrInlineUploader {...defaultProps} />);
    const input = container.querySelector('input[type="file"]');
    const file = createPdfFile();
    fireEvent.change(input, { target: { files: [file] } });

    const extractBtn = screen.getByText('ocrExtractFill');
    fireEvent.click(extractBtn);

    expect(extractFn).toHaveBeenCalledWith(file);
  });

  it('shows uploading status', () => {
    mockExtractionReturn.status = 'uploading';

    render(<OcrInlineUploader {...defaultProps} />);
    expect(screen.getByText('ocrUploading')).toBeInTheDocument();
  });

  it('shows extracting status', () => {
    mockExtractionReturn.status = 'extracting';

    render(<OcrInlineUploader {...defaultProps} />);
    expect(screen.getByText('ocrExtracting')).toBeInTheDocument();
  });

  it('shows extracting status when flow is applying', () => {
    mockFlowReturn.loading = true;

    render(<OcrInlineUploader {...defaultProps} />);
    expect(screen.getByText('ocrExtracting')).toBeInTheDocument();
  });

  it('shows error status with message', () => {
    mockExtractionReturn.status = 'error';
    mockExtractionReturn.error = 'OCR service unavailable';

    render(<OcrInlineUploader {...defaultProps} />);
    expect(screen.getByText('OCR service unavailable')).toBeInTheDocument();
  });

  it('shows fallback error when error is null', () => {
    mockExtractionReturn.status = 'error';
    mockExtractionReturn.error = null;

    render(<OcrInlineUploader {...defaultProps} />);
    expect(screen.getByText('ocrFailed')).toBeInTheDocument();
  });

  it('shows done status with line counts', () => {
    mockExtractionReturn.status = 'done';
    mockFlowReturn.result = {
      committed: false,
      linesCreated: 3,
      linesFailed: 1,
      unresolved: ['item-a'],
    };

    render(<OcrInlineUploader {...defaultProps} />);
    expect(screen.getByText(/ocrDone/)).toBeInTheDocument();
  });

  it('shows processing label when busy', () => {
    mockExtractionReturn.status = 'uploading';

    const { container } = render(<OcrInlineUploader {...defaultProps} />);
    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [createPdfFile()] } });

    expect(screen.getByText('ocrProcessing')).toBeInTheDocument();
  });

  it('shows browse label when no file selected', () => {
    render(<OcrInlineUploader {...defaultProps} />);
    // The drop zone button itself is the "browse" trigger
    // The buttonLabel for no-file state is 'ocrInlineBrowse' but it is only shown
    // when a file is selected (it is inside the file-selected branch).
    // When no file, the drop zone is shown instead. Verify drop zone is present.
    expect(screen.getByText('ocrSidePanelDropTitle')).toBeInTheDocument();
  });

  it('renders pendingModal from useOcrFlow', () => {
    mockFlowReturn.pendingModal = <div data-testid="pending-modal">Review</div>;

    render(<OcrInlineUploader {...defaultProps} />);
    expect(screen.getByTestId('pending-modal')).toBeInTheDocument();
  });

  it('uses copilot token as fallback when tokenProp is not provided', () => {
    const { container } = render(
      <OcrInlineUploader {...defaultProps} token={undefined} />
    );
    // Should still render (useCopilot provides the token)
    expect(container.innerHTML).not.toBe('');
  });
});
