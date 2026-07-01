// Additional Vitest tests for FmModel349Page — rendering, tabs, status, key filter
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));
vi.mock('../../../fiscalModelsUtils.js', () => ({
  formatAmount: (n) => (n == null ? '—' : String(n)),
  compute349Operators: vi.fn().mockResolvedValue(null),
  generate349File: vi.fn().mockResolvedValue(false),
}));
vi.mock('../use349Pdf.js', () => ({
  use349Pdf: () => ({
    pdfUrl: null,
    loading: false,
    generatePdf: vi.fn().mockResolvedValue(null),
    clearPdf: vi.fn(),
  }),
}));
vi.mock('../../../FmCommon.jsx', () => ({
  StatusPillMenu: () => null,
  KpiWidget: ({ value, label }) => React.createElement(
    'div',
    { className: 'test-kpi349' },
    React.createElement('span', { className: 'test-kpi349-label' }, label),
    React.createElement('span', { className: 'test-kpi349-value' }, value)
  ),
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
  SourcesTab: () => null,
  IncidentsTab: () => null,
  FilesTab: () => null,
  HistoryTab: () => null,
}));
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: () => null,
  FileGenModal: () => null,
}));
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
  OctagonAlert: () => null, ArrowLeft: () => null, FileText: () => null,
  Star: () => null, ArrowUpRight: () => null, Loader2: () => null, X: () => null, Check: () => null,
}));

import FmModel349Page from '../FmModel349Page.jsx';

const makeDecl = (overrides = {}) => ({
  id: 'decl-349', model: '349', year: 2026, period: 'T1',
  type: 'ord', status: 'pending', nif: 'B12345678',
  operators: [], invoices: [], rectifications: 0,
  incidents: { blocking: 0 }, _precomputed: null,
  ...overrides,
});

const defaultProps = {
  onBack: vi.fn(),
  onStatusChange: vi.fn(),
  token: 'tok',
  apiBaseUrl: '/api',
};

beforeEach(() => vi.clearAllMocks());

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('FmModel349Page — rendering', () => {
  it('renders without crashing', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    expect(document.body).toBeTruthy();
  });

  it('shows model 349 label', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    expect(document.body.textContent).toContain('349');
  });

  it('shows year in header', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    expect(document.body.textContent).toContain('2026');
  });

  it('renders the tab bar', () => {
    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    expect(container.querySelector('[role="tablist"]')).toBeTruthy();
  });

  it('renders KPI cards', () => {
    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    expect(container.querySelectorAll('.test-kpi349').length).toBeGreaterThan(0);
  });
});

// ── KPI values ────────────────────────────────────────────────────────────────

describe('FmModel349Page — KPI values', () => {
  it('shows 0 operator count initially when no operators', () => {
    render(<FmModel349Page decl={makeDecl({ operators: [] })} {...defaultProps} />);
    const values = document.querySelectorAll('.test-kpi349-value');
    expect(values[0].textContent).toBe('0');
  });

  it('shows operator count from _precomputed', () => {
    const ops = [
      { id: 1, nif: 'IT12345678901', name: 'Test', key: 'A', base: 100, vies: 'valid' },
      { id: 2, nif: 'FR40123456789', name: 'Test2', key: 'E', base: 200, vies: 'valid' },
    ];
    render(<FmModel349Page decl={makeDecl({ _precomputed: { operators: ops } })} {...defaultProps} />);
    const values = document.querySelectorAll('.test-kpi349-value');
    expect(values[0].textContent).toBe('2');
  });

  it('KPI totalBase is 0 when no operators', () => {
    render(<FmModel349Page decl={makeDecl({ operators: [] })} {...defaultProps} />);
    const values = document.querySelectorAll('.test-kpi349-value');
    // Index 1 = totalBase = formatAmount(0) = "0"
    expect(values[1].textContent).toBe('0');
  });

  it('shows VIES pending count', () => {
    const ops = [
      { id: 1, nif: 'IT123', name: 'A', key: 'A', base: 100, vies: 'pending' },
      { id: 2, nif: 'FR123', name: 'B', key: 'E', base: 200, vies: 'valid' },
    ];
    render(<FmModel349Page decl={makeDecl({ operators: ops })} {...defaultProps} />);
    const values = document.querySelectorAll('.test-kpi349-value');
    // Index 3 = viesPending = "1"
    expect(values[3].textContent).toBe('1');
  });
});

// ── Submit button ────────────────────────────────────────────────────────────

describe('FmModel349Page — submit button', () => {
  it('renders present button for non-submitted declarations', () => {
    render(<FmModel349Page decl={makeDecl({ status: 'draft' })} {...defaultProps} />);
    const btns = Array.from(document.querySelectorAll('button'));
    expect(btns.some(b => b.textContent.includes('fm.action.present'))).toBe(true);
  });

  it('does not render present button for submitted_ack declarations', () => {
    render(<FmModel349Page decl={makeDecl({ status: 'submitted_ack' })} {...defaultProps} />);
    const btns = Array.from(document.querySelectorAll('button'));
    expect(btns.some(b => b.textContent.includes('fm.action.present'))).toBe(false);
  });
});

// ── Operator table ───────────────────────────────────────────────────────────

describe('FmModel349Page — operator table', () => {
  const ops = [
    { id: 1, nif: 'IT12345678901', name: 'Bramini', key: 'A', base: 1000, vies: 'valid' },
    { id: 2, nif: 'FR40123456789', name: 'Olives', key: 'E', base: 500, vies: 'valid' },
  ];

  it('renders table rows for each operator', () => {
    const { container } = render(
      <FmModel349Page decl={makeDecl({ operators: ops })} {...defaultProps} />
    );
    expect(container.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('renders NIF column for each operator', () => {
    render(<FmModel349Page decl={makeDecl({ operators: ops })} {...defaultProps} />);
    expect(document.body.textContent).toContain('IT12345678901');
    expect(document.body.textContent).toContain('FR40123456789');
  });

  it('renders operator names', () => {
    render(<FmModel349Page decl={makeDecl({ operators: ops })} {...defaultProps} />);
    expect(document.body.textContent).toContain('Bramini');
    expect(document.body.textContent).toContain('Olives');
  });
});

// ── Key filter ───────────────────────────────────────────────────────────────

describe('FmModel349Page — key filter', () => {
  const ops = [
    { id: 1, nif: 'IT123', name: 'A-op', key: 'A', base: 100, vies: 'valid' },
    { id: 2, nif: 'FR123', name: 'E-op', key: 'E', base: 200, vies: 'valid' },
    { id: 3, nif: 'DE123', name: 'S-op', key: 'S', base: 300, vies: 'valid' },
  ];

  it('shows all operators with "all" key filter (default)', () => {
    const { container } = render(
      <FmModel349Page decl={makeDecl({ operators: ops })} {...defaultProps} />
    );
    expect(container.querySelectorAll('tbody tr').length).toBe(3);
  });
});

// ── VIES banner ───────────────────────────────────────────────────────────────

describe('FmModel349Page — VIES banner', () => {
  it('shows VIES banner when there are pending operators', () => {
    const ops = [{ id: 1, nif: 'IT123', name: 'A', key: 'A', base: 100, vies: 'pending' }];
    render(<FmModel349Page decl={makeDecl({ operators: ops })} {...defaultProps} />);
    expect(document.body.textContent).toContain('fm.m349.banner.vies_title');
  });

  it('does not show VIES banner when all operators have valid VIES', () => {
    const ops = [{ id: 1, nif: 'IT123', name: 'A', key: 'A', base: 100, vies: 'valid' }];
    render(<FmModel349Page decl={makeDecl({ operators: ops })} {...defaultProps} />);
    expect(document.body.textContent).not.toContain('fm.m349.banner.vies_title');
  });
});

// ── TotalsCard ────────────────────────────────────────────────────────────────

describe('FmModel349Page — totals card', () => {
  it('renders the totals card title', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    expect(document.body.textContent).toContain('fm.m349.totals.title');
  });

  it('renders total rows for each KEY_ID (E, S, A, I)', () => {
    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    const rows = container.querySelectorAll('.fm-349-total-row');
    expect(rows.length).toBe(4); // E, S, A, I
  });
});
