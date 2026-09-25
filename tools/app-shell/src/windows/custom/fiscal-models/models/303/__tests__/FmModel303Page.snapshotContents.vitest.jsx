import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, waitFor, fireEvent, screen } from '@testing-library/react';

const navigateMock = vi.fn();

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
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
  Tabs: ({ tabs, onSelect }) => React.createElement('div', null, tabs.map(tab => React.createElement(
    'button', { key: tab.id, 'data-testid': `tab-${tab.id}`, onClick: () => onSelect(tab.id) },
    `${tab.id}:${tab.badge ?? ''}`,
  ))),
  Banner: () => null,
  SectionCard: () => null,
  EmptyState: () => null,
  KpiWidget: ({ value, label }) => React.createElement(
    'div', { className: 'test-kpi303', 'data-kpi-label': label },
    React.createElement('span', { className: 'test-kpi303-value' }, value),
  ),
}));
vi.mock('../../../FmTabContent.jsx', () => ({
  SourcesTab: () => React.createElement('div', { 'data-testid': 'sources-tab' }),
  IncidentsTab: () => null,
}));
vi.mock('../FmBoxes303.jsx', () => ({
  default: ({ readOnly }) => React.createElement(
    'div', { 'data-testid': 'fm-boxes-303', 'data-readonly': String(!!readOnly) }, 'boxes'
  ),
}));
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: () => null,
  FileGenModal303: () => null,
}));
vi.mock('lucide-react', () => ({
  Settings: () => null, Download: () => null, ArrowLeft: () => null, Save: () => null, OctagonAlert: () => null,
  TriangleAlert: () => null, CircleCheck: () => null, ArrowLeftRight: () => null,
  Calculator: () => null, Loader2: () => null, MoreVertical: () => null,
  TrendingUp: () => null, TrendingDown: () => null, Clock: () => null,
  ClipboardCheck: () => null, ReceiptText: () => null, Folder: () => null,
  FileCheck: () => null, Landmark: () => null,
}));

import FmModel303Page, { submittedSnapshotOf, isSnapshotServed303, invoiceCountFor, sourcesTabBadge } from '../FmModel303Page.jsx';

// ETP-5438 scope decision — the submission snapshot keeps only the figures (boxes + summary) and
// the invoice COUNT (`sourceCount`), never the per-invoice `sources`. A declaration served from it
// must show a note instead of the invoice drilldown, never compute to fill it, and pick up a
// snapshot that arrives after mount (telematic filing, QA BUG-2).
const makeDecl = (overrides = {}) => ({
  id: 'decl-303-contents', model: '303', year: 2026, period: 'T3', type: 'ord',
  status: 'submitted', result: null, incidents: { blocking: 0, warning: 0 },
  _precomputed: null, boxes: null, history: [],
  identification: { tipo_declaracion: 'I' },
  ...overrides,
});
const strippedSnapshot = {
  boxes: { 27: 500, 29: 100, 45: 100, 46: 400 },
  summary: { accrued: 500, deductible: 100, result: 400 },
  sourceCount: 3,
};
const props = { onBack: vi.fn(), onStatusChange: vi.fn(), token: 'tok', apiBaseUrl: '/api' };
const kpis = (container) => [...container.querySelectorAll('.test-kpi303-value')].map(n => n.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('FmModel303Page — figures-only submission snapshot (ETP-5438)', () => {
  it('shows the "not kept" note in Facturas with the snapshot count as badge, never computing', async () => {
    const { computeBoxes303 } = await import('../../../fiscalModelsUtils.js');
    const { container } = render(<FmModel303Page decl={makeDecl({ submittedSnapshot: strippedSnapshot })} {...props} />);

    await waitFor(() => expect(kpis(container)).toContain('500'));
    expect(screen.getByTestId('tab-sources').textContent).toBe('sources:3');
    fireEvent.click(screen.getByTestId('tab-sources'));

    expect(screen.getByTestId('fm-snapshot-no-invoice-detail').textContent)
      .toBe('fm.snapshot.invoice_detail_not_kept');
    expect(screen.queryByTestId('sources-tab')).toBeNull();
    expect(computeBoxes303).not.toHaveBeenCalled();
  });

  it('a legacy submitted declaration (no snapshot) keeps the invoice list', async () => {
    render(<FmModel303Page decl={makeDecl({
      _precomputed: { boxes: { 27: 10 }, summary: { accrued: 10, deductible: 0, result: 10 }, sources: [{ ref: 'A' }] },
    })} {...props} />);

    fireEvent.click(screen.getByTestId('tab-sources'));

    expect(screen.getByTestId('sources-tab')).toBeTruthy();
    expect(screen.queryByTestId('fm-snapshot-no-invoice-detail')).toBeNull();
  });

  it('applies a snapshot delivered after mount (telematic filing refresh) without computing', async () => {
    const { computeBoxes303 } = await import('../../../fiscalModelsUtils.js');
    const before = makeDecl({
      status: 'submitted_ack',
      _precomputed: { boxes: { 27: 10 }, summary: { accrued: 10, deductible: 0, result: 10 }, sources: [] },
    });
    const { container, rerender } = render(<FmModel303Page decl={before} {...props} />);
    await waitFor(() => expect(kpis(container)).toContain('10'));

    rerender(<FmModel303Page decl={{ ...before, submittedSnapshot: strippedSnapshot }} {...props} />);

    await waitFor(() => expect(kpis(container)).toContain('500'));
    expect(computeBoxes303).not.toHaveBeenCalled();
  });
});

describe('FmModel303Page snapshot helpers (ETP-5438)', () => {
  it('submittedSnapshotOf returns the object snapshot, else null', () => {
    const snap = { boxes: {} };
    expect(submittedSnapshotOf({ submittedSnapshot: snap })).toBe(snap);
    expect(submittedSnapshotOf({ submittedSnapshot: null })).toBeNull();
    expect(submittedSnapshotOf({ submittedSnapshot: '{"boxes":{}}' })).toBeNull();
    expect(submittedSnapshotOf({})).toBeNull();
  });

  it('isSnapshotServed303 needs a submitted status AND snapshot boxes', () => {
    expect(isSnapshotServed303(true, { boxes: {} })).toBe(true);
    expect(isSnapshotServed303(false, { boxes: {} })).toBe(false);
    expect(isSnapshotServed303(true, { summary: {} })).toBe(false);
    expect(isSnapshotServed303(true, null)).toBe(false);
  });

  it('invoiceCountFor reads sourceCount when snapshot-served, else the rows', () => {
    expect(invoiceCountFor(true, { sourceCount: 7 }, [])).toBe(7);
    expect(invoiceCountFor(true, { sourceCount: 'x' }, [1, 2])).toBe(0);
    expect(invoiceCountFor(true, {}, [1, 2])).toBe(0);
    expect(invoiceCountFor(false, { sourceCount: 7 }, [1, 2])).toBe(2);
  });

  it('sourcesTabBadge shows the count when snapshot-served, else the rows length or null', () => {
    expect(sourcesTabBadge(true, 7, undefined)).toBe(7);
    expect(sourcesTabBadge(false, 7, [1, 2, 3])).toBe(3);
    expect(sourcesTabBadge(false, 7, undefined)).toBeNull();
  });
});
