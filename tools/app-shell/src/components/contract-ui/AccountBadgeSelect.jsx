import { useState, useMemo } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from '@/components/ui/command';
import { useUI } from '@/i18n';

/**
 * Grey rounded code badge (e.g. `5723`) used in account selectors and read-only
 * account displays. Generic and window-agnostic.
 */
export function AccountBadge({ code, className = '' }) {
  if (!code) return null;
  return (
    <span
      className={`inline-flex items-center rounded-md bg-[#F0F1F3] px-1.5 py-0.5 text-xs font-medium text-[#5A5E6B] ${className}`}
    >
      {code}
    </span>
  );
}

/**
 * AccountBadgeSelect — a searchable dropdown for account-like options rendered as
 * a grey code badge + name (e.g. `5723` "Bancos, cuenta puente") with a chevron.
 *
 * Generic / backwards-compatible: every prop beyond `options` is optional. Pass
 * `readOnly` to render a static (non-interactive) badge row. Used by the General
 * Ledger Configuration "Valores por defecto" tab but intentionally window-agnostic
 * so it can back any code+name reference selector.
 *
 * @param {object} props
 * @param {string} [props.label]
 * @param {boolean} [props.required]
 * @param {string|null} [props.value] — selected option id
 * @param {Array<{id:string,code?:string,name:string}>} props.options
 * @param {(id:string|null)=>void} [props.onChange]
 * @param {boolean} [props.readOnly]
 * @param {string|null} [props.error]
 * @param {string} [props.placeholder]
 * @param {string} [props.searchPlaceholder]
 */
export function AccountBadgeSelect({
  label,
  required = false,
  value = null,
  options = [],
  onChange,
  readOnly = false,
  error = null,
  placeholder,
  searchPlaceholder,
  'data-testid': dataTestId,
}) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);
  const ph = placeholder ?? ui('selectAccount');

  const triggerInner = selected ? (
    <span className="flex items-center gap-2 min-w-0">
      <AccountBadge code={selected.code} data-testid="AccountBadge__2082a8" />
      <span className="truncate text-[#121217]">{selected.name}</span>
    </span>
  ) : (
    <span className="text-[#9A9DA8]">{ph}</span>
  );

  const labelRow = label ? (
    <span className="block text-sm font-medium text-[#121217] mb-1.5">
      {label}
      {required && <span className="text-[#D7373F] ml-0.5">*</span>}
    </span>
  ) : null;

  if (readOnly) {
    return (
      <div data-testid={dataTestId}>
        {labelRow}
        <div className="flex items-center gap-2 min-w-0 h-9 px-3 rounded-lg border border-[#E8EAEF] bg-[#F8F9FB] text-sm">
          {triggerInner}
        </div>
      </div>
    );
  }

  const borderClass = error ? 'border-[#D7373F]' : 'border-[#E8EAEF]';

  return (
    <div data-testid={dataTestId}>
      {labelRow}
      <Popover open={open} onOpenChange={setOpen} data-testid="Popover__2082a8">
        <PopoverTrigger asChild data-testid="PopoverTrigger__2082a8">
          <button
            type="button"
            className={`flex w-full items-center justify-between gap-2 h-9 px-3 rounded-lg border ${borderClass} bg-white text-sm hover:border-[#C4C7D0] focus:outline-none focus:ring-2 focus:ring-primary transition-colors`}
          >
            <span className="flex items-center gap-2 min-w-0">{triggerInner}</span>
            <ChevronDown
              size={16}
              className="shrink-0 text-[#9A9DA8]"
              data-testid="ChevronDown__2082a8" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[260px]"
          align="start"
          data-testid="PopoverContent__2082a8">
          <Command data-testid="Command__2082a8">
            <CommandInput
              placeholder={searchPlaceholder ?? ui('search')}
              data-testid="CommandInput__2082a8" />
            <CommandList data-testid="CommandList__2082a8">
              <CommandEmpty data-testid="CommandEmpty__2082a8">{ui('noResultsFound')}</CommandEmpty>
              {options.map((opt) => (
                <CommandItem
                  key={opt.id}
                  value={`${opt.code ?? ''} ${opt.name}`}
                  onSelect={() => {
                    onChange?.(opt.id);
                    setOpen(false);
                  }}
                  className="gap-2"
                  data-testid="CommandItem__2082a8">
                  <AccountBadge code={opt.code} data-testid="AccountBadge__2082a8" />
                  <span className="truncate flex-1">{opt.name}</span>
                  {opt.id === value && <Check size={16} className="text-primary" data-testid="Check__2082a8" />}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && <p className="mt-1 text-xs text-[#D7373F]">{error}</p>}
    </div>
  );
}

export default AccountBadgeSelect;
