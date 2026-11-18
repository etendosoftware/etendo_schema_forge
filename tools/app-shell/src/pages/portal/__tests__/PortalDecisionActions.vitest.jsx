// @covers tools/app-shell/src/pages/portal/PortalDecisionActions.jsx
// New file: the component had no test, and driving its modal through PortalPage would bury its
// rules under the whole page's routing. The request itself is the real `requestPortalDecision`;
// only `apiFetch` (the network boundary) is a double.

/** The mocked translation: the key, plus its variables, so the email and tenant show. */
function t(key, vars) {
  return vars ? `${key} ${JSON.stringify(vars)}` : key;
}

vi.mock('@/i18n', () => ({ useUI: () => t }));

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PortalDecisionActions from '../PortalDecisionActions.jsx';

const TOKEN = 'tok-abcdef0123456789';

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}

const quotation = (decision) => ({ kind: 'QUOTATION', id: 'q-1', documentNo: 'PR/0001', decision });
const OPEN = { canDecide: true, blockedReason: null, acceptAvailable: true, email: 'contact@acme.com' };

function renderActions(document, { apiFetch = vi.fn(), onInvalid = vi.fn(), variant } = {}) {
  render(
    <PortalDecisionActions
      apiFetch={apiFetch}
      token={TOKEN}
      document={document}
      tenantName="Acme SA"
      onInvalid={onInvalid}
      variant={variant}
    />,
  );
  return { apiFetch, onInvalid };
}

/** The JSON body of the n-th decision request. */
const bodyOf = (apiFetch, n = 0) => JSON.parse(apiFetch.mock.calls[n][1].body);

describe('PortalDecisionActions — when it shows', () => {
  it('renders nothing for a document with no decision block', () => {
    renderActions({ kind: 'INVOICE', id: 'inv-1', decision: null });

    expect(screen.queryByTestId('portal-decision-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('portal-decision-blocked')).not.toBeInTheDocument();
  });

  for (const [blockedReason, key] of [
    ['expired', 'portalDecisionBlockedExpired'],
    ['no_recipient', 'portalDecisionBlockedNoRecipient'],
  ]) {
    it(`says why it cannot be answered when blocked as ${blockedReason}`, () => {
      renderActions(quotation({ canDecide: false, blockedReason, acceptAvailable: true }));

      expect(screen.getByTestId('portal-decision-blocked').textContent).toBe(t(key, { tenantName: 'Acme SA' }));
      expect(screen.queryByTestId('portal-decision-reject')).not.toBeInTheDocument();
    });
  }

  // Already answered or closed: the status badge says it; an unknown reason has nothing to say.
  for (const blockedReason of ['not_pending', 'something_new', null]) {
    it(`shows nothing when blocked as ${blockedReason}`, () => {
      renderActions(quotation({ canDecide: false, blockedReason, acceptAvailable: true }));

      expect(screen.queryByTestId('portal-decision-blocked')).not.toBeInTheDocument();
      expect(screen.queryByTestId('portal-decision-reject')).not.toBeInTheDocument();
    });
  }

  it('offers Rechazar without Aceptar when the backend has accepting off', () => {
    renderActions(quotation({ ...OPEN, acceptAvailable: false }));

    expect(screen.getByTestId('portal-decision-reject')).toBeInTheDocument();
    expect(screen.queryByTestId('portal-decision-accept')).not.toBeInTheDocument();
  });
});

describe('PortalDecisionActions — Aceptar', () => {
  it('asks first, naming where the confirmation goes, and sends nothing on Cancelar', async () => {
    const user = userEvent.setup();
    const apiFetch = vi.fn();
    renderActions(quotation(OPEN), { apiFetch });

    await user.click(screen.getByTestId('portal-decision-accept'));

    expect(screen.getByTestId('portal-accept-modal')).toHaveTextContent('portalAcceptConfirmTitle');
    expect(screen.getByTestId('portal-decision-email')).toHaveTextContent('contact@acme.com');
    await user.click(screen.getByTestId('portal-accept-cancel'));
    await waitFor(() => expect(screen.queryByTestId('portal-accept-modal')).not.toBeInTheDocument());
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('sends on Continuar, then says to check the email, and keeps saying where it went', async () => {
    const user = userEvent.setup();
    const apiFetch = vi.fn(async () => jsonResponse({ email: 'sales@acme.com' }));
    renderActions(quotation(OPEN), { apiFetch });

    await user.click(screen.getByTestId('portal-decision-accept'));
    await user.click(screen.getByTestId('portal-accept-continue'));

    await waitFor(() => expect(screen.getByTestId('portal-check-email-modal')).toBeInTheDocument());
    expect(screen.getByTestId('portal-check-email-modal'))
      .toHaveTextContent(t('portalCheckEmailDescription', { email: 'sales@acme.com' }));
    await user.click(screen.getByTestId('portal-check-email-ok'));
    await waitFor(() => expect(screen.queryByTestId('portal-check-email-modal')).not.toBeInTheDocument());
    expect(screen.getByTestId('portal-decision-sent').textContent).toBe(t('portalDecisionSent', { email: 'sales@acme.com' }));
    expect(apiFetch.mock.calls[0][0]).toBe('/sws/portal/quotations/q-1/decision');
    expect(bodyOf(apiFetch)).toEqual({ decision: 'ACCEPT' });
    expect(screen.queryByTestId('portal-decision-accept')).not.toBeInTheDocument();
  });

  it('lays Aceptar then Rechazar out as items of the side panel row (inline variant)', () => {
    renderActions(quotation(OPEN), { variant: 'inline' });

    const panel = screen.getByTestId('portal-decision-panel');
    expect(panel).toHaveClass('contents');
    const [first, second] = panel.querySelectorAll('button');
    expect([first.dataset.testid, second.dataset.testid]).toEqual(['portal-decision-accept', 'portal-decision-reject']);
  });

  it('labels the mobile bar button as accepting the quotation, under its hint', () => {
    renderActions(quotation(OPEN), { variant: 'bar' });

    expect(screen.getByTestId('portal-decision-bar')).toHaveTextContent(t('portalDecisionAcceptHint', { tenantName: 'Acme SA' }));
    expect(screen.getByTestId('portal-decision-accept')).toHaveTextContent('portalDecisionAcceptQuotation');
  });
});

describe('PortalDecisionActions — Rechazar', () => {
  async function openReject(apiFetch) {
    const user = userEvent.setup();
    renderActions(quotation(OPEN), { apiFetch });
    await user.click(screen.getByTestId('portal-decision-reject'));
    await waitFor(() => expect(screen.getByTestId('portal-reject-modal')).toBeInTheDocument());
    return user;
  }

  /** Continuar from the reasons, then Enviar solicitud from the confirmation popup. */
  async function confirmAndSend(user) {
    await user.click(screen.getByTestId('portal-reject-continue'));
    await waitFor(() => expect(screen.getByTestId('portal-reject-confirm-modal')).toBeInTheDocument());
    await user.click(screen.getByTestId('portal-reject-submit'));
  }

  it('needs a reason, and a text for "Otros", before it can continue', async () => {
    const user = await openReject(vi.fn());

    expect(screen.getByTestId('portal-reject-continue')).toBeDisabled();
    await user.click(screen.getByTestId('portal-reject-reason-other'));
    expect(screen.getByTestId('portal-reject-continue')).toBeDisabled();
    await user.type(screen.getByTestId('portal-reject-other-text'), '   ');
    expect(screen.getByTestId('portal-reject-continue')).toBeDisabled();
    await user.type(screen.getByTestId('portal-reject-other-text'), 'Ya no');
    expect(screen.getByTestId('portal-reject-continue')).toBeEnabled();
  });

  it('asks to confirm by email before sending, and Volver keeps the chosen reason', async () => {
    const apiFetch = vi.fn();
    const user = await openReject(apiFetch);

    await user.click(screen.getByTestId('portal-reject-reason-delivery'));
    await user.click(screen.getByTestId('portal-reject-continue'));
    await waitFor(() => expect(screen.getByTestId('portal-reject-confirm-modal')).toBeInTheDocument());
    expect(screen.getByTestId('portal-decision-email')).toHaveTextContent('contact@acme.com');
    expect(apiFetch).not.toHaveBeenCalled();
    // Volver and Cancelar take the app's outline hover; the label keeps the Figma's colour.
    for (const testId of ['portal-reject-back', 'portal-reject-confirm-cancel']) {
      expect(screen.getByTestId(testId)).toHaveClass('hover:bg-accent', 'text-[#1B1A1F]');
    }

    await user.click(screen.getByTestId('portal-reject-back'));
    await waitFor(() => expect(screen.getByTestId('portal-reject-modal')).toBeInTheDocument());
    expect(screen.getByTestId('portal-reject-reason-delivery')).toBeChecked();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('clears the "Otros" text when another reason is chosen, and sends no text with it', async () => {
    const apiFetch = vi.fn(async () => jsonResponse({ email: 'sales@acme.com' }));
    const user = await openReject(apiFetch);

    await user.click(screen.getByTestId('portal-reject-reason-other'));
    await user.type(screen.getByTestId('portal-reject-other-text'), 'Texto que no debe viajar');
    await user.click(screen.getByTestId('portal-reject-reason-price'));
    expect(screen.queryByTestId('portal-reject-other-text')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('portal-reject-reason-other'));
    expect(screen.getByTestId('portal-reject-other-text')).toHaveValue('');

    await user.click(screen.getByTestId('portal-reject-reason-price'));
    await confirmAndSend(user);

    await waitFor(() => expect(screen.getByTestId('portal-check-email-modal')).toBeInTheDocument());
    expect(bodyOf(apiFetch)).toEqual({ decision: 'REJECT', reasonCode: 'PRICE' });
  });

  it('sends the trimmed text only with "Otros"', async () => {
    const apiFetch = vi.fn(async () => jsonResponse({ email: 'sales@acme.com' }));
    const user = await openReject(apiFetch);

    await user.click(screen.getByTestId('portal-reject-reason-other'));
    await user.type(screen.getByTestId('portal-reject-other-text'), '  Ya no lo necesitamos  ');
    await confirmAndSend(user);

    await waitFor(() => expect(screen.getByTestId('portal-check-email-modal')).toBeInTheDocument());
    expect(bodyOf(apiFetch)).toEqual({ decision: 'REJECT', reasonCode: 'OTHER', reasonText: 'Ya no lo necesitamos' });
  });
});

describe('PortalDecisionActions — a refused request', () => {
  for (const [label, answer, key] of [
    ['a cooldown', () => jsonResponse({ error: 'cooldown' }, { status: 409 }), 'portalDecisionCooldown'],
    ['no recipient', () => jsonResponse({ error: 'no_recipient' }, { status: 409 }), 'portalDecisionBlockedNoRecipient'],
    ['an expired quotation', () => jsonResponse({ error: 'expired' }, { status: 409 }), 'portalDecisionBlockedExpired'],
    ['a quotation no longer pending', () => jsonResponse({ error: 'not_pending' }, { status: 409 }), 'portalDecisionBlockedNotPending'],
    ['an unknown refusal', () => jsonResponse({ error: 'boom' }, { status: 400 }), 'portalDecisionError'],
    ['a request that never completed', () => { throw new TypeError('Failed to fetch'); }, 'portalDecisionError'],
  ]) {
    it(`says so for ${label}, and keeps the buttons`, async () => {
      const user = userEvent.setup();
      renderActions(quotation(OPEN), { apiFetch: vi.fn(async () => answer()) });

      await user.click(screen.getByTestId('portal-decision-accept'));
      await user.click(screen.getByTestId('portal-accept-continue'));

      await waitFor(() => expect(screen.getByTestId('portal-decision-error')).toBeInTheDocument());
      expect(screen.getByTestId('portal-decision-error').textContent).toBe(t(key, { tenantName: 'Acme SA' }));
      expect(screen.getByTestId('portal-decision-accept')).toBeEnabled();
      expect(screen.queryByTestId('portal-decision-sent')).not.toBeInTheDocument();
    });
  }

  it('hands a rejected token to the page instead of showing an error', async () => {
    const user = userEvent.setup();
    const { onInvalid } = renderActions(quotation(OPEN), {
      apiFetch: vi.fn(async () => jsonResponse({}, { status: 401 })),
    });

    await user.click(screen.getByTestId('portal-decision-accept'));
    await user.click(screen.getByTestId('portal-accept-continue'));

    await waitFor(() => expect(onInvalid).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('portal-decision-error')).not.toBeInTheDocument();
  });
});
