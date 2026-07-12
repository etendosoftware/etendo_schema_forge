import { useUI } from '@/i18n';
import YearPage from '@generated/calendar/generated/web/calendar/YearPage';
import AccountingPanel from './AccountingPanel.jsx';
import PeriodsExpandablePanel from './PeriodsExpandablePanel.jsx';

export default function CalendarWindow(props) {
  const ui = useUI();
  const secondaryTabs = [
    { key: 'accounting', label: ui('calendarAccountingTab'), Panel: AccountingPanel },
    { key: 'periods', label: ui('calendarPeriodsTab'), Panel: PeriodsExpandablePanel },
  ];
  return <YearPage {...props} secondaryTabs={secondaryTabs} data-testid="CalendarPage__f478" />;
}
