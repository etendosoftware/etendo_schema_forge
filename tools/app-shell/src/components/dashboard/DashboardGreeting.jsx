import { ChevronDown, Sparkles, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUI } from '@/i18n';
import { useDashboardDateRange } from './DashboardDateRangeContext';

const RANGE_KEYS = [
  { value: 'lastYear', labelKey: 'dashboardRangeLastYear' },
  { value: 'last90d',  labelKey: 'dashboardRangeLast90d' },
  { value: 'last30d',  labelKey: 'dashboardRangeLast30d' },
  { value: 'mtd',      labelKey: 'dashboardRangeMtd' },
  { value: 'ytd',      labelKey: 'dashboardRangeYtd' },
];

export function DashboardGreeting({ username = '', onAskCopilot }) {
  const ui = useUI();
  const { range, setRange } = useDashboardDateRange();

  const currentRangeLabel = ui(RANGE_KEYS.find((r) => r.value === range)?.labelKey ?? 'dashboardRangeLastYear');
  const greeting = ui('dashboardGreetingHello').replace('{name}', username || '');

  return (
    <div className="flex items-center justify-between gap-4 mb-2">
      <div className="flex items-center gap-3 min-w-0">
        <div
          style={{
            width: '40px',
            height: '40px',
            flex: 'none',
            order: 0,
            flexGrow: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="8" fill="#F5F7F9"/>
            <path d="M26.25 16.75C26.25 15.0931 24.9069 13.75 23.25 13.75H16.75C15.0931 13.75 13.75 15.0931 13.75 16.75V23.25C13.75 24.9069 15.0931 26.25 16.75 26.25H23.25C24.9069 26.25 26.25 24.9069 26.25 23.25V16.75ZM28.25 23.25C28.25 26.0114 26.0114 28.25 23.25 28.25H16.75C13.9886 28.25 11.75 26.0114 11.75 23.25V16.75C11.75 13.9886 13.9886 11.75 16.75 11.75H23.25C26.0114 11.75 28.25 13.9886 28.25 16.75V23.25Z" fill="#3F3F50"/>
            <path d="M16.4248 20.4219C16.4308 20.433 16.4417 20.4523 16.457 20.4785C16.4879 20.5313 16.5373 20.6121 16.6064 20.7109C16.7456 20.9098 16.9606 21.1777 17.2549 21.4453C17.8388 21.976 18.7286 22.5 20 22.5C21.2714 22.5 22.1612 21.976 22.7451 21.4453C23.0394 21.1777 23.2544 20.9098 23.3936 20.7109C23.4627 20.6121 23.5121 20.5313 23.543 20.4785C23.5583 20.4523 23.5692 20.433 23.5752 20.4219L23.5791 20.415C23.7643 20.0447 24.2146 19.8942 24.585 20.0791C24.9553 20.2643 25.1058 20.7146 24.9209 21.085L24.25 20.75C24.9068 21.0784 24.9208 21.0845 24.9209 21.085L24.9121 21.1025C24.9078 21.1108 24.9024 21.122 24.8955 21.1348C24.8817 21.1603 24.8624 21.1945 24.8379 21.2363C24.7887 21.3203 24.7168 21.435 24.6221 21.5703C24.4332 21.8401 24.1478 22.1974 23.7549 22.5547C22.9638 23.2739 21.7284 24 20 24C18.2716 24 17.0362 23.2739 16.2451 22.5547C15.8522 22.1974 15.5668 21.8401 15.3779 21.5703C15.2832 21.435 15.2113 21.3203 15.1621 21.2363C15.1376 21.1945 15.1183 21.1603 15.1045 21.1348C15.0976 21.122 15.0922 21.1108 15.0879 21.1025L15.0801 21.0869C15.0799 21.0866 15.0792 21.0854 15.75 20.75L15.0791 21.085C14.8942 20.7146 15.0447 20.2643 15.415 20.0791C15.7854 19.8942 16.2347 20.0447 16.4199 20.415L16.4248 20.4219Z" fill="#3F3F50"/>
            <path d="M17 18C17 17.4477 17.4477 17 18 17C18.5523 17 19 17.4477 19 18C19 18.5523 18.5523 19 18 19C17.4477 19 17 18.5523 17 18Z" fill="#3F3F50"/>
            <path d="M21 18C21 17.4477 21.4477 17 22 17C22.5523 17 23 17.4477 23 18C23 18.5523 22.5523 19 22 19C21.4477 19 21 18.5523 21 18Z" fill="#3F3F50"/>
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-foreground leading-tight">{greeting}</p>
          <h1 className="text-lg font-semibold leading-8 truncate">{ui('dashboardGreetingHeadline')}</h1>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <DropdownMenu data-testid="DropdownMenu__5bd498">
          <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__5bd498">
            <Button data-testid="dashboard-range-trigger" variant="outline" size="sm" className="h-10 gap-1.5 text-sm bg-white hover:bg-[#F5F7F9]">
              <CalendarDays
                className="h-3.5 w-3.5 text-muted-foreground"
                data-testid="CalendarDays__5bd498" />
              <span>{currentRangeLabel}</span>
              <ChevronDown
                className="h-3.5 w-3.5 text-muted-foreground"
                data-testid="ChevronDown__5bd498" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" data-testid="DropdownMenuContent__5bd498">
            {RANGE_KEYS.map((r) => (
              <DropdownMenuItem
                key={r.value}
                data-testid={`dashboard-range-option-${r.value}`}
                onSelect={() => setRange(r.value)}
                className={range === r.value ? 'font-semibold' : ''}
              >
                {ui(r.labelKey)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          size="sm"
          className="h-10 gap-1.5 bg-[#121217] text-white hover:bg-[#FFD500] hover:text-[#121217]"
          onClick={onAskCopilot}
          data-testid="Button__5bd498">
          <Sparkles className="h-3.5 w-3.5" data-testid="Sparkles__5bd498" />
          <span className="hidden sm:inline">{ui('dashboardCopilotCta')}</span>
        </Button>
      </div>
    </div>
  );
}
