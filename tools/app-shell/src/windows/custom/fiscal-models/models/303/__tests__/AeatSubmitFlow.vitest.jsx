// Vitest tests for AeatSubmitFlow — the ETP-4456 Phase 2 AEAT 303 electronic
// submission flow. Covers the pure helpers (response-status branching,
// NRC/test-mode body shape, error-code-to-message mapping) plus the
// end-to-end render/submit/result behavior against a mocked apiFetch.

const stableApiFetch = vi.fn();
const navigateMock = vi.fn();

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => stableApiFetch }));
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

function renderFlow(overrides = {}) {
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
  return render(<AeatSubmitFlow {...defaults} {...overrides} />);
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

describe('AeatSubmitFlow — submit request shape', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sends year/period/tipo/id as query params, forwards identChecks via applyIdentParams (IBAN last), and the built body as JSON', async () => {
    stableApiFetch.mockReturnValueOnce(jsonResponse({ status: 'SUCCESS' }));
    renderFlow();

    fireEvent.change(screen.getByTestId('AeatSubmitFlow__nrc'), { target: { value: ' 1234567890AB ' } });
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(stableApiFetch).toHaveBeenCalledTimes(1));
    const [path, options] = stableApiFetch.mock.calls[0];
    // The default fixture's tipo ('I') is IBAN-required and its identChecks.bank_iban is
    // present, so applyIdentParams appends IBAN after the base {year,period,tipo,id} params
    // (URLSearchParams preserves insertion order).
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
    renderFlow({ identChecks: { tipo_declaracion: 'I', bank_iban: '' } });
    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(screen.getByText('fm.aeat.error.ibanRequired')).toBeInTheDocument());
    expect(stableApiFetch).not.toHaveBeenCalled();
    // Still on the confirm screen — the submit button must still be present.
    expect(screen.getByText('fm.aeat.action.submit')).toBeInTheDocument();
  });

  it('also blocks when bank_iban is only whitespace', async () => {
    renderFlow({ identChecks: { tipo_declaracion: 'V', bank_iban: '   ' } });
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
