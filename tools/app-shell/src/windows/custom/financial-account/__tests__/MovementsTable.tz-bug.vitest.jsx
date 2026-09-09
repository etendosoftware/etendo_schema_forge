// Regression test for ETP-5100 — a movement's wall-clock time must not move
// the calendar day the grid shows.
//
// MovementsTable has its own module-local `formatDate`, which used to be:
//
//   const d = new Date(isoString);
//   new Intl.DateTimeFormat(bcpLocale, { ..., timeZone: 'UTC' }).format(d);
//
// Two opposite assumptions that only cancel out for a payload that is literally
// UTC midnight — which is what every other fixture in this directory uses, and
// why the whole suite stayed green while the bug shipped. Once NEO started
// emitting a real wall-clock time ("2026-09-01T22:59:10"), `new Date()`
// resolved it in the HOST's zone while the formatter rendered it back in UTC,
// so the offsets stacked: a movement created at 22:59 on 01/09 in UTC-3
// displayed as 02/09. Confirmed live against the database.
//
// It now delegates to the canonical `formatCalendarDate` (src/lib/dateOnly.js),
// which reads the leading yyyy-MM-dd and builds the Date with the LOCAL-time
// constructor — no zone arithmetic at all.
//
// This file exists separately from MovementsTable.vitest.jsx because that suite
// mocks `getContractGridColumns` to a set of columns that deliberately excludes
// `transactionDate` (it exercises the renderer-fallback branch instead), so the
// date cell never reaches the DOM there.
//
// TZ is forced per describe block (`process.env.TZ` takes effect per-call in
// this project's Node/Vitest setup — same technique as
// ImportedStatementsTab.tz-bug.vitest.jsx) so the assertions hold regardless of
// the machine running the suite.

// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (k) => k,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../MovementStatusBadge', () => ({
  MovementStatusBadge: ({ status }) => <span data-testid="status-badge">{status}</span>,
}));
vi.mock('../PostingStatusDot', () => ({ PostingStatusDot: () => <span /> }));
vi.mock('../MovementRowKebab', () => ({ MovementRowKebab: () => <span /> }));
vi.mock('@/components/ui/money-amount', () => ({
  MoneyAmount: ({ value }) => <span>{String(value)}</span>,
}));

// Only the date column — this file is about that one cell.
vi.mock('@/components/financial-accounts/contractColumns', () => ({
  getContractGridColumns: () => [{ name: 'transactionDate', label: 'Fecha' }],
  getContractPanelFields: () => [],
}));

// --- Import under test (after mocks) ---

import { render, screen } from '@testing-library/react';
import { MovementsTable } from '../MovementsTable.jsx';

// --- Helpers ---

const movement = (date) => ({
  id: 'm1',
  date,
  documentNo: 'DOC-001',
  contact: 'ACME',
  description: 'compra',
  paymentStatus: 'RPR',
  trxType: 'BPD',
  amount: 100,
  balance: 1000,
  currencyIso: 'EUR',
  dimensions: {},
});

function renderRow(date) {
  render(
    <MovementsTable
      movements={[movement(date)]}
      loading={false}
      enabledDimensions={[]}
      selectedIds={new Set()}
      onSelectionChange={vi.fn()}
      sortKey={null}
      sortDirection={null}
      onSort={vi.fn()}
    />,
  );
  return screen.getByTestId('movement-row-m1');
}

function describeInTz(tz, label, body) {
  describe(label, () => {
    const originalTz = process.env.TZ;
    beforeAll(() => { process.env.TZ = tz; });
    afterAll(() => { process.env.TZ = originalTz; });
    body();
  });
}

// --- Tests ---

describeInTz(
  'America/Argentina/Buenos_Aires',
  'MovementsTable date cell — ETP-5100, host behind UTC (UTC-3)',
  () => {
    it('shows 01/09 for a movement stamped 22:59 on 01/09 with no zone suffix', () => {
      // RED against the old body: `new Date('2026-09-01T22:59:10')` is LOCAL, so
      // on UTC-3 the instant is 2026-09-02T01:59:10Z and the UTC formatter
      // printed 02/09/2026. This is the shape reported live.
      expect(renderRow('2026-09-01T22:59:10')).toHaveTextContent('01/09/2026');
    });

    it('shows 01/09 for the same instant carrying its UTC offset', () => {
      // RED against the old body under EVERY host zone: the offset was honored
      // on parse and then rendered back in UTC, so the day moved everywhere.
      expect(renderRow('2026-09-01T22:59:10-03:00')).toHaveTextContent('01/09/2026');
    });

    it('shows 01/09 for the Z-suffixed evening wire shape', () => {
      // NOT red against the old body (parsed UTC, rendered UTC → same answer).
      // Kept so the fix stays correct for whichever shape NEO sends.
      expect(renderRow('2026-09-01T22:59:10Z')).toHaveTextContent('01/09/2026');
    });

    it('still shows the UTC-midnight and date-only payloads unchanged', () => {
      // Pins the shapes that already worked, so the fix cannot be undone by
      // trading one broken case for another.
      expect(renderRow('2026-04-27T00:00:00Z')).toHaveTextContent('27/04/2026');
    });
  },
);

describeInTz(
  'Pacific/Kiritimati',
  'MovementsTable date cell — ETP-5100, host ahead of UTC (UTC+14)',
  () => {
    it('shows 02/09 for a movement stamped 00:30 on 02/09 with no zone suffix', () => {
      // The mirror image, RED against the old body for the opposite reason:
      // local 02/09 00:30 on UTC+14 is 2026-09-01T10:30Z, so the UTC formatter
      // printed 01/09 for a movement dated the 2nd. Proves the fix is
      // offset-agnostic, not just "negative offsets patched".
      expect(renderRow('2026-09-02T00:30:00')).toHaveTextContent('02/09/2026');
    });
  },
);
