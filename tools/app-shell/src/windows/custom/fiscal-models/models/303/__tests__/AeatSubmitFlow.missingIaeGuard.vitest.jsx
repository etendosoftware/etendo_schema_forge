// Vitest tests for AeatSubmitFlow's ETP-4975 missing-default-IAE-activity
// pre-flight guard in handleSubmit ("Submit to AEAT" button). Mirrors the
// identical guard already covered on FmModel303Page's "Generar fichero 303"
// button — see FmModel303Page.missingIaeGuard.vitest.jsx and AeatSubmitFlow.jsx's
// own handleSubmit docstring for the full rationale (Classic's Modelo 303 code,
// reused via reflection, throws an untranslated IndexOutOfBoundsException on the
// last period of the fiscal year when the organization has no default IAE
// activity with a code).
//
// Unlike FmModel303Page (raw `fetch`), AeatSubmitFlow reaches the backend via
// `useApiFetch` — mocked here the same way AeatSubmitFlow.vitest.jsx does, with
// a single stable `stableApiFetch` mock disambiguated by URL. `useAuth` is also
// mocked (unlike AeatSubmitFlow.vitest.jsx, which lets it fail-open via the
// try/catch around the missing-provider case) so `selectedOrg.id` resolves and
// the guard actually has a chance to run.

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
import AeatSubmitFlow from '../AeatSubmitFlow.jsx';

const LAST_PERIOD_DECL = { id: 'decl-t4', year: 2026, period: 'T4', model: '303', result: { kind: 'N' } };
const NOT_LAST_PERIOD_DECL = { id: 'decl-t2', year: 2026, period: 'T2', model: '303', result: { kind: 'N' } };
const ORG_IDENT = { nif: 'B20868352', nombre: 'F&B España, S.A' };
// tipo N: no NRC, no IBAN required — keeps every case focused on the IAE guard alone.
const IDENT_CHECKS = { tipo_declaracion: 'N' };

function jsonResponse(body) {
  return Promise.resolve({ ok: true, json: async () => body });
}

// iaeRows null (with iaeRejects) => the /organization/actividadesDelIae fetch itself rejects
// (fail-open case). Any call to /fiscal303/submit always succeeds, so tests can assert purely
// on whether it was reached and with what call count.
function mockApiFetch({ iaeRows = [], iaeRejects = false } = {}) {
  stableApiFetch.mockImplementation((url) => {
    if (url.includes('/organization/actividadesDelIae')) {
      if (iaeRejects) return Promise.reject(new Error('network down'));
      return jsonResponse({ response: { data: iaeRows } });
    }
    if (url.includes('/fiscal303/submit')) {
      return jsonResponse({ status: 'SUCCESS' });
    }
    return jsonResponse({});
  });
}

function renderFlow(overrides = {}) {
  const defaults = {
    decl: LAST_PERIOD_DECL,
    orgIdent: ORG_IDENT,
    identChecks: IDENT_CHECKS,
    summary: { result: -100 },
    token: 'tok',
    apiBaseUrl: '/sws/neo/fiscal-models',
    onSuccess: vi.fn(),
    onClose: vi.fn(),
  };
  return render(<AeatSubmitFlow {...defaults} {...overrides} />);
}

function submitCalls() {
  return stableApiFetch.mock.calls.filter(([url]) => url.includes('/fiscal303/submit'));
}

function iaeCalls() {
  return stableApiFetch.mock.calls.filter(([url]) => url.includes('/organization/actividadesDelIae'));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AeatSubmitFlow — missing default IAE activity guard (ETP-4975)', () => {
  it('last period + a default row WITH a code: proceeds to submit normally', async () => {
    mockApiFetch({ iaeRows: [{ id: 'row-1', default: true, epiaeCode: 'C1' }] });
    renderFlow();

    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(submitCalls()).toHaveLength(1));
    expect(screen.queryByText('fm.aeat.error.missingDefaultIae')).not.toBeInTheDocument();
  });

  it('last period + NO default row: blocks BEFORE calling /fiscal303/submit and shows the banner + CTA', async () => {
    mockApiFetch({ iaeRows: [] });
    renderFlow();

    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(screen.getByText('fm.aeat.error.missingDefaultIae')).toBeInTheDocument());
    expect(submitCalls()).toHaveLength(0);
    expect(screen.getByText('fm.aeat.action.go_to_organization')).toBeInTheDocument();
  });

  it('last period + a default row WITHOUT a code: still counts as missing and blocks', async () => {
    mockApiFetch({ iaeRows: [{ id: 'row-1', default: true, epiaeCode: null }] });
    renderFlow();

    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(screen.getByText('fm.aeat.error.missingDefaultIae')).toBeInTheDocument());
    expect(submitCalls()).toHaveLength(0);
  });

  it('non-last period: never checks actividadesDelIae and submits normally', async () => {
    mockApiFetch({ iaeRows: [] }); // would block if (wrongly) checked
    renderFlow({ decl: NOT_LAST_PERIOD_DECL });

    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(submitCalls()).toHaveLength(1));
    expect(iaeCalls()).toHaveLength(0);
    expect(screen.queryByText('fm.aeat.error.missingDefaultIae')).not.toBeInTheDocument();
  });

  it('fails OPEN when the actividadesDelIae fetch itself errors (network failure): submission still proceeds', async () => {
    mockApiFetch({ iaeRejects: true });
    renderFlow();

    fireEvent.click(screen.getByText('fm.aeat.action.submit'));

    await waitFor(() => expect(submitCalls()).toHaveLength(1));
    expect(screen.queryByText('fm.aeat.error.missingDefaultIae')).not.toBeInTheDocument();
  });

  it('clicking the "Go to Organization" CTA navigates to /organization', async () => {
    mockApiFetch({ iaeRows: [] });
    renderFlow();

    fireEvent.click(screen.getByText('fm.aeat.action.submit'));
    await waitFor(() => expect(screen.getByText('fm.aeat.action.go_to_organization')).toBeInTheDocument());

    fireEvent.click(screen.getByText('fm.aeat.action.go_to_organization'));
    expect(navigateMock).toHaveBeenCalledWith('/organization');
  });
});
