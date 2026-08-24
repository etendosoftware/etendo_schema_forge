// Vitest tests for the "Justificante" tab (AttachmentsTab bound to
// ETGO_Fiscal_Decl) and the handlePresent acuse-de-recibo upload wiring in
// FmModel349Page.jsx — ported from the equivalent Modelo 303 feature (see
// FmModel303Page.receiptTab.vitest.jsx). Kept in its own file (rather than
// editing FmModel349Page.vitest.jsx / .render.vitest.jsx / .rectifications.vitest.jsx)
// so its @/components/attachments mock (with an upload spy + mount counter)
// and its custom PresentModal mock (which needs to report `acuseFile`
// alongside `status`) don't leak into those sibling suites.
//
// Unlike 303, Modelo 349 does NOT get the AEAT telematic-submission path —
// only the "Justificante" tab + the manual acuse-de-recibo upload. See the
// dedicated negative-assertion describe block at the bottom.
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('../../../fiscalModelsUtils.js', () => ({
  formatAmount: (n) => (n == null ? '—' : String(n)),
  compute349Operators: vi.fn().mockResolvedValue(null),
  generate349File: vi.fn().mockResolvedValue(false),
}));
vi.mock('../../../FmCommon.jsx', () => ({
  StatusPillMenu: () => null,
  MoreOptionsMenu: () => null,
  KpiWidget: () => null,
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
}));
vi.mock('../../../FmTabContent.jsx', () => ({
  SourcesTab: () => null, IncidentsTab: () => null,
}));
vi.mock('../../../fiscal-models.css', () => ({}));
vi.mock('lucide-react', () => ({
  Download: () => null, CircleCheck: () => null, Search: () => null, Loader2: () => null,
  Globe: () => null, MoreVertical: () => null, ChevronDown: () => null, Users: () => null,
  FileEdit: () => null, TriangleAlert: () => null, Folder: () => null, ReceiptText: () => null,
  Calculator: () => null, PenLine: () => null, ShieldAlert: () => null, Info: () => null,
  FileCheck: () => null,
}));

// PresentModal mock: renders 3 buttons reporting the same `{ status, acuseFile }`
// shape the real component reports via onConfirm (see FmOverlays.jsx). 349 never
// passes `showAeatPath`, so the real component would never offer the AEAT
// telematic path either — this mock only exposes the 2 manual paths 349 actually
// wires up (submitted_ack with/without file, and submitted), matching the
// modal's own PATHS list when `showAeatPath` is falsy.
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: ({ onConfirm, showAeatPath }) => React.createElement(
    React.Fragment,
    null,
    React.createElement('span', { 'data-testid': 'present-modal-show-aeat-path' }, String(!!showAeatPath)),
    React.createElement('button', {
      'data-testid': 'present-confirm-submitted',
      onClick: () => onConfirm({ status: 'submitted', acuseFile: null }),
    }, 'confirm-submitted'),
    React.createElement('button', {
      'data-testid': 'present-confirm-ack-with-file',
      onClick: () => onConfirm({ status: 'submitted_ack', acuseFile: FILE_FIXTURE }),
    }, 'confirm-ack-with-file'),
    React.createElement('button', {
      'data-testid': 'present-confirm-ack-no-file',
      onClick: () => onConfirm({ status: 'submitted_ack', acuseFile: null }),
    }, 'confirm-ack-no-file'),
  ),
  FileGenModal: () => null,
}));

// @/components/attachments mock: AttachmentsTab renders identifying props so we
// can assert the "Justificante" tab is wired to the right table/record, mirroring
// FmModel303Page.receiptTab.vitest.jsx's convention.
const uploadMock = vi.fn();
const useAttachmentsMock = vi.fn(() => ({ upload: uploadMock }));
vi.mock('@/components/attachments', () => ({
  AttachmentsTab: (props) => React.createElement('div', {
    'data-testid': 'attachments-tab-mock',
    'data-table-name': props.tableName,
    'data-record-id': props.recordId,
    'data-mime-types': JSON.stringify(props.config?.allowedMimeTypes ?? []),
  }, 'attachments-tab'),
  useAttachments: (...args) => useAttachmentsMock(...args),
}));

import FmModel349Page from '../FmModel349Page.jsx';

const FILE_FIXTURE = new File(['dummy pdf content'], 'acuse.pdf', { type: 'application/pdf' });

const makeDecl = (overrides = {}) => ({
  id: 'decl-349', model: '349', year: 2026, period: 'T1',
  type: 'ord', status: 'pending', nif: 'B12345678',
  operators: [], invoices: [], rectifications: [],
  incidents: { blocking: 0 }, _precomputed: null,
  ...overrides,
});

const defaultProps = {
  onBack: vi.fn(),
  onStatusChange: vi.fn(),
  token: 'tok',
  apiBaseUrl: '/api',
};

function openPresentModal() {
  const btns = Array.from(document.querySelectorAll('button'));
  const presentBtn = btns.find(b => b.textContent.includes('fm.action.present'));
  fireEvent.click(presentBtn);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FmModel349Page — "Justificante" receipt tab', () => {
  it('renders a tab labeled via fm.tab.receipt', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.some(t => t.textContent.includes('fm.tab.receipt'))).toBe(true);
  });

  it('does not render AttachmentsTab before the receipt tab is selected', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    expect(screen.queryByTestId('attachments-tab-mock')).not.toBeInTheDocument();
  });

  it('renders AttachmentsTab bound to ETGO_Fiscal_Decl and decl.id when the receipt tab is selected', () => {
    const decl = makeDecl({ id: 'decl-349-xyz' });
    render(<FmModel349Page decl={decl} {...defaultProps} />);
    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs.find(t => t.textContent.includes('fm.tab.receipt')));

    const attachmentsTab = screen.getByTestId('attachments-tab-mock');
    expect(attachmentsTab).toBeInTheDocument();
    expect(attachmentsTab.getAttribute('data-table-name')).toBe('ETGO_Fiscal_Decl');
    expect(attachmentsTab.getAttribute('data-record-id')).toBe(decl.id);
    expect(JSON.parse(attachmentsTab.getAttribute('data-mime-types'))).toEqual(['application/pdf']);
  });

  it('hides AttachmentsTab again when switching away from the receipt tab', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs.find(t => t.textContent.includes('fm.tab.receipt')));
    expect(screen.getByTestId('attachments-tab-mock')).toBeInTheDocument();

    fireEvent.click(tabs.find(t => t.textContent.includes('fm.m349.tab.operators')));
    expect(screen.queryByTestId('attachments-tab-mock')).not.toBeInTheDocument();
  });

  it('calls useAttachments with the ETGO_Fiscal_Decl table and decl.id', () => {
    const decl = makeDecl({ id: 'decl-349-abc' });
    render(<FmModel349Page decl={decl} {...defaultProps} />);
    expect(useAttachmentsMock).toHaveBeenCalledWith(expect.objectContaining({
      tableName: 'ETGO_Fiscal_Decl',
      recordId: decl.id,
    }));
  });
});

describe('FmModel349Page — handlePresent uploads acuse-de-recibo', () => {
  it('uploads the file and still fires the status change for submitted_ack with a file', () => {
    const onStatusChange = vi.fn();
    const decl = makeDecl();
    render(<FmModel349Page decl={decl} onBack={vi.fn()} onStatusChange={onStatusChange} token="tok" apiBaseUrl="/api" />);

    openPresentModal();
    fireEvent.click(screen.getByTestId('present-confirm-ack-with-file'));

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock).toHaveBeenCalledWith(FILE_FIXTURE);
    expect(onStatusChange).toHaveBeenCalledWith(decl.id, 'submitted_ack', 'manual_ack');
  });

  it('does not upload for submitted_ack with no file (defensive — no null-file POST) but still changes status', () => {
    const onStatusChange = vi.fn();
    const decl = makeDecl();
    render(<FmModel349Page decl={decl} onBack={vi.fn()} onStatusChange={onStatusChange} token="tok" apiBaseUrl="/api" />);

    openPresentModal();
    fireEvent.click(screen.getByTestId('present-confirm-ack-no-file'));

    expect(uploadMock).not.toHaveBeenCalled();
    expect(onStatusChange).toHaveBeenCalledWith(decl.id, 'submitted_ack', 'manual_ack');
  });

  it('does not upload for the submitted path (no file involved)', () => {
    const onStatusChange = vi.fn();
    const decl = makeDecl();
    render(<FmModel349Page decl={decl} onBack={vi.fn()} onStatusChange={onStatusChange} token="tok" apiBaseUrl="/api" />);

    openPresentModal();
    fireEvent.click(screen.getByTestId('present-confirm-submitted'));

    expect(uploadMock).not.toHaveBeenCalled();
    expect(onStatusChange).toHaveBeenCalledWith(decl.id, 'submitted', 'manual_no_receipt');
  });
});

describe('FmModel349Page — no AEAT telematic path (scope guard)', () => {
  it('renders PresentModal without showAeatPath', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    openPresentModal();
    expect(screen.getByTestId('present-modal-show-aeat-path').textContent).toBe('false');
  });

  it('never mentions "Submit to AEAT" / AEAT telematic submission anywhere on the page', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    openPresentModal();
    expect(document.body.textContent).not.toMatch(/aeat/i);
  });

  it('does not import or render an AeatSubmitFlow component', () => {
    // FmModel349Page.jsx has no AeatSubmitFlow import at all — if it ever gained
    // one, the mocked FmOverlays/lucide modules above would still let the page
    // render, but no 'aeat_telematic' sentinel path exists to trigger it. This
    // guards the observable surface: no such flow ever mounts from this page.
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    openPresentModal();
    fireEvent.click(screen.getByTestId('present-confirm-submitted'));
    expect(screen.queryByTestId('AeatSubmitFlow__4f6c0d')).not.toBeInTheDocument();
  });
});
