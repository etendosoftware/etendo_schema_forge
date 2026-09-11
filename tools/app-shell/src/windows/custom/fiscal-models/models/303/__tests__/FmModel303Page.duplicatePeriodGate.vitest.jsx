// Vitest tests for FmModel303Page's ETP-5187 duplicate-period gate:
// `requiresRectificativa` warns and blocks "Marcar como Presentado" when this
// declaration is a 2nd/Nth one for the same (model, year, period) — signaled
// by `decl._hasDuplicatePeriod` (set by FmListPage.jsx) — until the user
// checks "Autoliquidación rectificativa" themselves. See FmModel303Page.jsx's
// own comment above `requiresRectificativa` for the full rationale.

import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => ({ selectedOrg: { id: 'org-1' } }) }));
vi.mock('../../../fiscalModelsUtils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    formatAmount: (n) => (n == null ? '—' : String(n)),
    formatPeriod: (p) => p,
    computeBoxes303: vi.fn().mockResolvedValue(null),
    generate303File: vi.fn().mockResolvedValue({ ok: true }),
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
  SourcesTab: () => null,
  IncidentsTab: () => null,
}));
vi.mock('../FmBoxes303.jsx', () => ({
  default: () => React.createElement('div', { 'data-testid': 'fm-boxes-303' }, 'boxes'),
}));
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: () => React.createElement('div', { 'data-testid': 'PresentModal-mock' }, 'present-modal'),
  FileGenModal303: () => React.createElement('div', { 'data-testid': 'FileGenModal303-mock' }, 'filegen-modal'),
}));
vi.mock('@/components/attachments', () => ({
  AttachmentsTab: () => null,
  useAttachments: () => ({ upload: vi.fn() }),
}));
vi.mock('lucide-react', () => ({
  Download: () => null, OctagonAlert: () => null, TriangleAlert: () => null,
  CircleCheck: () => null, Calculator: () => null, Loader2: () => null,
  TrendingUp: () => null, TrendingDown: () => null, ClipboardCheck: () => null,
  ReceiptText: () => null, FileCheck: () => null,
}));

import FmModel303Page from '../FmModel303Page.jsx';

function makeDecl(overrides = {}) {
  return {
    id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
    status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
    _precomputed: null, boxes: null, sources: [], history: [],
    // tipo_declaracion always set here so the (separately covered)
    // required-field gate never interferes with these assertions.
    identification: { tipo_declaracion: 'I' },
    ...overrides,
  };
}

const defaultProps = { onBack: vi.fn(), onStatusChange: vi.fn() };

const submitBtn = () => Array.from(document.querySelectorAll('button'))
  .find(b => b.textContent.includes('fm.action.submit'));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FmModel303Page — duplicate-period banner', () => {
  it('shows the warning banner when this is a duplicate period and rectificativa is unchecked', () => {
    const decl = makeDecl({ _hasDuplicatePeriod: true });
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    expect(screen.getByText('fm.duplicate_period.warning')).toBeInTheDocument();
  });

  it('clears the banner once rectificativa is checked, even though _hasDuplicatePeriod is still true', () => {
    const decl = makeDecl({
      _hasDuplicatePeriod: true,
      identification: { tipo_declaracion: 'I', rectificativa: true, bank_iban: 'ES1234567890123456789012' },
    });
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    expect(screen.queryByText('fm.duplicate_period.warning')).not.toBeInTheDocument();
  });

  it('does not show the banner at all when there is no duplicate period', () => {
    const decl = makeDecl({ _hasDuplicatePeriod: false });
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    expect(screen.queryByText('fm.duplicate_period.warning')).not.toBeInTheDocument();
  });

  it('does not show the banner when _hasDuplicatePeriod is simply absent (undefined)', () => {
    const decl = makeDecl();
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    expect(screen.queryByText('fm.duplicate_period.warning')).not.toBeInTheDocument();
  });

  it('does not show the banner once the declaration is already submitted, even if still duplicate/unchecked', () => {
    const decl = makeDecl({ _hasDuplicatePeriod: true, status: 'submitted' });
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    expect(screen.queryByText('fm.duplicate_period.warning')).not.toBeInTheDocument();
  });
});

describe('FmModel303Page — duplicate-period gate blocks "Marcar como Presentado"', () => {
  it('blocks presenting and toasts the warning when rectificativa is unchecked', async () => {
    const { toast } = await import('sonner');
    const decl = makeDecl({ _hasDuplicatePeriod: true });
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    fireEvent.click(submitBtn());
    expect(screen.queryByTestId('PresentModal-mock')).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('fm.duplicate_period.warning');
  });

  it('allows presenting once rectificativa is checked', () => {
    const decl = makeDecl({
      _hasDuplicatePeriod: true,
      identification: { tipo_declaracion: 'I', rectificativa: true, bank_iban: 'ES1234567890123456789012' },
    });
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    fireEvent.click(submitBtn());
    expect(screen.getByTestId('PresentModal-mock')).toBeInTheDocument();
  });

  it('allows presenting normally when there is no duplicate period', () => {
    const decl = makeDecl({ _hasDuplicatePeriod: false });
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    fireEvent.click(submitBtn());
    expect(screen.getByTestId('PresentModal-mock')).toBeInTheDocument();
  });
});
