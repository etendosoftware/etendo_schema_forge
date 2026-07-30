import { useLabel } from '@/i18n';
import { resolveIdentifier } from '@/lib/resolveIdentifier.js';
import { formatCurrency } from '@/lib/formatCurrency.js';

function resolveFieldDisplay(field, raw, data) {
  if (raw == null) return '\u2014';
  if (field.type === 'amount' && typeof raw === 'number') {
    return formatCurrency(data['currency$_identifier'], raw);
  }
  if (field.type === 'number' && typeof raw === 'number') {
    return raw.toLocaleString();
  }
  return resolveIdentifier(data, field.key);
}

/**
 * Inline summary of read-only reference fields.
 * Used in DetailView below the title.
 *
 * Props:
 *  - fields: Array<{ key, column, type, label? }>
 *  - data: object with field values (may include currency$_identifier)
 */
export function SummaryBar({ fields = [], data }) {
  const t = useLabel();
  if (!fields.length || !data) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      {fields.map((field, idx) => {
        const label = t(field.column) ?? field.label ?? field.key;
        const raw = data[field.key];
        const display = resolveFieldDisplay(field, raw, data);
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
