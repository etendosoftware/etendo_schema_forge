// Regression test for ETP-4850: date off-by-one bug under negative-UTC-offset
// timezones.
//
// WarehouseTransactionsTable's private fmtDate(iso) does `new Date(iso)` and
// then reads local-time getters (getDate/getMonth/getFullYear). A date-only
// string like "2026-08-10" is parsed by the Date constructor as UTC midnight;
// under a negative-offset timezone (e.g. America/Argentina/Buenos_Aires,
// UTC-3) the local-time getters roll it back to the previous day. The
// canonical fix (tools/app-shell/src/lib/dateOnly.js — formatCalendarDate)
// avoids this by parsing the yyyy-MM-dd components directly with the local
// Date constructor. This test forces TZ=America/Argentina/Buenos_Aires to
// make the bug reproducible regardless of the CI machine's default timezone
// (verified empirically: process.env.TZ takes effect per-call in this
// project's Node/Vitest setup, no ICU caching issue).

// --- Mocks (before imports) ---

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
  // useClientSort (wired in for ETP-5083) pulls the active locale from here; without it the
  // component throws before it ever reaches the date-rendering code this file is testing.
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

vi.mock('../useWarehouseStock', () => ({
  useWarehouseStock: vi.fn(),
}));

vi.mock('lucide-react', () => ({
  Loader2: (props) => <span data-testid="loader" {...props} />,
  ArrowUpRight: (props) => <span data-testid="icon-arrow-up-right" {...props} />,
}));

// --- Import under test ---

import { render, screen } from '@testing-library/react';
import WarehouseTransactionsTable from '../WarehouseTransactionsTable.jsx';
import { useWarehouseStock } from '../useWarehouseStock';

// --- Helpers ---

const defaultProps = {
  parentId: 'wh-1',
  token: 'test-token',
  apiBaseUrl: '/sws/neo/warehouse',
  onCount: vi.fn(),
};

// --- Tests ---

describe('WarehouseTransactionsTable — ETP-4850 date off-by-one bug', () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'America/Argentina/Buenos_Aires';
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the movement date as 10/08/2026, not shifted back a day', () => {
    useWarehouseStock.mockReturnValue({
      loading: false,
      error: null,
      transactions: [
        {
          id: 'tx-1',
          movementDate: '2026-08-10',
          'product$_identifier': 'Widget A',
          movementType: 'V+',
          movementQuantity: 10,
        },
      ],
    });

    render(<WarehouseTransactionsTable {...defaultProps} />);

    // Correct expected behavior: the date cell shows the calendar day that
    // was actually stored, unaffected by the local timezone offset.
    expect(screen.getByText('10/08/2026')).toBeInTheDocument();
    expect(screen.queryByText('09/08/2026')).not.toBeInTheDocument();
  });
});
