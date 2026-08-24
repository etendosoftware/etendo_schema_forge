import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock i18n — SifAttachmentsSection only needs the `attachments` key (reused from the
// generic Attachments feature's own locale strings, no new "section title" key added).
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// Replace the shared attachments hook with a controllable mock so tests can drive
// loading/items/download state without a network call — mirrors the pattern used by
// AttachmentsTab.vitest.jsx for the same hook.
const hookState = {
  items: [],
  loading: false,
  uploadingFiles: new Map(),
  download: vi.fn(),
  downloadAll: vi.fn(),
  formatBytes: (n) => `${n} B`,
};

const useAttachmentsSpy = vi.fn(() => hookState);
vi.mock('@/components/attachments/useAttachments', () => ({
  useAttachments: (...args) => useAttachmentsSpy(...args),
}));

import SifAttachmentsSection from '../SifAttachmentsSection.jsx';

const baseProps = {
  tableName: 'aeatsii_facturas',
  recordId: 'sub-001',
  token: 'tok',
  apiBaseUrl: '/sws/neo/sales-invoice',
};

beforeEach(() => {
  vi.clearAllMocks();
  hookState.items = [];
  hookState.loading = false;
  hookState.uploadingFiles = new Map();
});

describe('SifAttachmentsSection', () => {
  // ── recordId guard ─────────────────────────────────────────────────────────

  it('renders nothing when recordId is absent (sub-record not created yet)', () => {
    const { container } = render(<SifAttachmentsSection {...baseProps} recordId={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when recordId is an empty string', () => {
    const { container } = render(<SifAttachmentsSection {...baseProps} recordId="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the section when recordId is present', () => {
    render(<SifAttachmentsSection {...baseProps} />);
    expect(screen.getByText('attachments')).toBeInTheDocument();
    expect(screen.getByTestId('attachments-table')).toBeInTheDocument();
  });

  // ── wiring into useAttachments ───────────────────────────────────────────────

  it('calls useAttachments with the given tableName/recordId/token/apiBaseUrl', () => {
    render(<SifAttachmentsSection {...baseProps} />);
    expect(useAttachmentsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'aeatsii_facturas',
        recordId: 'sub-001',
        token: 'tok',
        apiBaseUrl: '/sws/neo/sales-invoice',
        isActive: true,
      }),
    );
  });

  it('passes isActive: false to useAttachments when recordId is absent', () => {
    render(<SifAttachmentsSection {...baseProps} recordId={undefined} />);
    expect(useAttachmentsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
  });

  // ── list rendering ───────────────────────────────────────────────────────────

  it('renders the empty state when there are no attachments', () => {
    render(<SifAttachmentsSection {...baseProps} />);
    expect(screen.getByTestId('attachments-empty-state')).toBeInTheDocument();
  });

  it('renders one row per attachment', () => {
    hookState.items = [
      { id: '1', name: 'sii-response.xml', size: 512 },
      { id: '2', name: 'sii-request.xml', size: 1024 },
    ];
    render(<SifAttachmentsSection {...baseProps} />);
    expect(screen.getByText('sii-response.xml')).toBeInTheDocument();
    expect(screen.getByText('sii-request.xml')).toBeInTheDocument();
  });

  // ── read-only: no delete button, download only ──────────────────────────────

  it('renders a download action but no delete action for each row (read-only)', () => {
    hookState.items = [{ id: '1', name: 'sii-response.xml', size: 512 }];
    render(<SifAttachmentsSection {...baseProps} />);
    expect(screen.getByTestId('attachment-download-1')).toBeInTheDocument();
    expect(screen.queryByTestId('attachment-delete-1')).not.toBeInTheDocument();
  });

  it('does not render an upload dropzone (view/download only)', () => {
    render(<SifAttachmentsSection {...baseProps} />);
    expect(screen.queryByTestId(/UploadDropzone/)).not.toBeInTheDocument();
  });

  it('does not render a "delete all" action even with multiple attachments', () => {
    hookState.items = [
      { id: '1', name: 'a.xml', size: 10 },
      { id: '2', name: 'b.xml', size: 20 },
    ];
    render(<SifAttachmentsSection {...baseProps} />);
    expect(screen.queryByTestId('attachments-delete-all')).not.toBeInTheDocument();
  });

  it('renders a "download all" action when there is more than one attachment', () => {
    hookState.items = [
      { id: '1', name: 'a.xml', size: 10 },
      { id: '2', name: 'b.xml', size: 20 },
    ];
    render(<SifAttachmentsSection {...baseProps} />);
    expect(screen.getByTestId('attachments-download-all')).toBeInTheDocument();
  });

  it('does not render "download all" when there are no attachments', () => {
    render(<SifAttachmentsSection {...baseProps} />);
    expect(screen.queryByTestId('attachments-download-all')).not.toBeInTheDocument();
  });
});
