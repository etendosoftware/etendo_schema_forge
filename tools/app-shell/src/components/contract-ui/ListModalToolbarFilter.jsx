import { ChevronDown, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Generic toolbar dropdown filter for the `list-modal` layout.
 *
 * Declarative and backend-agnostic: a filter is described in the contract
 * (`templateConfig.toolbarFilters[]`) as `{ key, field, allLabelKey, options }`,
 * where each option is `{ value, labelKey }`. The component renders a styled
 * dropdown (Figma "Todas las reglas" / "Todos los estados") and reports the
 * selected raw `value` (or `null` for the "all" option) to the parent, which
 * applies the actual row filtering. No window-specific logic lives here.
 *
 * @param {object}   props
 * @param {object}   props.filter   { key, allLabelKey, options: [{ value, labelKey }] }
 * @param {*}        props.value    current selected option value (null = all)
 * @param {Function} props.onChange (nextValue) => void  (null when "all" chosen)
 * @param {Function} props.ui       i18n resolver (useUI)
 */
export function ListModalToolbarFilter({ filter, value, onChange, ui }) {
  const allLabel = filter.allLabelKey ? ui(filter.allLabelKey) : '';
  const options = [
    { value: null, label: allLabel },
    ...(filter.options ?? []).map((o) => ({ value: o.value, label: ui(o.labelKey) })),
  ];
  const current = value ?? null;
  const active = options.find((o) => o.value === current) ?? options[0];

  return (
    <Popover data-testid="Popover__a4c11d">
      <PopoverTrigger asChild data-testid="PopoverTrigger__a4c11d">
        <button
          type="button"
          data-testid={`list-modal-filter-${filter.key}`}
          className="inline-flex h-10 items-center justify-between gap-2 rounded-lg border border-[#D1D4DB] bg-white px-3 text-sm font-normal leading-6 text-muted-foreground shadow-[0_1px_2px_rgba(18,18,23,0.05)] transition-colors hover:bg-[#F5F7F9]"
        >
          <span className="truncate text-left">{active.label}</span>
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            data-testid="ChevronDown__a4c11d" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start" data-testid="PopoverContent__a4c11d">
        <div role="listbox" aria-label={allLabel}>
          {options.map((opt) => {
            const selected = opt.value === current;
            return (
              <button
                key={String(opt.value ?? '__all__')}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onChange?.(opt.value)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-[#F5F7F9]',
                  selected ? 'font-semibold text-[#121217]' : 'text-[#3F3F50]',
                )}
                data-testid={`list-modal-filter-${filter.key}-option-${String(opt.value ?? 'all')}`}
              >
                <span className="flex-1 text-left">{opt.label}</span>
                {selected ? <Check className="h-4 w-4 text-[#121217]" data-testid="Check__a4c11d" /> : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default ListModalToolbarFilter;
