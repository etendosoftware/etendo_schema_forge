import { Check } from 'lucide-react';

export default function FiscalStepItem({ n, label, done, active, isFirst }) {
  let labelColor;
  if (done) labelColor = 'hsl(var(--text-disabled))';
  else if (active) labelColor = 'hsl(var(--foreground))';
  else labelColor = 'hsl(var(--muted-foreground))';
  return (
    <span className="flex items-center" style={{ gap: 6 }}>
      {!isFirst && <span className="flex-shrink-0" style={{ width: 40, height: 1, background: 'hsl(var(--border-subtle))' }} />}
      <span className="flex items-center" style={{ gap: 6 }}>
        {done ? (
          <Check
            size={14}
            strokeWidth={2.5}
            className="text-status-success-foreground flex-shrink-0"
            data-testid="Check__ede562" />
        ) : (
          <span
            className="flex items-center justify-center text-xs font-semibold flex-shrink-0"
            style={{
              width: 26, height: 24, borderRadius: 8,
              background: active ? 'hsl(var(--foreground))' : 'hsl(var(--muted))',
              color:      active ? 'hsl(var(--card))' : 'hsl(var(--muted-foreground))',
              border:     active ? 'none' : '1px solid hsl(var(--border-control))',
            }}
          >
            {n}
          </span>
        )}
        <span
          className="text-sm"
          style={{
            color:          labelColor,
            fontWeight:     active ? 600 : 400,
            textDecoration: done ? 'line-through' : 'none',
          }}
        >
          {label}
        </span>
      </span>
    </span>
  );
}
