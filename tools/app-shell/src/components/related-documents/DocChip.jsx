import { STATUS_BADGE } from './constants.jsx';
import { formatAmount } from './helpers.js';

export default function DocChip({ icon, iconColor, title, amount, currency, status, statusLabel, onClick }) {
  const badgeClass = STATUS_BADGE[status] || 'bg-gray-50 text-gray-600 border-gray-200';
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 border border-border/40 rounded-full bg-white transition-colors text-sm${onClick ? ' hover:bg-muted/30 cursor-pointer' : ''}`}
      style={{ borderWidth: '0.5px' }}
    >
      <span className={`shrink-0 ${iconColor}`}>{icon}</span>
      <span className="font-medium text-foreground/80">{title}</span>
      {amount != null && (
        <span className="text-xs text-muted-foreground tabular-nums">{formatAmount(amount, currency)}</span>
      )}
      {status && (
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${badgeClass}`} style={{ borderWidth: '0.5px' }}>
          {statusLabel || status}
        </span>
      )}
    </Tag>
  );
}
