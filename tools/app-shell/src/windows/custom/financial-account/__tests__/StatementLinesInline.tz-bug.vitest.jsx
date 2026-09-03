// Regression test for ETP-5100 — a statement line's wall-clock time must not
// move the calendar day the inline grid shows.
//
// StatementLinesInline has its own module-local `formatDate`, identical in
// shape to the one MovementsTable carried:
//
//   const d = new Date(iso);
//   new Intl.DateTimeFormat(bcpLocale, { ..., timeZone: 'UTC' }).format(d);
//
// Two opposite assumptions that only cancel out for a payload that is literally
// UTC midnight — which is exactly what every fixture in
// StatementLinesInline.vitest.jsx uses ("2026-05-06T00:00:00Z"), and why the
// existing suite was blind to the bug. With a real wall-clock time the offsets
// stack instead of cancelling and the day moves.
//
// It now delegates to the canonical `formatCalendarDate` (src/lib/dateOnly.js).
//
// TZ is pinned per describe block (`process.env.TZ` takes effect per-call in
// this project's Node/Vitest setup — same technique as
// ImportedStatementsTab.tz-bug.vitest.jsx) so nothing here depends on the
// machine running the suite.

// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

vi.mock('@/components/ui/status-tag', () => ({
  StatusTag: ({ tone, label }) => <span data-testid={`status-${tone}`}>{label}</span>,
}));

const linesMock = vi.fn();
vi.mock('@/hooks/useBankStatementLines', () => ({
  useBankStatementLines: (...args) => linesMock(...args),
}));

vi.mock('../ReconciledTxnsModal', () => ({ ReconciledTxnsModal: () => null }));

// --- Import under test (after mocks) ---

import { render, screen } from '@testing-library/react';
import { StatementLinesInline } from '../StatementLinesInline.jsx';

// --- Helpers ---

function renderLine(date) {
  linesMock.mockReturnValue({
    lines: [{ id: 'l1', date, description: 'compra', bpartnerName: 'ACME', amount: 100, matched: false }],
    loading: false,
  });
  render(<StatementLinesInline statementId="s1" currency="EUR" />);
  return screen.getByTestId('statement-line-row-l1');
}

function describeInTz(tz, label, body) {
  describe(label, () => {
    const originalTz = process.env.TZ;
    beforeAll(() => { process.env.TZ = tz; });
    afterAll(() => { process.env.TZ = originalTz; });
    beforeEach(() => { linesMock.mockReset(); });
    body();
  });
}

// --- Tests ---

describeInTz(
  'America/Argentina/Buenos_Aires',
  'StatementLinesInline date cell — ETP-5100, host behind UTC (UTC-3)',
  () => {
    it('shows 01/09 for a line stamped 22:59 on 01/09 with no zone suffix', () => {
      // RED against the old body: parsed as LOCAL (2026-09-02T01:59:10Z on
      // UTC-3), rendered in UTC → 02/09/2026.
      expect(renderLine('2026-09-01T22:59:10')).toHaveTextContent('01/09/2026');
    });

    it('shows 01/09 for the same instant carrying its UTC offset', () => {
      // RED against the old body under EVERY host zone.
      expect(renderLine('2026-09-01T22:59:10-03:00')).toHaveTextContent('01/09/2026');
    });

    it('shows 01/09 for the Z-suffixed evening wire shape', () => {
      // NOT red against the old body (UTC in, UTC out). Kept so the fix stays
      // correct for whichever wire shape NEO sends.
      expect(renderLine('2026-09-01T22:59:10Z')).toHaveTextContent('01/09/2026');
    });

    it('still shows the UTC-midnight payload unchanged', () => {
      // Pins the previously-working shape used by every other fixture here.
      expect(renderLine('2026-05-06T00:00:00Z')).toHaveTextContent('06/05/2026');
    });
  },
);

describeInTz(
  'Pacific/Kiritimati',
  'StatementLinesInline date cell — ETP-5100, host ahead of UTC (UTC+14)',
  () => {
    it('shows 02/09 for a line stamped 00:30 on 02/09 with no zone suffix', () => {
      // Mirror image, RED against the old body: local 02/09 00:30 on UTC+14 is
      // 2026-09-01T10:30Z, so the UTC formatter printed 01/09.
      expect(renderLine('2026-09-02T00:30:00')).toHaveTextContent('02/09/2026');
    });
  },
);
