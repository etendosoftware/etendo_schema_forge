import { useMemo } from 'react';
import { useUI } from '@/i18n';
import { CreatableSearchSelect } from './CreatableSearchSelect.jsx';

/**
 * The label every account picker shows for an account: `"<code> - <name>"`, the same string the
 * generic ValidCombination selector returns (`account.searchKey` + `account.name`), so an account
 * reads the same in the Esquema contable tabs, the chart of accounts and every generated
 * accounting tab. Searching by code works because the default selector filters on this label.
 *
 * @param {{ code?: string|null, name: string }} option
 * @returns {string}
 */
export function accountOptionLabel(option) {
  return option.code ? `${option.code} - ${option.name}` : option.name;
}

/**
 * AccountSelect — an account picker over a static `{ id, code, name }` catalog, rendered with the
 * app's DEFAULT selector (`CreatableSearchSelect`, `staticOptions` mode).
 *
 * ETP-5681: it replaces `AccountBadgeSelect`, a hand-built popover as wide as its field that cut
 * long account names off ("Socios por desembols..."). The default selector's dropdown grows to the
 * longest option (capped to the viewport) and searches by code and name.
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
 * @param {string} [props['data-testid']] — also keys the inner selector (`field-<testid>`).
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
  const selectOptions = useMemo(
    () => options.map((o) => ({ id: o.id, name: accountOptionLabel(o) })),
    [options],
  );
  const selectedLabel = useMemo(
    () => selectOptions.find((o) => o.id === value)?.name ?? '',
    [selectOptions, value],
  );
  const fieldKey = dataTestId ?? label ?? 'account';

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
            : <span className="text-[hsl(var(--text-disabled))]">{placeholder ?? ui('selectAccount')}</span>}
        </div>
      </div>
    );
  }

  return (
    <div data-testid={dataTestId}>
      {labelRow}
      <CreatableSearchSelect
        field={{ key: fieldKey, id: fieldKey, required, clearable: !required }}
        value={value ?? ''}
        displayValue={selectedLabel}
        onChange={(id) => onChange?.(id || null)}
        formData={{}}
        resolvedLabel={label ?? ''}
        staticOptions={selectOptions}
        placeholderOverride={placeholder ?? ui('selectAccount')}
      />
      {error && <p className="mt-1 text-xs text-[hsl(var(--destructive))]">{error}</p>}
    </div>
  );
}

export default AccountSelect;
