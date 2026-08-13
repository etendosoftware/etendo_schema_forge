// Regression test for ETP-4850: date off-by-one bug under negative-UTC-offset
// timezones.
//
// AutoMatchSuggestionModal's private formatLineDate(isoDate) does
// `new Date(isoDate).toLocaleDateString('es-ES', {...})` with no explicit
// `timeZone` option. `new Date(isoDate)` is parsed as a UTC instant, and
// `toLocaleDateString` without a pinned timeZone renders using the host's
// local timezone. Under a negative-offset timezone (e.g.
// America/Argentina/Buenos_Aires, UTC-3) that rolls the displayed calendar
// day back by one, e.g. "2026-08-10T00:00:00Z" renders as "09/08/2026"
// instead of "10/08/2026". The canonical fix
// (tools/app-shell/src/lib/dateOnly.js — formatCalendarDate) avoids this by
// parsing the yyyy-MM-dd components directly with the local Date
// constructor.
//
// TZ is forced to America/Argentina/Buenos_Aires (verified empirically:
// process.env.TZ takes effect per-call in this project's Node/Vitest setup)
// to make the bug reproducible regardless of the CI machine's default
// timezone.

// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    if (params && typeof params === 'object') {
      return Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), key);
    }
    return key;
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children, ...rest }) => <div {...rest}>{children}</div>,
  DialogTitle: ({ children, ...rest }) => <h2 {...rest}>{children}</h2>,
}));

vi.mock('@/components/ui/money-amount', () => ({
  MoneyAmount: ({ value, className }) => <span className={className}>{value}</span>,
}));

const applyMock = vi.fn();
vi.mock('@/hooks/useReconciliation', () => ({
  useApplySuggestions: () => ({ apply: applyMock, loading: false, error: null }),
}));

// --- Import under test (after mocks) ---

import { render, screen } from '@testing-library/react';
import { AutoMatchSuggestionModal } from '../AutoMatchSuggestionModal.jsx';

// --- Fixtures ---

// Dated the 10th of the month, at UTC midnight — the exact shape the real
// reconciliation API returns for a statement-line date.
// Only the statement line carries a `date` (the operation is left without
// one) so the rendered "10/08/2026" text is unambiguous — StatementContent
// is the only row calling formatLineDate().
const GROUP_WITH_DATE = {
  groupKey: 'line-1-txn-1',
  statementLine: { id: 'line-1', description: 'Transf. recibida ACME', amount: -500, date: '2026-08-10T00:00:00Z' },
  operations: [{ id: 'txn-1', documentNo: 'F2660006', partnerName: 'NCA Group Spain SA', amount: -500, isNew: false }],
  origin: 'standard',
  isNew: false,
  difference: 0,
};

// --- Tests ---

describe('AutoMatchSuggestionModal — ETP-4850 date off-by-one bug', () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'America/Argentina/Buenos_Aires';
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('renders the statement-line date as 10/08/2026, not shifted back a day', () => {
    render(
      <AutoMatchSuggestionModal
        accountId="acc-1"
        accountName="Banco Santander"
        groups={[GROUP_WITH_DATE]}
        kpis={{}}
        currency="EUR"
        open={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    // Correct expected behavior: the date shown is the calendar day that was
    // actually stored, unaffected by the local timezone offset.
    expect(screen.getByText('10/08/2026')).toBeInTheDocument();
    expect(screen.queryByText('09/08/2026')).not.toBeInTheDocument();
  });
});
