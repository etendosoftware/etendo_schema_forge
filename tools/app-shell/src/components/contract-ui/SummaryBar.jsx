import { useLabel } from '@/i18n';

/**
 * Inline summary of read-only reference fields.
 * Used in DetailView below the title.
 *
 * Props:
 *  - fields: Array<{ key, column, type }>
 *  - data: object with field values
 */
export function SummaryBar({ fields = [], data }) {
  const t = useLabel();
  if (!fields.length || !data) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      {fields.map((field, idx) => {
        const label = t(field.column) ?? field.label ?? field.key;
        const val = data[field.key];
        const display = val == null
          ? '\u2014'
          : (field.type === 'amount' || field.type === 'number') && typeof val === 'number'
            ? val.toLocaleString()
            : val;
        return (
          <span key={field.key} className="flex items-center gap-1">
            {idx > 0 && <span className="text-border">&middot;</span>}
            <span>{label}:</span>
            <span className="font-medium text-foreground">{display}</span>
          </span>
        );
      })}
    </div>
  );
}
