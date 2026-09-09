// ETP-5027 — "Operadores" and "Pendientes VIES" are DISTINCT counts, not row counts.
//
// The operators table is at (operator x AEAT key x regular/corrective) grain, so a
// declaration with two counterparties routinely produces six rows. Counting rows made
// the "Operadores" card read 6 for 2 counterparties, and made "Pendientes VIES" (plus
// the banner that echoes it) read 2 for a single NIF that appeared twice.
//
// The fixture below is the live declaration the defect was reported against: 6 rows,
// 2 operators (Italia x4 rows, Francia x2 rows), 3 of the 6 corrective, Francia's two
// rows BOTH pending VIES for the same NIF.
//
// Mocking conventions follow FmModel349Page.rectifications.vitest.jsx.
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    if (key === 'fm.m349.banner.vies_title') return `${params?.count} NIF-IVA con validación VIES pendiente`;
    if (key === 'fm.m349.banner.vies_sub') return 'Consulta en vivo al servicio VIES — informativa, no bloquea la declaración';
    return key;
  },
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
  MoreOptionsMenu: () => null,
  KpiWidget: ({ value, label, valueColor, badgeBg, badgeColor }) => React.createElement(
    'div',
    {
      className: 'test-kpi349',
      'data-kpi-label': label,
      'data-value-color': valueColor ?? '',
      'data-badge-bg': badgeBg ?? '',
      'data-badge-color': badgeColor ?? '',
    },
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
  FileCheck: () => null,
}));

import FmModel349Page from '../FmModel349Page.jsx';

// The reported declaration: 6 rows, 2 counterparties.
const ITALIA = { bpId: 'bp-it', nif: 'IT09449391218', name: 'Tercero Italia', vies: 'invalid' };
const FRANCIA = { bpId: 'bp-fr', nif: 'FR12487773327', name: 'Tercero Francia', vies: 'pending' };

const LIVE_OPERATORS = [
  { ...ITALIA,  key: 'E', base: '44.00',    rectificative: false },
  { ...ITALIA,  key: 'A', base: '1127.00',  rectificative: false },
  { ...ITALIA,  key: 'E', base: '-10.00',   rectificative: true  },
  { ...ITALIA,  key: 'A', base: '-5.00',    rectificative: true  },
  { ...FRANCIA, key: 'S', base: '2010.00',  rectificative: false },
  { ...FRANCIA, key: 'S', base: '-20.00',   rectificative: true  },
];

const makeDecl = (operators) => ({
  id: 'decl-349', model: '349', year: 2026, period: 'T1',
  type: 'ord', status: 'pending', nif: 'B12345678',
  operators: [], invoices: [], rectifications: [],
  incidents: { blocking: 0 },
  _precomputed: { operators },
});

const defaultProps = {
  onBack: vi.fn(),
  onStatusChange: vi.fn(),
  token: 'tok',
  apiBaseUrl: '/api',
};

const kpi = (label) => document.querySelector(`.test-kpi349[data-kpi-label="${label}"]`);
const kpiValue = (label) => kpi(label)?.querySelector('.test-kpi349-value')?.textContent;

const OPERATORS_KPI = 'fm.m349.kpi.operators';
const VIES_KPI = 'fm.m349.kpi.vies_pending';

beforeEach(() => vi.clearAllMocks());

describe('FmModel349Page — Operadores KPI counts distinct operators (ETP-5027)', () => {
  it('reads 2 for the reported 6-row / 2-counterparty declaration, NOT 6', () => {
    render(<FmModel349Page decl={makeDecl(LIVE_OPERATORS)} {...defaultProps} />);
    expect(kpiValue(OPERATORS_KPI)).toBe('2');
  });

  it('counts an operator that appears ONLY through a correction', () => {
    // Deliberately not solved by filtering correctives out: a counterparty that
    // shows up only via a correction is still a counterparty in the declaration.
    const ops = [
      { ...ITALIA, key: 'E', base: '44.00', rectificative: false },
      { ...FRANCIA, key: 'S', base: '-20.00', rectificative: true },
    ];
    render(<FmModel349Page decl={makeDecl(ops)} {...defaultProps} />);
    expect(kpiValue(OPERATORS_KPI)).toBe('2');
  });

  it('separates two operators that share a NIF, because identity is bpId', () => {
    const ops = [
      { bpId: 'bp-a', nif: 'IT09449391218', name: 'A', key: 'E', base: '10.00', vies: 'valid', rectificative: false },
      { bpId: 'bp-b', nif: 'IT09449391218', name: 'B', key: 'E', base: '20.00', vies: 'valid', rectificative: false },
    ];
    render(<FmModel349Page decl={makeDecl(ops)} {...defaultProps} />);
    expect(kpiValue(OPERATORS_KPI)).toBe('2');
  });

  it('falls back to nif/id for legacy rows that carry no bpId', () => {
    const ops = [
      { id: 1, nif: 'IT09449391218', name: 'A', key: 'E', base: '10.00', vies: 'valid', rectificative: false },
      { id: 2, nif: 'IT09449391218', name: 'A', key: 'A', base: '20.00', vies: 'valid', rectificative: false },
    ];
    render(<FmModel349Page decl={makeDecl(ops)} {...defaultProps} />);
    // Same nif, no bpId → one operator across its two AEAT keys.
    expect(kpiValue(OPERATORS_KPI)).toBe('1');
  });

  it('reads 0 when the declaration has no operator rows', () => {
    render(<FmModel349Page decl={makeDecl([])} {...defaultProps} />);
    expect(kpiValue(OPERATORS_KPI)).toBe('0');
  });
});

describe('FmModel349Page — Pendientes VIES counts distinct NIF-IVA (ETP-5027)', () => {
  it('reads 1 for the reported declaration: two pending ROWS, one pending NIF', () => {
    render(<FmModel349Page decl={makeDecl(LIVE_OPERATORS)} {...defaultProps} />);
    expect(kpiValue(VIES_KPI)).toBe('1');
  });

  it('counts a pending NIF that only appears on a corrective row', () => {
    const ops = [
      { ...ITALIA, key: 'E', base: '44.00', rectificative: false },
      { ...FRANCIA, key: 'S', base: '-20.00', rectificative: true },
    ];
    render(<FmModel349Page decl={makeDecl(ops)} {...defaultProps} />);
    expect(kpiValue(VIES_KPI)).toBe('1');
  });

  it('collapses two business partners that share one pending NIF into one validation', () => {
    // VIES validates the NIF-IVA, so duplicate BP records for one tax id are a
    // SINGLE validation to perform — this is why the VIES key is nif, not bpId.
    const ops = [
      { bpId: 'bp-a', nif: 'FR12487773327', name: 'A', key: 'S', base: '10.00', vies: 'pending', rectificative: false },
      { bpId: 'bp-b', nif: 'FR12487773327', name: 'B', key: 'S', base: '20.00', vies: 'pending', rectificative: false },
    ];
    render(<FmModel349Page decl={makeDecl(ops)} {...defaultProps} />);
    expect(kpiValue(VIES_KPI)).toBe('1');
  });

  it('normalizes case and surrounding whitespace before deduplicating the NIF', () => {
    const ops = [
      { bpId: 'bp-a', nif: 'fr12487773327 ', name: 'A', key: 'S', base: '10.00', vies: 'pending', rectificative: false },
      { bpId: 'bp-b', nif: 'FR12487773327', name: 'B', key: 'S', base: '20.00', vies: 'pending', rectificative: false },
    ];
    render(<FmModel349Page decl={makeDecl(ops)} {...defaultProps} />);
    expect(kpiValue(VIES_KPI)).toBe('1');
  });

  it('keeps NIF-less pending rows individually countable instead of collapsing them', () => {
    const ops = [
      { bpId: 'bp-a', nif: '', name: 'A', key: 'S', base: '10.00', vies: 'pending', rectificative: false },
      { bpId: 'bp-b', nif: '', name: 'B', key: 'S', base: '20.00', vies: 'pending', rectificative: false },
    ];
    render(<FmModel349Page decl={makeDecl(ops)} {...defaultProps} />);
    expect(kpiValue(VIES_KPI)).toBe('2');
  });

  it('ignores non-pending rows (valid and invalid VIES do not need validating)', () => {
    render(<FmModel349Page decl={makeDecl(LIVE_OPERATORS.filter(o => o.vies !== 'pending'))} {...defaultProps} />);
    expect(kpiValue(VIES_KPI)).toBe('0');
  });
});

describe('FmModel349Page — VIES banner (ETP-5027)', () => {
  it('shows the SAME corrected count as the KPI, not its own row count', () => {
    render(<FmModel349Page decl={makeDecl(LIVE_OPERATORS)} {...defaultProps} />);
    expect(kpiValue(VIES_KPI)).toBe('1');
    expect(screen.getByText('1 NIF-IVA con validación VIES pendiente')).toBeInTheDocument();
    expect(screen.queryByText('2 NIF-IVA con validación VIES pendiente')).not.toBeInTheDocument();
  });

  it('separates the two sentences instead of running them together', () => {
    render(<FmModel349Page decl={makeDecl(LIVE_OPERATORS)} {...defaultProps} />);
    const text = screen.getByText('1 NIF-IVA con validación VIES pendiente').parentElement.textContent;
    expect(text).toContain('pendiente. Consulta en vivo al servicio VIES');
    expect(text).not.toContain('pendiente Consulta');
  });

  it('stays hidden when nothing is pending', () => {
    render(<FmModel349Page decl={makeDecl(LIVE_OPERATORS.filter(o => o.vies !== 'pending'))} {...defaultProps} />);
    expect(screen.queryByText(/NIF-IVA con validación VIES pendiente/)).not.toBeInTheDocument();
  });

  it('keeps the Validar VIES action rendered and untouched', () => {
    // A separate investigation owns wiring this to real VIES validation — it must
    // not be removed or restyled as a side effect of the counting fix.
    render(<FmModel349Page decl={makeDecl(LIVE_OPERATORS)} {...defaultProps} />);
    expect(screen.getByText('fm.m349.banner.vies_action')).toBeInTheDocument();
  });
});

describe('FmModel349Page — Pendientes VIES severity tokens (ETP-5027)', () => {
  it('uses informational tokens, not destructive ones, while the check is pending', () => {
    render(<FmModel349Page decl={makeDecl(LIVE_OPERATORS)} {...defaultProps} />);
    const card = kpi(VIES_KPI);
    expect(card.getAttribute('data-value-color')).toBe('var(--status-info-fg)');
    expect(card.getAttribute('data-badge-bg')).toBe('var(--status-info-bg)');
    expect(card.getAttribute('data-badge-color')).toBe('var(--status-info-fg)');
    // The banner calls this check "informativa, no bloqueante" — red would contradict it.
    expect(card.outerHTML).not.toContain('destructive');
  });

  it('falls back to the neutral tokens when nothing is pending', () => {
    render(<FmModel349Page decl={makeDecl(LIVE_OPERATORS.filter(o => o.vies !== 'pending'))} {...defaultProps} />);
    const card = kpi(VIES_KPI);
    expect(card.getAttribute('data-value-color')).toBe('hsl(var(--foreground))');
    expect(card.getAttribute('data-badge-bg')).toBe('hsl(var(--muted))');
  });
});

describe('FmModel349Page — untouched neighbours (ETP-5027 regression guard)', () => {
  it('Total operaciones still sums regular rows only', () => {
    render(<FmModel349Page decl={makeDecl(LIVE_OPERATORS)} {...defaultProps} />);
    // 44 + 1127 + 2010 = 3181; the three corrective deltas must not net off.
    expect(kpiValue('fm.m349.kpi.total_ops')).toBe('3181');
  });

  it('the Operadores tab badge still reports the row count', () => {
    // Open question raised with the owner: the badge says 6 while the card now says
    // 2. Pinned deliberately so a change to it is a conscious decision, not drift.
    render(<FmModel349Page decl={makeDecl(LIVE_OPERATORS)} {...defaultProps} />);
    const tab = screen.getAllByRole('tab').find(b => b.textContent === 'fm.m349.tab.operators');
    expect(tab.getAttribute('data-badge')).toBe('6');
  });
});
