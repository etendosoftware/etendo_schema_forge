import { useCallback, useMemo, useState } from 'react';
import { useUI } from '@/i18n';
import YearPage from '@generated/fiscal-calendar/generated/web/fiscal-calendar/YearPage';
import AccountingPanel from './AccountingPanel.jsx';
import PeriodsExpandablePanel from './PeriodsExpandablePanel.jsx';
import YearCloseStatusBadge from './YearCloseStatusBadge.jsx';
import YearTableWithCloseStatus from './YearTableWithCloseStatus.jsx';
import { useYearCloseStatus } from './useYearCloseStatus.js';
import { useYearHasPeriods } from './useYearHasPeriods.js';
import CloseYearModal from '@/windows/custom/fiscal-calendar/CloseYearModal';
import UndoCloseYearModal from '@/windows/custom/fiscal-calendar/UndoCloseYearModal';

// Mirrors `artifacts/fiscal-calendar/decisions.json` → `window.processOverrides.processNow` /
// the generated `YearPage.jsx`'s own `processes` const exactly — kept in sync manually since
// this is a hand-written override (see the `processesForCalendar` comment below for why it must
// be a full replacement, not a merge). Update both places together if the process params change.
const CREATE_PERIODS_PROCESS = {
  name: 'processNow',
  label: 'Create Periods',
  style: 'positive',
  params: [
    {
      key: 'FISCALYEARSTART',
      type: 'select',
      label: 'Fiscal Year Range',
      required: true,
      options: [
        { value: 'JANUARY', label: 'January - December' },
        { value: 'JULY', label: 'July - June' },
      ],
    },
    {
      key: 'CREATEADJUSTMENT',
      type: 'select',
      label: 'Create Adjustment Period',
      required: false,
      options: [
        { value: 'N', label: 'No' },
        { value: 'Y', label: 'Yes' },
      ],
    },
  ],
};

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
  return (
    <AccountingPanel
      {...props}
      apiBaseUrl={`${rootApiBase(props.apiBaseUrl)}/end-year-close`}
      data-testid="AccountingPanel__5e732c" />
  );
}

function PeriodsExpandablePanelForCalendar(props) {
  return (
    <PeriodsExpandablePanel
      {...props}
      apiBaseUrl={`${rootApiBase(props.apiBaseUrl)}/open-close-period-control`}
      data-testid="PeriodsExpandablePanel__5e732c" />
  );
}

// `topbarRight` (DetailView.jsx's slot for "right side of detail topbar (replaces status
// badge)") passes { data, recordId, token, apiBaseUrl, api, onProcess, onRefresh } — `apiBaseUrl`
// here is DetailView's own base (`.../fiscal-calendar`), so it needs the same rewrite as the
// secondary-tab panels above to reach the `end-year-close` spec's accounting endpoint.
function YearCloseStatusBadgeForCalendar(props) {
  return (
    <YearCloseStatusBadge
      {...props}
      apiBaseUrl={`${rootApiBase(props.apiBaseUrl)}/end-year-close`}
      data-testid="YearCloseStatusBadge__5e732c" />
  );
}

export default function CalendarWindow(props) {
  const ui = useUI();
  const yearApiBaseUrl = `${rootApiBase(props.apiBaseUrl)}/fiscal-calendar`;
  const endYearCloseApiBaseUrl = `${rootApiBase(props.apiBaseUrl)}/end-year-close`;
  const periodControlApiBaseUrl = `${rootApiBase(props.apiBaseUrl)}/open-close-period-control`;
  const secondaryTabs = [
    { key: 'periods', label: ui('calendarPeriodsTab'), Panel: PeriodsExpandablePanelForCalendar },
    { key: 'accounting', label: ui('calendarAccountingTab'), Panel: AccountingPanelForCalendar },
  ];

  // The generated YearPage.jsx's own `menuActions` unconditionally offers BOTH "Cerrar Año"
  // and "Deshacer Cierre de Año" — a real bug, since only one is ever applicable. Fixing this
  // means fully replacing `menuActions` (props spread in YearPage.jsx overrides it wholesale,
  // it cannot be composed/merged from outside), which means the CloseYearModal/UndoCloseYearModal
  // instances YearPage.jsx renders internally (wired to ITS OWN now-unreachable state setters)
  // become dead code — so this component renders its own independent instances of the same two
  // modal components instead, exactly like AccountingPanel/PeriodsExpandablePanel are already
  // independently orchestrated here rather than left to the generated page.
  const [closeYearTarget, setCloseYearTarget] = useState(null);
  const [undoCloseYearTarget, setUndoCloseYearTarget] = useState(null);

  // Reuses the exact same "closed iff end-year-close has closing entries" derivation as the
  // status badge/list column — never a second, different derivation — so the visible menu
  // action can never disagree with what the badge/column show for the same year.
  const closed = useYearCloseStatus(props.recordId, props.token, endYearCloseApiBaseUrl);

  // "Create Periods" (`year.processNow`) should stop being offered once the year already has at
  // least one `C_Period` record — the same relationship the Periods tab (`PeriodsExpandablePanel`)
  // already fetches, via a dedicated lightweight existence check (not a full periods fetch) so
  // this header button and that tab don't share React state across specs.
  const hasPeriods = useYearHasPeriods(props.recordId, props.token, periodControlApiBaseUrl);

  // The generated `YearPage.jsx`'s own `processes` is a plain array, not a function of the
  // current record — same "wholesale override, not merge" constraint already documented above
  // for `menuActions` (props spread in YearPage.jsx overrides it entirely, it cannot be composed
  // from outside). While the existence check is still loading (`undefined`) or failed (`null`),
  // default to showing the button — the common case (a not-yet-populated year) — rather than
  // hiding a valid action on a transient fetch hiccup.
  const processesForCalendar = useMemo(
    () => (hasPeriods === true ? [] : [CREATE_PERIODS_PROCESS]),
    [hasPeriods]
  );

  const menuActionsForCalendar = useCallback(({ data }) => {
    // While the closed-status check is still loading (`undefined`) or failed (`null`), default
    // to offering "Cerrar Año" — the common case (a not-yet-closed year) rather than showing
    // nothing or, worse, the wrong action.
    if (closed === true) {
      return [{ key: 'undoCloseYear', labelKey: 'undoCloseYearTitle', onClick: () => setUndoCloseYearTarget(data ?? null) }];
    }
    return [{ key: 'closeYear', labelKey: 'closeYearTitle', onClick: () => setCloseYearTarget(data ?? null) }];
  }, [closed]);

  return (
    <>
      <YearPage
        {...props}
        apiBaseUrl={yearApiBaseUrl}
        secondaryTabs={secondaryTabs}
        topbarRight={YearCloseStatusBadgeForCalendar}
        Table={YearTableWithCloseStatus}
        menuActions={menuActionsForCalendar}
        processes={processesForCalendar}
        data-testid="CalendarPage__f478"
      />
      {closeYearTarget && (
        <CloseYearModal
          isOpen={!!closeYearTarget}
          token={props.token}
          apiBaseUrl={yearApiBaseUrl}
          currentRecord={closeYearTarget}
          onClose={() => setCloseYearTarget(null)}
          onSaved={() => { setCloseYearTarget(null); window.location.reload(); }}
          data-testid="CloseYearModal__5e732c" />
      )}
      {undoCloseYearTarget && (
        <UndoCloseYearModal
          isOpen={!!undoCloseYearTarget}
          token={props.token}
          apiBaseUrl={yearApiBaseUrl}
          currentRecord={undoCloseYearTarget}
          onClose={() => setUndoCloseYearTarget(null)}
          onSaved={() => { setUndoCloseYearTarget(null); window.location.reload(); }}
          data-testid="UndoCloseYearModal__5e732c" />
      )}
    </>
  );
}
