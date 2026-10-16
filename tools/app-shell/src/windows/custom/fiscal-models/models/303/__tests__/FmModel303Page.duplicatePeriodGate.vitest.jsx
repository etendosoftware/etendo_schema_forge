// @covers tools/app-shell/src/windows/custom/fiscal-models/models/303/FmModel303Page.jsx
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
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
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
// ETP-5725 (reopened QA fix, critical regression) — exposes `identification` + `onIdentChange`
// (same minimal pattern as FmModel303Page.identChangeSyncsBox111.vitest.jsx's own mock) so the
// regression tests below can assert on the ACTUAL rendered `rectificativa` checkbox state, not
// just on the duplicate-period banner/toast — the regression was specifically that the detail
// page's `identChecks` initializer auto-checked the box on an ALREADY-SUBMITTED declaration.
vi.mock('../FmBoxes303.jsx', () => ({
  default: ({ identification, onIdentChange }) => React.createElement(
    'div',
    { 'data-testid': 'fm-boxes-303' },
    React.createElement('input', {
      type: 'checkbox',
      checked: !!identification?.rectificativa,
      'data-testid': 'rectificativa-cb',
      onChange: (e) => onIdentChange?.('rectificativa', e.target.checked),
    }),
  ),
}));
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: () => React.createElement('div', { 'data-testid': 'PresentModal-mock' }, 'present-modal'),
  // `onConfirm` exposed as a clickable button (mirrors PresentModal's own mock above) so tests
  // can drive the REAL `handleGenerate` — the Bug-1 corrective-consistency guard lives INSIDE
  // that function, not in the "Generar fichero" button's own onClick (which only opens this
  // modal), so a test must reach this confirm to exercise it.
  FileGenModal303: ({ onConfirm }) => React.createElement(
    'button',
    { 'data-testid': 'filegen-modal-confirm', onClick: () => onConfirm({}) },
    'confirm-filegen',
  ),
}));
vi.mock('@/components/attachments', () => ({
  AttachmentsTab: () => null,
  useAttachments: () => ({ upload: vi.fn() }),
}));
vi.mock('lucide-react', () => ({
  // ETP-5584 — the detail status chip shows DocumentStatusPill's Check icon for success tones.
  Check: () => null,
  Download: () => null, ArrowLeft: () => null, Save: () => null, OctagonAlert: () => null, TriangleAlert: () => null,
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
      identification: { tipo_declaracion: 'I', rectificativa: true, motivo_rectificacion: 'R', bank_iban: 'ES1234567890123456789012' },
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
    // ETP-5725 (reopened QA fix, Bug 1) — `_duplicatePeriodPresented: true` added to this
    // fixture: checking rectificativa is no longer enough on its own to present — AEAT requires
    // an ORDINARIA to already be PRESENTED for the period (see `correctiveWithoutPresentedOrdinaria`
    // in FmModel303Page.jsx), which this flag represents. The old fixture (no presented sibling
    // at all) is exactly Bug 1's own repro and is now covered separately, as a BLOCKED case, by
    // the "Guardar/Generar gated by corrective consistency" describe block below.
    const decl = makeDecl({
      _hasDuplicatePeriod: true,
      _duplicatePeriodPresented: true,
      identification: { tipo_declaracion: 'I', rectificativa: true, motivo_rectificacion: 'R', bank_iban: 'ES1234567890123456789012' },
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

// ETP-5725 — `decl._duplicatePeriodPresented` (narrower than `_hasDuplicatePeriod`: set by
// FmListPage.jsx only when a sibling for this period is already in the submitted family) makes
// the `identChecks` lazy initializer auto-default `rectificativa` to true for a brand-new,
// never-persisted draft — so the gate above never even fires, and presenting is allowed
// immediately without the user having to find/check the box themselves.
describe('FmModel303Page — ETP-5725 auto-default rectificativa on duplicatePeriodPresented', () => {
  it('auto-checks rectificativa (no warning banner, no toast, present allowed) for a fresh draft', async () => {
    const { toast } = await import('sonner');
    // motivo_rectificacion/bank_iban are only REQUIRED once rectificativa is checked (same
    // fields the pre-existing "allows presenting once rectificativa is checked" test above
    // supplies) — provided here so the generic required-field gate doesn't mask what this test
    // is actually about: the duplicate-period-specific gate/warning disappearing once the
    // auto-default kicks in. rectificativa itself is deliberately left unset so it comes from
    // the auto-default, not from this fixture.
    const decl = makeDecl({
      _hasDuplicatePeriod: true, _duplicatePeriodPresented: true,
      identification: { tipo_declaracion: 'I', motivo_rectificacion: 'R', bank_iban: 'ES1234567890123456789012' },
    });
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    expect(screen.queryByText('fm.duplicate_period.warning')).not.toBeInTheDocument();
    fireEvent.click(submitBtn());
    expect(toast.error).not.toHaveBeenCalledWith('fm.duplicate_period.warning');
    expect(screen.getByTestId('PresentModal-mock')).toBeInTheDocument();
  });

  it('does NOT auto-check rectificativa when _duplicatePeriodPresented is false (duplicate exists but sibling not submitted)', () => {
    const decl = makeDecl({ _hasDuplicatePeriod: true, _duplicatePeriodPresented: false });
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    // Same behavior as the pre-ETP-5725 gate tests above: still gated, warning still shows.
    expect(screen.getByText('fm.duplicate_period.warning')).toBeInTheDocument();
  });

  it('does NOT auto-check rectificativa when _duplicatePeriodPresented is absent (undefined)', () => {
    // Regression guard: a period with no prior declaration at all (no _hasDuplicatePeriod,
    // no _duplicatePeriodPresented) must keep the untouched default.
    const decl = makeDecl();
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    expect(screen.queryByText('fm.duplicate_period.warning')).not.toBeInTheDocument();
  });

  it('an explicit persisted rectificativa=false wins over the auto-default', () => {
    // A declaration that was already saved once with rectificativa explicitly unchecked keeps
    // that choice — the auto-default only applies to a NEVER-persisted value (undefined).
    const decl = makeDecl({
      _hasDuplicatePeriod: true,
      _duplicatePeriodPresented: true,
      identification: { tipo_declaracion: 'I', rectificativa: false },
    });
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    expect(screen.getByText('fm.duplicate_period.warning')).toBeInTheDocument();
  });
});

// ETP-5725 (reopened QA fix) — CRITICAL REGRESSION: the `identChecks` lazy initializer applied
// the SAME auto-default as the banner/present gate above, but with NO `decl.status === 'draft'`
// precondition. Repro: present an ordinaria (rectificativa never touched/saved, so it reads
// `undefined`), then present a sibling as rectificativa for the same period — OPENING the
// original, already-presented ordinaria re-triggered the auto-default and showed "Autoliquidación
// rectificativa" CHECKED on an already-submitted, correctly-ordinaria record. Confirmed
// display-only (no PUT is reachable from the locked/`isSubmitted` view — see
// `docs/generated-custom-windows/fiscal-models.md`), but still alarming and wrong. Fixed by
// gating the auto-default on `decl.status === 'draft'`, mirroring the identical fix already
// applied to `FmListPage.jsx`'s `resolveDeclTypeLabel` (Bug 3).
describe('FmModel303Page — ETP-5725 critical regression: identChecks never auto-defaults on a non-draft declaration', () => {
  it('renders rectificativa UNCHECKED for an already-submitted declaration, even with _duplicatePeriodPresented true and rectificativa never persisted', () => {
    const decl = makeDecl({
      status: 'submitted',
      _duplicatePeriodPresented: true,
      identification: { tipo_declaracion: 'I' }, // rectificativa deliberately absent/undefined
    });
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    expect(screen.getByTestId('rectificativa-cb').checked).toBe(false);
  });

  it('still renders rectificativa UNCHECKED for a "ready" (not yet submitted, but no longer draft) declaration under the same conditions', () => {
    const decl = makeDecl({
      status: 'ready',
      _duplicatePeriodPresented: true,
      identification: { tipo_declaracion: 'I' },
    });
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    expect(screen.getByTestId('rectificativa-cb').checked).toBe(false);
  });

  it('control: a genuine DRAFT still gets the auto-default checked under the same conditions', () => {
    const decl = makeDecl({
      status: 'draft',
      _duplicatePeriodPresented: true,
      identification: { tipo_declaracion: 'I' },
    });
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    expect(screen.getByTestId('rectificativa-cb').checked).toBe(true);
  });
});

// ETP-5725 (reopened QA fix) — Bug 1 / mirror rule: "Guardar" and "Generar fichero" must be
// gated by the same corrective/ordinaria consistency rule as "Registrar/Presentar"
// (`correctiveWithoutPresentedOrdinaria` / `ordinariaAlreadyPresented`). Backend is the
// authoritative gate; these are the UX-sugar frontend checks.
describe('FmModel303Page — ETP-5725 Guardar/Generar gated by corrective consistency', () => {
  it('blocks "Registrar/Presentar" (Bug 1\'s own repro) when rectificativa is checked with no presented ordinaria sibling at all', async () => {
    const { toast } = await import('sonner');
    const decl = makeDecl({
      _hasDuplicatePeriod: false,
      _duplicatePeriodPresented: false,
      identification: { tipo_declaracion: 'I', rectificativa: true, motivo_rectificacion: 'R', bank_iban: 'ES1234567890123456789012' },
    });
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    fireEvent.click(submitBtn());
    expect(toast.error).toHaveBeenCalledWith('fm.duplicate_period.requires_ordinaria');
    expect(screen.queryByTestId('PresentModal-mock')).not.toBeInTheDocument();
  });

  it('blocks "Guardar" and toasts when rectificativa is checked with no presented ordinaria sibling', async () => {
    const { toast } = await import('sonner');
    const decl = makeDecl({
      _hasDuplicatePeriod: false,
      _duplicatePeriodPresented: false,
      identification: { tipo_declaracion: 'I', rectificativa: true, motivo_rectificacion: 'R', bank_iban: 'ES1234567890123456789012' },
    });
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    fireEvent.click(screen.getByTestId('FmModel303Page__save'));
    expect(toast.error).toHaveBeenCalledWith('fm.duplicate_period.requires_ordinaria');
  });

  it('blocks "Generar fichero" for the same corrective-without-ordinaria case BEFORE the modal opens', async () => {
    const { toast } = await import('sonner');
    const decl = makeDecl({
      _hasDuplicatePeriod: false,
      _duplicatePeriodPresented: false,
      identification: { tipo_declaracion: 'I', rectificativa: true, motivo_rectificacion: 'R', bank_iban: 'ES1234567890123456789012' },
    });
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    // ETP-5725 (reopened QA fix, UX follow-up) — the "Generar fichero" button's own onClick now
    // blocks BEFORE opening FileGenModal303, not only inside handleGenerate (the modal's
    // onConfirm) — mirrors "Registrar/Presentar"'s own onClick pre-check. The modal must never
    // even mount here.
    fireEvent.click(screen.getByTestId('FmModel303Page__generate'));
    expect(toast.error).toHaveBeenCalledWith('fm.duplicate_period.requires_ordinaria');
    expect(screen.queryByTestId('filegen-modal-confirm')).not.toBeInTheDocument();
  });

  it('blocks "Guardar" as ordinaria when another ordinaria is already presented (mirror rule)', async () => {
    const { toast } = await import('sonner');
    const decl = makeDecl({
      _hasDuplicatePeriod: true,
      _duplicatePeriodPresented: true,
      identification: { tipo_declaracion: 'I', rectificativa: false },
    });
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    fireEvent.click(screen.getByTestId('FmModel303Page__save'));
    expect(toast.error).toHaveBeenCalledWith('fm.duplicate_period.ordinaria_exists');
  });

  it('allows "Guardar" for a plain ordinaria with no conflicting sibling', async () => {
    const { toast } = await import('sonner');
    const decl = makeDecl({ _hasDuplicatePeriod: false, _duplicatePeriodPresented: false });
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    fireEvent.click(screen.getByTestId('FmModel303Page__save'));
    expect(toast.error).not.toHaveBeenCalledWith('fm.duplicate_period.requires_ordinaria');
    expect(toast.error).not.toHaveBeenCalledWith('fm.duplicate_period.ordinaria_exists');
  });
});
