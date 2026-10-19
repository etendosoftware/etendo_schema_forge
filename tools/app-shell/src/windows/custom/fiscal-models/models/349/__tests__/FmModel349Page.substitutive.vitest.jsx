// @covers tools/app-shell/src/windows/custom/fiscal-models/models/349/FmModel349Page.jsx
// @covers tools/app-shell/src/windows/custom/fiscal-models/formerStatement.js
//
// ETP-5456 — "349 sustitutivas": the substitute flag lives on the declaration form, persisted as
// `manualData.identification.sustitutiva` and flushed by the real "Guardar" button — mirroring
// the 303 "Autoliquidación rectificativa" convention.
//
// ETP-5597 — the checkbox next to the key filter was replaced by a "Tipo" segmented control
// [Normal | Sustitutiva] in the header action bar (`DeclarationTypeControl`). While Sustitutiva
// is selected a banner (`SubstitutiveBanner`) hosts the 13-character former-declaration
// identifier, persisted as `manualData.identification.formerStatement`; "Registrar/Presentar"
// stays disabled until it is exactly 13 DIGITS (`isValidFormerStatement`, shared with
// FileGenModal). While a save / present / generate is in flight every editing and action
// control is locked, and a double confirm starts only one save + one action. "Generar fichero" and "Registrar/Presentar"
// flush unsaved edits first (same write path as "Guardar") and abort on a failed save.
//
// Mocking conventions mirror FmModel349Page.render.vitest.jsx.
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Receipt tab out of scope here — stub the attachments boundary (see the helper).
vi.mock('@/components/attachments', () => import('../../../__tests__/testUtils/attachmentsBoundaryMock.js'));
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock('../../../fiscalModelsUtils.js', () => ({
  formatAmount: (n) => (n == null ? '—' : String(n)),
  compute349Operators: vi.fn().mockResolvedValue(null),
  generate349File: vi.fn().mockResolvedValue({ ok: false }),
  persistManualData: vi.fn().mockResolvedValue({ ok: true }),
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
}));
// FileGenModal echoes the `substitutive`/`formerStatement` props it received via data
// attributes, and both modals expose a confirm button that calls `onConfirm` — so tests drive the
// page's own handleGenerate/handlePresent without depending on FmOverlays.jsx's internals
// (covered separately in FmOverlays.vitest.jsx).
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: ({ onConfirm }) => React.createElement(
    'button',
    { type: 'button', 'data-testid': 'PresentModal-confirm', onClick: () => onConfirm({ status: 'submitted' }) },
    'present-confirm',
  ),
  FileGenModal: ({ substitutive, formerStatement, onConfirm }) => React.createElement(
    'button',
    {
      type: 'button',
      'data-testid': 'FileGenModal-mock',
      'data-substitutive': String(!!substitutive),
      'data-former-statement': formerStatement ?? '',
      onClick: () => onConfirm({ phone: '', contact: '', formerStatement: substitutive ? formerStatement : undefined }),
    },
    'filegen-modal',
  ),
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
  OctagonAlert: () => null, ArrowLeft: () => null, Save: () => null, FileText: () => null,
  Star: () => null, ArrowUpRight: () => null, Loader2: () => null, X: () => null, Check: () => null,
  FileCheck: () => null,
}));

import FmModel349Page from '../FmModel349Page.jsx';
import { persistManualData, generate349File } from '../../../fiscalModelsUtils.js';
import { toast } from 'sonner';
import { isValidFormerStatement, sanitizeFormerStatementInput } from '../../../formerStatement.js';

const makeDecl = (overrides = {}) => ({
  id: 'decl-349', model: '349', year: 2026, period: 'T1',
  type: 'ord', status: 'draft', nif: 'B12345678',
  operators: [], invoices: [], rectifications: 0,
  incidents: { blocking: 0 }, _precomputed: null,
  ...overrides,
});

const defaultProps = {
  onBack: vi.fn(),
  onStatusChange: vi.fn(),
  onManualDataSaved: vi.fn(),
  token: 'tok',
  apiBaseUrl: '/api',
};

// NOTE (ETP-5725, reopened QA fix) — deliberately NOT defaulting `_duplicatePeriodPresented` to
// true here: it also drives `lockNormalOption` (a DIFFERENT ETP-5725-round-1 feature), so a
// blanket default here would silently change the "Normal" button's disabled state for every
// OTHER test using this fixture, most of which have nothing to do with the corrective-consistency
// guard. Tests that specifically need a presented-ordinaria sibling (to exercise the save/
// present/generate guard's success path) pass `{ _duplicatePeriodPresented: true }` as an
// explicit override instead — see the "Guardar/Generar/Presentar gated" and the flush/in-flight
// describe blocks below.
const SUSTITUTIVA_DECL = (identification = {}, overrides = {}) =>
  makeDecl({ manualData: { identification: { sustitutiva: true, ...identification } }, ...overrides });

beforeEach(() => vi.clearAllMocks());

const normalBtn = () => screen.getByTestId('FmModel349Page__type_normal');
const sustitutivaBtn = () => screen.getByTestId('FmModel349Page__type_sustitutiva');
const banner = () => screen.queryByTestId('FmModel349Page__substitutiveBanner');
const formerInput = () => screen.getByTestId('FmModel349Page__formerStatement');
const presentBtn = () => screen.getByTestId('FmModel349Page__present');
const genBtn = (container) => Array.from(container.querySelectorAll('button'))
  .find(b => b.textContent.includes('fm.action.gen349'));

describe('FmModel349Page — Tipo segmented control (ETP-5597)', () => {
  it('renders Normal | Sustitutiva as a radiogroup in the header action bar', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    const group = screen.getByRole('radiogroup', { name: 'fm.m349.type.label' });
    expect(group).toContainElement(normalBtn());
    expect(group).toContainElement(sustitutivaBtn());
    expect(normalBtn().textContent).toBe('fm.m349.type.normal');
    expect(sustitutivaBtn().textContent).toBe('fm.m349.type.substitutive');
    // The old checkbox next to the key filter is gone.
    expect(screen.queryByTestId('FmModel349Page__sustitutiva')).toBeNull();
  });

  it('defaults to Normal when the declaration has no manualData — no banner', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    expect(normalBtn().getAttribute('aria-checked')).toBe('true');
    expect(sustitutivaBtn().getAttribute('aria-checked')).toBe('false');
    expect(banner()).toBeNull();
  });

  it.each([true, 'Y'])('is pre-selected as Sustitutiva when manualData.identification.sustitutiva is %s', (flag) => {
    render(<FmModel349Page decl={makeDecl({ manualData: { identification: { sustitutiva: flag } } })} {...defaultProps} />);
    expect(sustitutivaBtn().getAttribute('aria-checked')).toBe('true');
    expect(banner()).not.toBeNull();
  });

  it('switching to Sustitutiva shows the banner immediately (before any save); back to Normal hides it', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    fireEvent.click(sustitutivaBtn());
    expect(sustitutivaBtn().getAttribute('aria-checked')).toBe('true');
    expect(banner()).not.toBeNull();
    expect(persistManualData).not.toHaveBeenCalled();

    fireEvent.click(normalBtn());
    expect(normalBtn().getAttribute('aria-checked')).toBe('true');
    expect(banner()).toBeNull();
  });

  it('both options are disabled once the declaration is submitted', () => {
    render(<FmModel349Page decl={SUSTITUTIVA_DECL({}, { status: 'submitted' })} {...defaultProps} />);
    expect(normalBtn().disabled).toBe(true);
    expect(sustitutivaBtn().disabled).toBe(true);
    expect(sustitutivaBtn().getAttribute('aria-checked')).toBe('true');
    expect(formerInput().disabled).toBe(true);
  });

  it('threads the selected Tipo and the identifier into FileGenModal', () => {
    // ETP-5725 (reopened QA fix) — `_duplicatePeriodPresented: true` needed so the new
    // corrective-consistency pre-check on the Generar button's onClick doesn't block this
    // (unrelated) test: it's about what gets threaded into the modal, not about that guard.
    const { container } = render(<FmModel349Page decl={makeDecl({ _duplicatePeriodPresented: true })} {...defaultProps} />);
    fireEvent.click(sustitutivaBtn());
    fireEvent.change(formerInput(), { target: { value: '3490000000001' } });
    fireEvent.click(genBtn(container));

    const modal = screen.getByTestId('FileGenModal-mock');
    expect(modal.getAttribute('data-substitutive')).toBe('true');
    expect(modal.getAttribute('data-former-statement')).toBe('3490000000001');
  });
});

describe('FmModel349Page — substitutive banner + identifier (ETP-5597)', () => {
  it('renders title, subtitle and a 13-char identifier input pre-filled from manualData', () => {
    render(<FmModel349Page decl={SUSTITUTIVA_DECL({ formerStatement: '3490000000001' })} {...defaultProps} />);
    expect(banner().textContent).toContain('fm.m349.substitutive_banner.title');
    expect(banner().textContent).toContain('fm.m349.substitutive_banner.sub');
    expect(formerInput().value).toBe('3490000000001');
    expect(formerInput().getAttribute('maxLength')).toBe('13');
    expect(formerInput().getAttribute('aria-label')).toBe('fm.m349.substitutive_banner.former_statement');
  });

  it.each([
    ['', true],
    ['123456789012', true],
    ['1234567890123', false],
    ['  123456789012  ', true],
    // The input strips non-digits, so letters never reach the rule…
    ['ABCDEFGHIJKLM', true],
    // …and separators typed/pasted around 13 digits are dropped, leaving a valid identifier.
    ['349-000 000000-1', false],
  ])('Registrar/Presentar with identifier %j → disabled=%s', (value, disabled) => {
    render(<FmModel349Page decl={SUSTITUTIVA_DECL()} {...defaultProps} />);
    fireEvent.change(formerInput(), { target: { value } });
    expect(presentBtn().disabled).toBe(disabled);
    expect(presentBtn().getAttribute('title')).toBe(disabled ? 'fm.m349.present_disabled.former_statement' : null);
  });

  it('the identifier input is numeric and keeps digits only', () => {
    render(<FmModel349Page decl={SUSTITUTIVA_DECL()} {...defaultProps} />);
    expect(formerInput().getAttribute('inputMode')).toBe('numeric');
    fireEvent.change(formerInput(), { target: { value: 'ab12-34 5' } });
    expect(formerInput().value).toBe('12345');
  });

  it('a persisted identifier with a non-digit character keeps Registrar/Presentar disabled', () => {
    render(<FmModel349Page decl={SUSTITUTIVA_DECL({ formerStatement: '349000000000A' })} {...defaultProps} />);
    expect(presentBtn().disabled).toBe(true);
    expect(presentBtn().getAttribute('title')).toBe('fm.m349.present_disabled.former_statement');
    // ETP-5584 — the core Button's `disabled:pointer-events-none` would swallow the hover that
    // shows that title; FmDetailButton re-enables pointer events (jsdom cannot hover).
    expect(presentBtn().className).toContain('disabled:pointer-events-auto');
    expect(presentBtn().className).toContain('disabled:cursor-not-allowed');
  });

  it('Registrar/Presentar is enabled for a Normal declaration even without identifier', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    expect(presentBtn().disabled).toBe(false);
  });

  it('switching back to Normal re-enables Registrar/Presentar even with a short identifier left behind', () => {
    render(<FmModel349Page decl={SUSTITUTIVA_DECL({ formerStatement: '12' })} {...defaultProps} />);
    expect(presentBtn().disabled).toBe(true);
    fireEvent.click(normalBtn());
    expect(presentBtn().disabled).toBe(false);
  });
});

describe('FmModel349Page — Guardar flushes manualData (ETP-5456)', () => {
  it('makes a real PUT via persistManualData with Tipo + identifier, then updates the list cache', async () => {
    const onManualDataSaved = vi.fn();
    render(<FmModel349Page decl={makeDecl({ _duplicatePeriodPresented: true })} {...defaultProps} onManualDataSaved={onManualDataSaved} />);
    fireEvent.click(sustitutivaBtn());
    fireEvent.change(formerInput(), { target: { value: '3490000000001' } });
    fireEvent.click(screen.getByTestId('FmModel349Page__save'));

    const expected = { identification: { sustitutiva: true, formerStatement: '3490000000001' } };
    await waitFor(() => expect(persistManualData).toHaveBeenCalledWith(
      'decl-349', expected, expect.objectContaining({ token: 'tok', apiBaseUrl: '/api' }),
    ));
    await waitFor(() => expect(onManualDataSaved).toHaveBeenCalledWith('decl-349', expected));
    expect(toast.success).toHaveBeenCalled();
  });

  it('issues no network call when nothing was edited', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    fireEvent.click(screen.getByTestId('FmModel349Page__save'));
    expect(persistManualData).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('shows an error toast and does not call onManualDataSaved when the PUT fails', async () => {
    persistManualData.mockResolvedValueOnce({ ok: false, error: 'http_500' });
    const onManualDataSaved = vi.fn();
    render(<FmModel349Page decl={makeDecl({ _duplicatePeriodPresented: true })} {...defaultProps} onManualDataSaved={onManualDataSaved} />);
    // ETP-5725 — sustitutiva is already auto-defaulted true by `_duplicatePeriodPresented`, so
    // clicking an already-active option is a no-op; editing the identifier is what creates a
    // genuine pending edit (same as the "makes a real PUT" test above).
    fireEvent.click(sustitutivaBtn());
    fireEvent.change(formerInput(), { target: { value: '3490000000001' } });
    fireEvent.click(screen.getByTestId('FmModel349Page__save'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('fm.action.save_error'));
    expect(onManualDataSaved).not.toHaveBeenCalled();
  });

  it('a second Guardar after a successful one issues no further request', async () => {
    render(<FmModel349Page decl={makeDecl({ _duplicatePeriodPresented: true })} {...defaultProps} />);
    fireEvent.click(sustitutivaBtn());
    fireEvent.change(formerInput(), { target: { value: '3490000000001' } });
    fireEvent.click(screen.getByTestId('FmModel349Page__save'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('FmModel349Page__save'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(2));
    expect(persistManualData).toHaveBeenCalledTimes(1);
  });
});

describe('FmModel349Page — Registrar/Presentar flushes unsaved edits first (ETP-5597)', () => {
  function makeSubstitutiveAndPresent() {
    fireEvent.click(sustitutivaBtn());
    fireEvent.change(formerInput(), { target: { value: '3490000000001' } });
    fireEvent.click(presentBtn());
    fireEvent.click(screen.getByTestId('PresentModal-confirm'));
  }

  it('persists Tipo + identifier BEFORE the status change and updates the list cache', async () => {
    const onStatusChange = vi.fn().mockResolvedValue({ ok: true });
    const onManualDataSaved = vi.fn();
    render(<FmModel349Page decl={makeDecl({ _duplicatePeriodPresented: true })} {...defaultProps} onStatusChange={onStatusChange} onManualDataSaved={onManualDataSaved} />);
    makeSubstitutiveAndPresent();

    await waitFor(() => expect(onStatusChange).toHaveBeenCalled());
    expect(persistManualData).toHaveBeenCalledTimes(1);
    expect(persistManualData).toHaveBeenCalledWith(
      'decl-349', { identification: { sustitutiva: true, formerStatement: '3490000000001' } }, expect.any(Object),
    );
    expect(persistManualData.mock.invocationCallOrder[0]).toBeLessThan(onStatusChange.mock.invocationCallOrder[0]);
    expect(onManualDataSaved).toHaveBeenCalledWith('decl-349', { identification: { sustitutiva: true, formerStatement: '3490000000001' } });
  });

  it('aborts the presentation with the save-error toast when the flush fails', async () => {
    persistManualData.mockResolvedValueOnce({ ok: false, error: 'http_500' });
    const onStatusChange = vi.fn().mockResolvedValue({ ok: true });
    render(<FmModel349Page decl={makeDecl({ _duplicatePeriodPresented: true })} {...defaultProps} onStatusChange={onStatusChange} />);
    makeSubstitutiveAndPresent();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('fm.action.save_error'));
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('a rejected onStatusChange rolls the status back and shows the present-error toast', async () => {
    const onStatusChange = vi.fn().mockRejectedValue(new Error('network down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<FmModel349Page decl={SUSTITUTIVA_DECL({ formerStatement: '3490000000001' }, { _duplicatePeriodPresented: true })} {...defaultProps} onStatusChange={onStatusChange} />);
    fireEvent.click(presentBtn());
    fireEvent.click(screen.getByTestId('PresentModal-confirm'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('fm.action.present_error'));
    expect(onStatusChange).toHaveBeenCalledTimes(1);
    // Rolled back to draft: the primary actions are visible and enabled again.
    await waitFor(() => expect(presentBtn().disabled).toBe(false));
    errSpy.mockRestore();
  });

  it('makes no extra request when there is nothing unsaved', async () => {
    const onStatusChange = vi.fn().mockResolvedValue({ ok: true });
    render(<FmModel349Page decl={SUSTITUTIVA_DECL({ formerStatement: '3490000000001' }, { _duplicatePeriodPresented: true })} {...defaultProps} onStatusChange={onStatusChange} />);
    fireEvent.click(presentBtn());
    fireEvent.click(screen.getByTestId('PresentModal-confirm'));

    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('decl-349', 'submitted', 'manual_no_receipt'));
    expect(persistManualData).not.toHaveBeenCalled();
  });
});

describe('FmModel349Page — Generar fichero flushes unsaved edits first (ETP-5597)', () => {
  it('persists Tipo + identifier BEFORE generating the file, passing the identifier along', async () => {
    const onManualDataSaved = vi.fn();
    const { container } = render(<FmModel349Page decl={makeDecl({ _duplicatePeriodPresented: true })} {...defaultProps} onManualDataSaved={onManualDataSaved} />);
    fireEvent.click(sustitutivaBtn());
    fireEvent.change(formerInput(), { target: { value: '3490000000001' } });
    fireEvent.click(genBtn(container));
    fireEvent.click(screen.getByTestId('FileGenModal-mock'));

    await waitFor(() => expect(generate349File).toHaveBeenCalled());
    expect(persistManualData).toHaveBeenCalledTimes(1);
    expect(persistManualData.mock.invocationCallOrder[0]).toBeLessThan(generate349File.mock.invocationCallOrder[0]);
    expect(generate349File).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'decl-349' }),
      expect.objectContaining({ substitutive: true, formerStatement: '3490000000001' }),
    );
    expect(onManualDataSaved).toHaveBeenCalled();
  });

  it('aborts generation with the save-error toast when the flush fails', async () => {
    persistManualData.mockResolvedValueOnce({ ok: false, error: 'http_500' });
    const { container } = render(<FmModel349Page decl={makeDecl({ _duplicatePeriodPresented: true })} {...defaultProps} />);
    // ETP-5725 — sustitutiva is already auto-defaulted true by `_duplicatePeriodPresented`;
    // editing the identifier is what creates a genuine pending edit for this flush to find.
    fireEvent.click(sustitutivaBtn());
    fireEvent.change(formerInput(), { target: { value: '3490000000001' } });
    fireEvent.click(genBtn(container));
    fireEvent.click(screen.getByTestId('FileGenModal-mock'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('fm.action.save_error'));
    expect(generate349File).not.toHaveBeenCalled();
  });

  it('makes no save request when there is nothing unsaved', async () => {
    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    fireEvent.click(genBtn(container));
    fireEvent.click(screen.getByTestId('FileGenModal-mock'));

    await waitFor(() => expect(generate349File).toHaveBeenCalled());
    expect(persistManualData).not.toHaveBeenCalled();
  });
});

describe('formerStatement — the shared 13-digit rule (ETP-5597)', () => {
  it.each([
    ['3490000000001', true],
    ['  3490000000001  ', true],
    ['349000000000', false],
    ['34900000000012', false],
    ['349000000000A', false],
    ['349-000000001', false],
    ['', false],
    [null, false],
    [undefined, false],
  ])('isValidFormerStatement(%j) → %s', (value, expected) => {
    expect(isValidFormerStatement(value)).toBe(expected);
  });

  it.each([
    ['349-000 0000001', '3490000000001'],
    ['abc', ''],
    ['12345678901234567', '1234567890123'],
    [null, ''],
  ])('sanitizeFormerStatementInput(%j) → %j', (value, expected) => {
    expect(sanitizeFormerStatementInput(value)).toBe(expected);
  });
});

describe('FmModel349Page — in-flight save locks the form (ETP-5597)', () => {
  function deferred() {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    return { promise, resolve };
  }

  it('disables Tipo, the identifier, Guardar, Generar and Registrar/Presentar while the save is pending', async () => {
    const pending = deferred();
    persistManualData.mockReturnValueOnce(pending.promise);
    const { container } = render(<FmModel349Page decl={SUSTITUTIVA_DECL({ formerStatement: '3490000000001' }, { _duplicatePeriodPresented: true })} {...defaultProps} />);
    fireEvent.change(formerInput(), { target: { value: '3490000000002' } });
    fireEvent.click(screen.getByTestId('FmModel349Page__save'));

    await waitFor(() => expect(screen.getByTestId('FmModel349Page__save').disabled).toBe(true));
    expect(normalBtn().disabled).toBe(true);
    expect(sustitutivaBtn().disabled).toBe(true);
    expect(formerInput().disabled).toBe(true);
    expect(presentBtn().disabled).toBe(true);
    expect(genBtn(container).disabled).toBe(true);

    pending.resolve({ ok: true });
    await waitFor(() => expect(screen.getByTestId('FmModel349Page__save').disabled).toBe(false));
    // ETP-5725 — `normalBtn` is intentionally NOT asserted re-enabled here: this fixture's
    // `_duplicatePeriodPresented: true` (added so the save itself clears the corrective/ordinaria
    // consistency guard) ALSO engages `lockNormalOption` — a genuinely separate, pre-existing
    // ETP-5725-round-1 feature that keeps "Normal" disabled for as long as a presented ordinaria
    // sibling exists and Sustitutiva is selected, independent of any in-flight save. See the
    // dedicated `lockNormalOption` coverage above for that feature's own tests.
    expect(formerInput().disabled).toBe(false);
    expect(presentBtn().disabled).toBe(false);
    expect(genBtn(container).disabled).toBe(false);
  });

  it('a double confirm on Registrar/Presentar triggers only one save and one status change', async () => {
    const pending = deferred();
    persistManualData.mockReturnValueOnce(pending.promise);
    const onStatusChange = vi.fn().mockResolvedValue({ ok: true });
    render(<FmModel349Page decl={makeDecl({ _duplicatePeriodPresented: true })} {...defaultProps} onStatusChange={onStatusChange} />);
    fireEvent.click(sustitutivaBtn());
    fireEvent.change(formerInput(), { target: { value: '3490000000001' } });
    fireEvent.click(presentBtn());
    fireEvent.click(screen.getByTestId('PresentModal-confirm'));
    fireEvent.click(screen.getByTestId('PresentModal-confirm'));

    pending.resolve({ ok: true });
    await waitFor(() => expect(onStatusChange).toHaveBeenCalled());
    // Let any (wrongly) queued second attempt run before asserting.
    await new Promise((r) => setTimeout(r, 0));
    expect(persistManualData).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenCalledTimes(1);
  });

  it('a double confirm on Generar fichero 349 triggers only one save and one generation', async () => {
    const pending = deferred();
    persistManualData.mockReturnValueOnce(pending.promise);
    const { container } = render(<FmModel349Page decl={makeDecl({ _duplicatePeriodPresented: true })} {...defaultProps} />);
    fireEvent.click(sustitutivaBtn());
    fireEvent.change(formerInput(), { target: { value: '3490000000001' } });
    fireEvent.click(genBtn(container));
    fireEvent.click(screen.getByTestId('FileGenModal-mock'));
    fireEvent.click(screen.getByTestId('FileGenModal-mock'));

    pending.resolve({ ok: true });
    await waitFor(() => expect(generate349File).toHaveBeenCalled());
    // Let any (wrongly) queued second attempt run before asserting.
    await new Promise((r) => setTimeout(r, 0));
    expect(persistManualData).toHaveBeenCalledTimes(1);
    expect(generate349File).toHaveBeenCalledTimes(1);
  });

  it('an edit made after the save started keeps the pending flag, and the list cache gets the payload actually sent', async () => {
    const pending = deferred();
    persistManualData.mockReturnValueOnce(pending.promise);
    const onManualDataSaved = vi.fn();
    render(<FmModel349Page decl={SUSTITUTIVA_DECL({ formerStatement: '3490000000001' }, { _duplicatePeriodPresented: true })} {...defaultProps} onManualDataSaved={onManualDataSaved} />);
    fireEvent.change(formerInput(), { target: { value: '3490000000002' } });
    fireEvent.click(screen.getByTestId('FmModel349Page__save'));
    await waitFor(() => expect(persistManualData).toHaveBeenCalledTimes(1));

    // An edit that slips in mid-save (the input is disabled, so only a racing event can do this).
    fireEvent.change(formerInput(), { target: { value: '3490000000003' } });
    pending.resolve({ ok: true });

    const firstPayload = { identification: { sustitutiva: true, formerStatement: '3490000000002' } };
    await waitFor(() => expect(onManualDataSaved).toHaveBeenCalledWith('decl-349', firstPayload));
    await waitFor(() => expect(screen.getByTestId('FmModel349Page__save').disabled).toBe(false));

    // The racing edit was NOT marked as saved: the next Guardar persists it.
    fireEvent.click(screen.getByTestId('FmModel349Page__save'));
    await waitFor(() => expect(persistManualData).toHaveBeenCalledTimes(2));
    expect(persistManualData).toHaveBeenLastCalledWith(
      'decl-349', { identification: { sustitutiva: true, formerStatement: '3490000000003' } }, expect.any(Object),
    );
  });
});

// ETP-5725 — `decl._duplicatePeriodPresented` (set by FmListPage.jsx: true only when a sibling
// declaration for this (model, year, period) is already in the submitted family) drives two
// things, mirroring 303's `rectificativa` auto-default + lock (FmModel303Page.jsx):
//   1. The `identChecks` lazy initializer defaults `sustitutiva` to true for a brand-new,
//      never-persisted draft.
//   2. `DeclarationTypeControl`'s `lockNormalOption` disables the "Normal" option — but ONLY
//      while Sustitutiva is CURRENTLY checked (review B1 fix), so a legacy declaration saved
//      with `sustitutiva: false` while a sibling is presented never gets permanently stuck
//      unable to select Normal again.
describe('FmModel349Page — ETP-5725 auto-default sustitutiva + lockNormalOption', () => {
  it('auto-defaults to Sustitutiva (no persisted value) when _duplicatePeriodPresented is true', () => {
    render(<FmModel349Page decl={makeDecl({ _duplicatePeriodPresented: true })} {...defaultProps} />);
    expect(sustitutivaBtn().getAttribute('aria-checked')).toBe('true');
    expect(normalBtn().getAttribute('aria-checked')).toBe('false');
    expect(banner()).not.toBeNull();
  });

  it('locks "Normal" (disabled) once auto-defaulted to Sustitutiva, Sustitutiva itself stays clickable', () => {
    render(<FmModel349Page decl={makeDecl({ _duplicatePeriodPresented: true })} {...defaultProps} />);
    expect(normalBtn().disabled).toBe(true);
    expect(sustitutivaBtn().disabled).toBe(false);
  });

  it('does NOT auto-default when _duplicatePeriodPresented is false (duplicate exists but sibling not submitted)', () => {
    render(<FmModel349Page decl={makeDecl({ _duplicatePeriodPresented: false })} {...defaultProps} />);
    expect(normalBtn().getAttribute('aria-checked')).toBe('true');
    expect(normalBtn().disabled).toBe(false);
    expect(banner()).toBeNull();
  });

  it('does NOT auto-default when _duplicatePeriodPresented is absent — regression guard for a period with no prior declaration', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    expect(normalBtn().getAttribute('aria-checked')).toBe('true');
    expect(normalBtn().disabled).toBe(false);
    expect(banner()).toBeNull();
  });

  it('an explicit persisted sustitutiva=false wins over the auto-default (never-saved check only applies when truly unset)', () => {
    render(<FmModel349Page decl={makeDecl({
      _duplicatePeriodPresented: true,
      manualData: { identification: { sustitutiva: false } },
    })} {...defaultProps} />);
    expect(normalBtn().getAttribute('aria-checked')).toBe('true');
  });

  // ── B1 strand regression (the review blocker) ───────────────────────────
  it('B1: a legacy sustitutiva=false declaration with _duplicatePeriodPresented true keeps "Normal" clickable', () => {
    render(<FmModel349Page decl={makeDecl({
      _duplicatePeriodPresented: true,
      manualData: { identification: { sustitutiva: false } },
    })} {...defaultProps} />);
    // Sustitutiva is NOT checked, so lockNormalOption must be false — Normal stays enabled,
    // unlike the unconditional `Boolean(decl._duplicatePeriodPresented) && !isSubmitted` that
    // review caught (it would have disabled Normal here even though Sustitutiva was never set).
    expect(normalBtn().disabled).toBe(false);
    expect(sustitutivaBtn().getAttribute('aria-checked')).toBe('false');
  });

  it('B1: once the user clicks Sustitutiva (even by accident) while duplicatePeriodPresented, Normal locks — but clicking Sustitutiva is still always possible to reach it', () => {
    render(<FmModel349Page decl={makeDecl({
      _duplicatePeriodPresented: true,
      manualData: { identification: { sustitutiva: false } },
    })} {...defaultProps} />);
    expect(normalBtn().disabled).toBe(false);
    fireEvent.click(sustitutivaBtn());
    expect(sustitutivaBtn().getAttribute('aria-checked')).toBe('true');
    expect(normalBtn().disabled).toBe(true);
  });

  it('lockNormalOption never applies once the declaration is submitted, regardless of the current value', () => {
    render(<FmModel349Page decl={SUSTITUTIVA_DECL({}, { status: 'submitted', _duplicatePeriodPresented: true })} {...defaultProps} />);
    // Already disabled by `isSubmitted` (pre-existing behavior) — both options locked, same
    // outcome as before ETP-5725, unaffected by the new guard.
    expect(normalBtn().disabled).toBe(true);
    expect(sustitutivaBtn().disabled).toBe(true);
  });
});

// ETP-5725 (reopened QA fix) — CRITICAL REGRESSION: the `identChecks` lazy initializer applied
// the auto-default with NO `decl.status === 'draft'` precondition. Repro: present an ordinaria
// (sustitutiva never touched/saved, so it reads `undefined`), then present a sibling as
// Sustitutiva for the same period — OPENING the original, already-presented ordinaria
// re-triggered the auto-default and showed "Sustitutiva" selected on an already-submitted,
// correctly-ordinaria record. Confirmed display-only. Fixed by gating the auto-default on
// `decl.status === 'draft'`, mirroring the identical fix in `FmListPage.jsx`'s
// `resolveDeclTypeLabel` (Bug 3) and `FmModel303Page.jsx`'s own initializer.
describe('FmModel349Page — ETP-5725 critical regression: identChecks never auto-defaults on a non-draft declaration', () => {
  it('renders Normal selected for an already-submitted declaration, even with _duplicatePeriodPresented true and sustitutiva never persisted', () => {
    render(<FmModel349Page decl={makeDecl({ status: 'submitted', _duplicatePeriodPresented: true })} {...defaultProps} />);
    expect(normalBtn().getAttribute('aria-checked')).toBe('true');
    expect(sustitutivaBtn().getAttribute('aria-checked')).toBe('false');
    expect(banner()).toBeNull();
  });

  it('still renders Normal selected for a "ready" (not yet submitted, but no longer draft) declaration under the same conditions', () => {
    render(<FmModel349Page decl={makeDecl({ status: 'ready', _duplicatePeriodPresented: true })} {...defaultProps} />);
    expect(normalBtn().getAttribute('aria-checked')).toBe('true');
    expect(sustitutivaBtn().getAttribute('aria-checked')).toBe('false');
  });

  it('control: a genuine DRAFT still gets the auto-default to Sustitutiva under the same conditions', () => {
    render(<FmModel349Page decl={makeDecl({ status: 'draft', _duplicatePeriodPresented: true })} {...defaultProps} />);
    expect(sustitutivaBtn().getAttribute('aria-checked')).toBe('true');
  });
});

// ETP-5725 (reopened QA fix) — Bug 1 / mirror rule: "Guardar", "Generar fichero" and "Registrar/
// Presentar" must be gated by the same corrective/ordinaria consistency rule. Backend is the
// authoritative gate; these are the UX-sugar frontend checks (`isSustitutivaChecked(identChecks)`
// combined with `decl._duplicatePeriodPresented` in `FmModel349Page.jsx`).
describe('FmModel349Page — ETP-5725 Guardar/Generar/Presentar gated by corrective consistency', () => {
  it('blocks "Guardar" when Sustitutiva is selected with no presented ordinaria sibling at all', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    fireEvent.click(sustitutivaBtn());
    fireEvent.change(formerInput(), { target: { value: '3490000000001' } });
    fireEvent.click(screen.getByTestId('FmModel349Page__save'));
    expect(toast.error).toHaveBeenCalledWith('fm.duplicate_period.requires_ordinaria');
    expect(persistManualData).not.toHaveBeenCalled();
  });

  it('blocks "Generar fichero 349" for the same corrective-without-ordinaria case BEFORE the modal opens', () => {
    // ETP-5725 (reopened QA fix, UX follow-up) — genBtn's own onClick now mirrors 303's: it
    // blocks BEFORE opening FileGenModal, not only inside generateNow (the modal's onConfirm).
    // The modal must never even mount here.
    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    fireEvent.click(sustitutivaBtn());
    fireEvent.change(formerInput(), { target: { value: '3490000000001' } });
    fireEvent.click(genBtn(container));
    expect(toast.error).toHaveBeenCalledWith('fm.duplicate_period.requires_ordinaria');
    expect(screen.queryByTestId('FileGenModal-mock')).not.toBeInTheDocument();
    expect(generate349File).not.toHaveBeenCalled();
  });

  it('blocks "Registrar/Presentar" for the same corrective-without-ordinaria case BEFORE the modal opens', () => {
    // ETP-5725 (reopened QA fix, UX follow-up) — `presentBtn`'s own onClick now mirrors 303's:
    // it blocks BEFORE opening PresentModal, not only inside `presentNow` (the modal's
    // `onConfirm`). The modal must never even mount here.
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    fireEvent.click(sustitutivaBtn());
    fireEvent.change(formerInput(), { target: { value: '3490000000001' } });
    fireEvent.click(presentBtn());
    expect(toast.error).toHaveBeenCalledWith('fm.duplicate_period.requires_ordinaria');
    expect(screen.queryByTestId('PresentModal-confirm')).not.toBeInTheDocument();
    expect(persistManualData).not.toHaveBeenCalled();
  });

  it('allows "Guardar" for a plain Normal declaration with no conflicting sibling', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    fireEvent.click(screen.getByTestId('FmModel349Page__save'));
    expect(toast.error).not.toHaveBeenCalledWith('fm.duplicate_period.requires_ordinaria');
    expect(toast.error).not.toHaveBeenCalledWith('fm.duplicate_period.ordinaria_exists');
  });
});
