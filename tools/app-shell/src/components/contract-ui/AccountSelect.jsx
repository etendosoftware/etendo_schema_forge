import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useUI } from '@/i18n';
import { SearchPopup, staticPageLoader } from './SearchPopup.jsx';

/**
 * The label every account picker shows for an account: `"<code> - <name>"`, the same string the
 * generic ValidCombination selector returns (`account.searchKey` + `account.name`), so an account
 * reads the same in the Esquema contable tabs, the chart of accounts and every generated
 * accounting tab. Searching by code works because the popup filters on this label.
 *
 * @param {{ code?: string|null, name: string }} option
 * @returns {string}
 */
export function accountOptionLabel(option) {
  return option.code ? `${option.code} - ${option.name}` : option.name;
}

/**
 * AccountSelect — an account picker over a static `{ id, code, name }` catalog. The field is a
 * button showing the selected `"code - name"`; clicking it opens the shared `SearchPopup`, the
 * same centered search modal the report filters use for "Desde la cuenta".
 *
 * ETP-5681: it replaces `AccountBadgeSelect`, a hand-built popover as wide as its field that cut
 * long account names off ("Socios por desembols..."). The popup is wide, shows every name in full
 * and searches by code and name.
 *
 * Generic and window-agnostic: used by the Esquema contable (General Ledger Configuration) tabs
 * and the chart of accounts "parent account" field.
 *
 * @param {object} props
 * @param {string} [props.label]
 * @param {boolean} [props.required] — required fields cannot be cleared.
 * @param {import('react').ReactNode} [props.labelHint] — optional node rendered right after the
 *   label (and required marker), e.g. an info-icon + tooltip.
 * @param {string|null} [props.value] — selected option id
 * @param {Array<{id:string,code?:string,name:string}>} props.options
 * @param {(id:string|null)=>void} [props.onChange]
 * @param {boolean} [props.readOnly]
 * @param {string|null} [props.error]
 * @param {string} [props.placeholder]
 * @param {string} [props['data-testid']] — also keys the trigger (`field-<testid>`), the clear
 *   button (`field-<testid>-clear`) and the popup (`<testid>-popup`).
 */
export function AccountSelect({
  label,
  required = false,
  labelHint = null,
  value = null,
  options = [],
  onChange,
  readOnly = false,
  error = null,
  placeholder,
  'data-testid': dataTestId,
}) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const selectOptions = useMemo(
    () => options.map((o) => ({ id: o.id, name: accountOptionLabel(o) })),
    [options],
  );
  const loadPage = useMemo(() => staticPageLoader(selectOptions), [selectOptions]);
  const selectedLabel = useMemo(
    () => selectOptions.find((o) => o.id === value)?.name ?? '',
    [selectOptions, value],
  );
  const fieldKey = dataTestId ?? label ?? 'account';
  const placeholderText = placeholder ?? ui('selectAccount');

  const labelRow = label ? (
    <span className="flex items-center gap-1 text-sm font-medium text-[hsl(var(--foreground))] mb-1.5">
      <span>
        {label}
        {required && <span className="text-[hsl(var(--destructive))] ml-0.5">*</span>}
      </span>
      {labelHint}
    </span>
  ) : null;

  if (readOnly) {
    return (
      <div data-testid={dataTestId}>
        {labelRow}
        <div className="flex items-center min-w-0 h-9 px-3 rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--muted))] text-sm">
          {selectedLabel
            ? <span className="truncate text-[hsl(var(--foreground))]" title={selectedLabel}>{selectedLabel}</span>
            : <span className="text-[hsl(var(--text-disabled))]">{placeholderText}</span>}
        </div>
      </div>
    );
  }

  const borderClass = error
    ? 'border-[hsl(var(--destructive))]'
    : 'border-[hsl(var(--border-control))] hover:bg-[hsl(var(--field-hover))]';

  return (
    <div data-testid={dataTestId}>
      {labelRow}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid={`field-${fieldKey}`}
          title={selectedLabel || undefined}
          className={`flex-1 min-w-0 flex items-center gap-2 h-9 px-3 rounded-lg border bg-card text-sm text-left focus:outline-none focus:ring-2 focus:ring-primary ${borderClass}`}
        >
          <Search
            className="h-4 w-4 text-muted-foreground shrink-0"
            aria-hidden="true"
            data-testid="Search__a001bd" />
          {selectedLabel
            ? <span className="flex-1 truncate text-[hsl(var(--foreground))]">{selectedLabel}</span>
            : <span className="flex-1 truncate text-muted-foreground">{placeholderText}</span>}
        </button>
        {!required && value && (
          <button
            type="button"
            aria-label={ui('clear')}
            onClick={() => onChange?.(null)}
            data-testid={`field-${fieldKey}-clear`}
            className="h-9 w-7 flex items-center justify-center shrink-0 text-muted-foreground hover:text-[hsl(var(--destructive))]"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" data-testid="X__a001bd" />
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-[hsl(var(--destructive))]">{error}</p>}
      <SearchPopup
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(item) => { onChange?.(item.id); setOpen(false); }}
        loadPage={loadPage}
        title={label || placeholderText}
        data-testid={`${fieldKey}-popup`}
      />
    </div>
  );
}

export default AccountSelect;
