import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Search } from 'lucide-react';
import { FieldHighlight } from '@/components/inspector/FieldHighlight.jsx';
import { useLabel } from '@/i18n';
import { resolveIdentifier } from '@/lib/resolveIdentifier.js';

/**
 * Combobox-style search input for foreign key fields.
 * Filters results from catalogs when typing.
 */
function SearchInput({ field, value, displayValue, onChange, catalogs, resolvedLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(displayValue || value || '');

  React.useEffect(() => {
    setQuery(displayValue || value || '');
  }, [value, displayValue]);

  const options = catalogs?.[field.reference] ?? [];
  const filtered = useMemo(() => {
    if (!query || query.length === 0) return options.slice(0, 10);
    const q = query.toLowerCase();
    return options.filter(opt => opt.name.toLowerCase().includes(q)).slice(0, 10);
  }, [query, options]);

  const handleSelect = (opt) => {
    setQuery(opt.name);
    onChange?.(opt.id, opt.name, opt._aux);
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
function SelectorInput({ field, value, displayValue, onChange, catalogs, resolvedLabel }) {
  const catalogOptions = catalogs?.[field.reference] ?? [];
  // If the current value isn't in the catalog (real data vs mock), add it
  const hasValue = value && catalogOptions.some(opt => opt.id === value);
  const options = (!hasValue && value && displayValue)
    ? [{ id: value, name: displayValue }, ...catalogOptions]
    : catalogOptions;

  return (
    <Select
      value={value ?? ''}
      onValueChange={(val) => {
        const opt = options.find(o => o.id === val);
        onChange?.(val, opt?.name, opt?._aux);
      }}
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
function DependentSelect({ field, value, displayValue, onChange, catalogs, formData, resolvedLabel, selectorUrl, token }) {
  const parentValue = formData?.[field.dependsOn?.field];
  const [dynamicOptions, setDynamicOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch options dynamically when parent value changes
  React.useEffect(() => {
    if (!parentValue || !selectorUrl || !token) {
      setDynamicOptions([]);
      return;
    }
    setLoading(true);
    const url = `${selectorUrl}?${field.dependsOn?.filterKey}=${encodeURIComponent(parentValue)}`;
    fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.items) {
          const items = data.items.map(i => ({ id: i.id, name: i.label || i.name || i.id, ...i }));
          setDynamicOptions(items);
          // Auto-select first option if no current value
          if (items.length > 0 && !value) {
            onChange?.(items[0].id, items[0].name);
          }
        }
      })
      .catch(() => setDynamicOptions([]))
      .finally(() => setLoading(false));
  }, [parentValue, selectorUrl, token]);

  // If the current value isn't in options (real data from existing record), add it
  const hasValue = value && dynamicOptions.some(opt => opt.id === value);
  const options = (!hasValue && value && displayValue)
    ? [{ id: value, name: displayValue }, ...dynamicOptions]
    : dynamicOptions;

  return (
    <Select
      value={value ?? ''}
      onValueChange={(val) => {
        const opt = options.find(o => o.id === val);
        onChange?.(val, opt?.name);
      }}
      required={field.required}
      disabled={(!parentValue && !value) || loading}
    >
      <SelectTrigger id={field.key} className="focus:ring-2 focus:ring-primary">
        <SelectValue
          placeholder={loading ? 'Loading...' : (parentValue ? `Select ${resolvedLabel}...` : `Select ${field.dependsOn?.field} first`)}
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
 *  - displayLogic: { readOnly: { fieldName: bool }, visibility: { fieldName: bool } }
 */
export function EntityForm({ entity, fields = [], data, onChange, catalogs, layout, section, displayLogic, api, token, apiBaseUrl }) {
  const t = useLabel();
  let displayFields;
  if (section) {
    // When filtering by section, include all fields (editable + readOnly) for that section
    displayFields = fields.filter(f => f.section === section);
  } else if (layout === 'horizontal') {
    displayFields = fields.filter(f => !f.readOnly);
  } else {
    displayFields = fields;
  }

  // Apply visibility from evaluate-display (hide fields where visibility === false)
  if (displayLogic?.visibility && Object.keys(displayLogic.visibility).length > 0) {
    displayFields = displayFields.filter(f => displayLogic.visibility[f.key] !== false);
  }

  const gridClass = layout === 'horizontal'
    ? 'grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4'
    : 'grid grid-cols-2 gap-3 md:grid-cols-3';

  return (
    <div className={gridClass}>
      {displayFields.map(f => {
        const label = t(f.column) ?? f.label ?? f.key;
        // Field is read-only if statically declared OR dynamically set by evaluate-display
        const isReadOnly = f.readOnly || displayLogic?.readOnly?.[f.key] === true;
        if (f.type === 'checkbox') {
          return (
            <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
            <div className="flex items-center gap-2 pt-6">
              <button
                type="button"
                role="checkbox"
                aria-checked={!!data?.[f.key]}
                disabled={isReadOnly}
                id={f.key}
                onClick={() => !isReadOnly && onChange?.(f.key, !data?.[f.key])}
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
                {label}{f.required ? <span className="text-red-500 ml-0.5">*</span> : ''}
              </Label>
            </div>
            </FieldHighlight>
          );
        }
        if (f.type === 'dependent') {
          if (isReadOnly) {
            return (
              <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
                <div className="space-y-1.5">
                  <Label htmlFor={f.key} className="text-sm text-muted-foreground font-medium">
                    {label}
                  </Label>
                  <Input value={resolveIdentifier(data, f.key) || data?.[f.key] || ''} disabled className="bg-muted/50" />
                </div>
              </FieldHighlight>
            );
          }
          return (
            <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
              <div className="space-y-1.5">
                <Label htmlFor={f.key} className="text-sm text-foreground font-medium">
                  {label}{f.required ? <span className="text-red-500 ml-0.5">*</span> : ''}
                </Label>
                <DependentSelect
                  field={f}
                  value={data?.[f.key] ?? ''}
                  displayValue={resolveIdentifier(data, f.key)}
                  onChange={(val, label) => {
                    onChange?.(f.key, val);
                    if (label) onChange?.(f.key + '$_identifier', label);
                  }}
                  catalogs={catalogs}
                  formData={data}
                  resolvedLabel={label}
                  selectorUrl={apiBaseUrl ? `${apiBaseUrl}/${entity}/selectors/${f.column}` : null}
                  token={token}
                />
              </div>
            </FieldHighlight>
          );
        }
        if (f.type === 'selector') {
          if (isReadOnly) {
            return (
              <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
                <div className="space-y-1.5">
                  <Label htmlFor={f.key} className="text-sm text-muted-foreground font-medium">
                    {label}
                  </Label>
                  <Input value={resolveIdentifier(data, f.key) || data?.[f.key] || ''} disabled className="bg-muted/50" />
                </div>
              </FieldHighlight>
            );
          }
          return (
            <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
              <div className="space-y-1.5">
                <Label htmlFor={f.key} className="text-sm text-foreground font-medium">
                  {label}{f.required ? <span className="text-red-500 ml-0.5">*</span> : ''}
                </Label>
                <SelectorInput
                  field={f}
                  value={data?.[f.key] ?? ''}
                  displayValue={resolveIdentifier(data, f.key)}
                  onChange={(val, label, auxData) => {
                    onChange?.(f.key, val);
                    if (label) onChange?.(f.key + '$_identifier', label);
                    if (auxData) {
                      for (const [suffix, auxVal] of Object.entries(auxData)) {
                        onChange?.(f.key + suffix, auxVal);
                      }
                    }
                  }}
                  catalogs={catalogs}
                  resolvedLabel={label}
                />
              </div>
            </FieldHighlight>
          );
        }
        if (f.type === 'search') {
          if (isReadOnly) {
            return (
              <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
                <div className="space-y-1.5">
                  <Label htmlFor={f.key} className="text-sm text-muted-foreground font-medium">
                    {label}
                  </Label>
                  <Input value={resolveIdentifier(data, f.key) || data?.[f.key] || ''} disabled className="bg-muted/50" />
                </div>
              </FieldHighlight>
            );
          }
          return (
            <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
              <div className="space-y-1.5">
                <Label htmlFor={f.key} className="text-sm text-foreground font-medium">
                  {label}{f.required ? <span className="text-red-500 ml-0.5">*</span> : ''}
                </Label>
                <SearchInput
                  field={f}
                  value={data?.[f.key] ?? ''}
                  displayValue={resolveIdentifier(data, f.key)}
                  onChange={(val, label, auxData) => {
                    onChange?.(f.key, val);
                    if (label) onChange?.(f.key + '$_identifier', label);
                    if (auxData) {
                      for (const [suffix, auxVal] of Object.entries(auxData)) {
                        onChange?.(f.key + suffix, auxVal);
                      }
                    }
                  }}
                  catalogs={catalogs}
                  resolvedLabel={label}
                />
              </div>
            </FieldHighlight>
          );
        }
        const inputType = f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text';
        return (
          <FieldHighlight key={f.key} entityName={entity} fieldName={f.key}>
            <div className="space-y-1.5">
              <Label htmlFor={f.key} className="text-sm text-foreground font-medium">
                {label}{f.required && !isReadOnly ? <span className="text-red-500 ml-0.5">*</span> : ''}
              </Label>
              <Input
                id={f.key}
                name={f.key}
                type={inputType}
                value={data?.[f.key] ?? ''}
                onChange={(e) => onChange?.(f.key, e.target.value)}
                className={isReadOnly ? 'bg-muted/50' : 'focus:ring-2 focus:ring-primary focus:outline-none'}
                required={f.required && !isReadOnly}
                disabled={isReadOnly}
              />
            </div>
          </FieldHighlight>
        );
      })}
    </div>
  );
}
