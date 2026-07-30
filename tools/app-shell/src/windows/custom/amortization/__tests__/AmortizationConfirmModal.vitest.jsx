// Mocks must be hoisted before imports (Vitest hoisting)
vi.mock('@/i18n', () => ({
  useUI: () => (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  getStoredLocale: () => 'es_ES',
}));

import { render, screen, waitFor } from '@testing-library/react';
import AmortizationConfirmModal from '@generated/amortization/custom/AmortizationConfirmModal';

function mockFetchSequence({ header = {}, lines = [] } = {}) {
  return vi.fn((url) => {
    if (url.includes('/header/')) {
      return Promise.resolve({ ok: true, json: async () => ({ response: { data: [header] } }) });
    }
    if (url.includes('/lines?')) {
      return Promise.resolve({ ok: true, json: async () => ({ response: { data: lines } }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

const BASE_PROPS = {
  recordId: 'amort-1',
  token: 'tok',
  apiBaseUrl: 'http://host/neo/amortization',
  onClose: vi.fn(),
};

describe('AmortizationConfirmModal — amount formatting', () => {
  it('shows the total grouped with the real currency symbol, never the raw ISO code', async () => {
    globalThis.fetch = mockFetchSequence({
      header: { name: 'AM-1', 'currency$_identifier': 'EUR' },
      lines: [
        { amortizationAmount: 1000.5, amortizationPercentage: 10 },
        { amortizationAmount: 500, amortizationPercentage: 20 },
      ],
    });

    render(<AmortizationConfirmModal {...BASE_PROPS} />);

    await waitFor(() => expect(screen.getByText('AM-1')).toBeInTheDocument());
    // 1000.5 + 500 = 1500.50 — lands in the 1000-9999 silently-ungrouped range.
    expect(screen.getByText(/1\.500,50\s€/)).toBeInTheDocument();
    expect(screen.queryByText(/EUR/)).toBeNull();
    expect(screen.queryByText(/1500,50/)).toBeNull();
  });

  it('formats the total for a non-EUR currency (USD) in es-ES style, with the real resolved symbol', async () => {
    globalThis.fetch = mockFetchSequence({
      header: { name: 'AM-2', 'currency$_identifier': 'USD' },
      lines: [{ amortizationAmount: 250, amortizationPercentage: 10 }],
    });

    render(<AmortizationConfirmModal {...BASE_PROPS} recordId="amort-2" />);
    await waitFor(() => expect(screen.getByText('AM-2')).toBeInTheDocument());

    expect(screen.getByText(/250,00\s\$/)).toBeInTheDocument();
    expect(screen.queryByText(/USD/)).toBeNull();
  });
});
