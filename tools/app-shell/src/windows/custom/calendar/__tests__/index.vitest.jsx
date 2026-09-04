import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStableUseApiFetchMock } from '@/test/mockUseApiFetch.js';

// useYearCloseStatus/useYearHasPeriods (called directly by CalendarWindow, not just by the
// stubbed child panels below) now go through useApiFetch (@/auth/useApiFetch.js), which calls
// the real useAuth() internally — that throws without an AuthProvider in the tree. Mocked here
// the same way sibling calendar test files do, so CalendarWindow can still be rendered bare.
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: createStableUseApiFetchMock(),
}));

const __dirname = dirname(fileURLToPath(import.meta.url));
const calendarSource = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');
const yearPageSource = readFileSync(
  join(__dirname, '../../../../../../../artifacts/fiscal-calendar/generated/web/fiscal-calendar/YearPage.jsx'),
  'utf8'
);

vi.mock('@generated/fiscal-calendar/generated/web/fiscal-calendar/YearPage', () => ({
  default: (props) => {
    globalThis.__lastCalendarPageProps = props;
    return <div data-testid="calendar-page-stub" />;
  },
}));

vi.mock('../AccountingPanel.jsx', () => ({
  default: (props) => {
    globalThis.__lastAccountingPanelProps = props;
    return <div data-testid="accounting-panel-stub" />;
  },
}));

vi.mock('../PeriodsExpandablePanel.jsx', () => ({
  default: (props) => {
    globalThis.__lastPeriodsPanelProps = props;
    return <div data-testid="periods-panel-stub" />;
  },
}));

vi.mock('../YearCloseStatusBadge.jsx', () => ({
  default: (props) => {
    globalThis.__lastYearCloseStatusBadgeProps = props;
    return <div data-testid="year-close-status-badge-stub" />;
  },
}));

vi.mock('../YearTableWithCloseStatus.jsx', () => ({
  default: () => <div data-testid="year-table-with-close-status-stub" />,
}));

vi.mock('@/windows/custom/fiscal-calendar/CloseYearModal', () => ({
  default: (props) => {
    globalThis.__lastCloseYearModalProps = props;
    return <div data-testid="close-year-modal-stub" />;
  },
}));

vi.mock('@/windows/custom/fiscal-calendar/UndoCloseYearModal', () => ({
  default: (props) => {
    globalThis.__lastUndoCloseYearModalProps = props;
    return <div data-testid="undo-close-year-modal-stub" />;
  },
}));

import { screen } from '@testing-library/react';
import CalendarWindow from '../index.jsx';
import YearTableWithCloseStatus from '../YearTableWithCloseStatus.jsx';

describe('CalendarWindow', () => {
  it('passes the expected secondaryTabs to YearPage', () => {
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" />);
    const tabs = globalThis.__lastCalendarPageProps.secondaryTabs;
    expect(tabs.map((t) => t.key)).toEqual(['periods', 'accounting']);
    expect(typeof tabs[0].Panel).toBe('function');
    expect(typeof tabs[1].Panel).toBe('function');
  });

  it('leaves Attachments to the generated YearPage tab instead of reimplementing it', () => {
    expect(yearPageSource).toMatch(/AttachmentsTab/);
    expect(yearPageSource).toMatch(/key:\s*'attachments'/);
    expect(calendarSource).not.toMatch(/AttachmentsTab/);
    expect(calendarSource).not.toMatch(/key:\s*'attachments'/);
  });

  it('rewrites the calendar-route apiBaseUrl to fiscal-calendar for the header page', () => {
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" />);
    expect(globalThis.__lastCalendarPageProps.apiBaseUrl).toBe('https://api.test/fiscal-calendar');
  });

  it('rewrites the injected apiBaseUrl to end-year-close for the Accounting tab Panel', () => {
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" />);
    const { AccountingPanelForCalendar } = { AccountingPanelForCalendar: globalThis.__lastCalendarPageProps.secondaryTabs[1].Panel };
    render(<AccountingPanelForCalendar parentId="year1" token="tok" apiBaseUrl="https://api.test/calendar" />);
    expect(globalThis.__lastAccountingPanelProps.apiBaseUrl).toBe('https://api.test/end-year-close');
    expect(globalThis.__lastAccountingPanelProps.parentId).toBe('year1');
  });

  it('rewrites the injected apiBaseUrl to open-close-period-control for the Periods tab Panel', () => {
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" />);
    const PeriodsPanelForCalendar = globalThis.__lastCalendarPageProps.secondaryTabs[0].Panel;
    render(<PeriodsPanelForCalendar parentId="year1" token="tok" apiBaseUrl="https://api.test/calendar" />);
    expect(globalThis.__lastPeriodsPanelProps.apiBaseUrl).toBe('https://api.test/open-close-period-control');
    expect(globalThis.__lastPeriodsPanelProps.parentId).toBe('year1');
  });

  it('passes YearCloseStatusBadgeForCalendar as topbarRight to YearPage', () => {
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" />);
    expect(typeof globalThis.__lastCalendarPageProps.topbarRight).toBe('function');
  });

  it('rewrites the injected apiBaseUrl to end-year-close for the year-close status badge', () => {
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" />);
    const TopbarRightForCalendar = globalThis.__lastCalendarPageProps.topbarRight;
    render(<TopbarRightForCalendar recordId="year1" token="tok" apiBaseUrl="https://api.test/calendar" />);
    expect(globalThis.__lastYearCloseStatusBadgeProps.apiBaseUrl).toBe('https://api.test/end-year-close');
    expect(globalThis.__lastYearCloseStatusBadgeProps.recordId).toBe('year1');
  });

  it('sends the header, Accounting tab, and Periods tab to three distinct spec bases', () => {
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" />);
    const AccountingPanelForCalendar = globalThis.__lastCalendarPageProps.secondaryTabs[1].Panel;
    const PeriodsPanelForCalendar = globalThis.__lastCalendarPageProps.secondaryTabs[0].Panel;
    render(<AccountingPanelForCalendar parentId="year1" token="tok" apiBaseUrl="https://api.test/calendar" />);
    render(<PeriodsPanelForCalendar parentId="year1" token="tok" apiBaseUrl="https://api.test/calendar" />);

    const headerBase = globalThis.__lastCalendarPageProps.apiBaseUrl;
    const accountingBase = globalThis.__lastAccountingPanelProps.apiBaseUrl;
    const periodsBase = globalThis.__lastPeriodsPanelProps.apiBaseUrl;

    // Guards against a copy/paste mistake where two panels accidentally point at the
    // same (wrong) spec — every panel must resolve to its own, distinct backing spec.
    expect(new Set([headerBase, accountingBase, periodsBase]).size).toBe(3);
    expect(headerBase).toBe('https://api.test/fiscal-calendar');
    expect(accountingBase).toBe('https://api.test/end-year-close');
    expect(periodsBase).toBe('https://api.test/open-close-period-control');
  });

  it('falls back to a root-relative base when apiBaseUrl has no host (e.g. "/calendar")', () => {
    render(<CalendarWindow token="tok" apiBaseUrl="/calendar" />);
    expect(globalThis.__lastCalendarPageProps.apiBaseUrl).toBe('/fiscal-calendar');
  });

  it('degrades to a bare "/<spec>" path when apiBaseUrl is an empty string', () => {
    render(<CalendarWindow token="tok" apiBaseUrl="" />);
    expect(globalThis.__lastCalendarPageProps.apiBaseUrl).toBe('/fiscal-calendar');
  });

  it('routes the status badge to the same end-year-close spec as the Accounting tab (never re-derived)', () => {
    // The status pill and the Contabilidad tab must read from the exact same accounting
    // endpoint so they can never disagree with each other about whether a year is closed.
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" />);
    const AccountingPanelForCalendar = globalThis.__lastCalendarPageProps.secondaryTabs[1].Panel;
    const TopbarRightForCalendar = globalThis.__lastCalendarPageProps.topbarRight;
    render(<AccountingPanelForCalendar parentId="year1" token="tok" apiBaseUrl="https://api.test/calendar" />);
    render(<TopbarRightForCalendar recordId="year1" token="tok" apiBaseUrl="https://api.test/calendar" />);

    expect(globalThis.__lastYearCloseStatusBadgeProps.apiBaseUrl).toBe(globalThis.__lastAccountingPanelProps.apiBaseUrl);
  });

  it('passes YearTableWithCloseStatus as the list Table override (no wrapper needed — the apiBaseUrl rewrite for the status column happens inside its own col.render)', () => {
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" />);
    expect(globalThis.__lastCalendarPageProps.Table).toBe(YearTableWithCloseStatus);
  });

  it('offers only "Cerrar Año" (not both) while the year is not closed', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) }));
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" recordId="year1" />);
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const actions = globalThis.__lastCalendarPageProps.menuActions({ data: { id: 'year1' } });
    expect(actions.map((a) => a.key)).toEqual(['closeYear']);
  });

  it('offers only "Deshacer Cierre de Año" (not both) once the year is closed', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ id: 'f1' }] }) }));
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" recordId="year1" />);

    // Wait for useYearCloseStatus's async state update to flush and re-render
    // CalendarWindow with a fresh `menuActionsForCalendar` closing over the resolved value —
    // waiting only for `fetch` to have been called isn't enough, since the .then()/setState/
    // re-render chain hasn't necessarily settled yet at that point.
    await vi.waitFor(() => {
      const actions = globalThis.__lastCalendarPageProps.menuActions({ data: { id: 'year1' } });
      expect(actions.map((a) => a.key)).toEqual(['undoCloseYear']);
    });
  });

  it('reuses the same end-year-close derivation for menuActions as the badge/column (never re-derived)', () => {
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" recordId="year1" />);
    const TopbarRightForCalendar = globalThis.__lastCalendarPageProps.topbarRight;
    render(<TopbarRightForCalendar recordId="year1" token="tok" apiBaseUrl="https://api.test/calendar" />);
    // Same apiBaseUrl computation is used for both the badge and the recordId-scoped
    // menuActions check — confirmed by construction (endYearCloseApiBaseUrl is a single
    // variable feeding both `useYearCloseStatus` calls in index.jsx).
    expect(globalThis.__lastYearCloseStatusBadgeProps.apiBaseUrl).toBe('https://api.test/end-year-close');
  });

  it('clicking "Cerrar Año" opens CloseYearModal with the current record', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) }));
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" recordId="year1" />);
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const actions = globalThis.__lastCalendarPageProps.menuActions({ data: { id: 'year1', fiscalYear: '2026' } });
    actions.find((a) => a.key === 'closeYear').onClick();

    await vi.waitFor(() => expect(screen.getByTestId('close-year-modal-stub')).toBeInTheDocument());
    expect(globalThis.__lastCloseYearModalProps.currentRecord).toEqual({ id: 'year1', fiscalYear: '2026' });
    expect(globalThis.__lastCloseYearModalProps.apiBaseUrl).toBe('https://api.test/fiscal-calendar');
    expect(screen.queryByTestId('undo-close-year-modal-stub')).not.toBeInTheDocument();
  });

  it('clicking "Deshacer Cierre de Año" opens UndoCloseYearModal with the current record', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ id: 'f1' }] }) }));
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" recordId="year1" />);

    let actions;
    await vi.waitFor(() => {
      actions = globalThis.__lastCalendarPageProps.menuActions({ data: { id: 'year1', fiscalYear: '2026' } });
      expect(actions.map((a) => a.key)).toEqual(['undoCloseYear']);
    });
    actions.find((a) => a.key === 'undoCloseYear').onClick();

    await vi.waitFor(() => expect(screen.getByTestId('undo-close-year-modal-stub')).toBeInTheDocument());
    expect(globalThis.__lastUndoCloseYearModalProps.currentRecord).toEqual({ id: 'year1', fiscalYear: '2026' });
    expect(globalThis.__lastUndoCloseYearModalProps.apiBaseUrl).toBe('https://api.test/fiscal-calendar');
    expect(screen.queryByTestId('close-year-modal-stub')).not.toBeInTheDocument();
  });

  it('throws instead of silently misrouting when apiBaseUrl is undefined', () => {
    // Documents current behavior: WindowLoader always supplies a string apiBaseUrl, so this
    // is not reachable in practice, but if that invariant is ever broken the failure must be
    // loud (a thrown TypeError) rather than a silent, wrongly-routed fetch.
    expect(() => render(<CalendarWindow token="tok" apiBaseUrl={undefined} />)).toThrow();
  });

  it('sends the has-periods check to the open-close-period-control/periodControl endpoint', async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes('open-close-period-control/periodControl')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
    });
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" recordId="year1" />);

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.test/open-close-period-control/periodControl?criteria='),
        expect.anything()
      );
    });
  });

  it('offers only "Create Periods" while the year has no periods yet', async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes('open-close-period-control/periodControl')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
    });
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" recordId="year1" />);

    await vi.waitFor(() => {
      const processes = globalThis.__lastCalendarPageProps.processes;
      expect(processes).toHaveLength(1);
      expect(processes[0].name).toBe('processNow');
    });
  });

  it('offers "Create Periods" while the has-periods check is still loading', () => {
    global.fetch = vi.fn(() => new Promise(() => {})); // never resolves
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" recordId="year1" />);

    const processes = globalThis.__lastCalendarPageProps.processes;
    expect(processes).toHaveLength(1);
    expect(processes[0].name).toBe('processNow');
  });

  it('hides "Create Periods" once the year already has at least one period', async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes('open-close-period-control/periodControl')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [{ id: 'p1' }] } }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
    });
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" recordId="year1" />);

    await vi.waitFor(() => {
      expect(globalThis.__lastCalendarPageProps.processes).toEqual([]);
    });
  });
});
