// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// --- Import under test ---

import { render, screen, within, act } from '@testing-library/react';
import PaymentDetailSidebarBase from '../PaymentDetailSidebarBase.jsx';
import { notifyRecordUpdated } from '../useRecordRefreshSignal';

function baseData(overrides = {}) {
  return {
    id: 'pay-1',
    status: 'RPAP',
    amount: '100',
    creationDate: '2026-06-29',
    ...overrides,
  };
}

function dispatchProcessSuccess({ recordId, columnName }) {
  act(() => {
    window.dispatchEvent(new CustomEvent('neo:processSuccess', {
      detail: { recordId, process: { columnName } },
    }));
  });
}

describe('PaymentDetailSidebarBase — amount formatting', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ response: { data: [] } }) });
  });

  it('resolves the real currency symbol from the record instead of hardcoding €', async () => {
    const data = baseData({ amount: '100', 'currency$_identifier': 'USD' });
    render(<PaymentDetailSidebarBase dir="in" specName="payment-in" data={data} token="t" apiBaseUrl="http://x" />);
    const panel = within(screen.getByTestId('PaymentDetailSidebar__panel'));
    // The hero and the "Total"/"Unallocated" breakdown rows all show the same
    // amount when no lines are applied yet — assert at least one match.
    expect(panel.getAllByText(/100,00\s\$/).length).toBeGreaterThan(0);
    expect(panel.queryByText(/100,00\s€/)).toBeNull();
  });

  it('groups thousands in the hero amount (1000-9999 range silently drops the separator without explicit useGrouping)', async () => {
    const data = baseData({ amount: '1500.5', 'currency$_identifier': 'EUR' });
    render(<PaymentDetailSidebarBase dir="in" specName="payment-in" data={data} token="t" apiBaseUrl="http://x" />);
    const panel = within(screen.getByTestId('PaymentDetailSidebar__panel'));
    expect(panel.getAllByText(/1\.500,50\s€/).length).toBeGreaterThan(0);
    expect(panel.queryByText(/1500,50\s€/)).toBeNull();
  });
});

describe('PaymentDetailSidebarBase — activity history', () => {
  beforeEach(() => {
    window.localStorage.clear();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ response: { data: [] } }) });
  });

  it('keeps every confirm/reactivate occurrence as its own row instead of collapsing to the latest', async () => {
    const data = baseData();
    render(<PaymentDetailSidebarBase dir="in" specName="payment-in" data={data} token="t" apiBaseUrl="http://x" />);

    // Confirm
    dispatchProcessSuccess({ recordId: 'pay-1', columnName: 'aPRMProcessPayment' });
    // Reactivate
    dispatchProcessSuccess({ recordId: 'pay-1', columnName: 'etprReactivatePayment' });
    // Confirm again
    dispatchProcessSuccess({ recordId: 'pay-1', columnName: 'aPRMProcessPayment' });

    const confirmedItems = await screen.findAllByText('cobroConfirmado');
    const reactivatedItems = screen.getAllByText('cobroReactivado');

    expect(confirmedItems).toHaveLength(2);
    expect(reactivatedItems).toHaveLength(1);
  });

  it('says "confirmado · en progreso" while the transfer is only authorized (ETP-4895)', async () => {
    // The plain key reads "Cobro confirmado · depositado", with the word baked into the
    // translation — three centimetres under a header that now says "Pago en progreso".
    const data = baseData({ status: 'PPM', processed: true });
    render(<PaymentDetailSidebarBase dir="out" specName="payment-out" data={data} token="t" apiBaseUrl="http://x" />);

    dispatchProcessSuccess({ recordId: 'pay-1', columnName: 'aPRMProcessPayment' });

    await screen.findAllByText('pagoConfirmadoEnProgreso');
    expect(screen.queryByText('pagoConfirmado')).toBeNull();
  });

  it('says plain "confirmado · depositado" once the withdrawal is recorded', async () => {
    const data = baseData({ status: 'PWNC', processed: true });
    render(<PaymentDetailSidebarBase dir="out" specName="payment-out" data={data} token="t" apiBaseUrl="http://x" />);

    dispatchProcessSuccess({ recordId: 'pay-1', columnName: 'aPRMProcessPayment' });

    await screen.findAllByText('pagoConfirmado');
    expect(screen.queryByText('pagoConfirmadoEnProgreso')).toBeNull();
  });

  it('refetches the applied lines when the payment is announced as changed', async () => {
    // Editing a payment does not change its id, and `Updated` is not a NEO field on this entity, so
    // nothing in the payload moves. "Aplicado a facturas" kept showing the pre-save amount until the
    // whole window was reloaded; the editor now announces the write instead.
    const data = baseData({ status: 'RPAP' });
    render(
      <PaymentDetailSidebarBase dir="in" specName="payment-in" data={data} token="t" apiBaseUrl="http://x" />);
    await act(async () => {});
    const before = globalThis.fetch.mock.calls.length;

    await act(async () => { notifyRecordUpdated('pay-1'); });

    expect(globalThis.fetch.mock.calls.length).toBeGreaterThan(before);
  });

  it('ignores a write announced for a different payment', async () => {
    render(
      <PaymentDetailSidebarBase dir="in" specName="payment-in" data={baseData()} token="t" apiBaseUrl="http://x" />);
    await act(async () => {});
    const before = globalThis.fetch.mock.calls.length;

    await act(async () => { notifyRecordUpdated('some-other-payment'); });

    expect(globalThis.fetch.mock.calls.length).toBe(before);
  });

  it('persists the full event history in localStorage keyed by record id', () => {
    const data = baseData();
    render(<PaymentDetailSidebarBase dir="in" specName="payment-in" data={data} token="t" apiBaseUrl="http://x" />);

    dispatchProcessSuccess({ recordId: 'pay-1', columnName: 'aPRMProcessPayment' });
    dispatchProcessSuccess({ recordId: 'pay-1', columnName: 'etprReactivatePayment' });

    const stored = JSON.parse(window.localStorage.getItem('etgo:payment:pay-1:events'));
    expect(stored).toHaveLength(2);
    expect(stored[0].type).toBe('confirmed');
    expect(stored[1].type).toBe('reactivated');
  });

  it('does not warn about duplicate React keys when two events share the same label', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const data = baseData();
    render(<PaymentDetailSidebarBase dir="in" specName="payment-in" data={data} token="t" apiBaseUrl="http://x" />);

    dispatchProcessSuccess({ recordId: 'pay-1', columnName: 'aPRMProcessPayment' });
    dispatchProcessSuccess({ recordId: 'pay-1', columnName: 'etprReactivatePayment' });
    dispatchProcessSuccess({ recordId: 'pay-1', columnName: 'aPRMProcessPayment' });

    await screen.findAllByText('cobroConfirmado');
    const keyWarning = consoleError.mock.calls.some(args =>
      args.some(a => typeof a === 'string' && a.includes('key')));
    expect(keyWarning).toBe(false);
    consoleError.mockRestore();
  });
});
