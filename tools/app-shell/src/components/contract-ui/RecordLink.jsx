import { ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * ETP-6148 — a value that opens another window's record: underlined, with the ↗ icon, the look of
 * DataTable's FK link and of the «Pago» column in Financial Account › Movimientos. `to` is the
 * route (usually from `resolveColumnLink` in fkNavigation.js). The click stops propagating, so
 * the row's own click (or a picker row's toggle) does not fire as well; `onNavigate` runs just
 * before navigating (a modal closes itself there).
 *
 * Mount it only when a route resolved: it calls `useNavigate()`, which needs a Router, and a
 * caller that renders it conditionally keeps working outside one.
 */
export function RecordLink({ to, onNavigate, children, iconTestId = 'ArrowUpRight__record-link', 'data-testid': dataTestId = 'record-link' }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onNavigate?.(); navigate(to); }}
      className="inline-flex max-w-full min-w-0 items-center gap-1 text-left underline decoration-[hsl(var(--border-control))] underline-offset-4 hover:decoration-[hsl(var(--foreground))]"
      data-testid={dataTestId}
    >
      <span className="min-w-0 truncate">{children}</span>
      <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden="true" data-testid={iconTestId} />
    </button>
  );
}

export default RecordLink;
