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
 * AccountSelect — an account picker over a static `{ id, code, name }` catalog, or over a server
 * selector when `loadPage` is given. The field is a button showing the selected `"code - name"`;
 * clicking it opens the shared `SearchPopup`, the same centered search modal the report filters
 * use for "Desde la cuenta".
 *
 * ETP-5681: it replaces `AccountBadgeSelect`, a hand-built popover as wide as its field that cut
 * long account names off ("Socios por desembols..."). The popup is wide, shows every name in full
 * and searches by code and name.
 *
 * Generic and window-agnostic: used by the Esquema contable (General Ledger Configuration) tabs,
 * the chart of accounts "parent account" field and the contact category Accounting tab (ETP-5791,
 * fed by the field's NEO selector through `useAccountSelectorPages`).
 *
 * @param {object} props
 * @param {string} [props.label]
 * @param {boolean} [props.required] — required fields cannot be cleared.
 * @param {import('react').ReactNode} [props.labelHint] — optional node rendered right after the
 *   label (and required marker), e.g. an info-icon + tooltip.
 * @param {string|null} [props.value] — selected option id
 * @param {string} [props.displayValue] — label shown when `value` is not in `options` (e.g. a
 *   stored account the catalog no longer offers).
 * @param {Array<{id:string,code?:string,name:string}>} [props.options] — the static catalog.
 * @param {(query:string, offset:number, signal?:AbortSignal)=>Promise<{items:object[],hasMore:boolean}>} [props.loadPage]
 *   — a server page loader (e.g. `useAccountSelectorPages`) used instead of `options`; the
 *   selected label then comes from `displayValue` (the stored `$_identifier`).
 * @param {(id:string|null, label?:string)=>void} [props.onChange] — the picked id and its label.
 * @param {string} [props.popupTitle] — popup title when the field label is rendered outside
 *   (defaults to `label`, then the placeholder).
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
  displayValue = '',
  options = [],
  loadPage: serverLoadPage = null,
  onChange,
  readOnly = false,
  error = null,
  placeholder,
  popupTitle,
  'data-testid': dataTestId,
}) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const selectOptions = useMemo(
    () => options.map((o) => ({ id: o.id, name: accountOptionLabel(o) })),
    [options],
  );
  const loadPage = useMemo(
    () => serverLoadPage ?? staticPageLoader(selectOptions),
    [serverLoadPage, selectOptions],
  );
  const selectedLabel = useMemo(
    () => selectOptions.find((o) => o.id === value)?.name ?? (value ? displayValue : ''),
    [selectOptions, value, displayValue],
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
  const clearable = !required && !!value;

  // ETP-5791 — the clear "×" sits INSIDE the field's border, at its right end, like the clear of
  // the shared FK chip (SelectorChip). The border, background, radius, height and focus ring live
  // on this wrapper (focus-within: either button focused shows the ring), and the trigger and the
  // clear are two sibling buttons inside it, so there is no nested <button> and clicking the × never
  // opens the popup.
  return (
    <div data-testid={dataTestId}>
      {labelRow}
      <div
        className={`flex h-9 min-w-0 items-center rounded-lg border bg-card text-sm focus-within:ring-2 focus-within:ring-primary ${borderClass}`}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid={`field-${fieldKey}`}
          title={selectedLabel || undefined}
          className={`flex h-full min-w-0 flex-1 items-center gap-2 rounded-lg bg-transparent pl-3 ${clearable ? 'pr-1' : 'pr-3'} text-left focus:outline-none`}
        >
          <Search
            className="h-4 w-4 text-muted-foreground shrink-0"
            aria-hidden="true"
            data-testid="Search__a001bd" />
          {selectedLabel
            ? <span className="flex-1 truncate text-[hsl(var(--foreground))]">{selectedLabel}</span>
            : <span className="flex-1 truncate text-muted-foreground">{placeholderText}</span>}
        </button>
        {clearable && (
          <button
            type="button"
            aria-label={ui('clear')}
            onClick={() => onChange?.(null)}
            data-testid={`field-${fieldKey}-clear`}
            className="flex h-full w-8 shrink-0 items-center justify-center rounded-r-lg text-[hsl(var(--text-disabled))] transition-colors hover:text-foreground focus:outline-none focus-visible:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" data-testid="X__a001bd" />
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-[hsl(var(--destructive))]">{error}</p>}
      <SearchPopup
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(item) => { onChange?.(item.id, item.name); setOpen(false); }}
        loadPage={loadPage}
        value={value}
        valueLabel={selectedLabel}
        title={popupTitle || label || placeholderText}
        data-testid={`${fieldKey}-popup`}
      />
    </div>
  );
}

export default AccountSelect;
