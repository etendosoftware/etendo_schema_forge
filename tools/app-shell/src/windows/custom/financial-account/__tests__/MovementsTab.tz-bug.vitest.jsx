// Regression test for ETP-5100 — the user-visible half of the bug: the row did
// not merely show the wrong day, it disappeared from the grid entirely.
//
// A movement created at 22:59 on 01/09 in UTC-3 was emitted with its calendar
// day already rolled forward, and MovementsTab's default "Últimos 30 días"
// range filter reads the leading yyyy-MM-dd via `parseCalendarDate` and
// compares it against `getDateBounds({ presetId: 'last30' })`, whose `to` bound
// is the end of TODAY in local time. A date one day in the future therefore
// fell outside the window and the movement vanished. Anything created after
// ~21:00 local was simply not in the list.
//
// Two distinct failure modes, so this file asserts both on the SAME row, and
// deliberately renders the REAL MovementsTable rather than the JSON stub the
// main MovementsTab suite uses:
//
//   1. the row survives the default last30 filter (the filter half), and
//   2. its date cell reads today's calendar day (the rendering half — this is
//      the assertion that goes red against the pre-ETP-5100 `formatDate`).
//
// "Today" is built from `todayCalendarISO()` rather than hardcoded, so the test
// does not rot tomorrow and does not depend on the runner's zone: the fixture
// date and the expected label are derived from the same local calendar day.

// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (k) => k,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

// Toolbar / strip / modals are siblings of the table and out of scope here.
// The toolbar is stubbed to render nothing so the default filter state
// ({ presetId: 'last30' }) is the one under test — no interaction changes it.
vi.mock('../MovementsToolbar/index.jsx', () => ({
  MovementsToolbar: () => <div data-testid="toolbar" />,
}));
vi.mock('../AccountSummaryStrip.jsx', () => ({ AccountSummaryStrip: () => null }));
vi.mock('../NewTransactionModal.jsx', () => ({ NewTransactionModal: () => null }));
vi.mock('../FundsTransferModal.jsx', () => ({ FundsTransferModal: () => null }));

vi.mock('@/hooks/useCreateMovement', () => ({
  useDeleteMovement: () => ({ deleteMovement: vi.fn(), deleting: false, error: null }),
}));
vi.mock('@/hooks/useBatchDeleteDialog.jsx', () => ({
  useBatchDeleteDialog: () => ({
    requestBatchDelete: vi.fn(), batchDeleteDialog: null, deleting: false,
  }),
}));
vi.mock('@/components/financial-accounts', () => ({
  BulkDeleteSelectionBar: () => null,
}));

// Leaf cells inside the REAL MovementsTable — stubbed so this file stays about
// the date, but the table itself (and its module-local formatDate) is real.
vi.mock('../MovementStatusBadge', () => ({ MovementStatusBadge: () => null }));
vi.mock('../PostingStatusDot', () => ({ PostingStatusDot: () => null }));
vi.mock('../MovementRowKebab', () => ({ MovementRowKebab: () => null }));
vi.mock('@/components/ui/money-amount', () => ({
  MoneyAmount: ({ value }) => <span>{String(value)}</span>,
}));
vi.mock('@/components/financial-accounts/contractColumns', () => ({
  getContractGridColumns: () => [{ name: 'transactionDate', label: 'Fecha' }],
  getContractPanelFields: () => [],
}));

// --- Imports under test (after mocks) ---

import { render, screen } from '@testing-library/react';
import { todayCalendarISO } from '@/lib/dateOnly.js';
import { MovementsTab } from '../MovementsTab.jsx';

// --- Fixtures ---

// Both "today" and its expected dd/mm/yyyy label are computed INSIDE each test,
// after the TZ has been pinned — computing them at module load would read the
// ambient zone and could disagree with the local day the filter resolves.
function today() {
  const iso = todayCalendarISO();
  const [year, month, day] = iso.split('-');
  return { iso, label: `${day}/${month}/${year}` };
}

const movement = (date) => ({
  id: 'evening',
  date,
  documentNo: 'DOC-EVENING',
  contact: 'ACME',
  description: 'compra nocturna',
  paymentStatus: 'RPR',
  trxType: 'BPD',
  amount: 100,
  balance: 1000,
  currencyIso: 'EUR',
  dimensions: {},
});

function renderTab(date) {
  render(
    <MovementsTab
      account={{ id: 'acc-1', currencyIso: 'EUR' }}
      totals={{ balance: 0, inflows: 0, outflows: 0, currency: 'EUR' }}
      movements={[movement(date)]}
      loading={false}
    />,
  );
}

// --- Tests ---

// The host zone is pinned to a negative offset, the condition under which the
// old renderer moved an evening value forward a day. `process.env.TZ` takes
// effect per-call in this project's Node/Vitest setup — same technique as
// ImportedStatementsTab.tz-bug.vitest.jsx.
describe('MovementsTab — ETP-5100, an evening movement created today (UTC-3 host)', () => {
  const originalTz = process.env.TZ;
  beforeAll(() => { process.env.TZ = 'America/Argentina/Buenos_Aires'; });
  afterAll(() => { process.env.TZ = originalTz; });

  it('is still in the grid under the default last30 window, showing today as its date', () => {
    // 22:59 today, civil time with no zone suffix — the shape NEO emits since
    // ETP-5100. The row must both SURVIVE the range filter and read today.
    const { iso, label } = today();
    renderTab(`${iso}T22:59:10`);

    const row = screen.getByTestId('movement-row-evening');
    expect(row).toBeInTheDocument();
    // RED against the pre-ETP-5100 formatDate: the instant was parsed locally
    // (UTC-3 → tomorrow 01:59Z) and then rendered in UTC, printing tomorrow.
    expect(row).toHaveTextContent(label);
  });

  it('is still in the grid when the payload carries an explicit UTC offset', () => {
    // Offset-suffixed wire shape. RED against the old formatDate under EVERY
    // host zone: the offset was honored on parse, then re-rendered in UTC.
    const { iso, label } = today();
    renderTab(`${iso}T22:59:10-03:00`);

    expect(screen.getByTestId('movement-row-evening')).toHaveTextContent(label);
  });

  it('is still in the grid for a Z-suffixed evening payload', () => {
    // NOT red against the old formatDate (UTC in, UTC out). Kept so the window
    // stays correct for whichever wire shape NEO ends up sending.
    const { iso, label } = today();
    renderTab(`${iso}T22:59:10Z`);

    expect(screen.getByTestId('movement-row-evening')).toHaveTextContent(label);
  });

  it('still hides a movement genuinely outside the 30-day window', () => {
    // The counterweight: "always visible" would satisfy every assertion above,
    // so pin that the range filter is in fact doing something.
    const old = new Date();
    old.setDate(old.getDate() - 40);
    renderTab(`${todayCalendarISO(old)}T22:59:10`);

    expect(screen.queryByTestId('movement-row-evening')).not.toBeInTheDocument();
  });
});
