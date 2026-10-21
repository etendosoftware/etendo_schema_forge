import { formatAmount } from './helpers.js';
import { StatusTag } from '@/components/ui/status-tag';

export default function DocChip({ icon, iconColor, title, amount, currency, status, statusLabel, onClick }) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`inline-flex max-w-full items-center gap-1.5 px-2.5 py-1 border border-border/40 rounded-full bg-card transition-colors text-sm${onClick ? ' hover:bg-muted/30 cursor-pointer' : ''}`}
      style={{ borderWidth: '0.5px' }}
      data-testid="Tag__a9a774">
      <span className={`shrink-0 ${iconColor}`}>{icon}</span>
      <span className="min-w-0 truncate font-medium text-foreground/80" title={typeof title === 'string' ? title : undefined}>{title}</span>
      {amount != null && (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatAmount(amount, currency)}</span>
      )}
      {status && (
        <span className="shrink-0">
          <StatusTag
            status={status}
            label={statusLabel || status}
            data-testid="StatusTag__a9a774" />
        </span>
      )}
    </Tag>
  );
}
