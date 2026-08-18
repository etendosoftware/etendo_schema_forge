/**
 * Render/interaction coverage for CalendarView. The sibling
 * CalendarView.indexEvents.vitest.jsx only unit-tests the `indexEvents` helper,
 * so the grid itself (month navigation, controlled vs uncontrolled month, cell
 * and pill clicks, overflow badge, colour resolution) was never rendered.
 */
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarView } from '../CalendarView.jsx';

const MAY_2026 = new Date(2026, 4, 1);
const d = (y, m1, day) => new Date(y, m1 - 1, day);

/** Grid cells are the day buttons; the two chevrons are the only other buttons. */
function dayCell(day, { month = 'May' } = {}) {
  return screen.getByRole('button', { name: new RegExp(`${month} ${day}\\b`) });
}

describe('CalendarView — rendering', () => {
  it('renders the month label, weekday header and a full 6x7 grid', () => {
    render(<CalendarView month={MAY_2026} />);

    expect(screen.getByRole('heading', { name: 'May 2026' })).toBeInTheDocument();
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Sun')).toBeInTheDocument();
    // 42 day cells + previous/next month buttons.
    expect(screen.getAllByRole('button')).toHaveLength(44);
  });

  it('starts the grid on the Monday preceding the first of the month', () => {
    // 1 May 2026 is a Friday, so the grid opens on Monday 27 April.
    render(<CalendarView month={MAY_2026} />);
    expect(dayCell(27, { month: 'April' })).toBeInTheDocument();
    // ...and runs past the end of May into early June.
    expect(dayCell(7, { month: 'June' })).toBeInTheDocument();
  });

  it('marks a Monday-starting month without leading days from the previous month', () => {
    // 1 June 2026 is a Monday.
    render(<CalendarView month={new Date(2026, 5, 1)} />);
    expect(screen.getByRole('heading', { name: 'June 2026' })).toBeInTheDocument();
    expect(dayCell(1, { month: 'June' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /May 31/ })).not.toBeInTheDocument();
  });

  it('highlights today with the primary pill', () => {
    const today = new Date();
    render(<CalendarView />);

    const label = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    // Exact name: a prefix match would also hit e.g. "August 31" from "August 3".
    const cell = screen.getByRole('button', { name: label });
    expect(cell.querySelector('.bg-primary')).not.toBeNull();
  });

  it('dims cells that belong to an adjacent month', () => {
    render(<CalendarView month={MAY_2026} />);
    expect(dayCell(27, { month: 'April' }).className).toContain('bg-muted/30');
    expect(dayCell(15).className).not.toContain('bg-muted/30');
  });
});

describe('CalendarView — month navigation', () => {
  it('moves the internal month backwards and forwards when uncontrolled', async () => {
    const user = userEvent.setup();
    render(<CalendarView />);
    const now = new Date();

    await user.click(screen.getByRole('button', { name: 'Next month' }));
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    expect(screen.getByRole('heading')).toHaveTextContent(
      `${next.toLocaleDateString('en-US', { month: 'long' })} ${next.getFullYear()}`,
    );

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    expect(screen.getByRole('heading')).toHaveTextContent(
      `${prev.toLocaleDateString('en-US', { month: 'long' })} ${prev.getFullYear()}`,
    );
  });

  it('delegates to onMonthChange and keeps the displayed month when controlled', async () => {
    const user = userEvent.setup();
    const onMonthChange = vi.fn();
    render(<CalendarView month={MAY_2026} onMonthChange={onMonthChange} />);

    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(onMonthChange).toHaveBeenCalledTimes(1);
    expect(onMonthChange.mock.calls[0][0].getFullYear()).toBe(2026);
    expect(onMonthChange.mock.calls[0][0].getMonth()).toBe(5);

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(onMonthChange.mock.calls[1][0].getMonth()).toBe(3);

    // The parent owns the month, so the view did not move on its own.
    expect(screen.getByRole('heading', { name: 'May 2026' })).toBeInTheDocument();
  });

  it('rolls over the year when navigating past December', async () => {
    const user = userEvent.setup();
    const onMonthChange = vi.fn();
    render(<CalendarView month={new Date(2026, 11, 1)} onMonthChange={onMonthChange} />);

    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(onMonthChange.mock.calls[0][0].getFullYear()).toBe(2027);
    expect(onMonthChange.mock.calls[0][0].getMonth()).toBe(0);
  });

  it('rolls back the year when navigating before January', async () => {
    const user = userEvent.setup();
    const onMonthChange = vi.fn();
    render(<CalendarView month={new Date(2026, 0, 1)} onMonthChange={onMonthChange} />);

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(onMonthChange.mock.calls[0][0].getFullYear()).toBe(2025);
    expect(onMonthChange.mock.calls[0][0].getMonth()).toBe(11);
  });
});

describe('CalendarView — events', () => {
  const events = [
    { id: 'e1', title: 'Kickoff', date: d(2026, 5, 12), type: 'meeting' },
    { id: 'e2', title: 'Holiday', date: d(2026, 5, 12), type: 'absence' },
    { id: 'e3', title: 'Overflowing', date: d(2026, 5, 12) },
  ];

  it('renders at most two pills per day and collapses the rest', () => {
    render(<CalendarView month={MAY_2026} events={events} />);

    expect(screen.getByTitle('Kickoff')).toBeInTheDocument();
    expect(screen.getByTitle('Holiday')).toBeInTheDocument();
    expect(screen.queryByTitle('Overflowing')).not.toBeInTheDocument();
    expect(screen.getByText(/\+ 1 more/)).toBeInTheDocument();
  });

  it('does not render the overflow badge at exactly two events', () => {
    render(<CalendarView month={MAY_2026} events={events.slice(0, 2)} />);
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });

  it('announces the event count in the cell label', () => {
    render(<CalendarView month={MAY_2026} events={events} />);
    expect(screen.getByRole('button', { name: /May 12, 3 events/ })).toBeInTheDocument();
  });

  it('uses the singular wording for a single event', () => {
    render(<CalendarView month={MAY_2026} events={[events[0]]} />);
    expect(screen.getByRole('button', { name: /May 12, 1 event$/ })).toBeInTheDocument();
  });

  it('applies the palette colour for a known type and the default otherwise', () => {
    render(<CalendarView month={MAY_2026} events={events} />);
    expect(screen.getByTitle('Kickoff').className).toContain('bg-violet-100');
    expect(screen.getByTitle('Holiday').className).toContain('bg-rose-100');

    render(<CalendarView month={MAY_2026} events={[{ id: 'x', title: 'Plain', date: d(2026, 5, 4) }]} />);
    expect(screen.getByTitle('Plain').className).toContain('bg-blue-100');
  });

  it('honours an explicit colour override', () => {
    render(
      <CalendarView
        month={MAY_2026}
        events={[{ id: 'x', title: 'Custom', date: d(2026, 5, 4), type: 'task', color: 'bg-pink-500' }]}
      />,
    );
    expect(screen.getByTitle('Custom').className).toContain('bg-pink-500');
    expect(screen.getByTitle('Custom').className).not.toContain('bg-amber-100');
  });

  it('spreads a multi-day event across every day it covers', () => {
    render(
      <CalendarView
        month={MAY_2026}
        events={[{ id: 'span', title: 'Trip', date: d(2026, 5, 4), endDate: d(2026, 5, 6) }]}
      />,
    );
    expect(screen.getAllByTitle('Trip')).toHaveLength(3);
  });
});

describe('CalendarView — interaction', () => {
  it('reports the clicked date', async () => {
    const user = userEvent.setup();
    const onDateClick = vi.fn();
    render(<CalendarView month={MAY_2026} onDateClick={onDateClick} />);

    await user.click(dayCell(14));
    expect(onDateClick).toHaveBeenCalledTimes(1);
    const clicked = onDateClick.mock.calls[0][0];
    expect(clicked.getDate()).toBe(14);
    expect(clicked.getMonth()).toBe(4);
  });

  it('reports an event click without also firing the date click', async () => {
    const user = userEvent.setup();
    const onDateClick = vi.fn();
    const onEventClick = vi.fn();
    const evt = { id: 'e1', title: 'Kickoff', date: d(2026, 5, 12) };
    render(
      <CalendarView month={MAY_2026} events={[evt]} onDateClick={onDateClick} onEventClick={onEventClick} />,
    );

    await user.click(screen.getByTitle('Kickoff'));
    expect(onEventClick).toHaveBeenCalledWith(evt);
    // The pill stops propagation so the surrounding cell does not also fire.
    expect(onDateClick).not.toHaveBeenCalled();
  });

  it('activates an event pill with Enter and Space', async () => {
    const user = userEvent.setup();
    const onEventClick = vi.fn();
    const evt = { id: 'e1', title: 'Kickoff', date: d(2026, 5, 12) };
    render(<CalendarView month={MAY_2026} events={[evt]} onEventClick={onEventClick} />);

    const pill = screen.getByTitle('Kickoff');
    pill.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onEventClick).toHaveBeenCalledTimes(2);
  });

  it('ignores other keys on an event pill', async () => {
    const user = userEvent.setup();
    const onEventClick = vi.fn();
    render(
      <CalendarView
        month={MAY_2026}
        events={[{ id: 'e1', title: 'Kickoff', date: d(2026, 5, 12) }]}
        onEventClick={onEventClick}
      />,
    );

    screen.getByTitle('Kickoff').focus();
    await user.keyboard('a');
    expect(onEventClick).not.toHaveBeenCalled();
  });

  it('does not crash when no handlers are provided', async () => {
    const user = userEvent.setup();
    render(<CalendarView month={MAY_2026} events={[{ id: 'e1', title: 'Kickoff', date: d(2026, 5, 12) }]} />);

    await user.click(screen.getByTitle('Kickoff'));
    await user.click(dayCell(13));
    expect(screen.getByRole('heading', { name: 'May 2026' })).toBeInTheDocument();
  });
});
