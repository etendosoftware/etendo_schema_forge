import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useUI, useMenuLabel, useLocaleSwitch } from '@/i18n';
import { Button } from '@/components/ui/button';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { useFavorites } from '@/components/layout/FavoritesContext';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import MonthGrid from './unified-calendar/MonthGrid.jsx';
import SourcePanel from './unified-calendar/SourcePanel.jsx';
import { buildEventSources } from './unified-calendar/eventSources.js';
import { addMonths, buildMonthGrid, gridRange, startOfMonth } from './unified-calendar/calendarGrid.js';

/**
 * Unified Calendar — proof of concept (flag `unified-calendar-poc`).
 *
 * One month view that overlays several event sources (purchase invoice due
 * dates, holidays, employee vacations), each toggled from the side panel.
 * All data is static mock data (see unified-calendar/mockEvents.js): the PoC
 * makes no backend request of any kind.
 */

const TOGGLE_STORAGE_KEY = 'unified-calendar-poc:enabled-sources';

function readStoredToggles() {
  try {
    const raw = window.localStorage.getItem(TOGGLE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredToggles(value) {
  try {
    window.localStorage.setItem(TOGGLE_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode, blocked site data): the toggles just do not persist.
  }
}

export default function UnifiedCalendarPage() {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const { locale } = useLocaleSwitch();

  const sources = useMemo(() => buildEventSources(new Date()), []);
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [enabled, setEnabled] = useState(() => {
    const stored = readStoredToggles();
    return Object.fromEntries(sources.map((s) => [s.id, stored[s.id] ?? s.enabled]));
  });

  useEffect(() => { writeStoredToggles(enabled); }, [enabled]);

  const toggleSource = useCallback((id) => {
    setEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const weeks = useMemo(() => buildMonthGrid(monthDate), [monthDate]);

  // Events of every source in the visible range, regardless of the toggle, so
  // the panel can show a count even for a source that is switched off.
  const eventsBySource = useMemo(() => {
    const range = gridRange(weeks);
    return Object.fromEntries(sources.map((s) => [s.id, s.fetch(range)]));
  }, [sources, weeks]);

  const counts = useMemo(
    () => Object.fromEntries(Object.entries(eventsBySource).map(([id, list]) => [id, list.length])),
    [eventsBySource],
  );
  const visibleEvents = useMemo(
    () => sources.filter((s) => enabled[s.id]).flatMap((s) => eventsBySource[s.id]),
    [sources, enabled, eventsBySource],
  );
  const colorBySource = useMemo(
    () => Object.fromEntries(sources.map((s) => [s.id, s.color.pill])),
    [sources],
  );

  const translatedTitle = tMenu('Unified Calendar');
  const breadcrumb = `${tMenu('Proof of Concept')} / ${translatedTitle}`;
  const { toggleFavorite, isFavorite } = useFavorites();
  const favKey = 'unified-calendar';

  useSetPageMeta({
    title: translatedTitle,
    breadcrumb,
    onAddToFavorites: () => toggleFavorite(favKey, 'Unified Calendar'),
    isFavorite: isFavorite(favKey),
  }, [isFavorite(favKey), translatedTitle]);

  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 overflow-auto bg-muted/10 p-4" data-testid="unified-calendar-page">
      <SourcePanel
        sources={sources}
        enabled={enabled}
        counts={counts}
        onToggle={toggleSource}
        data-testid="SourcePanel__3bd298" />
      <section className="flex-1 min-w-0 flex flex-col rounded-lg border bg-card">
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMonthDate(startOfMonth(new Date()))}
            data-testid="Button__3bd298">
            {ui('ucalToday')}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui('ucalPrevMonth')}
            onClick={() => setMonthDate((d) => addMonths(d, -1))}
            data-testid="Button__3bd298">
            <ChevronLeft className="h-5 w-5" data-testid="ChevronLeft__3bd298" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui('ucalNextMonth')}
            onClick={() => setMonthDate((d) => addMonths(d, 1))}
            data-testid="Button__3bd298">
            <ChevronRight className="h-5 w-5" data-testid="ChevronRight__3bd298" />
          </Button>
          <h2 className="text-lg font-semibold capitalize">
            {formatCalendarDate(monthDate, locale, { month: 'long', year: 'numeric' })}
          </h2>
        </header>
        <MonthGrid
          weeks={weeks}
          monthDate={monthDate}
          events={visibleEvents}
          colorBySource={colorBySource}
          locale={locale}
          data-testid="MonthGrid__3bd298" />
      </section>
    </div>
  );
}
