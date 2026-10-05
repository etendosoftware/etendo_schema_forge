/**
 * ETP-5205 — `attachmentConfig.readOnly` (Solo-Lectura tier): the preview keeps READING the
 * record's marked attachment but never writes it — no auto-store of the rendered PDF, no drop
 * zone / file picker, no delete.
 */
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const mockStoreBlob = vi.fn(() => Promise.resolve());
const mockUseMainAttachment = vi.fn();

vi.mock('../useMainAttachment.js', () => ({
  useMainAttachment: (...args) => mockUseMainAttachment(...args),
}));

vi.mock('../attachmentFileTypes.js', () => ({
  ACCEPTED_TYPES: {},
  ACCEPT_ATTR: '.pdf,.png,.jpg',
}));

vi.mock('../PdfViewer.jsx', () => ({
  default: () => <div data-testid="pdf-viewer" />,
}));

vi.mock('lucide-react', () => ({
  X: () => <span />,
  Upload: () => <span />,
  Trash2: () => <span />,
  Loader2: () => <span />,
  Download: () => <span />,
}));

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GenericPreviewModal from '../GenericPreviewModal.jsx';

const STORED_FILE = { objectUrl: 'blob:stored', mimeType: 'application/pdf', fileName: 'scan.pdf' };

function attachmentState(overrides = {}) {
  return {
    storedFile: null,
    storedFileIsStale: false,
    isBusy: false,
    storeFailed: false,
    storeFile: vi.fn(),
    storeBlob: mockStoreBlob,
    storeUrl: vi.fn(),
    markExisting: vi.fn(),
    deleteFile: vi.fn(),
    fetchBlobUrl: vi.fn(),
    ...overrides,
  };
}

function renderModal(attachmentConfig) {
  return render(
    <GenericPreviewModal
      title="Doc"
      onClose={vi.fn()}
      leftPanel={<div data-testid="caller-left-panel" />}
      attachmentConfig={{ documentId: 'doc-1', tableName: 'C_Invoice', storeCondition: true, ...attachmentConfig }}
    />,
  );
}

describe('GenericPreviewModal — Solo-Lectura (attachmentConfig.readOnly)', () => {
  beforeEach(() => {
    mockStoreBlob.mockClear();
    mockUseMainAttachment.mockReset();
  });

  it('drop-zone window: keeps showing the stored document and its download, hides delete', () => {
    mockUseMainAttachment.mockReturnValue(attachmentState({ storedFile: STORED_FILE }));

    renderModal({ autoFetch: false, readOnly: true });

    expect(screen.getByTestId('pdf-viewer')).toBeInTheDocument();
    expect(screen.getByLabelText('downloadPdf')).toBeInTheDocument();
    expect(screen.queryByLabelText('deleteDocument')).not.toBeInTheDocument();
  });

  it('drop-zone window without a stored document: no drop zone and no file input', () => {
    mockUseMainAttachment.mockReturnValue(attachmentState());

    const { container } = renderModal({ autoFetch: false, readOnly: true });

    expect(screen.getByTestId('preview-drop-zone-readonly')).toBeInTheDocument();
    expect(screen.getByText('dropZoneReadOnlyEmpty')).toBeInTheDocument();
    expect(screen.queryByTestId('preview-drop-zone')).not.toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it('full access keeps the drop zone and delete (control)', () => {
    mockUseMainAttachment.mockReturnValue(attachmentState({ storedFile: STORED_FILE }));
    renderModal({ autoFetch: false });
    expect(screen.getByLabelText('deleteDocument')).toBeInTheDocument();
  });

  it('generated-PDF window: never auto-stores the rendered PDF', () => {
    mockUseMainAttachment.mockReturnValue(attachmentState());

    renderModal({ autoFetch: true, readOnly: true, sourceBlob: new Blob(['%PDF']) });

    expect(screen.getByTestId('caller-left-panel')).toBeInTheDocument();
    expect(mockStoreBlob).not.toHaveBeenCalled();
  });

  it('generated-PDF window: does not overwrite a stale cache either', () => {
    mockUseMainAttachment.mockReturnValue(attachmentState({ storedFile: STORED_FILE, storedFileIsStale: true }));

    renderModal({ autoFetch: true, readOnly: true, sourceBlob: new Blob(['%PDF']) });

    expect(mockStoreBlob).not.toHaveBeenCalled();
  });

  it('generated-PDF window under full access still auto-stores (control)', () => {
    mockUseMainAttachment.mockReturnValue(attachmentState());

    renderModal({ autoFetch: true, sourceBlob: new Blob(['%PDF']) });

    expect(mockStoreBlob).toHaveBeenCalledTimes(1);
  });

  it('still reads the attachment under read-only (storeCondition keeps the hook active)', () => {
    mockUseMainAttachment.mockReturnValue(attachmentState());

    renderModal({ autoFetch: true, readOnly: true });

    expect(mockUseMainAttachment).toHaveBeenCalledWith(expect.objectContaining({ storeCondition: true }));
  });
});
