import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Search } from 'lucide-react';
import { FieldHighlight } from '@/components/inspector/FieldHighlight.jsx';
import { useLabel } from '@/i18n';

/**
 * Combobox-style search input for foreign key fields.
 * Filters results from catalogs when typing.
 */
function SearchInput({ field, value, onChange, catalogs, resolvedLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value ?? '');

  React.useEffect(() => {
    setQuery(value ?? '');
  }, [value]);

  const options = catalogs?.[field.reference] ?? [];
  const filtered = useMemo(() => {
    if (!query || query.length === 0) return [];
    const q = query.toLowerCase();
    return options.filter(opt => opt.name.toLowerCase().includes(q)).slice(0, 10);
  }, [query, options]);

  const handleSelect = (opt) => {
    setQuery(opt.name);
    onChange?.(opt.id);
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          id={field.key}
          name={field.key}
          type="text"
          placeholder={`Search ${resolvedLabel}...`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange?.(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          className="pl-8 focus:ring-2 focus:ring-primary focus:outline-none"
          required={field.required}
          autoComplete="off"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-auto">
          {filtered.map(opt => (
            <button
              key={opt.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 cursor-pointer"
              onMouseDown={() => handleSelect(opt)}
            >
              {opt.name}
            </button>
          ))}
        </div>
      )}
      {open && query.length > 0 && filtered.length === 0 && (
        <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-auto">
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No results for "{query}"
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Dropdown selector for FK fields with few options (inputMode: selector).
 * Uses shadcn Select (Radix) for consistent styling.
 */
function SelectorInput({ field, value, onChange, catalogs, resolvedLabel }) {
  const options = catalogs?.[field.reference] ?? [];
  return (
    <Select
      value={value ?? ''}
      onValueChange={(val) => onChange?.(val)}
      required={field.required}
    >
      <SelectTrigger id={field.key} className="focus:ring-2 focus:ring-primary">
        <SelectValue placeholder={`Select ${resolvedLabel}...`} />
      </SelectTrigger>
      <SelectContent>
        {options.map(opt => (
          <SelectItem key={opt.id} value={opt.id}>{opt.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Dependent dropdown that filters options by a parent field value (inputMode: dependent).
 * Uses shadcn Select (Radix) for consistent styling.
 */
function DependentSelect({ field, value, onChange, catalogs, formData, resolvedLabel }) {
  const parentValue = formData?.[field.dependsOn?.field];
  const allOptions = catalogs?.[field.reference] ?? [];
  const options = parentValue
    ? allOptions.filter(opt => opt[field.dependsOn?.filterKey] === parentValue)
    : [];

  return (
    <Select
      value={value ?? ''}
      onValueChange={(val) => onChange?.(val)}
      required={field.required}
      disabled={!parentValue}
    >
      <SelectTrigger id={field.key} className="focus:ring-2 focus:ring-primary">
        <SelectValue
          placeholder={parentValue ? `Select ${resolvedLabel}...` : `Select ${field.dependsOn?.field} first`}
        />
      </SelectTrigger>
      <SelectContent>
        {options.map(opt => (
          <SelectItem key={opt.id} value={opt.id}>{opt.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Generic entity form driven by field declarations.
 *
 * Props:
 *  - fields: Array<{ key, label, type, required, reference, inputMode, dependsOn }>
 *  - data: object with current field values
 *  - onChange: (fieldKey, value) => void
 *  - catalogs: Record<string, Array<{ id, name, ... }>> for FK reference data
 */
export function EntityForm({ entity, fields = [], data, onChange, catalogs }) {
  const t = useLabel();
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {fields.map(f => {
        const label = t(f.column) ?? f.label ?? f.key;
        if (f.type === 'checkbox') {
          return (
            <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
            <div className="flex items-center gap-2 pt-6">
              <button
                type="button"
                role="checkbox"
                aria-checked={!!data?.[f.key]}
                id={f.key}
                onClick={() => onChange?.(f.key, !data?.[f.key])}
                className={[
                  'peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  !!data?.[f.key]
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-transparent',
                ].join(' ')}
              >
                {!!data?.[f.key] && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
              <Label htmlFor={f.key} className="text-sm text-foreground font-medium cursor-pointer">
                {label}{f.required ? ' *' : ''}
              </Label>
            </div>
            </FieldHighlight>
          );
        }
        if (f.type === 'dependent') {
          return (
            <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
              <div className="space-y-1.5">
                <Label htmlFor={f.key} className="text-sm text-foreground font-medium">
                  {label}{f.required ? ' *' : ''}
                </Label>
                <DependentSelect
                  field={f}
                  value={data?.[f.key] ?? ''}
                  onChange={(val) => onChange?.(f.key, val)}
                  catalogs={catalogs}
                  formData={data}
                  resolvedLabel={label}
                />
              </div>
            </FieldHighlight>
          );
        }
        if (f.type === 'selector') {
          return (
            <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
              <div className="space-y-1.5">
                <Label htmlFor={f.key} className="text-sm text-foreground font-medium">
                  {label}{f.required ? ' *' : ''}
                </Label>
                <SelectorInput
                  field={f}
                  value={data?.[f.key] ?? ''}
                  onChange={(val) => onChange?.(f.key, val)}
                  catalogs={catalogs}
                  resolvedLabel={label}
                />
              </div>
            </FieldHighlight>
          );
        }
        if (f.type === 'search') {
          return (
            <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
              <div className="space-y-1.5">
                <Label htmlFor={f.key} className="text-sm text-foreground font-medium">
                  {label}{f.required ? ' *' : ''}
                </Label>
                <SearchInput
                  field={f}
                  value={data?.[f.key] ?? ''}
                  onChange={(val) => onChange?.(f.key, val)}
                  catalogs={catalogs}
                  resolvedLabel={label}
                />
              </div>
            </FieldHighlight>
          );
        }
        const inputType = f.type === 'number' ? 'number' : 'text';
        return (
          <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
            <div className="space-y-1.5">
              <Label htmlFor={f.key} className="text-sm text-foreground font-medium">
                {label}{f.required ? ' *' : ''}
              </Label>
              <Input
                id={f.key}
                name={f.key}
                type={inputType}
                value={data?.[f.key] ?? ''}
                onChange={(e) => onChange?.(f.key, e.target.value)}
                className="focus:ring-2 focus:ring-primary focus:outline-none"
                required={f.required}
              />
            </div>
          </FieldHighlight>
        );
      })}
    </div>
  );
}
