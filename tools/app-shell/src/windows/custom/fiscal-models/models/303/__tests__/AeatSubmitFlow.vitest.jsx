// Vitest tests for AeatSubmitFlow — the ETP-4456 Phase 2 AEAT 303 electronic
// submission flow. Covers the pure helpers (response-status branching,
// NRC/test-mode body shape, error-code-to-message mapping) plus the
// end-to-end render/submit/result behavior against a mocked apiFetch.

const stableApiFetch = vi.fn();
const navigateMock = vi.fn();

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => stableApiFetch }));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => ({ selectedOrg: { id: 'org-1' } }) }));
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u ?? '' }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('lucide-react', () => ({
  Loader2: () => null,
  TriangleAlert: () => null,
  OctagonAlert: () => null,
  CircleCheck: () => null,
  Download: () => null,
  Landmark: () => null,
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AeatSubmitFlow, {
  buildAeatSubmitBody,
  buildLocalDeclarationData,
  classifySubmitOutcome,
  resolveErrorCodeKey,
} from '../AeatSubmitFlow.jsx';

// ── Pure helpers ────────────────────────────────────────────────────────────

describe('buildAeatSubmitBody', () => {
  it('defaults idi to ES and testMode to false', () => {
    expect(buildAeatSubmitBody({})).toEqual({
      testMode: false, idi: 'ES', nrc: '', presenterNif: '', presenterName: '',
    });
  });

  it('coerces testMode to a strict boolean', () => {
    expect(buildAeatSubmitBody({ testMode: true }).testMode).toBe(true);
    expect(buildAeatSubmitBody({ testMode: 'yes' }).testMode).toBe(true);
    expect(buildAeatSubmitBody({ testMode: undefined }).testMode).toBe(false);
  });

  it('trims nrc/presenterNif/presenterName', () => {
    const body = buildAeatSubmitBody({
      nrc: '  1234567890AB  ',
      presenterNif: ' B20868352 ',
      presenterName: ' F&B España, S.A ',
    });
    expect(body.nrc).toBe('1234567890AB');
    expect(body.presenterNif).toBe('B20868352');
    expect(body.presenterName).toBe('F&B España, S.A');
  });

  it('handles missing optional fields without throwing', () => {
    expect(buildAeatSubmitBody()).toEqual({
      testMode: false, idi: 'ES', nrc: '', presenterNif: '', presenterName: '',
    });
  });
});

describe('buildLocalDeclarationData', () => {
  const decl = { year: 2026, period: 'T2', result: { kind: 'I' }, summary: { result: -100 } };
  const orgIdent = { nif: 'B20868352', nombre: 'F&B España, S.A' };

  it('prefers identChecks.tipo_declaracion over decl.result.kind', () => {
    const data = buildLocalDeclarationData({ decl, orgIdent, identChecks: { tipo_declaracion: 'C' }, summary: {} });
    expect(data.declarationType).toBe('C');
  });

  it('falls back to decl.result.kind when identChecks has no tipo_declaracion', () => {
    const data = buildLocalDeclarationData({ decl, orgIdent, identChecks: {}, summary: {} });
    expect(data.declarationType).toBe('I');
  });

  it('prefers the live summary result over decl.summary.result', () => {
    const data = buildLocalDeclarationData({ decl, orgIdent, identChecks: {}, summary: { result: -35479.08 } });
    expect(data.resultAmount).toBe(-35479.08);
  });

  it('falls back to decl.summary.result when no live summary is given', () => {
    const data = buildLocalDeclarationData({ decl, orgIdent, identChecks: {}, summary: null });
    expect(data.resultAmount).toBe(-100);
  });

  it('reads nif/businessName from orgIdent and iban from identChecks.bank_iban', () => {
    const data = buildLocalDeclarationData({
      decl, orgIdent, identChecks: { bank_iban: 'ES00 0000 0000 0000 0000 0000' }, summary: {},
    });
    expect(data.nif).toBe('B20868352');
    expect(data.businessName).toBe('F&B España, S.A');
    expect(data.iban).toBe('ES00 0000 0000 0000 0000 0000');
  });

  it('does not throw when everything is missing', () => {
    expect(buildLocalDeclarationData()).toEqual({
      nif: '', businessName: '', fiscalYear: '', period: '',
      declarationType: '', resultAmount: null, iban: '',
    });
  });
});

describe('classifySubmitOutcome', () => {
  it('maps SUCCESS/TEST_SUCCESS/ERROR to their outcome keys', () => {
    expect(classifySubmitOutcome({ status: 'SUCCESS' })).toBe('success');
    expect(classifySubmitOutcome({ status: 'TEST_SUCCESS' })).toBe('test_success');
    expect(classifySubmitOutcome({ status: 'ERROR' })).toBe('error');
  });

  it('returns unknown for a missing/malformed/unrecognized status', () => {
    expect(classifySubmitOutcome(null)).toBe('unknown');
    expect(classifySubmitOutcome(undefined)).toBe('unknown');
    expect(classifySubmitOutcome('not-an-object')).toBe('unknown');
    expect(classifySubmitOutcome({})).toBe('unknown');
    expect(classifySubmitOutcome({ status: 'WEIRD' })).toBe('unknown');
  });
});

describe('resolveErrorCodeKey', () => {
  it('maps MISSING_PRESENTER, NO_CERTIFICATE, and ALREADY_SUBMITTED to specific i18n keys', () => {
    expect(resolveErrorCodeKey('MISSING_PRESENTER')).toBe('fm.aeat.error.missingPresenter');
    expect(resolveErrorCodeKey('NO_CERTIFICATE')).toBe('fm.aeat.error.noCertificate');
    expect(resolveErrorCodeKey('ALREADY_SUBMITTED')).toBe('fm.aeat.error.alreadySubmitted');
  });

  it('returns null for SUBMISSION_FAILED and unknown/missing codes (falls back to errors[])', () => {
    expect(resolveErrorCodeKey('SUBMISSION_FAILED')).toBeNull();
    expect(resolveErrorCodeKey(undefined)).toBeNull();
    expect(resolveErrorCodeKey('SOMETHING_ELSE')).toBeNull();
  });
});

// ── Component ───────────────────────────────────────────────────────────────

const DECL = { id: 'decl-1', year: 2026, period: 'T2', model: '303', result: { kind: 'I' } };
const ORG_IDENT = { nif: 'B20868352', nombre: 'F&B España, S.A' };

function jsonResponse(body) {
  return Promise.resolve({ ok: true, json: async () => body });
}

const DEFAULT_NRC = '1234567890123456789012';

// The default fixture is tipo 'I' with an empty NRC, which the ETP-5027 pre-flight guard
// now rejects. Fill the NRC centrally here so every submit-path test keeps exercising the
// behaviour it was written for; guard tests opt out with `{ fillNrc: false }`.
function renderFlow(overrides = {}) {
  const { fillNrc = true, ...props } = overrides;
  const defaults = {
    decl: DECL,
    orgIdent: ORG_IDENT,
    identChecks: { tipo_declaracion: 'I', bank_iban: 'ES7620770024003102575766' },
    summary: { result: -2816.31 },
    token: 'tok',
    apiBaseUrl: '/sws/neo/fiscal-models',
    onSuccess: vi.fn(),
    onClose: vi.fn(),
  };
  const utils = render(<AeatSubmitFlow {...defaults} {...props} />);
  if (fillNrc) {
    const nrcInput = screen.queryByTestId('AeatSubmitFlow__nrc');
    if (nrcInput) fireEvent.change(nrcInput, { target: { value: DEFAULT_NRC } });
  }
  return utils;
}

describe('AeatSubmitFlow — confirm screen', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the modal title', () => {
    renderFlow();
    expect(screen.getByText('fm.aeat.title')).toBeInTheDocument();
  });

  it('pre-fills presenter NIF/name from orgIdent', () => {
    renderFlow();
    expect(screen.getByTestId('AeatSubmitFlow__presenterNif')).toHaveValue('B20868352');
    expect(screen.getByTestId('AeatSubmitFlow__presenterName')).toHaveValue('F&B España, S.A');
  });

  it('shows the test-mode warning banner only when the checkbox is checked', () => {
    renderFlow();
    expect(screen.queryByText('fm.aeat.test_mode.warning')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('AeatSubmitFlow__testMode'));
    expect(screen.getByText('fm.aeat.test_mode.warning')).toBeInTheDocument();
  });

  it('calls onClose when the close (✕) button is clicked', () => {
    const onClose = vi.fn();
    renderFlow({ onClose });
    fireEvent.click(screen.getByLabelText('fm.action.close'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('AeatSubmitFlow — NRC visibility (ETP-4456, NRC only applies to tipo I / Ingreso)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the NRC input for tipo I (Ingreso), the default fixture', () => {
    renderFlow();
    expect(screen.getByTestId('AeatSubmitFlow__nrc')).toBeInTheDocument();
  });

  it('does not render the NRC input for tipo U (Domiciliación)', () => {
    renderFlow({ identChecks: { tipo_declaracion: 'U', bank_iban: 'ES7620770024003102575766' } });
    expect(screen.queryByTestId('AeatSubmitFlow__nrc')).not.toBeInTheDocument();
  });

  it('does not render the NRC input for tipo D (Devolución)', () => {
    renderFlow({ identChecks: { tipo_declaracion: 'D', bank_iban: 'ES7620770024003102575766' } });
    expect(screen.queryByTestId('AeatSubmitFlow__nrc')).not.toBeInTheDocument();
  });

  it('does not render the NRC input for tipo N (Sin actividad / resultado cero)', () => {
    renderFlow({ identChecks: { tipo_declaracion: 'N' } });
    expect(screen.queryByTestId('AeatSubmitFlow__nrc')).not.toBeInTheDocument();
  });

  it('still submits successfully for a non-I tipo where NRC is hidden, sending nrc: "" in the body', async () => {
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'SUCCESS' }));
    renderFlow({ identChecks: { tipo_declaracion: 'N' } });

    // NRC input is not present, so it can't be typed into — the local nrc state stays at its
    // default '' — but submission must still succeed and produce a well-formed body.
    expect(screen.queryByTestId('AeatSubmitFlow__nrc')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(stableApiFetch).toHaveBeenCalledTimes(1));
    const [, options] = stableApiFetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({
      testMode: false, idi: 'ES', nrc: '',
      presenterNif: 'B20868352', presenterName: 'F&B España, S.A',
    });
  });
});

describe('AeatSubmitFlow — submit request shape', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sends year/period/tipo/id as query params, forwards identChecks via applyIdentParams (IBAN last), and the built body as JSON', async () => {
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'SUCCESS' }));
    renderFlow();

    fireEvent.change(screen.getByTestId('AeatSubmitFlow__nrc'), { target: { value: ' 1234567890AB ' } });
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(stableApiFetch).toHaveBeenCalledTimes(1));
    const [path, options] = stableApiFetch.mock.calls[0];
    // The default fixture's identChecks.bank_iban is present, so applyIdentParams appends
    // IBAN after the base {year,period,tipo,id} params (URLSearchParams preserves insertion
    // order) — this happens regardless of whether tipo 'I' is IBAN-required (it is not, per
    // EDID065 / IBAN_REQUIRED_TIPOS: only U/D/X are).
    expect(path).toBe('/fiscal303/submit?year=2026&period=T2&tipo=I&id=decl-1&IBAN=ES7620770024003102575766');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      testMode: false, idi: 'ES', nrc: '1234567890AB',
      presenterNif: 'B20868352', presenterName: 'F&B España, S.A',
    });
  });

  it('sends testMode: true when the checkbox is checked', async () => {
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'TEST_SUCCESS' }));
    renderFlow();
    fireEvent.click(screen.getByTestId('AeatSubmitFlow__testMode'));
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));
    await waitFor(() => expect(stableApiFetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(stableApiFetch.mock.calls[0][1].body).testMode).toBe(true);
  });
});

describe('AeatSubmitFlow — IBAN pre-flight guard (ETP-4456, submit-flow parity with generate303File)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('forwards IBAN (spaces stripped) for an IBAN-required tipo when bank_iban is present', async () => {
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'SUCCESS' }));
    renderFlow({
      identChecks: { tipo_declaracion: 'U', bank_iban: 'ES76 2077 0024 0031 0257 5766' },
    });
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(stableApiFetch).toHaveBeenCalledTimes(1));
    const [path] = stableApiFetch.mock.calls[0];
    expect(path).toContain('IBAN=ES7620770024003102575766');
  });

  it('does not call apiFetch and shows a client-side error when an IBAN-required tipo has no bank_iban', async () => {
    renderFlow({ identChecks: { tipo_declaracion: 'D', bank_iban: '' } });
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(screen.getByText('fm.aeat.error.ibanRequired')).toBeInTheDocument());
    expect(stableApiFetch).not.toHaveBeenCalled();
    // Still on the confirm screen — the submit button must still be present.
    expect(screen.getByText('fm.aeat.action.submit')).toBeInTheDocument();
  });

  it('also blocks when bank_iban is only whitespace', async () => {
    renderFlow({ identChecks: { tipo_declaracion: 'X', bank_iban: '   ' } });
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(screen.getByText('fm.aeat.error.ibanRequired')).toBeInTheDocument());
    expect(stableApiFetch).not.toHaveBeenCalled();
  });

  it('submits fine without an IBAN param for a non-IBAN-required tipo with no bank_iban', async () => {
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'SUCCESS' }));
    renderFlow({ identChecks: { tipo_declaracion: 'C' } });
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(stableApiFetch).toHaveBeenCalledTimes(1));
    const [path] = stableApiFetch.mock.calls[0];
    expect(path).not.toContain('IBAN=');
  });

  it('no longer blocks tipo=I on IBAN (EDID065 fix — I removed from IBAN_REQUIRED_TIPOS)', async () => {
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'SUCCESS' }));
    renderFlow({ identChecks: { tipo_declaracion: 'I', bank_iban: '' } });
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(stableApiFetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('fm.aeat.error.ibanRequired')).not.toBeInTheDocument();
    const [path] = stableApiFetch.mock.calls[0];
    expect(path).not.toContain('IBAN=');
  });

  it('no longer blocks tipo=V on IBAN (EDID065 fix — V removed from IBAN_REQUIRED_TIPOS)', async () => {
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'SUCCESS' }));
    renderFlow({ identChecks: { tipo_declaracion: 'V', bank_iban: '   ' } });
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(stableApiFetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('fm.aeat.error.ibanRequired')).not.toBeInTheDocument();
  });

  it('blocks tipo=I when rectificativa is checked and bank_iban is empty (ETP-4456 follow-up fix)', async () => {
    // tipo I alone is not IBAN-required (EDID065 fix, see above), but a
    // rectificativa filed under tipo I still shows the bank section (per
    // fm303Layouts.js's datos_bancarios anyOf) — the pre-flight guard must
    // widen to cover that case too, or an empty IBAN would round-trip to
    // the backend for an untranslated 500 instead of failing fast here.
    renderFlow({ identChecks: { tipo_declaracion: 'I', bank_iban: '', rectificativa: true } });
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(screen.getByText('fm.aeat.error.ibanRequired')).toBeInTheDocument());
    expect(stableApiFetch).not.toHaveBeenCalled();
  });

  it('still does not block tipo=I when rectificativa is absent/false, even with an empty IBAN', async () => {
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'SUCCESS' }));
    renderFlow({ identChecks: { tipo_declaracion: 'I', bank_iban: '' } });
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(stableApiFetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('fm.aeat.error.ibanRequired')).not.toBeInTheDocument();
  });
});

describe('AeatSubmitFlow — result: SUCCESS', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows the success banner, declaration numbers, and calls onSuccess with submitted_ack', async () => {
    const onSuccess = vi.fn();
    stableApiFetch.mockReturnValueOnce(jsonResponse({
      status: 'SUCCESS', csv: 'CSV123', presentationDate: '2026-07-21',
      registryNumber: 'REG1', justificanteNumber: 'JUS1',
    }));
    renderFlow({ onSuccess });
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(screen.getByText('fm.aeat.result.success.title')).toBeInTheDocument());
    expect(screen.getByText('CSV123')).toBeInTheDocument();
    expect(screen.getByText('REG1')).toBeInTheDocument();
    expect(screen.getByText('JUS1')).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalledWith('submitted_ack');
  });

  it('shows a download button when pdfBase64 is present', async () => {
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'SUCCESS', pdfBase64: 'AAAA' }));
    renderFlow();
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));
    await waitFor(() => expect(screen.getByText('fm.aeat.action.download_pdf')).toBeInTheDocument());
  });

  it('shows the pdfDownloadFailed message instead of a download button, without implying the submission failed', async () => {
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'SUCCESS', pdfBase64: 'AAAA', pdfDownloadFailed: true }));
    renderFlow();
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));
    await waitFor(() => expect(screen.getByText('fm.aeat.result.success.title')).toBeInTheDocument());
    expect(screen.getByText('fm.aeat.result.pdf_failed')).toBeInTheDocument();
    expect(screen.queryByText('fm.aeat.action.download_pdf')).not.toBeInTheDocument();
  });
});

describe('AeatSubmitFlow — result: TEST_SUCCESS', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows the "not filed" banner, offers the draft PDF, and does NOT call onSuccess', async () => {
    const onSuccess = vi.fn();
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'TEST_SUCCESS', pdfBase64: 'AAAA' }));
    renderFlow({ onSuccess });
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(screen.getByText('fm.aeat.result.test.title')).toBeInTheDocument());
    expect(screen.getByText('fm.aeat.action.download_pdf')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe('AeatSubmitFlow — result: ERROR', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows a specific message for MISSING_PRESENTER instead of the generic errors dump', async () => {
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'ERROR', errorCode: 'MISSING_PRESENTER', errors: ['ignored'] }));
    renderFlow();
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));
    await waitFor(() => expect(screen.getByText('fm.aeat.error.missingPresenter')).toBeInTheDocument());
    expect(screen.queryByText('ignored')).not.toBeInTheDocument();
  });

  it('shows a specific message and a shortcut to fiscal-config for NO_CERTIFICATE', async () => {
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'ERROR', errorCode: 'NO_CERTIFICATE' }));
    renderFlow();
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));
    await waitFor(() => expect(screen.getByText('fm.aeat.error.noCertificate')).toBeInTheDocument());

    fireEvent.click(screen.getByText('fm.aeat.action.go_to_cert_config'));
    expect(navigateMock).toHaveBeenCalledWith('/fiscal-config');
  });

  it('shows a specific message for ALREADY_SUBMITTED instead of the generic errors dump, with no cert-config shortcut', async () => {
    stableApiFetch.mockReturnValueOnce(jsonResponse({
      status: 'ERROR', testMode: false, errorCode: 'ALREADY_SUBMITTED',
      errors: ['This declaration was already submitted to the AEAT (status: submitted_ack). Resubmitting the same declaration in production is not supported here — filing a complementaria is a separate, manual process.'],
      warnings: [],
    }));
    renderFlow();
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));
    await waitFor(() => expect(screen.getByText('fm.aeat.error.alreadySubmitted')).toBeInTheDocument());
    // The specific message replaces the raw AEAT errors[] dump...
    expect(screen.queryByText(/Resubmitting the same declaration in production/)).not.toBeInTheDocument();
    // ...and, unlike NO_CERTIFICATE, this error code has no dedicated action button.
    expect(screen.queryByText('fm.aeat.action.go_to_cert_config')).not.toBeInTheDocument();
  });

  it('renders the raw AEAT errors[] list for unrecognized/absent error codes', async () => {
    stableApiFetch.mockReturnValueOnce(jsonResponse({
      status: 'ERROR', errorCode: 'SUBMISSION_FAILED',
      errors: ['E0100803 - Razón social del Declarante'],
    }));
    renderFlow();
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));
    await waitFor(() => expect(screen.getByText('E0100803 - Razón social del Declarante')).toBeInTheDocument());
  });
});

describe('AeatSubmitFlow — onAttached (Justificante tab refresh, ETP-4456 test-mode attach follow-up)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls onAttached (but not onSuccess) for a TEST_SUCCESS response with a PDF', async () => {
    const onSuccess = vi.fn();
    const onAttached = vi.fn();
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'TEST_SUCCESS', pdfBase64: 'AAAA' }));
    renderFlow({ onSuccess, onAttached });
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(screen.getByText('fm.aeat.result.test.title')).toBeInTheDocument());
    expect(onAttached).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('calls both onSuccess and onAttached for a SUCCESS response with a PDF', async () => {
    const onSuccess = vi.fn();
    const onAttached = vi.fn();
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'SUCCESS', pdfBase64: 'AAAA' }));
    renderFlow({ onSuccess, onAttached });
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(screen.getByText('fm.aeat.result.success.title')).toBeInTheDocument());
    expect(onSuccess).toHaveBeenCalledWith('submitted_ack');
    expect(onAttached).toHaveBeenCalledTimes(1);
  });

  it('does not call onAttached for a TEST_SUCCESS response without a PDF', async () => {
    const onAttached = vi.fn();
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'TEST_SUCCESS' }));
    renderFlow({ onAttached });
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(screen.getByText('fm.aeat.result.test.title')).toBeInTheDocument());
    expect(onAttached).not.toHaveBeenCalled();
  });

  it('does not call onAttached for a SUCCESS response whose PDF download failed (pdfBase64 null)', async () => {
    const onSuccess = vi.fn();
    const onAttached = vi.fn();
    stableApiFetch.mockReturnValueOnce(jsonResponse({
      status: 'SUCCESS', pdfBase64: null, pdfDownloadFailed: true,
    }));
    renderFlow({ onSuccess, onAttached });
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(screen.getByText('fm.aeat.result.success.title')).toBeInTheDocument());
    // The declaration was still submitted successfully — onSuccess still fires — but there is
    // no PDF to attach, so onAttached must not be called (no wasted remount of the receipt tab).
    expect(onSuccess).toHaveBeenCalledWith('submitted_ack');
    expect(onAttached).not.toHaveBeenCalled();
  });
});

describe('AeatSubmitFlow — onIncidentsChanged (Incidencias tab refresh, ETP-4456)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls onIncidentsChanged for a SUCCESS response', async () => {
    const onIncidentsChanged = vi.fn();
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'SUCCESS' }));
    renderFlow({ onIncidentsChanged });
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(screen.getByText('fm.aeat.result.success.title')).toBeInTheDocument());
    expect(onIncidentsChanged).toHaveBeenCalledTimes(1);
  });

  it('calls onIncidentsChanged for a TEST_SUCCESS response', async () => {
    const onIncidentsChanged = vi.fn();
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'TEST_SUCCESS' }));
    renderFlow({ onIncidentsChanged });
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(screen.getByText('fm.aeat.result.test.title')).toBeInTheDocument());
    expect(onIncidentsChanged).toHaveBeenCalledTimes(1);
  });

  it('calls onIncidentsChanged for an ERROR response — incidents are persisted on failed submissions too', async () => {
    const onIncidentsChanged = vi.fn();
    stableApiFetch.mockReturnValueOnce(jsonResponse({
      status: 'ERROR', errorCode: 'SUBMISSION_FAILED',
      errors: ['E0100803 - Razón social del Declarante'],
    }));
    renderFlow({ onIncidentsChanged });
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(screen.getByText('fm.aeat.result.error.title')).toBeInTheDocument());
    expect(onIncidentsChanged).toHaveBeenCalledTimes(1);
  });

  it('does not call onIncidentsChanged when the response is malformed (connection-error path)', async () => {
    const onIncidentsChanged = vi.fn();
    stableApiFetch.mockReturnValueOnce(Promise.resolve({ ok: false, json: async () => { throw new Error('bad json'); } }));
    renderFlow({ onIncidentsChanged });
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(screen.getByText('fm.aeat.error.connection')).toBeInTheDocument());
    expect(onIncidentsChanged).not.toHaveBeenCalled();
  });

  it('still calls onIncidentsChanged for a test-mode (testMode: true) submission', async () => {
    const onIncidentsChanged = vi.fn();
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'TEST_SUCCESS' }));
    renderFlow({ onIncidentsChanged });
    fireEvent.click(screen.getByTestId('AeatSubmitFlow__testMode'));
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(stableApiFetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(stableApiFetch.mock.calls[0][1].body).testMode).toBe(true);
    await waitFor(() => expect(screen.getByText('fm.aeat.result.test.title')).toBeInTheDocument());
    expect(onIncidentsChanged).toHaveBeenCalledTimes(1);
  });
});

describe('AeatSubmitFlow — double-submit protection (Sentinel QA, ETP-4456)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // Uses userEvent (not fireEvent) deliberately: fireEvent.click dispatches a raw event that
  // bypasses the browser's native "disabled elements don't activate" behavior (verified directly
  // against jsdom — a disabled button's click listener still fires via dispatchEvent), so a
  // fireEvent-based version of this test would pass even if the button were NOT actually
  // protecting against a second click. userEvent emulates a real user interaction and correctly
  // no-ops on a disabled target, which is what this test needs to assert.
  it('disables the submit button while a request is in flight, so a rapid second click cannot fire another request', async () => {
    const user = userEvent.setup();
    let resolveFetch;
    stableApiFetch.mockReturnValueOnce(new Promise((resolve) => { resolveFetch = resolve; }));
    renderFlow();

    const submitBtn = screen.getByText('fm.aeat.action.submit').closest('button');
    await user.click(submitBtn);

    // setSubmitting(true) runs synchronously before the first `await` inside handleSubmit, so the
    // button must already be disabled once the click interaction settles.
    expect(submitBtn).toBeDisabled();

    // A second user click on the now-disabled button must not fire another request.
    await user.click(submitBtn);
    expect(stableApiFetch).toHaveBeenCalledTimes(1);

    resolveFetch({ ok: true, json: async () => ({ status: 'SUCCESS' }) });
    await waitFor(() => expect(screen.getByText('fm.aeat.result.success.title')).toBeInTheDocument());
  });
});

describe('AeatSubmitFlow — connection failure', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows a connection-error banner and stays on the confirm screen when the response has no JSON body', async () => {
    stableApiFetch.mockReturnValueOnce(Promise.resolve({ ok: false, json: async () => { throw new Error('bad json'); } }));
    renderFlow();
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));
    await waitFor(() => expect(screen.getByText('fm.aeat.error.connection')).toBeInTheDocument());
    // Still on the confirm screen — the submit button must still be present.
    expect(screen.getByText('fm.aeat.action.submit')).toBeInTheDocument();
  });

  it('shows a connection-error banner when apiFetch rejects (network failure)', async () => {
    stableApiFetch.mockReturnValueOnce(Promise.reject(new Error('network down')));
    renderFlow();
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));
    await waitFor(() => expect(screen.getByText('fm.aeat.error.connection')).toBeInTheDocument());
  });
});

describe('AeatSubmitFlow — NRC required guard (ETP-5027)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  function submit() {
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));
  }

  it('blocks submission and shows the error banner for tipo I with an empty NRC', async () => {
    renderFlow({ fillNrc: false });
    submit();

    await waitFor(() => expect(screen.getByText('fm.aeat.error.nrcRequired')).toBeInTheDocument());
    expect(stableApiFetch).not.toHaveBeenCalled();
    // Still on the confirm screen — the submit button must still be present.
    expect(screen.getByText('fm.aeat.action.submit')).toBeInTheDocument();
  });

  it('blocks submission for tipo I with a whitespace-only NRC', async () => {
    renderFlow({ fillNrc: false });
    fireEvent.change(screen.getByTestId('AeatSubmitFlow__nrc'), { target: { value: '   ' } });
    submit();

    await waitFor(() => {
      expect(screen.getByText('fm.aeat.error.nrcRequired')).toBeInTheDocument();
    });
    expect(stableApiFetch).not.toHaveBeenCalled();
  });

  it('does not block submission for tipo I once the NRC is filled', async () => {
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'SUCCESS' }));
    renderFlow();
    submit();

    await waitFor(() => expect(stableApiFetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('fm.aeat.error.nrcRequired')).not.toBeInTheDocument();
  });

  it('does not block submission in test mode, where no NRC exists yet', async () => {
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'TEST_SUCCESS' }));
    renderFlow({ fillNrc: false });
    fireEvent.click(screen.getByTestId('AeatSubmitFlow__testMode'));
    submit();

    await waitFor(() => expect(stableApiFetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('fm.aeat.error.nrcRequired')).not.toBeInTheDocument();
  });

  it.each(['U', 'D', 'N'])('does not fire the NRC guard for tipo %s', async (tipo) => {
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'SUCCESS' }));
    renderFlow({
      fillNrc: false,
      decl: { ...DECL, result: { kind: tipo } },
      identChecks: { tipo_declaracion: tipo, bank_iban: 'ES7620770024003102575766' },
    });
    submit();

    await waitFor(() => expect(stableApiFetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('fm.aeat.error.nrcRequired')).not.toBeInTheDocument();
  });
});

// The asterisk and the pre-flight guard are driven by the same `nrcRequired` expression, so
// the marker must track test mode exactly like the guard does: while "Validar sin presentar"
// is checked the NRC is not required, and promising otherwise with an asterisk is a lie.
describe('AeatSubmitFlow — NRC required marker (ETP-5027)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the required asterisk next to the NRC label for tipo I with test mode off', () => {
    const { container } = renderFlow();
    expect(screen.getByTestId('AeatSubmitFlow__testMode')).not.toBeChecked();
    expect(container.querySelector('.fm-aeat-required-mark')).toBeInTheDocument();
  });

  it('renders no required asterisk when the NRC field is hidden (tipo D, test mode off)', () => {
    const { container } = renderFlow({
      decl: { ...DECL, result: { kind: 'D' } },
      identChecks: { tipo_declaracion: 'D', bank_iban: 'ES7620770024003102575766' },
    });
    expect(container.querySelector('.fm-aeat-required-mark')).toBeNull();
  });

  it('renders no required asterisk for tipo I when test mode is on', () => {
    const { container } = renderFlow();
    fireEvent.click(screen.getByTestId('AeatSubmitFlow__testMode'));
    expect(container.querySelector('.fm-aeat-required-mark')).toBeNull();
  });

  it('keeps the NRC input visible in test mode — only the required marker goes away', () => {
    const { container } = renderFlow();
    fireEvent.click(screen.getByTestId('AeatSubmitFlow__testMode'));
    expect(screen.getByTestId('AeatSubmitFlow__nrc')).toBeInTheDocument();
    expect(container.querySelector('.fm-aeat-required-mark')).toBeNull();
  });

  it('toggles the asterisk reactively as the test-mode checkbox is clicked', () => {
    const { container } = renderFlow();
    const checkbox = screen.getByTestId('AeatSubmitFlow__testMode');
    expect(container.querySelector('.fm-aeat-required-mark')).toBeInTheDocument();
    fireEvent.click(checkbox);
    expect(container.querySelector('.fm-aeat-required-mark')).toBeNull();
    fireEvent.click(checkbox);
    expect(container.querySelector('.fm-aeat-required-mark')).toBeInTheDocument();
  });
});
