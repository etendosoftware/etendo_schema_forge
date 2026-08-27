// Vitest tests for the ETP-4456 "Justificante" tab (AttachmentsTab bound to
// ETGO_Fiscal_Decl) and the handlePresent acuse-de-recibo upload fix in
// FmModel303Page.jsx. Kept in its own file (rather than editing
// FmModel303Page.vitest.jsx or FmModel303Page.aeatFlow.vitest.jsx) so its
// PresentModal mock — which needs to report `acuseFile` alongside `status`,
// unlike the other files' mocks — and its @/components/attachments mock
// can't affect the existing suites there.
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const navigateMock = vi.fn();

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => ({ selectedOrg: { id: 'org-1' } }) }));
vi.mock('../../../fiscalModelsUtils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    formatAmount: (n) => (n == null ? '—' : String(n)),
    formatPeriod: (p) => p,
    computeBoxes303: vi.fn().mockResolvedValue(null),
    generate303File: vi.fn().mockResolvedValue({ ok: false }),
    checkModified303: vi.fn(),
  };
});
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));
vi.mock('../../../fiscal-models.css', () => ({}));
vi.mock('../../../FmCommon.jsx', () => ({
  StatusPillMenu: () => null,
  MoreOptionsMenu: () => null,
  ResultPill: () => null,
  SummaryCard: () => null,
  Tabs: ({ tabs, active, onSelect }) => React.createElement(
    'div',
    { role: 'tablist' },
    tabs.map(t => React.createElement(
      'button',
      { key: t.id, role: 'tab', 'aria-selected': String(t.id === active), onClick: () => onSelect(t.id) },
      t.label
    ))
  ),
  Banner: () => null,
  SectionCard: () => null,
  EmptyState: () => null,
  KpiWidget: () => null,
}));
vi.mock('../../../FmTabContent.jsx', () => ({
  SourcesTab: () => null, IncidentsTab: () => null, HistoryTab: () => null,
}));
vi.mock('../FmBoxes303.jsx', () => ({ default: () => null }));
// AeatSubmitFlow mock: exposes a button that triggers `onAttached` (mirroring how
// FmModel303Page.aeatFlow.vitest.jsx mocks it to trigger `onSuccess`) — used by the
// "receiptRefreshTick" remount test below to simulate a test-mode submission attaching a PDF
// without ever calling `onSuccess`/changing `status`.
vi.mock('../AeatSubmitFlow.jsx', () => ({
  default: ({ onAttached }) => React.createElement(
    'button',
    { 'data-testid': 'aeat-flow-attach', onClick: () => onAttached?.() },
    'aeat-flow-attach',
  ),
}));
// Explicit per-icon mock (matching the sibling files' established pattern) rather
// than a catch-all Proxy — see FmModel303Page.aeatFlow.vitest.jsx for why.
vi.mock('lucide-react', () => ({
  Settings: () => null, Download: () => null, OctagonAlert: () => null,
  TriangleAlert: () => null, CircleCheck: () => null, ArrowLeftRight: () => null,
  Calculator: () => null, Loader2: () => null, MoreVertical: () => null,
  TrendingUp: () => null, TrendingDown: () => null, Clock: () => null,
  ClipboardCheck: () => null, ReceiptText: () => null, Folder: () => null,
  FileCheck: () => null,
}));

// PresentModal mock: renders 4 buttons, one per path, each reporting the same
// `{ status, acuseFile }` shape the real component reports via onConfirm —
// see FmOverlays.jsx: `onConfirm({ status: path, acuseFile: path === 'submitted_ack' ? acuseFile : null })`.
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: ({ onConfirm }) => React.createElement(
    React.Fragment,
    null,
    React.createElement('button', {
      'data-testid': 'present-confirm-submitted',
      onClick: () => onConfirm({ status: 'submitted', acuseFile: null }),
    }, 'confirm-submitted'),
    React.createElement('button', {
      'data-testid': 'present-confirm-submitted-ext',
      onClick: () => onConfirm({ status: 'submitted_ext', acuseFile: null }),
    }, 'confirm-submitted-ext'),
    React.createElement('button', {
      'data-testid': 'present-confirm-aeat',
      onClick: () => onConfirm({ status: 'aeat_telematic', acuseFile: null }),
    }, 'confirm-aeat'),
    React.createElement('button', {
      'data-testid': 'present-confirm-ack-with-file',
      onClick: () => onConfirm({ status: 'submitted_ack', acuseFile: FILE_FIXTURE }),
    }, 'confirm-ack-with-file'),
    React.createElement('button', {
      'data-testid': 'present-confirm-ack-no-file',
      onClick: () => onConfirm({ status: 'submitted_ack', acuseFile: null }),
    }, 'confirm-ack-no-file'),
  ),
  FileGenModal303: () => null,
  ConfigDrawer: () => null,
  CompareDrawer: () => null,
}));

// @/components/attachments mock: AttachmentsTab renders identifying props so
// we can assert the "Justificante" tab is wired to the right table/record,
// and (for the remount assertion) a mount counter tied to a module-level ref
// bumped in a render-time side effect — cheaper and less brittle than trying
// to intercept React's own key-based unmount/remount internals.
const uploadMock = vi.fn();
const useAttachmentsMock = vi.fn(() => ({ upload: uploadMock }));
let attachmentsTabMountCount = 0;
vi.mock('@/components/attachments', () => ({
  AttachmentsTab: (props) => {
    attachmentsTabMountCount += 1;
    return React.createElement('div', {
      'data-testid': 'attachments-tab-mock',
      'data-table-name': props.tableName,
      'data-record-id': props.recordId,
      'data-mime-types': JSON.stringify(props.config?.allowedMimeTypes ?? []),
      'data-mount-count': attachmentsTabMountCount,
    }, 'attachments-tab');
  },
  useAttachments: (...args) => useAttachmentsMock(...args),
}));

import FmModel303Page from '../FmModel303Page.jsx';

const FILE_FIXTURE = new File(['dummy pdf content'], 'acuse.pdf', { type: 'application/pdf' });

const BASE_DECL = {
  id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
  status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
  _precomputed: null, boxes: null, sources: [], history: [],
};

function openPresentModal() {
  const btns = Array.from(document.querySelectorAll('button'));
  const presentBtn = btns.find(b => b.textContent.includes('fm.action.submit'));
  fireEvent.click(presentBtn);
}

beforeEach(() => {
  vi.clearAllMocks();
  attachmentsTabMountCount = 0;
});

describe('FmModel303Page — "Justificante" receipt tab (ETP-4456)', () => {
  it('renders a tab labeled via fm.tab.receipt', () => {
    render(<FmModel303Page decl={BASE_DECL} onBack={vi.fn()} onStatusChange={vi.fn()} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.some(t => t.textContent.includes('fm.tab.receipt'))).toBe(true);
  });

  it('does not render AttachmentsTab before the receipt tab is selected', () => {
    render(<FmModel303Page decl={BASE_DECL} onBack={vi.fn()} onStatusChange={vi.fn()} />);
    expect(screen.queryByTestId('attachments-tab-mock')).not.toBeInTheDocument();
  });

  it('renders AttachmentsTab bound to ETGO_Fiscal_Decl and decl.id when the receipt tab is selected', () => {
    render(<FmModel303Page decl={BASE_DECL} onBack={vi.fn()} onStatusChange={vi.fn()} />);
    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs.find(t => t.textContent.includes('fm.tab.receipt')));

    const attachmentsTab = screen.getByTestId('attachments-tab-mock');
    expect(attachmentsTab).toBeInTheDocument();
    expect(attachmentsTab.getAttribute('data-table-name')).toBe('ETGO_Fiscal_Decl');
    expect(attachmentsTab.getAttribute('data-record-id')).toBe(BASE_DECL.id);
    expect(JSON.parse(attachmentsTab.getAttribute('data-mime-types'))).toEqual(['application/pdf']);
  });

  it('hides AttachmentsTab again when switching away from the receipt tab', () => {
    render(<FmModel303Page decl={BASE_DECL} onBack={vi.fn()} onStatusChange={vi.fn()} />);
    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs.find(t => t.textContent.includes('fm.tab.receipt')));
    expect(screen.getByTestId('attachments-tab-mock')).toBeInTheDocument();

    fireEvent.click(tabs.find(t => t.textContent.includes('fm.tab.boxes')));
    expect(screen.queryByTestId('attachments-tab-mock')).not.toBeInTheDocument();
  });
});

describe('FmModel303Page — "Justificante" tab remounts on status change (key={status})', () => {
  it('remounts AttachmentsTab (fresh mount) after a status change while the receipt tab stays selected', () => {
    render(<FmModel303Page decl={BASE_DECL} onBack={vi.fn()} onStatusChange={vi.fn()} />);
    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs.find(t => t.textContent.includes('fm.tab.receipt')));

    const firstMountCount = Number(screen.getByTestId('attachments-tab-mock').getAttribute('data-mount-count'));
    expect(firstMountCount).toBeGreaterThan(0);

    // Drive a status change through the normal manual "submitted" present path —
    // the receipt tab has no idea a submission just happened (the AEAT auto-attach
    // is server-side/invisible), so a fresh mount is the only remount signal.
    openPresentModal();
    fireEvent.click(screen.getByTestId('present-confirm-submitted'));

    const secondMountCount = Number(screen.getByTestId('attachments-tab-mock').getAttribute('data-mount-count'));
    expect(secondMountCount).toBeGreaterThan(firstMountCount);
  });
});

describe('FmModel303Page — "Justificante" tab remounts on a test-mode attach (receiptRefreshTick, ETP-4456 follow-up)', () => {
  it('remounts AttachmentsTab when AeatSubmitFlow calls onAttached, even though status does not change', () => {
    const onStatusChange = vi.fn();
    render(<FmModel303Page decl={BASE_DECL} onBack={vi.fn()} onStatusChange={onStatusChange} />);
    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs.find(t => t.textContent.includes('fm.tab.receipt')));

    const firstMountCount = Number(screen.getByTestId('attachments-tab-mock').getAttribute('data-mount-count'));
    expect(firstMountCount).toBeGreaterThan(0);

    // Open AeatSubmitFlow via the same 'aeat_telematic' sentinel path used by the AEAT wiring
    // tests, then simulate a test-mode success that attaches a PDF (onAttached), which must
    // never go through onStatusChange — `status` itself stays untouched.
    openPresentModal();
    fireEvent.click(screen.getByTestId('present-confirm-aeat'));
    fireEvent.click(screen.getByTestId('aeat-flow-attach'));

    const secondMountCount = Number(screen.getByTestId('attachments-tab-mock').getAttribute('data-mount-count'));
    expect(secondMountCount).toBeGreaterThan(firstMountCount);
    expect(onStatusChange).not.toHaveBeenCalled();
  });
});

describe('FmModel303Page — handlePresent uploads acuse-de-recibo (ETP-4456 fix)', () => {
  it('uploads the file and still fires the status change for submitted_ack with a file', () => {
    const onStatusChange = vi.fn();
    render(<FmModel303Page decl={BASE_DECL} onBack={vi.fn()} onStatusChange={onStatusChange} />);

    openPresentModal();
    fireEvent.click(screen.getByTestId('present-confirm-ack-with-file'));

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock).toHaveBeenCalledWith(FILE_FIXTURE);
    expect(onStatusChange).toHaveBeenCalledWith(BASE_DECL.id, 'submitted_ack', 'manual_ack');
  });

  it('calls useAttachments with the ETGO_Fiscal_Decl table and decl.id', () => {
    render(<FmModel303Page decl={BASE_DECL} onBack={vi.fn()} onStatusChange={vi.fn()} />);
    expect(useAttachmentsMock).toHaveBeenCalledWith(expect.objectContaining({
      tableName: 'ETGO_Fiscal_Decl',
      recordId: BASE_DECL.id,
    }));
  });

  it('does not upload for submitted_ack with no file (defensive — no null-file POST)', () => {
    const onStatusChange = vi.fn();
    render(<FmModel303Page decl={BASE_DECL} onBack={vi.fn()} onStatusChange={onStatusChange} />);

    openPresentModal();
    fireEvent.click(screen.getByTestId('present-confirm-ack-no-file'));

    expect(uploadMock).not.toHaveBeenCalled();
    expect(onStatusChange).toHaveBeenCalledWith(BASE_DECL.id, 'submitted_ack', 'manual_ack');
  });

  it('does not upload for the submitted path', () => {
    render(<FmModel303Page decl={BASE_DECL} onBack={vi.fn()} onStatusChange={vi.fn()} />);
    openPresentModal();
    fireEvent.click(screen.getByTestId('present-confirm-submitted'));
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('does not upload for the submitted_ext path', () => {
    render(<FmModel303Page decl={BASE_DECL} onBack={vi.fn()} onStatusChange={vi.fn()} />);
    openPresentModal();
    fireEvent.click(screen.getByTestId('present-confirm-submitted-ext'));
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('does not upload for the aeat_telematic sentinel path', () => {
    const onStatusChange = vi.fn();
    render(<FmModel303Page decl={BASE_DECL} onBack={vi.fn()} onStatusChange={onStatusChange} />);
    openPresentModal();
    fireEvent.click(screen.getByTestId('present-confirm-aeat'));
    expect(uploadMock).not.toHaveBeenCalled();
    // aeat_telematic is a sentinel, never a real status change.
    expect(onStatusChange).not.toHaveBeenCalled();
  });
});
