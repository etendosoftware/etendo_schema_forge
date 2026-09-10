// ETP-5027 — the "Validar VIES" banner action.
//
// Before this change the button was a `<button>` carrying nothing but a `style` prop:
// no onClick, and ViesBanner did not even receive an action callback. Clicking it did
// literally nothing. These tests pin the wired behaviour: it calls the endpoint, it
// cannot be fired twice, it refreshes the operators (badges + "Pendientes VIES" KPI +
// the banner itself all read the same array), it invalidates the compute cache that
// would otherwise repaint the pre-validation statuses, and it reports honestly.
//
// Mocking conventions follow FmModel349Page.distinctCounts.vitest.jsx. Every network
// call is mocked — nothing here reaches ec.europa.eu or a real NEO endpoint.
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Realistic es_ES copy for the keys under test, so the assertions below are about the
// SENTENCE the user reads, not about a key name. Kept in sync with locales/es_ES.json.
const ES = {
  'fm.m349.banner.vies_action': 'Validar VIES',
  'fm.m349.banner.vies_validating': 'Validando…',
  'fm.m349.vies.result.none': 'No había ningún NIF-IVA pendiente de validar',
  'fm.m349.vies.result.processed_one': '1 NIF-IVA procesado',
  'fm.m349.vies.result.processed_many': '{count} NIF-IVA procesados',
  'fm.m349.vies.result.valid_one': '1 válido',
  'fm.m349.vies.result.valid_many': '{count} válidos',
  'fm.m349.vies.result.invalid_one': '1 inválido',
  'fm.m349.vies.result.invalid_many': '{count} inválidos',
  'fm.m349.vies.result.pending_one': '1 sigue pendiente; puedes volver a intentarlo',
  'fm.m349.vies.result.pending_many': '{count} siguen pendientes; puedes volver a intentarlo',
  'fm.m349.vies.result.failed_one': '1 comprobado pero no se pudo guardar; inténtalo de nuevo',
  'fm.m349.vies.result.failed_many': '{count} comprobados pero no se pudieron guardar; inténtalo de nuevo',
  'fm.m349.vies.result.not_eligible_one': '1 no se puede consultar en VIES (necesita clave de NIF intracomunitario y NIF-IVA)',
  'fm.m349.vies.result.not_eligible_many': '{count} no se pueden consultar en VIES (necesitan clave de NIF intracomunitario y NIF-IVA)',
  'fm.m349.vies.result.error': 'No se pudo ejecutar la validación VIES. Inténtelo de nuevo.',
  'fm.m349.banner.vies_title': '{count} NIF-IVA con validación VIES pendiente',
};

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    const raw = ES[key];
    if (raw == null) return key;
    return Object.keys(params ?? {}).reduce((acc, p) => acc.replace(`{${p}}`, params[p]), raw);
  },
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(),
  }),
}));

vi.mock('../../../fiscalModelsUtils.js', () => ({
  formatAmount: (n) => (n == null ? '—' : String(n)),
  compute349Operators: vi.fn().mockResolvedValue(null),
  generate349File: vi.fn().mockResolvedValue(false),
  validate349Vies: vi.fn(),
}));
vi.mock('../../../useFiscalAutoCompute.js', () => ({
  default: vi.fn(),
  invalidateFiscalComputeCache: vi.fn(),
}));
vi.mock('../use349Pdf.js', () => ({
  use349Pdf: () => ({ pdfUrl: null, loading: false, generatePdf: vi.fn(), clearPdf: vi.fn() }),
}));
vi.mock('../../../FmCommon.jsx', () => ({
  StatusPillMenu: () => null,
  MoreOptionsMenu: () => null,
  KpiWidget: ({ value, label }) => React.createElement(
    'div',
    { className: 'test-kpi349', 'data-kpi-label': label },
    React.createElement('span', { className: 'test-kpi349-value' }, value),
  ),
  Tabs: () => null,
  Banner: () => null,
}));
vi.mock('../../../FmTabContent.jsx', () => ({ SourcesTab: () => null, IncidentsTab: () => null }));
vi.mock('../../../FmOverlays.jsx', () => ({ PresentModal: () => null, FileGenModal: () => null }));
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

import { toast } from 'sonner';
import { compute349Operators, validate349Vies } from '../../../fiscalModelsUtils.js';
import { invalidateFiscalComputeCache } from '../../../useFiscalAutoCompute.js';
import FmModel349Page from '../FmModel349Page.jsx';

// One French counterparty, pending. FR is the realistic fixture: France's member-state
// service answers MS_MAX_CONCURRENT_REQ on essentially every attempt right now, so a
// non-zero `stillPending` is a routine outcome, not an edge case.
const FRANCIA_PENDING = {
  bpId: 'bp-fr', nif: 'FR12487773327', name: 'Tercero Francia',
  key: 'S', base: '2010.00', rectificative: false, vies: 'pending',
};
const FRANCIA_VALID = { ...FRANCIA_PENDING, vies: 'valid' };
const ITALIA_PENDING = {
  bpId: 'bp-it', nif: 'IT09449391218', name: 'Tercero Italia',
  key: 'E', base: '44.00', rectificative: false, vies: 'pending',
};

const makeDecl = (operators) => ({
  id: 'decl-349', model: '349', year: 2026, period: 'T1',
  type: 'ord', status: 'pending', nif: 'B12345678',
  operators: [], invoices: [], rectifications: [],
  incidents: { blocking: 0 },
  _precomputed: { operators },
});

const defaultProps = { onBack: vi.fn(), onStatusChange: vi.fn(), token: 'tok', apiBaseUrl: '/api' };

const VIES_KPI = 'fm.m349.kpi.vies_pending';
const kpiValue = () =>
  document.querySelector(`.test-kpi349[data-kpi-label="${VIES_KPI}"] .test-kpi349-value`)?.textContent;
const button = () => screen.getByTestId('vies-validate-button');

function renderPage(operators = [FRANCIA_PENDING]) {
  return render(<FmModel349Page decl={makeDecl(operators)} {...defaultProps} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  compute349Operators.mockResolvedValue(null);
});

describe('Validar VIES — the button is wired at all', () => {
  it('calls validate349Vies for this declaration when clicked', async () => {
    validate349Vies.mockResolvedValue({ ok: true, validated: 1, valid: 1, invalid: 0, stillPending: 0 });
    renderPage();

    // Nothing must have fired merely by rendering — the click is what makes the call.
    expect(validate349Vies).not.toHaveBeenCalled();

    await userEvent.click(button());

    await waitFor(() => expect(validate349Vies).toHaveBeenCalledTimes(1));
    expect(validate349Vies).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'decl-349', year: 2026, period: 'T1' }),
      { token: 'tok', apiBaseUrl: '/api' },
    );
  });

  it('is not rendered at all when nothing is pending', () => {
    renderPage([FRANCIA_VALID]);
    expect(screen.queryByTestId('vies-validate-button')).toBeNull();
  });
});

describe('Validar VIES — double-submission guard', () => {
  it('disables the button and swaps its label while the request is in flight', async () => {
    let release;
    validate349Vies.mockReturnValue(new Promise(res => { release = res; }));
    renderPage();

    expect(button()).not.toBeDisabled();
    expect(button()).toHaveTextContent('Validar VIES');

    await userEvent.click(button());

    await waitFor(() => expect(button()).toBeDisabled());
    expect(button()).toHaveTextContent('Validando…');
    expect(button()).toHaveAttribute('aria-busy', 'true');

    release({ ok: true, validated: 1, valid: 1, invalid: 0, stillPending: 0 });
    // Once the run settles the label reverts and the button is clickable again.
    await waitFor(() => expect(button()).toHaveTextContent('Validar VIES'));
    expect(button()).not.toBeDisabled();
    expect(button()).not.toHaveAttribute('aria-busy');
  });

  it('does not fire a second bulk validation while one is running', async () => {
    let release;
    validate349Vies.mockReturnValue(new Promise(res => { release = res; }));
    renderPage();

    const btn = button();
    await userEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
    // Bypass the pointer-events/disabled shield the way a stray programmatic caller
    // or a fast double-click would: the ref guard, not the DOM, is what must hold.
    btn.click();
    btn.click();

    expect(validate349Vies).toHaveBeenCalledTimes(1);
    release({ ok: true, validated: 1, valid: 1, invalid: 0, stillPending: 0 });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('re-enables the button after a failed run so the user can retry', async () => {
    validate349Vies.mockResolvedValue({ ok: false, error: 'network' });
    renderPage();

    await userEvent.click(button());

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(button()).not.toBeDisabled();
    expect(button()).toHaveTextContent('Validar VIES');
  });
});

describe('Validar VIES — refreshing the displayed state', () => {
  it('recomputes the operators and drops the VIES KPI to 0 on success', async () => {
    validate349Vies.mockResolvedValue({ ok: true, validated: 1, valid: 1, invalid: 0, stillPending: 0 });
    compute349Operators.mockResolvedValue({ operators: [FRANCIA_VALID] });
    renderPage();

    expect(kpiValue()).toBe('1');
    expect(screen.getByText('1 NIF-IVA con validación VIES pendiente')).toBeInTheDocument();

    await userEvent.click(button());

    await waitFor(() => expect(kpiValue()).toBe('0'));
    expect(compute349Operators).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'decl-349' }),
      { token: 'tok', apiBaseUrl: '/api' },
    );
    // Banner and KPI read the same array, so the banner goes with it.
    expect(screen.queryByText(/NIF-IVA con validación VIES pendiente/)).toBeNull();
  });

  it('leaves the KPI at the partial count when only some NIFs resolved', async () => {
    validate349Vies.mockResolvedValue({ ok: true, validated: 2, valid: 1, invalid: 0, stillPending: 1 });
    compute349Operators.mockResolvedValue({ operators: [FRANCIA_PENDING, { ...ITALIA_PENDING, vies: 'valid' }] });
    renderPage([FRANCIA_PENDING, ITALIA_PENDING]);

    expect(kpiValue()).toBe('2');
    await userEvent.click(button());
    await waitFor(() => expect(kpiValue()).toBe('1'));
  });

  it('invalidates the compute cache BEFORE recomputing, so the stale payload cannot win', async () => {
    validate349Vies.mockResolvedValue({ ok: true, validated: 1, valid: 1, invalid: 0, stillPending: 0 });
    const order = [];
    invalidateFiscalComputeCache.mockImplementation(() => order.push('invalidate'));
    compute349Operators.mockImplementation(async () => { order.push('compute'); return { operators: [FRANCIA_VALID] }; });
    renderPage();

    await userEvent.click(button());

    await waitFor(() => expect(invalidateFiscalComputeCache).toHaveBeenCalledWith('decl-349'));
    expect(order).toEqual(['invalidate', 'compute']);
  });

  it('does not recompute or invalidate when the request failed', async () => {
    validate349Vies.mockResolvedValue({ ok: false, error: 'http_500' });
    renderPage();

    await userEvent.click(button());

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(invalidateFiscalComputeCache).not.toHaveBeenCalled();
    expect(compute349Operators).not.toHaveBeenCalled();
    // The displayed state is untouched — not blanked, not reset to mock data.
    expect(kpiValue()).toBe('1');
    expect(screen.getByText('1 NIF-IVA con validación VIES pendiente')).toBeInTheDocument();
  });
});

describe('Validar VIES — what the toast says', () => {
  async function clickWith(result, operators = [FRANCIA_PENDING]) {
    validate349Vies.mockResolvedValue(result);
    compute349Operators.mockResolvedValue({ operators });
    renderPage(operators);
    await userEvent.click(button());
  }

  it('all valid → success, counts only', async () => {
    await clickWith({ ok: true, validated: 4, valid: 4, invalid: 0, stillPending: 0 });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('4 NIF-IVA procesados: 4 válidos'));
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('mixed valid/invalid → warning naming both counts', async () => {
    await clickWith({ ok: true, validated: 4, valid: 3, invalid: 1, stillPending: 0 });
    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith('4 NIF-IVA procesados: 3 válidos, 1 inválido'));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('some still pending → reports the count and never implies success', async () => {
    await clickWith({ ok: true, validated: 4, valid: 2, invalid: 0, stillPending: 2 });
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(
      '4 NIF-IVA procesados: 2 válidos, 2 siguen pendientes; puedes volver a intentarlo'));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('all still pending → warning that attributes NO cause to the number', async () => {
    await clickWith({ ok: true, validated: 1, valid: 0, invalid: 0, stillPending: 1 });
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(
      '1 NIF-IVA procesado: 1 sigue pendiente; puedes volver a intentarlo'));
    const msg = toast.warning.mock.calls[0][0];
    // ETP-5027 (QA F5): `stillPending` no longer carries the ineligible partners, but it
    // still conflates "VIES did not answer" with "deferred past the batch cap" — both
    // transient — so the copy may blame neither the external service nor the user's data.
    expect(msg).not.toMatch(/inválid|error/i);
    expect(msg).not.toMatch(/VIES no respondió|servicio/i);
  });

  it('the pending clause always closes the sentence', async () => {
    await clickWith({ ok: true, validated: 3, valid: 1, invalid: 1, stillPending: 1 });
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(
      '3 NIF-IVA procesados: 1 válido, 1 inválido, 1 sigue pendiente; puedes volver a intentarlo'));
  });

  it('nothing attempted → info, not a fake success', async () => {
    await clickWith({ ok: true, validated: 0, valid: 0, invalid: 0, stillPending: 0 });
    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith('No había ningún NIF-IVA pendiente de validar'));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('a broken sum invariant stays off the success channel', async () => {
    // valid + invalid + notEligible + failed + stillPending === validated is guaranteed by
    // the backend; this is the defensive branch for the day it is not.
    await clickWith({ ok: true, validated: 3, valid: 0, invalid: 0, stillPending: 0 });
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith('3 NIF-IVA procesados'));
    expect(toast.success).not.toHaveBeenCalled();
  });

  // ── ETP-5027 QA F2/F5: the two buckets split out of `stillPending` ──

  // F5. A partner whose tax-id key is not NOI (or whose VAT number is blank) fails the
  // eligibility gate on EVERY future click. It used to be folded into `stillPending`,
  // whose copy says "you can run it again" — an unbreakable loop with no explanation.
  it('reports permanently-ineligible partners separately and never invites a retry for them',
    async () => {
      await clickWith({
        ok: true, validated: 3, valid: 1, invalid: 0, notEligible: 2, failed: 0, stillPending: 0,
      });
      await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(
        '3 NIF-IVA procesados: 1 válido, '
        + '2 no se pueden consultar en VIES (necesitan clave de NIF intracomunitario y NIF-IVA)'));
      const msg = toast.warning.mock.calls[0][0];
      expect(msg).not.toMatch(/siguen pendientes|volver a intentarlo/);
      expect(toast.success).not.toHaveBeenCalled();
    });

  it('an all-ineligible run is a warning, never a success', async () => {
    await clickWith({
      ok: true, validated: 1, valid: 0, invalid: 0, notEligible: 1, failed: 0, stillPending: 0,
    });
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(
      '1 NIF-IVA procesado: '
      + '1 no se puede consultar en VIES (necesita clave de NIF intracomunitario y NIF-IVA)'));
    expect(toast.success).not.toHaveBeenCalled();
  });

  // F2. A conclusive VIES answer whose write-back failed must NOT be reported as success:
  // the user reloads against the database and would find the partner still pending.
  it('reports a failed write-back as a failure, not as valid', async () => {
    await clickWith({
      ok: true, validated: 2, valid: 1, invalid: 0, notEligible: 0, failed: 1, stillPending: 0,
    });
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(
      '2 NIF-IVA procesados: 1 válido, '
      + '1 comprobado pero no se pudo guardar; inténtalo de nuevo'));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('a run where nothing could be saved is a warning, never a success', async () => {
    await clickWith({
      ok: true, validated: 2, valid: 0, invalid: 0, notEligible: 0, failed: 2, stillPending: 0,
    });
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(
      '2 NIF-IVA procesados: '
      + '2 comprobados pero no se pudieron guardar; inténtalo de nuevo'));
    expect(toast.success).not.toHaveBeenCalled();
  });

  // Fragment order is part of the sentence: conclusive first, then the two actionable
  // buckets, then the retryable pending one, which always closes.
  it('orders the five buckets valid, invalid, failed, ineligible, pending', async () => {
    await clickWith({
      ok: true, validated: 5, valid: 1, invalid: 1, notEligible: 1, failed: 1, stillPending: 1,
    });
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(
      '5 NIF-IVA procesados: 1 válido, 1 inválido, '
      + '1 comprobado pero no se pudo guardar; inténtalo de nuevo, '
      + '1 no se puede consultar en VIES (necesita clave de NIF intracomunitario y NIF-IVA), '
      + '1 sigue pendiente; puedes volver a intentarlo'));
  });

  // A payload from a backend that predates the split still parses: both new buckets
  // default to 0 and the sentence is the one it always was.
  it('tolerates a legacy payload with neither notEligible nor failed', async () => {
    await clickWith({ ok: true, validated: 2, valid: 2, invalid: 0, stillPending: 0 });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('2 NIF-IVA procesados: 2 válidos'));
  });

  it('a failure prefers the real backend message over the generic one', async () => {
    validate349Vies.mockResolvedValue({
      ok: false, error: 'http_500', serverMessage: 'AEAT349_ViesUnavailable',
    });
    renderPage();
    await userEvent.click(button());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('AEAT349_ViesUnavailable'));
  });

  it('a failure with no backend message falls back to the generic error copy', async () => {
    validate349Vies.mockResolvedValue({ ok: false, error: 'network' });
    renderPage();
    await userEvent.click(button());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'No se pudo ejecutar la validación VIES. Inténtelo de nuevo.'));
  });
});
