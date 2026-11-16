// @covers tools/app-shell/src/pages/PortalDecisionPage.jsx
// New file: the decision landing is its own public route with its own page; PortalPage's tests
// cover the portal, not this one. The confirmation call is the real `confirmPortalDecision`; only
// `apiFetch` (the network boundary) is a double.
const apiFetchMock = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => apiFetchMock }));

/** The mocked translation: the key, plus its variables, so the number and tenant show. */
function t(key, vars) {
  return vars ? `${key} ${JSON.stringify(vars)}` : key;
}
vi.mock('@/i18n', () => ({ useUI: () => t }));

import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter, Route, Routes, useLocation, useNavigationType,
} from 'react-router-dom';
import PortalDecisionPage from '../PortalDecisionPage.jsx';

const DECISION_TOKEN = 'dec-0123456789abcdef';

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

function renderLanding({ strict = false, path = `/portal/decision/${DECISION_TOKEN}` } = {}) {
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="portal/decision/:token" element={<PortalDecisionPage />} />
        <Route path="portal/:token" element={<PortalArrivalProbe />} />
      </Routes>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

/** Stands in for the portal: shows where the landing sent the customer, and how. */
function PortalArrivalProbe() {
  const location = useLocation();
  return (
    <output
      data-testid="portal-arrival-probe"
      data-path={`${location.pathname}${location.search}`}
      data-navigation={useNavigationType()}
      data-state={JSON.stringify(location.state)}
    />
  );
}

const confirmCalls = () => apiFetchMock.mock.calls.filter(([path]) => path.endsWith('/decisions/confirm'));

const APPLIED_REJECT = {
  state: 'confirmed', appliedNow: true, decision: 'REJECT', reasonCode: 'OTHER',
  reasonText: 'Ya no lo necesitamos', documentNo: 'PR/0001', tenantName: 'Acme SA',
};

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue(jsonResponse(APPLIED_REJECT));
});

describe('PortalDecisionPage — the confirmation POST', () => {
  it('POSTs the confirmation once on open, with the token in its header and never in the URL', async () => {
    renderLanding();

    await waitFor(() => expect(screen.getByTestId('portal-decision-applied')).toBeInTheDocument());
    expect(confirmCalls()).toHaveLength(1);
    const [path, options] = confirmCalls()[0];
    expect(path).not.toContain(DECISION_TOKEN);
    expect(options).toStrictEqual({
      token: null, headers: { 'X-Portal-Decision-Token': DECISION_TOKEN }, on401: 'ignore', method: 'POST',
    });
  });

  it('POSTs once under StrictMode too, where the effect runs twice', async () => {
    renderLanding({ strict: true });

    await waitFor(() => expect(screen.getByTestId('portal-decision-applied')).toBeInTheDocument());
    // A second POST would answer "already applied" and hide what this open did.
    expect(confirmCalls()).toHaveLength(1);
  });
});

describe('PortalDecisionPage — what it says', () => {
  it('says what this open applied, with the number, and the reason of a rejection', async () => {
    renderLanding();

    await waitFor(() => expect(screen.getByTestId('portal-decision-applied')).toBeInTheDocument());
    const card = screen.getByTestId('portal-decision-applied');
    expect(card.querySelector('h1').textContent).toBe('portalDecisionAppliedRejectTitle PR/0001');
    expect(screen.getByTestId('portal-decision-reason').textContent)
      .toBe('portalRejectReasonLabel: portalRejectReasonOther — Ya no lo necesitamos');
  });

  it('says an acceptance applied now as an acceptance, with no reason line', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({ state: 'confirmed', appliedNow: true, decision: 'ACCEPT', documentNo: 'PR/0001' }));
    renderLanding();

    await waitFor(() => expect(screen.getByTestId('portal-decision-applied')).toBeInTheDocument());
    expect(screen.getByTestId('portal-decision-applied').querySelector('h1').textContent)
      .toBe('portalDecisionAppliedAcceptTitle PR/0001');
    expect(screen.queryByTestId('portal-decision-reason')).not.toBeInTheDocument();
  });

  for (const [label, body, testId, title] of [
    ['already applied (a re-opened link)', { state: 'confirmed', appliedNow: false, decision: 'REJECT' }, 'portal-decision-confirmed', 'portalDecisionConfirmedTitle'],
    ['voided (another decision won)', { state: 'voided' }, 'portal-decision-voided', 'portalDecisionVoidedTitle'],
    ['no longer pending', { state: 'not_pending' }, 'portal-decision-not_pending', 'portalDecisionNotPendingTitle'],
    ['expired', { state: 'expired' }, 'portal-decision-expired', 'portalDecisionExpiredTitle'],
  ]) {
    it(`says the decision is ${label}`, async () => {
      apiFetchMock.mockResolvedValue(jsonResponse({ documentNo: 'PR/0001', ...body }));
      renderLanding();

      await waitFor(() => expect(screen.getByTestId(testId)).toBeInTheDocument());
      expect(screen.getByTestId(testId).querySelector('h1').textContent).toBe(title);
      expect(screen.queryByTestId('portal-decision-reason')).not.toBeInTheDocument();
    });
  }

  for (const status of [401, 403, 404]) {
    it(`shows the generic invalid-link screen on ${status}`, async () => {
      apiFetchMock.mockResolvedValue(jsonResponse({}, { status }));
      renderLanding();

      await waitFor(() => expect(screen.getByTestId('portal-decision-invalid')).toBeInTheDocument());
      expect(screen.queryByTestId('portal-decision-retry')).not.toBeInTheDocument();
    });
  }

  it('offers a retry when the POST never completed, and the retry confirms', async () => {
    const user = userEvent.setup();
    apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderLanding();

    await waitFor(() => expect(screen.getByTestId('portal-decision-failed')).toBeInTheDocument());
    await user.click(screen.getByTestId('portal-decision-retry'));

    await waitFor(() => expect(screen.getByTestId('portal-decision-applied')).toBeInTheDocument());
    expect(confirmCalls()).toHaveLength(2);
  });
});

describe('PortalDecisionPage — the way into the portal', () => {
  it('opens the portal on the quotation, replacing the landing, with the notice in router state only', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({ ...APPLIED_REJECT, portalToken: 'tok-new', quotationId: 'q-1' }));
    // StrictMode: the effect runs twice, the confirmation still goes out once.
    renderLanding({ strict: true });

    await waitFor(() => expect(screen.getByTestId('portal-arrival-probe')).toBeInTheDocument());
    const probe = screen.getByTestId('portal-arrival-probe');
    expect(probe.dataset.path).toBe('/portal/tok-new?view=doc&kind=QUOTATION&id=q-1');
    // Replace: Back does not return to the landing (which would answer "already applied").
    expect(probe.dataset.navigation).toBe('REPLACE');
    expect(JSON.parse(probe.dataset.state)).toStrictEqual({
      portalNotice: {
        messageKey: 'portalNoticeRejected', tone: 'success', number: 'PR/0001',
        reasonCode: 'OTHER', reasonText: 'Ya no lo necesitamos',
      },
    });
    expect(screen.queryByTestId('portal-decision-applied')).not.toBeInTheDocument();
    expect(confirmCalls()).toHaveLength(1);
  });

  it('keeps its own card when the answer carries no portal token', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({ ...APPLIED_REJECT, portalToken: null, quotationId: 'q-1' }));
    renderLanding();

    await waitFor(() => expect(screen.getByTestId('portal-decision-applied')).toBeInTheDocument());
    expect(screen.queryByTestId('portal-arrival-probe')).not.toBeInTheDocument();
  });
});
