// @covers tools/app-shell/src/windows/custom/shared/SifAttachmentsSection.jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock i18n — SifAttachmentsSection only needs the `attachments` key (reused from the
// generic Attachments feature's own locale strings, no new "section title" key added).
// The attachments table renders through the generic DataTable (ETP-5526), which
// also reads the label / locale hooks.
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
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
  useAttachmentsSpy.mockImplementation(() => hookState);
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

  it('does not query attachments when recordId is absent', () => {
    render(<SifAttachmentsSection {...baseProps} recordId={undefined} />);
    expect(useAttachmentsSpy).not.toHaveBeenCalled();
  });

  // ── several sub-records (ETP-6284: SII F1 + one F5 per DUA) ─────────────────

  /** Per-record hook results: each record id gets its own items and downloadAll. */
  function stubPerRecord(itemsByRecord) {
    const downloadAllByRecord = {};
    useAttachmentsSpy.mockImplementation(({ recordId }) => {
      downloadAllByRecord[recordId] ??= vi.fn();
      return { ...hookState, items: itemsByRecord[recordId] ?? [], downloadAll: downloadAllByRecord[recordId] };
    });
    return downloadAllByRecord;
  }

  it('with a single id in recordIds renders exactly like the single-recordId form', () => {
    render(<SifAttachmentsSection {...baseProps} recordId={undefined} recordIds={['sub-001']} />);
    expect(screen.getAllByTestId('attachments-table')).toHaveLength(1);
    expect(useAttachmentsSpy).toHaveBeenCalledTimes(1);
    expect(useAttachmentsSpy).toHaveBeenCalledWith(expect.objectContaining({ recordId: 'sub-001' }));
  });

  it('merges the files of every record into one table sorted by upload date, then name', () => {
    stubPerRecord({
      'sub-001': [
        { id: 'f1-resp', name: 'F1_Respuesta.xml', size: 1, uploadedAt: '2026-11-19T13:41:20.527Z' },
        { id: 'f1-req', name: 'F1_Envio.xml', size: 1, uploadedAt: '2026-11-19T13:41:20.487Z' },
      ],
      'sub-002': [
        { id: 'f5-b', name: 'F5_b.xml', size: 1, uploadedAt: '2026-11-19T13:41:20.552Z' },
        { id: 'f5-a', name: 'F5_a.xml', size: 1, uploadedAt: '2026-11-19T13:41:20.552Z' },
      ],
    });
    render(<SifAttachmentsSection {...baseProps} recordIds={['sub-001', 'sub-002']} />);

    expect(screen.getAllByTestId('attachments-table')).toHaveLength(1);
    const names = screen.getAllByText(/\.xml$/).map((el) => el.textContent);
    expect(names).toEqual(['F1_Envio.xml', 'F1_Respuesta.xml', 'F5_a.xml', 'F5_b.xml']);
    const queried = useAttachmentsSpy.mock.calls.map(([opts]) => opts.recordId);
    expect(queried).toEqual(expect.arrayContaining(['sub-001', 'sub-002']));
  });

  it('a record without files adds nothing and no empty table', () => {
    stubPerRecord({ 'sub-002': [{ id: 'f5', name: 'F5.xml', size: 1 }] });
    render(<SifAttachmentsSection {...baseProps} recordIds={['sub-001', 'sub-002']} />);
    expect(screen.getAllByTestId('attachments-table')).toHaveLength(1);
    expect(screen.getByText('F5.xml')).toBeInTheDocument();
    expect(screen.queryByTestId('attachments-empty-state')).not.toBeInTheDocument();
  });

  it('shows the empty state once when no record has files', () => {
    stubPerRecord({});
    render(<SifAttachmentsSection {...baseProps} recordIds={['sub-001', 'sub-002']} />);
    expect(screen.getAllByTestId('attachments-empty-state')).toHaveLength(1);
  });

  it('hides "download all" when the files come from more than one record', () => {
    stubPerRecord({
      'sub-001': [{ id: 'a', name: 'a.xml', size: 1 }],
      'sub-002': [{ id: 'b', name: 'b.xml', size: 1 }],
    });
    render(<SifAttachmentsSection {...baseProps} recordIds={['sub-001', 'sub-002']} />);
    expect(screen.queryByTestId('attachments-download-all')).not.toBeInTheDocument();
    expect(screen.getByTestId('attachment-download-a')).toBeInTheDocument();
    expect(screen.getByTestId('attachment-download-b')).toBeInTheDocument();
  });

  it('keeps "download all" bound to the only record that has files', () => {
    const downloadAllByRecord = stubPerRecord({
      'sub-002': [{ id: 'a', name: 'a.xml', size: 1 }, { id: 'b', name: 'b.xml', size: 1 }],
    });
    render(<SifAttachmentsSection {...baseProps} recordIds={['sub-001', 'sub-002']} />);
    screen.getByTestId('attachments-download-all').click();
    expect(downloadAllByRecord['sub-002']).toHaveBeenCalled();
    expect(downloadAllByRecord['sub-001']).not.toHaveBeenCalled();
  });

  it('falls back to recordId when recordIds is empty', () => {
    render(<SifAttachmentsSection {...baseProps} recordIds={[]} />);
    expect(useAttachmentsSpy).toHaveBeenCalledWith(expect.objectContaining({ recordId: 'sub-001' }));
    expect(screen.getAllByTestId('attachments-table')).toHaveLength(1);
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
