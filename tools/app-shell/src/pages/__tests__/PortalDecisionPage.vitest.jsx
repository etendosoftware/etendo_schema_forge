// @covers tools/app-shell/src/pages/PortalDecisionPage.jsx
// @covers tools/app-shell/src/lib/portal/usePortalApiFetch.js

// The decision landing is its own public route with its own page; PortalPage's tests cover the
// portal, not this one. The confirmation call is the real `confirmPortalDecision`; only `apiFetch`
// (the network boundary) is a double.
const apiFetchMock = vi.fn();
// `real` lets one test drive the page through the REAL client over a stubbed `fetch`, to see
// what the session scope does to the answer; every other test reads the mock's call options.
const hookMode = { real: false };
vi.mock('@/lib/portal/usePortalApiFetch.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { usePortalApiFetch: (base) => (hookMode.real ? actual.usePortalApiFetch(base) : apiFetchMock) };
});

/** The mocked translation: the key, plus its variables, so the number and tenant show. */
function t(key, vars) {
  return vars ? `${key} ${JSON.stringify(vars)}` : key;
}
vi.mock('@/i18n', () => ({
  useUI: () => t,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter, Route, Routes, useLocation, useNavigationType,
} from 'react-router-dom';
import { registerApiSession, resetApiSessionForTests } from '@etendosoftware/app-shell-core/auth';
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

/**
 * `resendDelayMs` defaults to 0 so the lost-confirm tests do not each wait the real backoff; the
 * backoff itself has its own test below.
 */
function renderLanding({ strict = false, path = `/portal/decision/${DECISION_TOKEN}`, resendDelayMs = 0 } = {}) {
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="portal/decision/:token" element={<PortalDecisionPage resendDelayMs={resendDelayMs} />} />
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
const viewCalls = () => apiFetchMock.mock.calls.filter(([path]) => path.endsWith('/decisions/view'));

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

describe('PortalDecisionPage — a cold open from the email', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    hookMode.real = false;
    globalThis.fetch = realFetch;
    resetApiSessionForTests();
  });

  it('shows the applied decision when the app session identity settles while the POST is in flight', async () => {
    // The customer has no app session: the auth bootstrap resolves the identity (unknown, then
    // anonymous) in parallel with the confirm POST. The backend answers 200 and has committed
    // the decision; that answer must not be discarded as belonging to a superseded session.
    let identityReplaced = false;
    const scope = {
      capture: () => ({}),
      isSameIdentity: () => !identityReplaced,
      isCurrent: () => !identityReplaced,
    };
    registerApiSession({ getToken: () => null, onUnauthorized: () => {}, scope });
    globalThis.fetch = vi.fn(async () => {
      identityReplaced = true;
      return new Response(JSON.stringify(APPLIED_REJECT), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    });
    hookMode.real = true;

    renderLanding();

    await waitFor(() => expect(screen.getByTestId('portal-decision-applied')).toBeInTheDocument());
    expect(screen.queryByTestId('portal-decision-failed')).not.toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('never routes a portal 401 to the app logout, even with a session registered', async () => {
    const onUnauthorized = vi.fn();
    registerApiSession({ getToken: () => 'app-jwt', onUnauthorized });
    globalThis.fetch = vi.fn(async () => new Response('{}', {
      status: 401, headers: { 'Content-Type': 'application/json' },
    }));
    hookMode.real = true;

    renderLanding();

    await waitFor(() => expect(screen.getByTestId('portal-decision-invalid')).toBeInTheDocument());
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

describe('PortalDecisionPage — what it says', () => {
  it('says what this open applied, with the number, and the reason of a rejection', async () => {
    renderLanding();

    await waitFor(() => expect(screen.getByTestId('portal-decision-applied')).toBeInTheDocument());
    const card = screen.getByTestId('portal-decision-applied');
    expect(card.querySelector('h1').textContent).toBe('portalDecisionRejectedTitle');
    expect(screen.getByTestId('portal-decision-summary-number')).toHaveTextContent('PR/0001');
    // "Otros": the customer's own words stand in for the reason's label.
    expect(screen.getByTestId('portal-decision-reason').textContent)
      .toBe('portalRejectReasonLabelYa no lo necesitamos');
    expect(screen.getByTestId('portal-decision-notified')).toBeInTheDocument();
  });

  it('says an acceptance applied now as an acceptance, with no reason line', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({ state: 'confirmed', appliedNow: true, decision: 'ACCEPT', documentNo: 'PR/0001' }));
    renderLanding();

    await waitFor(() => expect(screen.getByTestId('portal-decision-applied')).toBeInTheDocument());
    expect(screen.getByTestId('portal-decision-applied').querySelector('h1').textContent)
      .toBe('portalDecisionAcceptedTitle');
    // An acceptance shows the issue date where a rejection shows its reason.
    expect(screen.queryByTestId('portal-decision-reason')).not.toBeInTheDocument();
    expect(screen.getByTestId('portal-decision-summary-date')).toBeInTheDocument();
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
      // Only a confirmed rejection names its reason in the summary (a re-opened link does too).
      if (body.state !== 'confirmed') expect(screen.queryByTestId('portal-decision-reason')).not.toBeInTheDocument();
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

  it('offers a retry when the POST and its resend never completed, and the retry confirms', async () => {
    const user = userEvent.setup();
    apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    apiFetchMock.mockResolvedValueOnce(jsonResponse({ state: 'pending', documentNo: 'PR/0001' }));
    renderLanding();

    await waitFor(() => expect(screen.getByTestId('portal-decision-failed')).toBeInTheDocument());
    await user.click(screen.getByTestId('portal-decision-retry'));

    await waitFor(() => expect(screen.getByTestId('portal-decision-applied')).toBeInTheDocument());
    expect(confirmCalls()).toHaveLength(3);
  });
});

describe('PortalDecisionPage — a confirm whose answer was lost', () => {
  it('resends the confirmation once and enters the portal on its answer, as already answered', async () => {
    const user = userEvent.setup();
    apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    apiFetchMock.mockResolvedValueOnce(jsonResponse({
      state: 'confirmed', appliedNow: false, decision: 'REJECT', documentNo: 'PR/0001',
      portalToken: 'tok-new', quotationId: 'q-1',
    }));
    renderLanding();

    await waitFor(() => expect(screen.getByTestId('portal-decision-confirmed')).toBeInTheDocument());
    await user.click(screen.getByTestId('portal-decision-enter'));
    await waitFor(() => expect(screen.getByTestId('portal-arrival-probe')).toBeInTheDocument());
    const probe = screen.getByTestId('portal-arrival-probe');
    expect(probe.dataset.path).toBe('/portal/tok-new?view=doc&kind=QUOTATION&id=q-1');
    expect(probe.dataset.navigation).toBe('REPLACE');
    expect(JSON.parse(probe.dataset.state).portalNotice.messageKey).toBe('portalNoticeAlreadyAnswered');
    expect(confirmCalls()).toHaveLength(2);
    expect(confirmCalls()[1][1]).toStrictEqual(confirmCalls()[0][1]);
    expect(viewCalls()).toHaveLength(0);
  });

  it('waits the backoff before its one resend', async () => {
    const DELAY_MS = 300;
    apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const started = Date.now();
    renderLanding({ resendDelayMs: DELAY_MS });

    await waitFor(() => expect(confirmCalls()).toHaveLength(1));
    await new Promise((resolve) => { setTimeout(resolve, DELAY_MS / 3); });
    expect(confirmCalls()).toHaveLength(1);
    expect(screen.getByTestId('portal-decision-applying')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId('portal-decision-applied')).toBeInTheDocument());
    expect(Date.now() - started).toBeGreaterThanOrEqual(DELAY_MS);
    expect(confirmCalls()).toHaveLength(2);
  });

  it('shows the result card when the resend answers with no way into the portal', async () => {
    apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    apiFetchMock.mockResolvedValueOnce(jsonResponse(APPLIED_REJECT));
    renderLanding();

    await waitFor(() => expect(screen.getByTestId('portal-decision-applied')).toBeInTheDocument());
    expect(confirmCalls()).toHaveLength(2);
    expect(viewCalls()).toHaveLength(0);
  });

  it('shows the invalid-link screen, without the view, when the resend rejects the token', async () => {
    apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    apiFetchMock.mockResolvedValueOnce(jsonResponse({}, { status: 401 }));
    renderLanding();

    await waitFor(() => expect(screen.getByTestId('portal-decision-invalid')).toBeInTheDocument());
    expect(viewCalls()).toHaveLength(0);
  });

  it('treats a 200 whose body cannot be read as a lost answer, and resends', async () => {
    apiFetchMock.mockResolvedValueOnce({
      ...jsonResponse({}), json: async () => { throw new TypeError('body stream cut'); },
    });
    apiFetchMock.mockResolvedValueOnce(jsonResponse(APPLIED_REJECT));
    renderLanding();

    await waitFor(() => expect(screen.getByTestId('portal-decision-applied')).toBeInTheDocument());
    expect(screen.queryByTestId('portal-decision-not_pending')).not.toBeInTheDocument();
    expect(confirmCalls()).toHaveLength(2);
  });

  it('resends a 429 and ends on the failure card, never on the invalid-link one', async () => {
    apiFetchMock.mockImplementation(async (path) => (path.endsWith('/decisions/confirm')
      ? jsonResponse({}, { status: 429 })
      : jsonResponse({ state: 'pending' })));
    renderLanding();

    await waitFor(() => expect(screen.getByTestId('portal-decision-failed')).toBeInTheDocument());
    expect(screen.queryByTestId('portal-decision-invalid')).not.toBeInTheDocument();
    expect(confirmCalls()).toHaveLength(2);
    expect(viewCalls()).toHaveLength(1);
  });

  it('stops the chain when the customer leaves during the backoff: no resend, no navigation', async () => {
    const DELAY_MS = 60;
    apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    apiFetchMock.mockResolvedValueOnce(jsonResponse({ ...APPLIED_REJECT, portalToken: 'tok-new', quotationId: 'q-1' }));
    const consoleError = vi.spyOn(console, 'error');
    const { unmount } = renderLanding({ resendDelayMs: DELAY_MS });

    await waitFor(() => expect(confirmCalls()).toHaveLength(1));
    unmount();
    await new Promise((resolve) => { setTimeout(resolve, DELAY_MS * 3); });

    expect(confirmCalls()).toHaveLength(1);
    expect(viewCalls()).toHaveLength(0);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('sends exactly one POST when "Reintentar" is clicked twice before the page re-renders', async () => {
    apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    apiFetchMock.mockResolvedValueOnce(jsonResponse({ state: 'pending' }));
    renderLanding();

    await waitFor(() => expect(screen.getByTestId('portal-decision-failed')).toBeInTheDocument());
    const retry = screen.getByTestId('portal-decision-retry');
    // Both clicks inside ONE act: React renders only when the act ends, so the second click still
    // reaches the button's handler and only the in-flight guard can stop a second chain.
    // (`fireEvent.click` wraps each click in its own act, which removes the button in between.)
    act(() => {
      retry.click();
      retry.click();
    });

    await waitFor(() => expect(screen.getByTestId('portal-decision-applied')).toBeInTheDocument());
    expect(confirmCalls()).toHaveLength(3);
  });

  /** The confirm POST and its resend both fail with no readable answer; the view answers `viewAnswer`. */
  function confirmLostThenView(viewAnswer) {
    apiFetchMock.mockImplementation(async (path) => {
      if (path.endsWith('/decisions/confirm')) throw new TypeError('Failed to fetch');
      return viewAnswer();
    });
  }

  it('falls back to the view when the resend is lost too, and shows a settled decision', async () => {
    confirmLostThenView(() => jsonResponse({
      state: 'confirmed', appliedNow: false, decision: 'REJECT', documentNo: 'PR/0001', tenantName: 'Acme SA',
    }));
    renderLanding();

    await waitFor(() => expect(screen.getByTestId('portal-decision-confirmed')).toBeInTheDocument());
    expect(screen.getByTestId('portal-decision-confirmed').querySelector('h1').textContent)
      .toBe('portalDecisionConfirmedTitle');
    expect(screen.queryByTestId('portal-decision-retry')).not.toBeInTheDocument();
    expect(confirmCalls()).toHaveLength(2);
    expect(viewCalls()).toHaveLength(1);
    expect(viewCalls()[0][1]).toStrictEqual({
      token: null, headers: { 'X-Portal-Decision-Token': DECISION_TOKEN }, on401: 'ignore',
    });
    expect(screen.queryByTestId('portal-arrival-probe')).not.toBeInTheDocument();
  });

  for (const [label, viewAnswer] of [
    ['the decision is still pending', () => jsonResponse({ state: 'pending' })],
    ['the view fails too', () => { throw new TypeError('Failed to fetch'); }],
  ]) {
    it(`keeps the failure and its retry when ${label}`, async () => {
      confirmLostThenView(viewAnswer);
      renderLanding();

      await waitFor(() => expect(screen.getByTestId('portal-decision-failed')).toBeInTheDocument());
      expect(screen.getByTestId('portal-decision-retry')).toBeInTheDocument();
      expect(confirmCalls()).toHaveLength(2);
    });
  }

  it('shows the invalid-link screen when the view rejects the token', async () => {
    confirmLostThenView(() => jsonResponse({}, { status: 401 }));
    renderLanding();

    await waitFor(() => expect(screen.getByTestId('portal-decision-invalid')).toBeInTheDocument());
  });
});

describe('PortalDecisionPage — the way into the portal', () => {
  it('opens the portal on the quotation from "Portal de clientes", replacing the landing, with the notice in router state only', async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValue(jsonResponse({ ...APPLIED_REJECT, portalToken: 'tok-new', quotationId: 'q-1' }));
    // StrictMode: the effect runs twice, the confirmation still goes out once.
    renderLanding({ strict: true });

    // The page shows its result first; nothing navigates by itself.
    await waitFor(() => expect(screen.getByTestId('portal-decision-applied')).toBeInTheDocument());
    expect(screen.queryByTestId('portal-arrival-probe')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('portal-decision-enter'));

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
    expect(screen.queryByTestId('portal-decision-enter')).not.toBeInTheDocument();
    expect(screen.queryByTestId('portal-arrival-probe')).not.toBeInTheDocument();
  });
});
