import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

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

import CalendarWindow from '../index.jsx';

describe('CalendarWindow', () => {
  it('passes the expected secondaryTabs to YearPage', () => {
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" />);
    const tabs = globalThis.__lastCalendarPageProps.secondaryTabs;
    expect(tabs.map((t) => t.key)).toEqual(['accounting', 'periods']);
    expect(typeof tabs[0].Panel).toBe('function');
    expect(typeof tabs[1].Panel).toBe('function');
  });

  it('rewrites the calendar-route apiBaseUrl to fiscal-calendar for the header page', () => {
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" />);
    expect(globalThis.__lastCalendarPageProps.apiBaseUrl).toBe('https://api.test/fiscal-calendar');
  });

  it('rewrites the injected apiBaseUrl to end-year-close for the Accounting tab Panel', () => {
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" />);
    const { AccountingPanelForCalendar } = { AccountingPanelForCalendar: globalThis.__lastCalendarPageProps.secondaryTabs[0].Panel };
    render(<AccountingPanelForCalendar parentId="year1" token="tok" apiBaseUrl="https://api.test/calendar" />);
    expect(globalThis.__lastAccountingPanelProps.apiBaseUrl).toBe('https://api.test/end-year-close');
    expect(globalThis.__lastAccountingPanelProps.parentId).toBe('year1');
  });

  it('rewrites the injected apiBaseUrl to open-close-period-control for the Periods tab Panel', () => {
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" />);
    const PeriodsPanelForCalendar = globalThis.__lastCalendarPageProps.secondaryTabs[1].Panel;
    render(<PeriodsPanelForCalendar parentId="year1" token="tok" apiBaseUrl="https://api.test/calendar" />);
    expect(globalThis.__lastPeriodsPanelProps.apiBaseUrl).toBe('https://api.test/open-close-period-control');
    expect(globalThis.__lastPeriodsPanelProps.parentId).toBe('year1');
  });

  it('sends the header, Accounting tab, and Periods tab to three distinct spec bases', () => {
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test/calendar" />);
    const AccountingPanelForCalendar = globalThis.__lastCalendarPageProps.secondaryTabs[0].Panel;
    const PeriodsPanelForCalendar = globalThis.__lastCalendarPageProps.secondaryTabs[1].Panel;
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

  it('throws instead of silently misrouting when apiBaseUrl is undefined', () => {
    // Documents current behavior: WindowLoader always supplies a string apiBaseUrl, so this
    // is not reachable in practice, but if that invariant is ever broken the failure must be
    // loud (a thrown TypeError) rather than a silent, wrongly-routed fetch.
    expect(() => render(<CalendarWindow token="tok" apiBaseUrl={undefined} />)).toThrow();
  });
});
