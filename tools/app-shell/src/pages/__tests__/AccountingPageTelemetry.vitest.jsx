import { render, waitFor } from '@testing-library/react';

const trackMock = vi.hoisted(() => vi.fn());
const trackKpiEventMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/components/contract-ui', () => ({
  DataTable: () => <div data-testid="accounting-data-table" />,
  KPIHeader: () => <div data-testid="accounting-kpi-header" />,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }) => <section>{children}</section>,
  CardContent: ({ children }) => <div>{children}</div>,
  CardHeader: ({ children }) => <header>{children}</header>,
  CardTitle: ({ children }) => <h2>{children}</h2>,
}));

vi.mock('@generated/accounting/generated/config', () => ({
  kpisConfig: [],
  sections: {
    bankSummary: { columns: [] },
    purchaseInvoices: { columns: [] },
    salesInvoices: { columns: [] },
    taxSummary: { columns: [] },
  },
}));

vi.mock('@generated/accounting/generated/mockData', () => ({
  bankSummary: [],
  kpis: {},
  purchaseInvoices: [],
  salesInvoices: [],
  taxSummary: [],
}));

vi.mock('@/lib/observability.js', () => ({
  track: trackMock,
  trackKpiEvent: trackKpiEventMock,
}));

import AccountingPage from '../AccountingPage.jsx';

describe('AccountingPage KPI telemetry', () => {
  beforeEach(() => {
    trackMock.mockReset();
    trackKpiEventMock.mockClear();
    trackKpiEventMock.mockResolvedValue(undefined);
  });

  it('tracks the accounting dashboard weekly adoption event on render', async () => {
    render(<AccountingPage />);

    await waitFor(() => {
      expect(trackKpiEventMock).toHaveBeenCalledWith(trackMock, 'accounting_dashboard_viewed', {
        kpiId: 'kpi_adopt_accounting_board_weekly',
        module: 'accounting',
        source: 'accounting_dashboard',
        status: 'success',
      });
    });
  });

  it('swallows telemetry dispatch failures', async () => {
    trackKpiEventMock.mockRejectedValueOnce(new Error('telemetry unavailable'));

    render(<AccountingPage />);

    await waitFor(() => {
      expect(trackKpiEventMock).toHaveBeenCalledTimes(1);
    });
  });
});
