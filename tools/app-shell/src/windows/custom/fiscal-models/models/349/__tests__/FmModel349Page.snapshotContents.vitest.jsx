import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, waitFor, fireEvent, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('../../../fiscalModelsUtils.js', () => ({
  formatAmount: (n) => (n == null ? '—' : String(n)),
  compute349Operators: vi.fn().mockResolvedValue(null),
  generate349File: vi.fn().mockResolvedValue({ ok: false }),
}));
vi.mock('../use349Pdf.js', () => ({
  use349Pdf: () => ({ pdfUrl: null, loading: false, generatePdf: vi.fn(), clearPdf: vi.fn() }),
}));
vi.mock('../../../FmCommon.jsx', () => ({
  StatusPillMenu: () => null,
  MoreOptionsMenu: () => null,
  KpiWidget: ({ value, label }) => React.createElement(
    'div', { className: 'test-kpi349', 'data-kpi-label': label },
    React.createElement('span', { className: 'test-kpi349-value' }, value),
  ),
  Tabs: ({ tabs, onSelect }) => React.createElement('div', null, tabs.map(tab => React.createElement(
    'button', { key: tab.id, 'data-testid': `tab-${tab.id}`, onClick: () => onSelect(tab.id) },
    `${tab.id}:${tab.badge ?? ''}`,
  ))),
  Banner: () => null,
}));
vi.mock('../../../FmTabContent.jsx', () => ({ SourcesTab: () => null, IncidentsTab: () => null }));
vi.mock('../../../FmOverlays.jsx', () => ({ PresentModal: () => null, FileGenModal: () => null }));
vi.mock('../../../../../../components/contract-ui/DocumentPreview.jsx', () => ({
  DocumentPreview: () => null,
}));
vi.mock('../../../fiscal-models.css', () => ({}));
vi.mock('lucide-react', () => ({
  Download: () => null, FileDown: () => null, CircleCheck: () => null, Search: () => null,
  RefreshCw: () => null, Globe: () => null, Eye: () => null, MoreVertical: () => null,
  ChevronDown: () => null, ChevronRight: () => null, Users: () => null, FileEdit: () => null,
  Clock: () => null, TriangleAlert: () => null, Folder: () => null, ReceiptText: () => null,
  Calculator: () => null, PenLine: () => null, ShieldAlert: () => null, Info: () => null,
  OctagonAlert: () => null, ArrowLeft: () => null, Save: () => null, FileText: () => null,
  Star: () => null, ArrowUpRight: () => null, Loader2: () => null, X: () => null, Check: () => null,
  FileCheck: () => null,
}));

import FmModel349Page, { submittedSnapshotOf, isSnapshotServed349, rectificationCountFor, invoicesTabBadge, detailTabFor } from '../FmModel349Page.jsx';

// ETP-5438 scope decision — the 349 snapshot keeps operators and the key totals plus the
// invoice/rectification COUNTS, never the per-invoice rows. Those two tabs show a note instead.
const decl = {
  id: 'decl-349-contents', model: '349', year: 2026, period: 'T3',
  type: 'ord', status: 'submitted', nif: 'B12345678',
  incidents: { blocking: 0 }, _precomputed: null,
  submittedSnapshot: {
    operators: [
      { bpId: '9', nif: 'FR40123456789', name: 'Snapshot SARL', key: 'E', base: '321.00', vies: 'valid',
        originPurchases: 0, originSales: 3 },
      { bpId: '8', nif: 'IT01234567890', name: 'Mixed Srl', key: 'A', base: '10.00', vies: 'valid',
        originPurchases: 1, originSales: 2 },
    ],
    summary: { totalE: '321.00', totalS: '0.00', totalA: '0.00', totalI: '0.00' },
    rectificativeSummary: { totalE: '0.00', totalS: '0.00', totalA: '0.00', totalI: '0.00' },
    invoiceCount: 42,
    rectificationCount: 2,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('FmModel349Page — figures-only submission snapshot (ETP-5438)', () => {
  it('renders the operators, uses the counts as badges and shows the note in both per-invoice tabs', async () => {
    const { compute349Operators } = await import('../../../fiscalModelsUtils.js');
    render(<FmModel349Page decl={decl} onBack={vi.fn()} onStatusChange={vi.fn()} token="tok" apiBaseUrl="/api" />);

    await waitFor(() => expect(document.body.textContent).toContain('Snapshot SARL'));
    expect(screen.getByTestId('tab-invoices').textContent).toBe('invoices:42');
    expect(screen.getByTestId('tab-rectif').textContent).toBe('rectif:2');

    fireEvent.click(screen.getByTestId('tab-invoices'));
    expect(screen.getByTestId('fm-snapshot-no-invoice-detail')).toBeTruthy();

    fireEvent.click(screen.getByTestId('tab-rectif'));
    expect(screen.getByTestId('fm-snapshot-no-invoice-detail').textContent)
      .toBe('fm.snapshot.invoice_detail_not_kept');
    expect(compute349Operators).not.toHaveBeenCalled();
  });

  it('shows the per-operator Origen counts folded into the snapshot (no invoice rows needed)', async () => {
    render(<FmModel349Page decl={decl} onBack={vi.fn()} onStatusChange={vi.fn()} token="tok" apiBaseUrl="/api" />);

    await waitFor(() => expect(document.body.textContent).toContain('Snapshot SARL'));
    expect(document.body.textContent).toContain('3 facturas venta');
    expect(document.body.textContent).toContain('1 compra, 2 venta');
    // Plain text, not the goToOrigin link: the invoice tab only holds the "not kept" note.
    expect(document.querySelectorAll('.fm-origin-link')).toHaveLength(0);
    expect(screen.getAllByTestId('fm-origin-text').map(n => n.textContent))
      .toEqual(expect.arrayContaining(['3 facturas venta', '1 compra, 2 venta']));
  });
});

describe('FmModel349Page snapshot helpers (ETP-5438)', () => {
  it('submittedSnapshotOf returns the object snapshot, else null', () => {
    const snap = { operators: [] };
    expect(submittedSnapshotOf({ submittedSnapshot: snap })).toBe(snap);
    expect(submittedSnapshotOf({ submittedSnapshot: 'text' })).toBeNull();
    expect(submittedSnapshotOf({})).toBeNull();
  });

  it('isSnapshotServed349 needs a submitted status AND an operators array', () => {
    expect(isSnapshotServed349(true, { operators: [] })).toBe(true);
    expect(isSnapshotServed349(false, { operators: [] })).toBe(false);
    expect(isSnapshotServed349(true, { operators: 'x' })).toBe(false);
    expect(isSnapshotServed349(true, null)).toBe(false);
  });

  it('rectificationCountFor reads the snapshot count, else the rows (a non-array counts 0)', () => {
    expect(rectificationCountFor(true, { rectificationCount: 4 }, [1])).toBe(4);
    expect(rectificationCountFor(true, {}, [1])).toBe(0);
    expect(rectificationCountFor(false, { rectificationCount: 4 }, [1, 2])).toBe(2);
    expect(rectificationCountFor(false, null, 3)).toBe(0);
  });

  it('invoicesTabBadge reads the snapshot count, else the live rows length or null', () => {
    expect(invoicesTabBadge(true, { invoiceCount: 9 }, [1])).toBe(9);
    expect(invoicesTabBadge(true, {}, [1])).toBe(0);
    expect(invoicesTabBadge(false, { invoiceCount: 9 }, [1, 2])).toBe(2);
    expect(invoicesTabBadge(false, null, null)).toBeNull();
  });

  it('detailTabFor hides only the snapshot-served invoices tab', () => {
    expect(detailTabFor(true, 'invoices')).toBeNull();
    expect(detailTabFor(true, 'incidents')).toBe('incidents');
    expect(detailTabFor(false, 'invoices')).toBe('invoices');
  });
});
