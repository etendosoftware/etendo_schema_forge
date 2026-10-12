import { Info } from 'lucide-react';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { TruncatedText } from '@/components/ui/truncated-text.jsx';
import { buildBalanceDisplay } from './balanceDisplay.js';

/**
 * Cuentas sidebar — single column matching Figma frame `3012:25602`.
 *
 * Layout (top → bottom):
 *   1. Header — "Saldo" + info icon.
 *   2. Big balance number (30 / 32 / medium, fixed) — the total converted to
 *      the organization currency (ETP-5580): `≈` when a conversion was applied,
 *      a warning for currencies with no exchange rate. Always the full amount
 *      (`formatCurrency`, no K/M/B); it never shrinks. When it does not fit it
 *      ellipsises and reveals the exact value in a tooltip (TruncatedText, see
 *      `balanceDisplay.js`).
 *   3. Currency breakdown card (gray, rounded). Each row shows the exact
 *      balance; when it does not fit next to the ISO label it ellipsises and
 *      reveals the full amount in a tooltip (TruncatedText).
 *   4. Pending reconcile card (bordered, rounded).
 */
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
            {/* The ISO label keeps its width (`shrink-0`); the amount takes the rest
                (`min-w-0 flex-1` bounds it, so TruncatedText can measure the clip) and
                ellipsises with the exact value in a tooltip when it does not fit. */}
            <div
              className="flex items-center justify-between gap-2"
              data-testid={`balance-by-currency-${row.currencyIso}`}
            >
              <span className="shrink-0 text-xs font-normal leading-4 text-[hsl(var(--muted-foreground))]">
                {row.currencyIso}
              </span>
              <TruncatedText
                text={formatCurrency(row.currencyIso, row.total)}
                className="min-w-0 flex-1 text-right text-sm font-medium leading-5 text-[hsl(var(--foreground))] tabular-nums"
                data-testid={`balance-by-currency-${row.currencyIso}-amount`} />
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

function BalanceInfoButton({ ui }) {
  const label = ui('financeAccountsBalanceInfo');
  return (
    <TooltipProvider data-testid="TooltipProvider__5d6a4a">
      <Tooltip delayDuration={150} data-testid="Tooltip__5d6a4a">
        <TooltipTrigger asChild data-testid="TooltipTrigger__5d6a4a">
          <button
            type="button"
            aria-label={label}
            data-testid="balance-info-button"
            className="flex h-6 w-6 items-center justify-center rounded-full text-[hsl(var(--text-disabled))] hover:bg-[hsl(var(--muted))]"
          >
            <Info className="h-4 w-4" data-testid="Info__5d6a4a" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px]" data-testid="balance-info-tooltip">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function AccountsSidebar({ summary, loading }) {
  const ui = useUI();
  // ETP-5580: the total is converted server-side to the organization currency, so its
  // ISO comes from `totalBalanceCurrencyIso`. Older backends do not send it — fall back
  // to the first breakdown row as before. `||` (not `??`) so an empty string is treated
  // as unknown too. Breakdown rows keep their own ISO.
  const primaryIso = summary?.totalBalanceCurrencyIso
    || summary?.byCurrency?.[0]?.currencyIso
    || 'EUR';
  const totalBalance = summary?.totalBalance ?? 0;
  const byCurrency = summary?.byCurrency ?? [];
  const pending = summary?.pending ?? {};
  const missingRateCurrencies = Array.isArray(summary?.missingRateCurrencies)
    ? summary.missingRateCurrencies
    : [];
  const balance = buildBalanceDisplay(primaryIso, totalBalance, {
    approximate: summary?.totalBalanceApproximate === true,
  });

  return (
    <aside
      data-testid="cuentas-sidebar"
      className="flex w-[292px] shrink-0 flex-col py-2"
    >
      <header className="px-3 pb-3 pt-2">
        <div className="flex items-center gap-1">
          <h2 className="text-xl font-semibold leading-7 text-[hsl(var(--foreground))]">
            {ui('financeAccountsBalanceTitle')}
          </h2>
          <BalanceInfoButton ui={ui} data-testid="BalanceInfoButton__5d6a4a" />
        </div>
      </header>
      <div className="flex flex-col px-3">
        {/* The row carries the fixed 30px size (inherited by the amount) and bounds the
            width; the amount (`min-w-0 flex-1`) ellipsises when it does not fit and
            TruncatedText then shows the exact value in a tooltip. */}
        <div
          className="flex min-w-0 items-center"
          style={{ minHeight: 32, ...balance.style }}
          data-testid="balance-total"
        >
          <TruncatedText
            text={loading ? '—' : balance.text}
            className="min-w-0 flex-1 font-medium text-[hsl(var(--foreground))] tabular-nums"
            data-testid="balance-card" />
        </div>
        {!loading && missingRateCurrencies.length > 0 ? (
          <p
            className="mt-1 text-xs font-normal leading-4 text-[var(--status-warning-fg)]"
            data-testid="balance-missing-rate"
          >
            {ui('financeAccountsBalanceMissingRate', {
              currencies: missingRateCurrencies.join(', '),
            })}
          </p>
        ) : null}
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
