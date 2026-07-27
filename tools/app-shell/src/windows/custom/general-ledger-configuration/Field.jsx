import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUI } from '@/i18n';
import UnbackedHint from './UnbackedHint.jsx';

/**
 * Field — label + control wrapper for the General tab. Supports text/select/
 * read-only controls, the red required `*`, inline error + red border, the
 * unbacked-placeholder marker, and a read-only caption (for AD_OrgInfo-sourced
 * fields). Window-local.
 *
 * Unbacked placeholders keep the label clean (no inline crowding): the marker is
 * a small info-icon on the control + a "Sin conexión a datos" caption *below* the
 * field — the same below-the-field caption pattern used for the read-only
 * AD_OrgInfo fields, so all the General-tab fields align on one row.
 */
function FieldLabel({ label, required }) {
  return (
    <span className="flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--foreground))] mb-1.5">
      <span>
        {label}
        {required && <span className="text-[hsl(var(--destructive))] ml-0.5">*</span>}
      </span>
    </span>
  );
}

export default function Field({
  label,
  type = 'text',
  value,
  onChange,
  options = [],
  required = false,
  error = null,
  readOnly = false,
  unbacked = false,
  caption,
  placeholder,
  'data-testid': dataTestId,
}) {
  const ui = useUI();
  const borderClass = error ? 'border-[hsl(var(--destructive))]' : 'border-[hsl(var(--border-subtle))]';

  if (readOnly) {
    return (
      <div data-testid={dataTestId}>
        <FieldLabel label={label} required={required} data-testid="FieldLabel__39edc8" />
        <div className="flex items-center h-9 px-3 rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--muted))] text-sm text-[hsl(var(--foreground))]">
          {value || '—'}
        </div>
        {caption && <p className="mt-1 text-xs text-[hsl(var(--text-disabled))]">{caption}</p>}
      </div>
    );
  }

  // Non-functional placeholder: a disabled select-looking control (so it reads as
  // part of the form but is clearly inert) with a small info-icon on the control
  // and a "Sin conexión a datos" caption below — no label crowding, aligns with
  // its neighbours.
  if (unbacked) {
    return (
      <div data-testid={dataTestId}>
        <FieldLabel label={label} required={required} data-testid="FieldLabel__39edc8" />
        <div className="flex items-center justify-between gap-2 h-9 px-3 rounded-lg border border-dashed border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-sm text-[hsl(var(--muted-foreground))] cursor-not-allowed">
          <span className="truncate">{value || placeholder || '—'}</span>
          <UnbackedHint data-testid="UnbackedHint__39edc8" />
        </div>
        <p className="mt-1 text-xs text-[hsl(var(--text-disabled))]">{ui('glc.unbacked.label')}</p>
      </div>
    );
  }

  if (type === 'select') {
    return (
      <div data-testid={dataTestId}>
        <FieldLabel label={label} required={required} data-testid="FieldLabel__39edc8" />
        <Select
          value={value ?? undefined}
          onValueChange={onChange}
          data-testid="Select__39edc8">
          <SelectTrigger
            className={`h-9 bg-card ${borderClass} focus:ring-2 focus:ring-primary`}
            data-testid="SelectTrigger__39edc8">
            <SelectValue placeholder={placeholder} data-testid="SelectValue__39edc8" />
          </SelectTrigger>
          <SelectContent data-testid="SelectContent__39edc8">
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} data-testid="SelectItem__39edc8">{opt.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && <p className="mt-1 text-xs text-[hsl(var(--destructive))]">{error}</p>}
      </div>
    );
  }

  return (
    <div data-testid={dataTestId}>
      <FieldLabel label={label} required={required} data-testid="FieldLabel__39edc8" />
      <Input
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className={`h-9 bg-card ${borderClass} focus:ring-2 focus:ring-primary`}
        data-testid="Input__39edc8" />
      {error && <p className="mt-1 text-xs text-[hsl(var(--destructive))]">{error}</p>}
    </div>
  );
}
