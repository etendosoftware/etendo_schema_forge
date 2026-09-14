// Vitest tests for FmModel303Page's ETP-5187 required-field pre-flight gate:
// blocks "Generar fichero 303" / "Marcar como Presentado" — including their
// button-level pre-checks, which must stop the modal from even opening — when
// a currently-visible required identification field (tipo_declaracion,
// bank_iban) is blank. The pure logic (getMissingRequiredFields/matchesVisibility)
// is covered directly in fm303Layouts.requiredFields.vitest.js; this file covers
// the actual UI wiring: the persistent banner, the toast, and that the
// generate/present actions never reach the backend while blocked.

import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const navigateMock = vi.fn();

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
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
import { generate303File } from '../../../fiscalModelsUtils.js';

function makeDecl(identification, overrides = {}) {
  return {
    id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
    status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
    _precomputed: null, boxes: null, sources: [], history: [],
    identification,
    ...overrides,
  };
}

const DECL_MISSING_TIPO = makeDecl({});
const DECL_MISSING_IBAN = makeDecl({ tipo_declaracion: 'D' });
const DECL_MISSING_IBAN_VIA_RECTIFICATIVA = makeDecl({ tipo_declaracion: 'I', rectificativa: true });
const DECL_COMPLETE = makeDecl({ tipo_declaracion: 'I' });

const defaultProps = { onBack: vi.fn(), onStatusChange: vi.fn() };

const genBtn = () => Array.from(document.querySelectorAll('button'))
  .find(b => b.textContent.includes('fm.action.gen303'));
const submitBtn = () => Array.from(document.querySelectorAll('button'))
  .find(b => b.textContent.includes('fm.action.submit'));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FmModel303Page — required-field gate banner', () => {
  it('shows the missing-required banner when tipo_declaracion is blank', () => {
    render(<FmModel303Page decl={DECL_MISSING_TIPO} {...defaultProps} />);
    expect(screen.getByText('fm.validation.missing_required_banner')).toBeInTheDocument();
  });

  it('shows the missing-required banner when bank_iban is blank and the bank section is visible', () => {
    render(<FmModel303Page decl={DECL_MISSING_IBAN} {...defaultProps} />);
    expect(screen.getByText('fm.validation.missing_required_banner')).toBeInTheDocument();
  });

  it('does NOT show the banner when every currently-required field is filled', () => {
    render(<FmModel303Page decl={DECL_COMPLETE} {...defaultProps} />);
    expect(screen.queryByText('fm.validation.missing_required_banner')).not.toBeInTheDocument();
  });
});

describe('FmModel303Page — required-field gate blocks "Generar fichero 303"', () => {
  it('does not open FileGenModal303 and toasts an error when tipo_declaracion is blank', async () => {
    const { toast } = await import('sonner');
    render(<FmModel303Page decl={DECL_MISSING_TIPO} {...defaultProps} />);
    fireEvent.click(genBtn());
    expect(screen.queryByTestId('FileGenModal303-mock')).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('fm.validation.missing_required_generate');
    expect(generate303File).not.toHaveBeenCalled();
  });

  it('does not open FileGenModal303 when bank_iban is blank (tipo D, section visible)', async () => {
    const { toast } = await import('sonner');
    render(<FmModel303Page decl={DECL_MISSING_IBAN} {...defaultProps} />);
    fireEvent.click(genBtn());
    expect(screen.queryByTestId('FileGenModal303-mock')).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('fm.validation.missing_required_generate');
  });

  it('does not open FileGenModal303 when bank_iban is blank via rectificativa (tipo not U/D/X)', async () => {
    const { toast } = await import('sonner');
    render(<FmModel303Page decl={DECL_MISSING_IBAN_VIA_RECTIFICATIVA} {...defaultProps} />);
    fireEvent.click(genBtn());
    expect(screen.queryByTestId('FileGenModal303-mock')).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('fm.validation.missing_required_generate');
  });

  it('opens FileGenModal303 normally once every required field is filled', () => {
    render(<FmModel303Page decl={DECL_COMPLETE} {...defaultProps} />);
    fireEvent.click(genBtn());
    expect(screen.getByTestId('FileGenModal303-mock')).toBeInTheDocument();
  });
});

describe('FmModel303Page — required-field gate blocks "Marcar como Presentado"', () => {
  it('does not open PresentModal and toasts an error when tipo_declaracion is blank', async () => {
    const { toast } = await import('sonner');
    render(<FmModel303Page decl={DECL_MISSING_TIPO} {...defaultProps} />);
    fireEvent.click(submitBtn());
    expect(screen.queryByTestId('PresentModal-mock')).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('fm.validation.missing_required_present');
  });

  it('does not open PresentModal when bank_iban is blank (tipo D, section visible)', async () => {
    const { toast } = await import('sonner');
    render(<FmModel303Page decl={DECL_MISSING_IBAN} {...defaultProps} />);
    fireEvent.click(submitBtn());
    expect(screen.queryByTestId('PresentModal-mock')).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('fm.validation.missing_required_present');
  });

  it('opens PresentModal normally once every required field is filled', () => {
    render(<FmModel303Page decl={DECL_COMPLETE} {...defaultProps} />);
    fireEvent.click(submitBtn());
    expect(screen.getByTestId('PresentModal-mock')).toBeInTheDocument();
  });

  it('the required-field check runs before the requiresRectificativa check (tipo_declaracion wins first)', async () => {
    const { toast } = await import('sonner');
    const decl = makeDecl({}, { _hasDuplicatePeriod: true });
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    fireEvent.click(submitBtn());
    expect(toast.error).toHaveBeenCalledWith('fm.validation.missing_required_present');
    expect(toast.error).not.toHaveBeenCalledWith('fm.duplicate_period.warning');
  });
});
