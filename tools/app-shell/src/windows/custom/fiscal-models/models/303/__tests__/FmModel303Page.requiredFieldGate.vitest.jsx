// @covers tools/app-shell/src/windows/custom/fiscal-models/models/303/FmModel303Page.jsx
// @covers tools/app-shell/src/windows/custom/fiscal-models/models/303/fm303Layouts.js
// Vitest tests for FmModel303Page's ETP-5187 required-field pre-flight gate:
// blocks "Generar fichero 303" / "Marcar como Presentado" — including their
// button-level pre-checks, which must stop the modal from even opening — when
// a currently-visible required identification field (tipo_declaracion,
// bank_iban) is blank. The pure logic (getMissingRequiredFields/matchesVisibility)
// is covered directly in fm303Layouts.requiredFields.vitest.js; this file covers
// the actual UI wiring: the proactive toast, the click-time toast, and that the
// generate/present actions never reach the backend while blocked.
//
// ETP-5432 pt.10 follow-up — the persistent inline banner this suite used to assert
// on (`fm.validation.missing_required_banner` rendered unconditionally below the
// toolbar) was removed; that condition now fires `showMissingRequiredFieldsReminder`
// (a toast) from a mount-time effect instead, matching the missing-IAE guard's own
// toast-only feedback. `sonner` is mocked wholesale below (not just spied on), so
// the proactive-toast assertions check the mocked `toast.warning` call, not the DOM.

import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const navigateMock = vi.fn();
// Spy so a test can read the interpolation params (e.g. the `fields` list of a toast).
const tSpy = vi.hoisted(() => vi.fn((key) => key));

vi.mock('@/i18n', () => ({
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
  useUI: () => tSpy,
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
// Stubbed by default; a test that needs the real grid (inline error under the tipo select, a
// real box edit) flips `boxesMode.real` — the ETP-5597 box-69-turns-positive case below.
const boxesMode = vi.hoisted(() => ({ real: false }));
vi.mock('../FmBoxes303.jsx', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    default: (props) => (boxesMode.real
      ? React.createElement(actual.default, props)
      : React.createElement('div', { 'data-testid': 'fm-boxes-303' }, 'boxes')),
  };
});
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: () => React.createElement('div', { 'data-testid': 'PresentModal-mock' }, 'present-modal'),
  FileGenModal303: () => React.createElement('div', { 'data-testid': 'FileGenModal303-mock' }, 'filegen-modal'),
}));
vi.mock('@/components/attachments', () => ({
  AttachmentsTab: () => null,
  useAttachments: () => ({ upload: vi.fn() }),
}));
// ETP-5584 — FmBoxes303 renders the app's Radix Select; drive it as a native <select>.
vi.mock('@/components/ui/select', () => import('../../../__tests__/testUtils/nativeSelectMock.jsx'));
vi.mock('lucide-react', () => ({
  // ETP-5584 — the detail status chip renders lucide's Check for success tones.
  Check: () => null,
  Download: () => null, ArrowLeft: () => null, Save: () => null, OctagonAlert: () => null, TriangleAlert: () => null,
  CircleCheck: () => null, Calculator: () => null, Loader2: () => null,
  TrendingUp: () => null, TrendingDown: () => null, ClipboardCheck: () => null,
  ReceiptText: () => null, FileCheck: () => null, Pencil: () => null,
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
// ETP-5393 Bug E — bank_iban is only required via the rectificativa path when box 111
// (Rectificación - Importe) is ALSO non-zero (fm303Layouts.js's requiredWhen). This
// declaration used to seed a non-zero box 111 directly via `_precomputed.boxes: { 111: 500 }`.
// ETP-5431 pt.2 — box 111 is no longer a real stored value the mount-time `recomputeDerivedBoxes`
// pass-through would respect: it unconditionally OVERWRITES whatever `_precomputed.boxes` carries
// for box 111 with `computeBox111`'s formula result, so seeding it directly is silently discarded
// (see `fm303Layouts.computeBox111.vitest.js` / `FmModel303Page.box111Autocomplete.vitest.jsx`
// for the formula itself). To still land on a non-zero box 111 here, seed the UNDERLYING boxes
// the formula reads instead — box 68 (`reg_anual`) -> box 69 = 1000 (nothing else feeds box69
// in this fixture), box 70 (`a_deducir`) = 1500 -> box 71 = 1000 - 1500 = -500 (< 0). box69 is
// positive and 70 - 69 = 500 (> 0), so `computeBox111` lands on the SAME 500 the old direct seed
// used, keeping this fixture's expected value unchanged.
const DECL_MISSING_IBAN_VIA_RECTIFICATIVA = makeDecl(
  { tipo_declaracion: 'I', rectificativa: true },
  { _precomputed: { boxes: [{ num: 68, value: 1000 }, { num: 70, value: 1500 }] } },
);
const DECL_COMPLETE = makeDecl({ tipo_declaracion: 'I' });

const defaultProps = { onBack: vi.fn(), onStatusChange: vi.fn() };

const genBtn = () => Array.from(document.querySelectorAll('button'))
  .find(b => b.textContent.includes('fm.action.gen303'));
const submitBtn = () => Array.from(document.querySelectorAll('button'))
  .find(b => b.textContent.includes('fm.action.submit'));

beforeEach(() => {
  vi.clearAllMocks();
  boxesMode.real = false;
});

describe('FmModel303Page — required-field gate proactive toast', () => {
  it('fires the missing-required toast when tipo_declaracion is blank', async () => {
    const { toast } = await import('sonner');
    render(<FmModel303Page decl={DECL_MISSING_TIPO} {...defaultProps} />);
    expect(toast.warning).toHaveBeenCalledWith('fm.validation.missing_required_banner');
    // No fixed page fixture for this condition anymore, from any trigger.
    expect(screen.queryByText('fm.validation.missing_required_banner')).not.toBeInTheDocument();
  });

  it('fires the missing-required toast when bank_iban is blank and the bank section is visible', async () => {
    const { toast } = await import('sonner');
    render(<FmModel303Page decl={DECL_MISSING_IBAN} {...defaultProps} />);
    expect(toast.warning).toHaveBeenCalledWith('fm.validation.missing_required_banner');
  });

  it('does NOT fire the toast when every currently-required field is filled', async () => {
    const { toast } = await import('sonner');
    render(<FmModel303Page decl={DECL_COMPLETE} {...defaultProps} />);
    expect(toast.warning).not.toHaveBeenCalled();
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

// ── ETP-5597 pt.1 — tipo Compensación/Devolución with a positive casilla 71 ───────────────
// box 68 (reg_anual) = 1000 is the only input to box 69 in this fixture → box 69 = 1000 and,
// with 70/109/112 empty, box 71 (= 69 - 70 + 109 - 112) = 1000 > 0. Negative: both = -1000, so
// neither the 71 > 0 rule nor the "69 > 0 and 71 < 0" rule applies.
const POSITIVE_71 = { _precomputed: { boxes: [{ num: 68, value: 1000 }] } };
const NEGATIVE_71 = { _precomputed: { boxes: [{ num: 68, value: -1000 }] } };

describe('FmModel303Page — a negative-result tipo with box 71 positive blocks generate/present (ETP-5597)', () => {
  it.each(['C', 'V'])('tipo %s + box 71 > 0: "Generar fichero 303" toasts the reason and never opens the modal', async (tipo) => {
    const { toast } = await import('sonner');
    render(<FmModel303Page decl={makeDecl({ tipo_declaracion: tipo }, POSITIVE_71)} {...defaultProps} />);
    fireEvent.click(genBtn());
    expect(screen.queryByTestId('FileGenModal303-mock')).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('fm.ident.decl.disabled_positive_result');
    expect(generate303File).not.toHaveBeenCalled();
  });

  it('tipo C + box 71 > 0: "Registrar/Presentar" toasts the reason and never opens the modal', async () => {
    const { toast } = await import('sonner');
    render(<FmModel303Page decl={makeDecl({ tipo_declaracion: 'C' }, POSITIVE_71)} {...defaultProps} />);
    fireEvent.click(submitBtn());
    expect(screen.queryByTestId('PresentModal-mock')).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('fm.ident.decl.disabled_positive_result');
  });

  it('tipo I + box 71 > 0 is a valid combination — the generate modal opens', () => {
    render(<FmModel303Page decl={makeDecl({ tipo_declaracion: 'I' }, POSITIVE_71)} {...defaultProps} />);
    fireEvent.click(genBtn());
    expect(screen.getByTestId('FileGenModal303-mock')).toBeInTheDocument();
  });

  it('tipo C + box 69/71 < 0 is not blocked', async () => {
    const { toast } = await import('sonner');
    render(<FmModel303Page decl={makeDecl({ tipo_declaracion: 'C' }, NEGATIVE_71)} {...defaultProps} />);
    fireEvent.click(genBtn());
    expect(screen.getByTestId('FileGenModal303-mock')).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalledWith('fm.ident.decl.disabled_positive_result');
  });

  it('tipo C with no box 69/71 computed yet is not blocked', () => {
    render(<FmModel303Page decl={makeDecl({ tipo_declaracion: 'C' })} {...defaultProps} />);
    fireEvent.click(submitBtn());
    expect(screen.getByTestId('PresentModal-mock')).toBeInTheDocument();
  });
});

// ETP-5597 pt.1 — the transition case: tipo C chosen while box 71 is negative (valid), then
// box 71 turns positive through a box edit + recompute (box 68 feeds 69, which feeds 71). Uses the REAL FmBoxes303 grid.
describe('FmModel303Page — box 71 turning positive under tipo C (ETP-5597)', () => {
  function findCellByNum(container, num) {
    const padded = String(num).padStart(2, '0');
    return Array.from(container.querySelectorAll('.fm-aeat-cell')).find(
      (cell) => cell.querySelector('.fm-aeat-cell__num')?.textContent === padded,
    );
  }
  function editBox(container, num, rawValue) {
    fireEvent.click(findCellByNum(container, num).querySelector('.fm-aeat-cell__edit-btn'));
    const input = container.querySelector('.fm-aeat-cell__input');
    fireEvent.change(input, { target: { value: rawValue } });
    fireEvent.blur(input);
  }
  const tipoSelect = (container) => Array.from(container.querySelectorAll('select'))
    .find(sel => Array.from(sel.options).some(o => o.value === 'C'));

  const goToPage = (titleKey) => fireEvent.click(
    Array.from(document.querySelectorAll('button')).find(b => b.textContent === titleKey),
  );

  it('shows the inline error, blocks generate and keeps tipo C selected', async () => {
    const { toast } = await import('sonner');
    boxesMode.real = true;
    const { container } = render(
      <FmModel303Page decl={makeDecl({ tipo_declaracion: 'C' }, NEGATIVE_71)} {...defaultProps} />,
    );

    // Identificación page (default): box 71 negative, so tipo C is a valid choice — no error.
    expect(tipoSelect(container).value).toBe('C');
    expect(screen.queryByTestId('fm-aeat-ident-tipo_declaracion-error')).not.toBeInTheDocument();

    // Resultado final page: box 68 edited to +1000 → recompute makes box 69 = 71 = 1000 > 0.
    goToPage('fm.page.resultado_final');
    editBox(container, 68, '1000');
    expect(findCellByNum(container, 69).querySelector('.fm-aeat-cell__value').textContent).toContain('1000');

    goToPage('fm.page.identificacion');
    const error = screen.getByTestId('fm-aeat-ident-tipo_declaracion-error');
    expect(error.textContent).toBe('fm.ident.decl.disabled_positive_result');
    // Never cleared automatically: the user's choice stays, the declaration is blocked instead.
    expect(tipoSelect(container).value).toBe('C');
    expect(tipoSelect(container)).toHaveAttribute('aria-invalid', 'true');

    fireEvent.click(genBtn());
    expect(screen.queryByTestId('FileGenModal303-mock')).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('fm.ident.decl.disabled_positive_result');
    expect(generate303File).not.toHaveBeenCalled();
  });
});

// ── ETP-5597 (QA round 3) — 69 > 0 and 71 < 0: tipo is auto-set to Resultado cero ─────────
// box 68 = 1000 -> box 69 = 1000; box 70 = 1500 -> box 71 = 1000 - 1500 = -500.
const ZERO_ONLY_BOXES = { _precomputed: { boxes: [{ num: 68, value: 1000 }, { num: 70, value: 1500 }] } };

describe('FmModel303Page — the zero-only rule auto-selects Resultado cero (ETP-5597)', () => {
  const tipoSelect = (container) => Array.from(container.querySelectorAll('select'))
    .find(sel => Array.from(sel.options).some(o => o.value === 'C'));

  it('a draft with tipo I is switched to N silently (no error, no message) and generate is not blocked', async () => {
    const { toast } = await import('sonner');
    boxesMode.real = true;
    const { container } = render(
      <FmModel303Page decl={makeDecl({ tipo_declaracion: 'I' }, ZERO_ONLY_BOXES)} {...defaultProps} />,
    );
    expect(tipoSelect(container).value).toBe('N');
    expect(screen.queryByTestId('fm-aeat-ident-tipo_declaracion-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('fm-aeat-ident-tipo_declaracion-hint')).not.toBeInTheDocument();
    expect(toast.warning).not.toHaveBeenCalledWith('fm.ident.decl.disabled_zero_only');
    fireEvent.click(genBtn());
    expect(screen.getByTestId('FileGenModal303-mock')).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalledWith('fm.ident.decl.disabled_zero_only');
  });

  it('a submitted declaration keeps its stored tipo (never mutated) and shows no error', () => {
    boxesMode.real = true;
    const { container } = render(
      <FmModel303Page decl={makeDecl({ tipo_declaracion: 'I' }, { ...ZERO_ONLY_BOXES, status: 'submitted' })} {...defaultProps} />,
    );
    expect(tipoSelect(container).value).toBe('I');
    expect(screen.queryByTestId('fm-aeat-ident-tipo_declaracion-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('fm-aeat-ident-tipo_declaracion-hint')).not.toBeInTheDocument();
  });
  // Review W1 — the identification is read-only for every status but draft, so a `ready`
  // declaration must not get the invisible tipo edit either (an auto-save would persist it).
  it('a ready (non-draft) declaration keeps its stored tipo (no auto edit) and shows no error', () => {
    boxesMode.real = true;
    const { container } = render(
      <FmModel303Page decl={makeDecl({ tipo_declaracion: 'I' }, { ...ZERO_ONLY_BOXES, status: 'ready' })} {...defaultProps} />,
    );
    expect(tipoSelect(container).value).toBe('I');
    expect(screen.queryByTestId('fm-aeat-ident-tipo_declaracion-error')).not.toBeInTheDocument();
  });
});

// ── ETP-5597 pt.3 — the missing-fields toast names the field as it is labelled on screen ──
describe('FmModel303Page — missing-field names follow the dynamic label (ETP-5597)', () => {
  it('under marca SEPA 3 a blank IBAN is reported as "Cuenta bancaria"', () => {
    render(<FmModel303Page decl={makeDecl({
      tipo_declaracion: 'D', bank_sepa: '3', bank_swift_bic: 'X', bank_nombre: 'X',
      bank_direccion: 'X', bank_ciudad: 'X', bank_pais: 'CH',
    })} {...defaultProps} />);
    fireEvent.click(genBtn());
    expect(tSpy).toHaveBeenCalledWith('fm.validation.missing_required_generate', { fields: "'fm.ident.bank.account'" });
  });

  it('under marca SEPA 1 the same field is reported as "IBAN"', () => {
    render(<FmModel303Page decl={makeDecl({ tipo_declaracion: 'D', bank_sepa: '1' })} {...defaultProps} />);
    fireEvent.click(genBtn());
    expect(tSpy).toHaveBeenCalledWith('fm.validation.missing_required_generate', { fields: "'fm.ident.bank.iban'" });
  });
});

