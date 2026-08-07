// ETP-4404 — FmModel349Page "Rectificaciones" tab: KPI, tab badge, table and
// compute-path refresh. Mocking conventions follow FmModel349Page.render.vitest.jsx
// (the Tabs mock here additionally surfaces each tab badge for assertions).
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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
    { className: 'test-kpi349', 'data-kpi-label': label },
    React.createElement('span', { className: 'test-kpi349-label' }, label),
    React.createElement('span', { className: 'test-kpi349-value' }, value)
  ),
  Tabs: ({ tabs, active, onSelect }) => React.createElement(
    'div',
    { role: 'tablist' },
    tabs.map(t => React.createElement(
      'button',
      {
        key: t.id, role: 'tab', 'aria-selected': String(t.id === active),
        'data-badge': t.badge == null ? '' : String(t.badge),
        onClick: () => onSelect(t.id),
      },
      t.label
    ))
  ),
  Banner: () => null,
}));
vi.mock('../../../FmTabContent.jsx', () => ({
  SourcesTab: () => null,
  IncidentsTab: () => null,
  FilesTab: () => null,
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
import { compute349Operators } from '../../../fiscalModelsUtils.js';

const RECTIF_ROW = {
  ref: 'NC-01',
  date: '2026-05-05',
  type: 'Venta',
  party: 'Acme Corp',
  nifIva: 'IT12345678901',
  originalRef: '10000067',
  declaredYear: '2025',
  declaredPeriod: '1T',
  baseProducts: '1500.00',
  baseServices: '250.50',
};

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

const rectifKpiValue = () =>
  document.querySelector('.test-kpi349[data-kpi-label="fm.m349.kpi.rectif"] .test-kpi349-value')?.textContent;

const rectifTab = () =>
  screen.getAllByRole('tab').find(b => b.textContent === 'fm.m349.tab.rectif');

beforeEach(() => vi.clearAllMocks());

// ── (a) precomputed rectifications ──────────────────────────────────────────

describe('FmModel349Page — rectifications from _precomputed', () => {
  it('KPI value and tab badge show the rectification count', () => {
    render(
      <FmModel349Page
        decl={makeDecl({ _precomputed: { rectifications: [RECTIF_ROW] } })}
        {...defaultProps}
      />
    );

    expect(rectifKpiValue()).toBe('1');
    expect(rectifTab()).toHaveAttribute('data-badge', '1');
  });

  it('clicking the Rectificaciones tab renders the full detail row', () => {
    const { container } = render(
      <FmModel349Page
        decl={makeDecl({ _precomputed: { rectifications: [RECTIF_ROW] } })}
        {...defaultProps}
      />
    );

    fireEvent.click(rectifTab());

    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    const text = rows[0].textContent;
    expect(text).toContain('2026-05-05');
    expect(text).toContain('NC-01');
    expect(text).toContain('Venta');
    expect(text).toContain('Acme Corp');
    expect(text).toContain('IT12345678901');
    expect(text).toContain('10000067');
    // Declared period is formatted "YYYY / PP"
    expect(text).toContain('2025 / 1T');
    // Both base amounts pass through formatAmount (mocked as String)
    expect(text).toContain('1500.00');
    expect(text).toContain('250.50');
  });

  it('a row without declaredYear renders the em-dash placeholder for the declared period', () => {
    const { container } = render(
      <FmModel349Page
        decl={makeDecl({
          _precomputed: {
            rectifications: [{ ...RECTIF_ROW, declaredYear: '', declaredPeriod: '' }],
          },
        })}
        {...defaultProps}
      />
    );

    fireEvent.click(rectifTab());
    const row = container.querySelector('tbody tr');
    expect(row.textContent).not.toContain('2025 / 1T');
    expect(row.textContent).toContain('—');
  });
});

// ── (b) empty state ──────────────────────────────────────────────────────────

describe('FmModel349Page — rectifications empty state', () => {
  it('KPI shows 0, tab has no badge and the tab shows the empty-state text', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);

    expect(rectifKpiValue()).toBe('0');
    expect(rectifTab()).toHaveAttribute('data-badge', '');

    fireEvent.click(rectifTab());
    expect(screen.getByText('fm.m349.rectif.empty')).toBeInTheDocument();
    expect(document.querySelector('tbody tr')).toBeNull();
  });
});

// ── (c) compute path ─────────────────────────────────────────────────────────

describe('FmModel349Page — compute result refreshes the rectifications tab', () => {
  it('Calcular applies compute349Operators().rectifications to KPI, badge and table', async () => {
    compute349Operators.mockResolvedValue({
      operators: [],
      invoices: [],
      rectifications: [RECTIF_ROW, { ...RECTIF_ROW, ref: 'NC-02', originalRef: '10000068' }],
    });
    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    expect(rectifKpiValue()).toBe('0');

    const recalc = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.compute'));
    fireEvent.click(recalc);

    await waitFor(() => expect(rectifKpiValue()).toBe('2'));
    expect(compute349Operators).toHaveBeenCalledTimes(1);
    expect(rectifTab()).toHaveAttribute('data-badge', '2');

    fireEvent.click(rectifTab());
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[1].textContent).toContain('NC-02');
  });
});
