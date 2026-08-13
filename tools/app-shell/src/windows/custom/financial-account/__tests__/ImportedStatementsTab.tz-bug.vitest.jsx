// Regression test for ETP-4850: date off-by-one bug under negative-UTC-offset
// timezones.
//
// ImportedStatementsTab's `filteredStatements` useMemo does
// `new Date(s.importDate)` and compares it against `from`/`to` bounds coming
// from `getDateBounds(dateRange)` (tools/app-shell/src/lib/dateRangeBounds.js).
// `importDate` is a date-only string (e.g. "2026-08-10") — parsed by the Date
// constructor as UTC midnight — while `from`/`to` are built with
// `setHours(0,0,0,0)` / `setHours(23,59,59,999)`, i.e. LOCAL-time day
// boundaries. Under a negative-offset timezone (e.g.
// America/Argentina/Buenos_Aires, UTC-3), "2026-08-10" (= Aug 10 00:00 UTC =
// Aug 9 21:00 local) falls BEFORE the local midnight that starts the "Aug 10"
// day, so a statement genuinely dated Aug 10 gets wrongly excluded from a
// date-range filter for Aug 10. The canonical fix
// (tools/app-shell/src/lib/dateOnly.js — parseCalendarDate) avoids this by
// parsing the yyyy-MM-dd components directly with the local Date
// constructor, so the comparison stays entirely in local-day space.
//
// TZ is forced to America/Argentina/Buenos_Aires (verified empirically:
// process.env.TZ takes effect per-call in this project's Node/Vitest setup)
// to make the bug reproducible regardless of the CI machine's default
// timezone. The filter range uses explicit `{ from, to }` Date bounds (not a
// relative preset) so the test does not depend on "today".

// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/hooks/useStatementActions', () => ({
  useStatementActions: () => ({
    processStatement: vi.fn(), reactivateStatement: vi.fn(), deleteStatement: vi.fn(),
    updateStatement: vi.fn(), busy: false, error: null,
  }),
}));

vi.mock('@/hooks/useBankConnectionActions', () => ({
  useBankConnectionActions: () => ({ sync: vi.fn() }),
}));

vi.mock('../StatementConfirmDialog', () => ({
  StatementConfirmDialog: () => null,
}));

const statementsRef = { value: [] };
vi.mock('@/hooks/useBankStatements', () => ({
  useBankStatements: () => ({
    statements: statementsRef.value,
    loading: false,
    reload: vi.fn(),
  }),
}));

// Minimal toolbar stub: exposes a single button that fires an explicit
// { from, to } Date-range change (bypassing the preset system, which is
// relative to "today" and would add an unrelated variable to this test).
vi.mock('../StatementsToolbar', () => ({
  StatementsToolbar: ({ onDateRangeChange }) => (
    <div data-testid="stub-toolbar">
      <button
        type="button"
        data-testid="toolbar-daterange-aug10"
        onClick={() => onDateRangeChange({
          from: new Date(2026, 7, 10), // Aug 10, 2026 (local) — month is 0-based
          to: new Date(2026, 7, 10),
        })}
      />
    </div>
  ),
}));

vi.mock('../StatementsTable', () => ({
  StatementsTable: ({ statements }) => (
    <div data-testid="stub-table" data-len={statements.length}>
      {statements.map((s) => <div key={s.id} data-testid={`row-${s.id}`}>{s.documentNo}</div>)}
    </div>
  ),
}));

vi.mock('../StatementLinesView', () => ({ StatementLinesView: () => null }));
vi.mock('../ImportStatementModal', () => ({ ImportStatementModal: () => null }));
vi.mock('../ManualStatementModal', () => ({ ManualStatementModal: () => null }));

// --- Import under test (after mocks) ---

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportedStatementsTab } from '../ImportedStatementsTab.jsx';

// --- Fixtures ---

const ACCOUNT = { id: 'acc-1', currencyIso: 'EUR' };

// A statement genuinely imported on August 10, 2026 — the date-only format
// NEO returns for Date-type fields (matches the format used across the rest
// of this codebase's fixtures for equivalent fields, e.g. invoiceDate).
const STATEMENT_AUG_10 = {
  id: 's1', documentNo: 'BS-001', fileName: 'agosto.c43', name: 'Agosto',
  importDate: '2026-08-10', status: 'PENDING',
};

// --- Tests ---

describe('ImportedStatementsTab — ETP-4850 date off-by-one bug', () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'America/Argentina/Buenos_Aires';
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  beforeEach(() => {
    statementsRef.value = [STATEMENT_AUG_10];
  });

  it('includes a statement imported on 2026-08-10 when filtering for that exact day', async () => {
    const user = userEvent.setup();
    render(<ImportedStatementsTab account={ACCOUNT} />);

    // Before filtering, the default "last30" window already includes it — this
    // just confirms the fixture reaches the table before we narrow the range.
    expect(screen.getByTestId('stub-table')).toHaveAttribute('data-len', '1');

    await user.click(screen.getByTestId('toolbar-daterange-aug10'));

    // Correct expected behavior: a statement literally dated Aug 10 must be
    // included when filtering the range [Aug 10, Aug 10].
    expect(screen.getByTestId('stub-table')).toHaveAttribute('data-len', '1');
    expect(screen.getByTestId('row-s1')).toBeInTheDocument();
  });
});
