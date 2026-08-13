import { Info, Check } from 'lucide-react';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';

/**
 * Cuentas sidebar — single column matching Figma frame `3012:25602`.
 *
 * Layout (top → bottom):
 *   1. Header — "Saldo" + info icon, sync pill underneath.
 *   2. Big balance number (30 / 32 / medium).
 *   3. Currency breakdown card (gray, rounded).
 *   4. Pending reconcile card (bordered, rounded).
 */
function SyncPill({ ui }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--status-success-bg)]">
        <Check className="h-3 w-3 text-[var(--status-success-fg)]" data-testid="Check__5d6a4a" />
      </span>
      <span className="text-xs font-normal leading-4 text-[var(--status-success-fg)]">
        {ui('financeAccountsSyncUpdatedAgo')}
      </span>
    </div>
  );
}

function CurrencyBreakdown({ rows, primaryIso, ui }) {
  const visibleRows = rows.length > 0
    ? rows
    : [{ currencyIso: primaryIso, total: 0 }];

  return (
    <div className="rounded-lg bg-[hsl(var(--muted))] p-3">
      <h3 className="text-xs font-semibold leading-4 text-[hsl(var(--muted-foreground))]">
        {ui('financeAccountsBalanceByCurrency')}
      </h3>
      <div className="mt-3 flex flex-col gap-2">
        {visibleRows.map((row, idx) => (
          <div key={row.currencyIso}>
            {idx > 0 ? (
              <div className="mb-2 h-px w-full bg-[hsl(var(--foreground) / 0.05)]" />
            ) : null}
            <div
              className="flex items-center justify-between"
              data-testid={`balance-by-currency-${row.currencyIso}`}
            >
              <span className="text-xs font-normal leading-4 text-[hsl(var(--muted-foreground))]">
                {row.currencyIso}
              </span>
              <span className="text-sm font-medium leading-5 text-[hsl(var(--foreground))] tabular-nums">
                {formatCurrency(row.currencyIso, row.total)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PendingIndicator({ dotColor, label, value }) {
  return (
    <div className="flex items-center justify-between px-3">
      <div className="flex items-center gap-2">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor }}
          aria-hidden="true"
        />
        <span className="text-xs font-normal leading-4 text-[hsl(var(--muted-foreground))]">{label}</span>
      </div>
      <span className="text-xs font-semibold leading-5 text-[hsl(var(--foreground))] tabular-nums">
        {value}
      </span>
    </div>
  );
}

function PendingCard({ pending, ui }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[hsl(var(--border-subtle))]">
      <header className="flex items-center justify-between border-b border-[hsl(var(--border-subtle))] px-3 py-3">
        <h3 className="text-xs font-semibold leading-4 text-[hsl(var(--muted-foreground))]">
          {ui('financeAccountsPendingTitle')}
        </h3>
      </header>
      <div className="flex flex-col gap-3 py-3">
        <PendingIndicator
          dotColor="hsl(var(--destructive))"
          label={ui('financeAccountsPendingAccountsRow')}
          value={pending.accountsWithPending ?? 0}
          data-testid="PendingIndicator__5d6a4a" />
      </div>
    </div>
  );
}

export function AccountsSidebar({ summary, loading }) {
  const ui = useUI();
  const primaryIso = summary?.byCurrency?.[0]?.currencyIso ?? 'EUR';
  const totalBalance = summary?.totalBalance ?? 0;
  const byCurrency = summary?.byCurrency ?? [];
  const pending = summary?.pending ?? {};

  return (
    <aside
      data-testid="cuentas-sidebar"
      className="flex w-[292px] shrink-0 flex-col py-2"
    >
      <header className="flex flex-col gap-0.5 px-3 pb-3 pt-2">
        <div className="flex items-center gap-1">
          <h2 className="text-xl font-semibold leading-7 text-[hsl(var(--foreground))]">
            {ui('financeAccountsBalanceTitle')}
          </h2>
          <button
            type="button"
            aria-label={ui('financeAccountsBalanceInfo')}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[hsl(var(--text-disabled))] hover:bg-[hsl(var(--muted))]"
          >
            <Info className="h-4 w-4" data-testid="Info__5d6a4a" />
          </button>
        </div>
        <SyncPill ui={ui} data-testid="SyncPill__5d6a4a" />
      </header>
      <div className="flex items-center px-3" style={{ minHeight: 32 }}>
        <span
          className="text-[30px] font-medium leading-8 text-[hsl(var(--foreground))] tabular-nums"
          data-testid="balance-card"
        >
          {loading ? '—' : formatCurrency(primaryIso, totalBalance)}
        </span>
      </div>
      <div className="px-3 py-3">
        <CurrencyBreakdown
          rows={byCurrency}
          primaryIso={primaryIso}
          ui={ui}
          data-testid="CurrencyBreakdown__5d6a4a" />
      </div>
      <div className="px-3" data-testid="pending-reconcile-card">
        <PendingCard pending={pending} ui={ui} data-testid="PendingCard__5d6a4a" />
      </div>
    </aside>
  );
}
