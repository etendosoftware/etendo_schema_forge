import { useUI } from '@/i18n';
import YearPage from '@generated/fiscal-calendar/generated/web/fiscal-calendar/YearPage';
import AccountingPanel from './AccountingPanel.jsx';
import PeriodsExpandablePanel from './PeriodsExpandablePanel.jsx';
import YearCloseStatusBadge from './YearCloseStatusBadge.jsx';

/**
 * The `calendar` custom window has no backing NEO spec of its own (ETP-4478 rework — the
 * originally-attempted merged `calendar` spec was retired because `schema_forge_core`'s
 * populate/push mechanism assumes 1 spec = 1 AD window, see GH #35 / ETP-4481). This window
 * aggregates three separate single-window specs instead:
 *   - `fiscal-calendar` — the `year` header entity + Close Year/Undo Close Year
 *   - `open-close-period-control` — `periodControl`/`documents` (Periods tab)
 *   - `end-year-close` — `accounting` (Accounting tab)
 *
 * `WindowLoader.jsx` always injects `apiBaseUrl={rootBase}/calendar` (derived from the route
 * name, not any real spec), and `DetailView`'s `SecondaryPanelTab` threads that same value
 * unchanged into every secondary-tab `Panel`. Since none of those three specs is actually named
 * "calendar", every fetch below must swap the trailing route segment for the spec it really
 * targets — including the header's own `YearPage`, not just the secondary tabs.
 */
function rootApiBase(apiBaseUrl) {
  return apiBaseUrl.replace(/\/[^/]*$/, '');
}

function AccountingPanelForCalendar(props) {
  return <AccountingPanel {...props} apiBaseUrl={`${rootApiBase(props.apiBaseUrl)}/end-year-close`} />;
}

function PeriodsExpandablePanelForCalendar(props) {
  return <PeriodsExpandablePanel {...props} apiBaseUrl={`${rootApiBase(props.apiBaseUrl)}/open-close-period-control`} />;
}

// `topbarRight` (DetailView.jsx's slot for "right side of detail topbar (replaces status
// badge)") passes { data, recordId, token, apiBaseUrl, api, onProcess, onRefresh } — `apiBaseUrl`
// here is DetailView's own base (`.../fiscal-calendar`), so it needs the same rewrite as the
// secondary-tab panels above to reach the `end-year-close` spec's accounting endpoint.
function YearCloseStatusBadgeForCalendar(props) {
  return <YearCloseStatusBadge {...props} apiBaseUrl={`${rootApiBase(props.apiBaseUrl)}/end-year-close`} />;
}

export default function CalendarWindow(props) {
  const ui = useUI();
  const yearApiBaseUrl = `${rootApiBase(props.apiBaseUrl)}/fiscal-calendar`;
  const secondaryTabs = [
    { key: 'accounting', label: ui('calendarAccountingTab'), Panel: AccountingPanelForCalendar },
    { key: 'periods', label: ui('calendarPeriodsTab'), Panel: PeriodsExpandablePanelForCalendar },
  ];
  return (
    <YearPage
      {...props}
      apiBaseUrl={yearApiBaseUrl}
      secondaryTabs={secondaryTabs}
      topbarRight={YearCloseStatusBadgeForCalendar}
      data-testid="CalendarPage__f478"
    />
  );
}
