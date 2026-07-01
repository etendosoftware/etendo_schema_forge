// Form field primitives that WRAP the shared UI components used by the Sales
// Order detail form (EntityForm), so wizard/modal inputs, selects and date
// pickers look and behave identically across the app. Shared by the New
// Movement wizard and the generic Payment form.
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Label as UiLabel } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import {
  Select as RSelect, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

export function Field({ label, required, className = '', children }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label ? (
        <UiLabel
          className="text-sm font-medium text-foreground"
          data-testid="UiLabel__7183e9">
          {label}{required ? <span className="ml-0.5 text-red-500">*</span> : null}
        </UiLabel>
      ) : null}
      {children}
    </div>
  );
}

/** Read-only display — the disabled base Input, consistent with the form fields. */
export function ReadOnly({ children }) {
  const text = Array.isArray(children) ? children.join('') : (children ?? '');
  return <Input disabled readOnly value={text} data-testid="Input__7183e9" />;
}

export function TextInput({ className = '', name, ...rest }) {
  // White background: these are editable; the app's default Input is grey, which
  // reads as read-only. Caller className can still override.
  return <Input className={`bg-white ${className}`} name={name} {...rest} data-testid={name ? `field-text-${name}` : 'field-text'} />;
}

/**
 * Enum select. `onChange` receives the selected value (string), matching the
 * Radix Select contract used across the app.
 */
export function Select({ label, required, value, onChange, options, placeholder, className, name }) {
  // Accept options as plain strings or as { id, name } / { value, label } objects.
  const items = (options || []).map((o) =>
    (typeof o === 'string' ? { value: o, label: o } : { value: o.id ?? o.value, label: o.name ?? o.label }));
  return (
    <Field
      label={label}
      required={required}
      className={className}
      data-testid="Field__7183e9">
      <RSelect
        value={value ?? ''}
        onValueChange={onChange}
        data-testid="RSelect__7183e9">
        <SelectTrigger
          className="focus:ring-2 focus:ring-primary"
          data-testid={name ? `field-select-${name}` : 'SelectTrigger__7183e9'}>
          <SelectValue
            placeholder={placeholder || 'Seleccionar…'}
            data-testid="SelectValue__7183e9" />
        </SelectTrigger>
        <SelectContent data-testid="SelectContent__7183e9">
          {items.map((it) => <SelectItem key={it.value} value={it.value} data-testid="SelectItem__7183e9">{it.label}</SelectItem>)}
        </SelectContent>
      </RSelect>
    </Field>
  );
}

/** Date field. `value` is an ISO date (yyyy-mm-dd); `onChange` emits the same. */
export function DateInput({ label, required, value, onChange, className, name }) {
  return (
    <Field
      label={label}
      required={required}
      className={className}
      data-testid="Field__7183e9">
      <DateField value={value} onChange={onChange} data-testid={name ? `field-date-${name}` : 'DateField__7183e9'} />
    </Field>
  );
}

/**
 * Bare money/numeric input that keeps what the user types verbatim while
 * focused, so a parent that re-formats `value` on every change (e.g.
 * eur(parseEur(x))) doesn't fight the keystrokes. On blur it shows the formatted
 * `value`. Same UX as the Sales Order line amount fields. Unstyled — pass a
 * `className` for table-cell / inline use.
 */
export function MoneyInput({ value, onChange, className = '', disabled, placeholder, name }) {
  const [buffer, setBuffer] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setBuffer(value); }, [value, focused]);
  return (
    <input
      className={className}
      value={focused ? buffer : value}
      onChange={(e) => { setBuffer(e.target.value); onChange?.(e); }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={disabled}
      placeholder={placeholder}
      data-testid={name ? `field-number-${name}` : 'field-number'}
    />
  );
}

export function AmountInput({ label, required, value, onChange, placeholder, readOnly, className, name }) {
  // Keep what the user types verbatim while the field is focused, so a parent
  // that re-formats `value` on every change (e.g. eur(parseEur(x))) doesn't
  // fight the keystrokes. On blur we fall back to the formatted `value`.
  const [buffer, setBuffer] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setBuffer(value); }, [value, focused]);

  return (
    <Field
      label={label}
      required={required}
      className={className}
      data-testid="Field__7183e9">
      <div className="relative">
        <Input
          className={`pr-8 text-right tabular-nums ${readOnly ? '' : 'bg-white'}`}
          value={focused ? buffer : value}
          onChange={(e) => { setBuffer(e.target.value); onChange?.(e); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          disabled={readOnly}
          data-testid={name ? `field-number-${name}` : 'field-number'} />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-medium text-muted-foreground">€</span>
      </div>
    </Field>
  );
}

/**
 * Searchable lookup field shared across the app (G/L item, business partner…).
 * Built on Radix Popover (non-modal) so it positions, portals and closes-outside
 * correctly even inside the transformed Radix Dialog, and clicks aren't treated
 * as "outside the dialog". Focus stays on the input so the user can keep typing.
 *
 * @param {function} useLookup - hook `(query) => { results, loading }` returning
 *   `{ id, name }` rows. Pass a pre-bound hook (e.g. `(q) => useBPartnerLookup(q,
 *   'customer')`) to add extra args while keeping React's rules of hooks intact.
 * @param {{ id, name } | null} value
 * @param {(row: { id, name } | null) => void} onChange
 */
export function LookupPicker({ value, onChange, useLookup, placeholder = 'Buscar…' }) {
  const [query, setQuery] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const { results, loading } = useLookup(query);

  useEffect(() => { setQuery(value?.name ?? ''); }, [value]);

  const showList = open && (results.length > 0 || loading);

  return (
    <Popover open={showList} onOpenChange={setOpen} data-testid="Popover__7183e9">
      <PopoverAnchor asChild data-testid="PopoverAnchor__7183e9">
        <div className="relative">
          <Input
            className="bg-white pr-9"
            value={query}
            placeholder={placeholder}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); if (value) onChange(null); }}
            onFocus={() => setOpen(true)}
            data-testid="Input__7183e9" />
          <Search
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            data-testid="Search__7183e9" />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        className="max-h-56 overflow-auto rounded-lg border border-[#D1D4DB] bg-white p-0 shadow-lg"
        style={{ width: 'var(--radix-popover-trigger-width)' }}
        data-testid="PopoverContent__7183e9">
        {loading && results.length === 0 ? (
          <div className="px-3 py-2 text-sm text-[#6C6C89]">…</div>
        ) : null}
        {results.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => { onChange(r); setOpen(false); }}
            className="block w-full px-3 py-2 text-left text-sm text-[#121217] hover:bg-[#F5F7F9]"
          >
            {r.name}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function Note({ children }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[#E8EAEF] bg-white px-3 py-2.5 text-xs leading-[17px] text-[#6C6C89] [&_b]:font-semibold [&_b]:text-[#121217]">
      {children}
    </div>
  );
}

export function SectionLabel({ children }) {
  return (
    <div className="mb-3 mt-[18px] text-xs font-bold uppercase leading-4 tracking-[0.06em] text-[#8A8AA3] first:mt-1.5">
      {children}
    </div>
  );
}
