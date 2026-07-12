import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@generated/calendar/generated/web/calendar/YearPage', () => ({
  default: (props) => {
    globalThis.__lastCalendarPageProps = props;
    return <div data-testid="calendar-page-stub" />;
  },
}));

import CalendarWindow from '../index.jsx';

describe('CalendarWindow', () => {
  it('passes the expected secondaryTabs to YearPage', () => {
    render(<CalendarWindow token="tok" apiBaseUrl="https://api.test" />);
    const tabs = globalThis.__lastCalendarPageProps.secondaryTabs;
    expect(tabs.map((t) => t.key)).toEqual(['accounting', 'periods']);
    expect(typeof tabs[0].Panel).toBe('function');
    expect(typeof tabs[1].Panel).toBe('function');
  });
});
