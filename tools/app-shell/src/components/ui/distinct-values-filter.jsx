import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DistinctValuesList } from '@/components/contract-ui/DistinctValuesList';

/**
 * Reusable Popover that wraps a {@link DistinctValuesList} for an
 * in-memory fixed list of codes (no backend pagination).
 *
 * Used by StatusFilter, TypeFilter, and any other filter that needs the
 * "search + scrollable list of codes" UX without hitting `useDistinctValues`.
 *
 * @param {{
 *   value: string|null;
 *   onChange: (v: string|null) => void;
 *   codes: string[];
 *   labelFor: (code: string) => string;
 *   allLabel: string;
 *   searchPlaceholder: string;
 *   popoverWidth?: string;
 * }} props
 */
export function DistinctValuesFilter({
  value,
  onChange,
  codes,
  labelFor,
  allLabel,
  searchPlaceholder,
  popoverWidth = 'w-64',
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredCodes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return codes;
    return codes.filter(
      (code) =>
        labelFor(code).toLowerCase().includes(q) ||
        code.toLowerCase().includes(q),
    );
  }, [search, codes, labelFor]);

  const distinct = {
    search,
    setSearch,
    loading: false,
    loadingMore: false,
    hasMore: false,
    loadMore: () => {},
    values: filteredCodes,
  };

  const triggerLabel = value ? labelFor(value) : allLabel;

  return (
    <Popover open={open} onOpenChange={setOpen} data-testid="Popover__cd3aa9">
      <PopoverTrigger asChild data-testid="PopoverTrigger__cd3aa9">
        <button
          type="button"
          className="inline-flex h-9 items-center justify-between gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-normal leading-6 text-muted-foreground transition-colors hover:bg-[#F5F7F9]"
        >
          <span className="truncate text-left">{triggerLabel}</span>
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            data-testid="ChevronDown__cd3aa9" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={`${popoverWidth} p-0`}
        align="start"
        data-testid="PopoverContent__cd3aa9">
        <DistinctValuesList
          activeCode={value}
          allLabel={allLabel}
          codes={filteredCodes}
          labelFor={labelFor}
          distinct={distinct}
          onSelect={(code) => {
            onChange?.(code);
            setOpen(false);
          }}
          searchPlaceholder={searchPlaceholder}
          data-testid="DistinctValuesList__cd3aa9" />
      </PopoverContent>
    </Popover>
  );
}
