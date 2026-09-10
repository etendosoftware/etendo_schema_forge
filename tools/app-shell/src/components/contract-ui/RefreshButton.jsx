import { RefreshCw } from 'lucide-react';

/**
 * Icon-only refresh button, matching ListView's own private one (see ListView.jsx).
 *
 * Any toolbar that replaces ListView's idle bar loses that button along with it — the
 * financial-account list and its four detail tabs, and `ListModalWindow` (Reglas de matcheo),
 * which never had one. Each of them renders this and wires it to its own reload/refetch.
 *
 * Pair it with `ListProgressBar`, shown under the same `loading && rows.length > 0` condition:
 * this is what the user clicks, that is what tells them it is working.
 */
export function RefreshButton({ onRefresh, label }) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      title={label}
      aria-label={label}
      className="h-9 w-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
      data-testid="finance-refresh-button"
    >
      <RefreshCw className="h-4 w-4" data-testid="RefreshCw__finance-refresh" />
    </button>
  );
}
