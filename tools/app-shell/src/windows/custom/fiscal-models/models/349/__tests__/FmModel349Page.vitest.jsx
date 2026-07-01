// Regression tests for FmModel349Page
// Bug 1: NaN when operator.base is a string ("2323.00" instead of a number)
// Bug 2: liveOperators not updated when decl._precomputed changes via polling

// ── Mocks (hoisted before imports) ───────────────────────────────────────────
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// Paths below are relative to THIS test file (__tests__/).
// Vitest normalizes both the mock path and the source import to the same
// absolute path, so they match correctly.

// fiscalModelsUtils.js lives at fiscal-models/ (3 levels up from __tests__/)
vi.mock('../../../fiscalModelsUtils.js', () => ({
  formatAmount: (n) => String(n),
  compute349Operators: vi.fn(),
  generate349File: vi.fn(),
}));

// use349Pdf.js lives at models/349/ (1 level up from __tests__/)
vi.mock('../use349Pdf.js', () => ({
  use349Pdf: () => ({
    pdfUrl: null,
    loading: false,
    generatePdf: vi.fn(),
    clearPdf: vi.fn(),
  }),
}));

// FmCommon.jsx lives at fiscal-models/ (3 levels up)
vi.mock('../../../FmCommon.jsx', () => ({
  StatusPillMenu: () => null,
  // KpiWidget must render the value prop so count/total KPI tests can read it.
  KpiWidget: ({ value, valueColor }) => (
    React.createElement('span', { className: 'test-kpi-value', style: { color: valueColor } }, value)
  ),
  Tabs: () => null,
  Banner: () => null,
}));

// FmOverlays.jsx lives at fiscal-models/ (3 levels up)
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: () => null,
  FileGenModal: () => null,
}));

// DocumentPreview.jsx: from __tests__/, 6 levels up reaches src/
vi.mock('../../../../../../components/contract-ui/DocumentPreview.jsx', () => ({
  DocumentPreview: () => null,
}));

// CSS module
vi.mock('../../../fiscal-models.css', () => ({}));

// FmTabContent.jsx lives at fiscal-models/ (3 levels up)
vi.mock('../../../FmTabContent.jsx', () => ({
  SourcesTab: () => null,
  IncidentsTab: () => null,
  FilesTab: () => null,
  HistoryTab: () => null,
}));

vi.mock('lucide-react', () => ({
  ArrowLeft: () => null,
  Download: () => null,
  FileDown: () => null,
  Play: () => null,
  OctagonAlert: () => null,
  CircleCheck: () => null,
  Search: () => null,
  RefreshCw: () => null,
  Globe: () => null,
  Eye: () => null,
  Lock: () => null,
  MoreVertical: () => null,
  ChevronDown: () => null,
  ChevronRight: () => null,
  Users: () => null,
  FileEdit: () => null,
  Clock: () => null,
  TriangleAlert: () => null,
  Folder: () => null,
  ReceiptText: () => null,
  Calculator: () => null,
  PenLine: () => null,
  ShieldAlert: () => null,
  Info: () => null,
  Star: () => null,
  ArrowUpRight: () => null,
  Loader2: () => null,
  TrendingUp: () => null,
  TrendingDown: () => null,
  FileText: () => null,
  Settings: () => null,
  ArrowLeftRight: () => null,
  Pencil: () => null,
  X: () => null,
  Check: () => null,
  Checkbox: () => null,
}));

// ── Imports ───────────────────────────────────────────────────────────────────
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import FmModel349Page from '../FmModel349Page.jsx';

// ── Fixture ───────────────────────────────────────────────────────────────────
const makeDecl = (overrides = {}) => ({
  id: 'decl-001',
  model: '349',
  year: 2026,
  period: 'T1',
  type: 'ord',
  status: 'pending',
  nif: 'B12345678',
  operators: [],
  invoices: [],
  rectifications: 0,
  incidents: { blocking: 0 },
  _precomputed: null,
  ...overrides,
});

const defaultProps = {
  onBack: vi.fn(),
  onStatusChange: vi.fn(),
  token: 'test-token',
  apiBaseUrl: '/api',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Bug 1: string bases must not produce NaN ──────────────────────────────────
describe('Bug 1 — totalBase with string operator.base values', () => {
  it('renders without crashing when operator.base is a string', () => {
    const decl = makeDecl({
      operators: [
        { id: 1, nif: 'IT12345678901', name: 'Bramini Vino S.r.l.', key: 'A', base: '1500.00', vies: 'valid' },
        { id: 2, nif: 'FR40123456789', name: 'Olives de Provence', key: 'A', base: '800.50', vies: 'valid' },
      ],
    });
    render(<FmModel349Page decl={decl} {...defaultProps} />);
    // Component must mount without throwing
  });

  it('does not display "NaN" in the total KPI when bases are strings', () => {
    const decl = makeDecl({
      operators: [
        { id: 1, nif: 'IT12345678901', name: 'Bramini Vino S.r.l.', key: 'A', base: '1500.00', vies: 'valid' },
        { id: 2, nif: 'FR40123456789', name: 'Olives de Provence', key: 'A', base: '800.50', vies: 'valid' },
      ],
    });
    render(<FmModel349Page decl={decl} {...defaultProps} />);

    // formatAmount mock returns String(n); if n is NaN the text is "NaN"
    // KPI values are rendered by the KpiWidget mock as .test-kpi-value spans.
    // The 2nd KpiWidget (index 1) receives formatAmount(totalBase) as value.
    const kpiValues = document.querySelectorAll('.test-kpi-value');
    kpiValues.forEach(el => {
      expect(el.textContent).not.toBe('NaN');
    });
  });

  it('computes a numeric total when bases are strings', () => {
    const decl = makeDecl({
      operators: [
        { id: 1, nif: 'IT12345678901', name: 'Bramini Vino S.r.l.', key: 'A', base: '1500.00', vies: 'valid' },
        { id: 2, nif: 'FR40123456789', name: 'Olives de Provence', key: 'A', base: '800.50', vies: 'valid' },
      ],
    });
    render(<FmModel349Page decl={decl} {...defaultProps} />);

    // KPI bar has 4 KpiWidgets: operators count, totalBase, rectifications, viesPending.
    // formatAmount mock: String(2300.5) = "2300.5" — parseable as a number.
    // Index 1 = totalBase KPI.
    const kpiValues = document.querySelectorAll('.test-kpi-value');
    expect(kpiValues.length).toBeGreaterThanOrEqual(2);
    const totalEl = kpiValues[1]; // 2nd KpiWidget = totalBase
    const rendered = totalEl.textContent.trim();
    expect(rendered).not.toBe('NaN');
    const parsed = parseFloat(rendered);
    expect(isNaN(parsed)).toBe(false);
    expect(parsed).toBeCloseTo(2300.5);
  });

  it('handles a mix of string and numeric bases without producing NaN', () => {
    const decl = makeDecl({
      operators: [
        { id: 1, nif: 'DE123456789', name: 'Bayern GmbH', key: 'E', base: '17600.00', vies: 'valid' },
        { id: 2, nif: 'PT501234567', name: 'Lusitana Lda', key: 'S', base: 650, vies: 'pending' },
      ],
    });
    render(<FmModel349Page decl={decl} {...defaultProps} />);

    const kpiValues = document.querySelectorAll('.test-kpi-value');
    expect(kpiValues.length).toBeGreaterThanOrEqual(2);
    const totalEl = kpiValues[1]; // 2nd KpiWidget = totalBase
    const rendered = totalEl.textContent.trim();
    expect(rendered).not.toBe('NaN');
    const parsed = parseFloat(rendered);
    expect(isNaN(parsed)).toBe(false);
    expect(parsed).toBeCloseTo(18250);
  });
});

// ── Bug 2: polling sync — liveOperators must update on prop change ────────────
describe('Bug 2 — liveOperators syncs when decl._precomputed changes', () => {
  const initialOps = [
    { id: 10, nif: 'IT12345678901', name: 'Operator A', key: 'A', base: '1000.00', vies: 'valid' },
    { id: 11, nif: 'FR40123456789', name: 'Operator B', key: 'E', base: '500.00', vies: 'valid' },
  ];

  const updatedOps = [
    { id: 10, nif: 'IT12345678901', name: 'Operator A', key: 'A', base: '1000.00', vies: 'valid' },
    { id: 11, nif: 'FR40123456789', name: 'Operator B', key: 'E', base: '500.00', vies: 'valid' },
    { id: 12, nif: 'DE123456789',   name: 'Operator C', key: 'S', base: '2000.00', vies: 'valid' },
  ];

  it('shows initial operator count from _precomputed', () => {
    const decl = makeDecl({ _precomputed: { operators: initialOps } });
    render(<FmModel349Page decl={decl} {...defaultProps} />);

    // KpiWidget mock renders .test-kpi-value spans. Index 0 = operators count.
    const kpiValues = document.querySelectorAll('.test-kpi-value');
    expect(kpiValues[0].textContent).toBe('2');
  });

  it('updates operator count KPI when _precomputed is replaced via rerender', () => {
    const decl = makeDecl({ _precomputed: { operators: initialOps } });
    const { rerender } = render(<FmModel349Page decl={decl} {...defaultProps} />);

    const getCountKpi = () => document.querySelectorAll('.test-kpi-value')[0];

    expect(getCountKpi().textContent).toBe('2');

    // Simulate polling update: parent passes new _precomputed with 3 operators
    const updatedDecl = makeDecl({ _precomputed: { operators: updatedOps } });
    rerender(<FmModel349Page decl={updatedDecl} {...defaultProps} />);

    // useEffect([decl._precomputed]) fires and calls setLiveOperators(updatedOps)
    expect(getCountKpi().textContent).toBe('3');
  });

  it('total KPI also reflects updated bases after polling sync', () => {
    const decl = makeDecl({ _precomputed: { operators: initialOps } });
    const { rerender } = render(<FmModel349Page decl={decl} {...defaultProps} />);

    // KpiWidget mock index 1 = totalBase
    const getTotalEl = () => document.querySelectorAll('.test-kpi-value')[1];

    // Initial: 1000 + 500 = 1500; formatAmount mock: String(1500) = "1500"
    expect(parseFloat(getTotalEl().textContent.trim())).toBeCloseTo(1500);

    // After polling update: 1000 + 500 + 2000 = 3500
    const updatedDecl = makeDecl({ _precomputed: { operators: updatedOps } });
    rerender(<FmModel349Page decl={updatedDecl} {...defaultProps} />);

    expect(parseFloat(getTotalEl().textContent.trim())).toBeCloseTo(3500);
  });

  it('falls back to decl.operators when _precomputed is null', () => {
    const fallbackOps = [
      { id: 20, nif: 'NL123456789B01', name: 'Amsterdam BV', key: 'I', base: '999.00', vies: 'valid' },
    ];
    const decl = makeDecl({ _precomputed: null, operators: fallbackOps });
    render(<FmModel349Page decl={decl} {...defaultProps} />);

    // KpiWidget index 0 = operators count; with 1 fallback operator → "1"
    const kpiValues = document.querySelectorAll('.test-kpi-value');
    expect(kpiValues[0].textContent).toBe('1');
  });
});

// ── Operator search filter ────────────────────────────────────────────────────
describe('Operator search — filter by name and NIF-IVA', () => {
  const ops = [
    { id: 1, nif: 'IT12345678901', name: 'Bramini Vino S.r.l.', key: 'A', base: '1000.00', vies: 'valid' },
    { id: 2, nif: 'FR40123456789', name: 'Olives de Provence',  key: 'E', base: '500.00',  vies: 'valid' },
    { id: 3, nif: 'DE123456789',   name: 'Bayern GmbH',         key: 'S', base: '2000.00', vies: 'valid' },
  ];

  // Helper: find the search input (no explicit type attr in the component)
  const getInput = (container) => container.querySelector('input');

  it('shows all operators when search is empty', () => {
    const decl = makeDecl({ _precomputed: { operators: ops } });
    const { container } = render(<FmModel349Page decl={decl} {...defaultProps} />);
    expect(container.querySelectorAll('tbody tr').length).toBe(3);
  });

  it('filters operators by name (case-insensitive)', () => {
    const decl = makeDecl({ _precomputed: { operators: ops } });
    const { container } = render(<FmModel349Page decl={decl} {...defaultProps} />);
    fireEvent.change(getInput(container), { target: { value: 'bramini' } });
    expect(container.querySelectorAll('tbody tr').length).toBe(1);
  });

  it('filters operators by NIF-IVA (case-insensitive)', () => {
    const decl = makeDecl({ _precomputed: { operators: ops } });
    const { container } = render(<FmModel349Page decl={decl} {...defaultProps} />);
    fireEvent.change(getInput(container), { target: { value: 'FR40' } });
    expect(container.querySelectorAll('tbody tr').length).toBe(1);
  });

  it('shows zero rows when search matches nothing', () => {
    const decl = makeDecl({ _precomputed: { operators: ops } });
    const { container } = render(<FmModel349Page decl={decl} {...defaultProps} />);
    fireEvent.change(getInput(container), { target: { value: 'xxxxxxxxxxx' } });
    expect(container.querySelectorAll('tbody tr').length).toBe(0);
  });
});
