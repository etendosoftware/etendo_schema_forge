// Regression test for ETP-4850: date off-by-one bug under negative-UTC-offset
// timezones.
//
// ImportedStatementsTab's `filteredStatements` useMemo parses `s.importDate`
// and compares it against `from`/`to` bounds coming from
// `getDateBounds(dateRange)` (tools/app-shell/src/lib/dateRangeBounds.js).
// `importDate` is a date-only string (e.g. "2026-08-10") — which the plain Date
// constructor reads as UTC midnight — while `from`/`to` are built with
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
// timezone.
//
// The fixture's `importDate` is DERIVED from `todayCalendarISO()` inside the
// test body — after the TZ is pinned — and the explicit `{ from, to }` filter
// range is built for that same local calendar day. It is not hardcoded because
// a fixed date is a calendar bomb: the tab opens on the `last30` preset, whose
// `from` bound is `today - 29 days`, so any pinned date silently drops out of
// the default window ~30 days after it is written. That is exactly what
// happened to the original "2026-08-10" fixture — the test started failing on
// its own pre-filter sanity assertion and never reached the ETP-4850
// assertions it exists to protect. Deriving from today keeps the fixture inside
// the default window forever.
//
// The range is built with the local-time constructor from the ISO components
// (`new Date(y, m - 1, d)`) rather than via `parseCalendarDate`, so the test
// never depends on the very helper whose behavior it is validating. The date
// stays a date-only `yyyy-MM-dd` string — that shape IS the bug's trigger, so
// it must not be widened into a full timestamp.

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

// The single local calendar day (yyyy-MM-dd) the stubbed toolbar filters for.
// Set by the test after the TZ is pinned — same indirection as statementsRef
// above, because a vi.mock factory cannot close over a per-test value directly.
const filterDayRef = { value: null };

// Minimal toolbar stub: exposes a single button that fires an explicit
// { from, to } Date-range change for filterDayRef's day (bypassing the preset
// system, which is relative to "today" and would add an unrelated variable to
// the assertion under test). The bounds are built with the local-time Date
// constructor from the ISO components, deliberately NOT with parseCalendarDate
// — the test must not lean on the helper it is validating.
function localDay(iso) {
  const [year, month, day] = iso.split('-');
  return new Date(Number(year), Number(month) - 1, Number(day));
}

vi.mock('../StatementsToolbar', () => ({
  StatementsToolbar: ({ onDateRangeChange }) => (
    <div data-testid="stub-toolbar">
      <button
        type="button"
        data-testid="toolbar-daterange-single-day"
        onClick={() => onDateRangeChange({
          from: localDay(filterDayRef.value),
          to: localDay(filterDayRef.value),
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
  // The tab builds these from the table module (the sort state lives in the tab since
  // ETP-4921, so its toolbar can host the "Ordenar por" popover).
  buildStatementSortAccessors: () => ({}),
  buildStatementSortColumns: () => [],
}));

vi.mock('../StatementLinesView', () => ({ StatementLinesView: () => null }));
vi.mock('../ImportStatementModal', () => ({ ImportStatementModal: () => null }));
vi.mock('../ManualStatementModal', () => ({ ManualStatementModal: () => null }));

// --- Import under test (after mocks) ---

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { todayCalendarISO } from '@/lib/dateOnly.js';
import { ImportedStatementsTab } from '../ImportedStatementsTab.jsx';

// --- Fixtures ---

const ACCOUNT = { id: 'acc-1', currencyIso: 'EUR' };

// A statement imported on the host's current local calendar day, carried as the
// date-only string NEO returns for Date-type fields (the same shape the rest of
// this codebase's fixtures use for equivalent fields, e.g. invoiceDate). Built
// inside the test, never at module load, so it reads the pinned TZ.
const statementImportedOn = (importDate) => ({
  id: 's1', documentNo: 'BS-001', fileName: 'extracto.c43', name: 'Extracto',
  importDate, status: 'PENDING',
});

// --- Tests ---

describe('ImportedStatementsTab — ETP-4850 date off-by-one bug', () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'America/Argentina/Buenos_Aires';
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('includes a statement imported today when filtering for that exact day', async () => {
    // Resolved here, with the TZ already pinned: the fixture's date and the
    // filter's day are the same local calendar day by construction.
    const importDate = todayCalendarISO();
    statementsRef.value = [statementImportedOn(importDate)];
    filterDayRef.value = importDate;

    const user = userEvent.setup();
    render(<ImportedStatementsTab account={ACCOUNT} />);

    // Before filtering, the default "last30" window includes it — this just
    // confirms the fixture reaches the table before we narrow the range. Today
    // can never fall outside last30, which is why the date is derived.
    expect(screen.getByTestId('stub-table')).toHaveAttribute('data-len', '1');

    await user.click(screen.getByTestId('toolbar-daterange-single-day'));

    // Correct expected behavior: a statement literally dated today must be
    // included when filtering the single-day range [today, today].
    expect(screen.getByTestId('stub-table')).toHaveAttribute('data-len', '1');
    expect(screen.getByTestId('row-s1')).toBeInTheDocument();
  });
});
