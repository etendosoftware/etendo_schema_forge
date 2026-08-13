vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { render, screen, waitFor } from '@testing-library/react';
import PaymentDetailsPanelCustom from '../PaymentDetailsPanelCustom.jsx';

function mockFetchSequence(details) {
  return vi.fn((url) => {
    if (url.includes('/paymentPlan?')) {
      return Promise.resolve({ ok: true, json: async () => ({ response: { data: [{ id: 'sched-1' }] } }) });
    }
    if (url.includes('/paymentDetails?')) {
      return Promise.resolve({ ok: true, json: async () => ({ response: { data: details } }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

describe('PaymentDetailsPanelCustom — amount formatting', () => {
  it('groups thousands via the shared formatAmount (es-ES), never the en-US dot separator', async () => {
    globalThis.fetch = mockFetchSequence([
      { id: 'pd-1', documentNo: 'PAY-1', amount: 1355.2, status: 'RPR' },
    ]);
    render(<PaymentDetailsPanelCustom parentId="inv-1" token="tok" apiBaseUrl="http://host/neo/purchase-invoice" />);

    await waitFor(() => expect(screen.getByText('PAY-1')).toBeInTheDocument());
    expect(screen.getByText('1.355,20')).toBeInTheDocument();
    expect(screen.queryByText('1,355.20')).toBeNull();
  });
});
