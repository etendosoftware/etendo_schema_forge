import { useState } from 'react';
import { Filter } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AdvancedFilterBuilder } from '@/components/contract-ui/AdvancedFilterBuilder.jsx';
import { useUI } from '@/i18n';

/**
 * Funnel button + popover hosting the generic {@link AdvancedFilterBuilder}
 * ("filtro por condiciones"). Shared across list toolbars (movements,
 * statements, accounts) so the trigger, the active-conditions badge and the
 * builder wiring live in one place instead of being copy-pasted per toolbar.
 *
 * Renders nothing when no {@code onChange} handler is provided (parity with the
 * previous per-toolbar guard).
 *
 * @param {{
 *   columns: Array<object>,
 *   rows?: Array<object>,
 *   value?: object|null,
 *   onChange?: (next: object|null) => void,
 *   testId?: string,
 * }} props
 */
export function AdvancedFilterButton({ columns, rows = [], value = null, onChange, testId, entity = null, apiBaseUrl = null, labelOverrides = null }) {
  const ui = useUI();
  const [open, setOpen] = useState(false);

  if (!onChange) {
    return null;
  }

  const activeConditions = value?.conditions?.length ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen} data-testid="Popover__1026f3">
      <PopoverTrigger asChild data-testid="PopoverTrigger__1026f3">
        <button
          type="button"
          data-testid={testId}
          title={ui('advancedFilterTitle')}
          className="relative inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-medium text-foreground transition-colors hover:bg-[#F5F7F9]"
        >
          <Filter className="h-4 w-4 text-muted-foreground" data-testid="Filter__1026f3" />
          <span>{ui('filters')}</span>
          {activeConditions > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#121217] px-1 text-[10px] font-semibold leading-none text-white">
              {activeConditions}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-4" data-testid="PopoverContent__1026f3">
        <AdvancedFilterBuilder
          columns={columns}
          rows={rows}
          entity={entity}
          apiBaseUrl={apiBaseUrl}
          labelOverrides={labelOverrides}
          value={value}
          onApply={(next) => onChange(next)}
          onClear={() => onChange(null)}
          onClose={() => setOpen(false)}
          data-testid="AdvancedFilterBuilder__1026f3" />
      </PopoverContent>
    </Popover>
  );
}
