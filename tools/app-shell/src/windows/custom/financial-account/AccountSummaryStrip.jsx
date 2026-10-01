import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { AccountLogoAvatar } from '@/components/financial-accounts/AccountLogoAvatar';
import { ACCOUNT_TYPE } from '@/components/financial-accounts/tokens';
import { Skeleton } from '@/components/ui/skeleton';
import { MoneyAmount } from '@/components/ui/money-amount';

/** Formats a raw IBAN string into groups of 4 chars: "ES7012341234..." → "ES70 1234 1234 ..." */
function formatIban(iban) {
  if (!iban) return '—';
  return iban.replace(/\s+/g, '').match(/.{1,4}/g)?.join(' ') ?? iban;
}

/** What the avatar + identifier block shows (ETP-5521 added the logo-only card case). */
const IDENTIFIER_MODE = {
  FULL: 'full',
  LOGO_ONLY: 'logoOnly',
  HIDDEN: 'hidden',
};

/**
 * Cash has no IBAN, so its block is hidden. Banks (and a missing account) show the IBAN; a card
 * shows its masked card number instead. An offline card without a PAN can still carry the bank
 * logo picked at creation — then only the logo is shown; with neither, the block is hidden.
 */
function resolveIdentifierMode(account) {
  const type = account?.type;
  if (type === ACCOUNT_TYPE.CASH) return IDENTIFIER_MODE.HIDDEN;
  if (type !== ACCOUNT_TYPE.CARD || account?.maskedPan) return IDENTIFIER_MODE.FULL;
  return account?.providerLogoUrl?.trim() ? IDENTIFIER_MODE.LOGO_ONLY : IDENTIFIER_MODE.HIDDEN;
}

/**
 * Avatar + identifier — fixed width, never grows or shrinks, so the KPIs line up the same way in
 * every mode. Banks show the IBAN (with "—" when none stored) and a copy button; cards show their
 * card number, or only the bank logo in `LOGO_ONLY` mode.
 */
function AccountIdentifierBlock({ account, mode }) {
  const ui = useUI();
  const isCard = account?.type === ACCOUNT_TYPE.CARD;

  const handleCopyIban = () => {
    if (account?.iban) {
      navigator.clipboard.writeText(account.iban).then(() => {
        toast.success(ui('financeAccountDetailIbanCopied'));
      });
    }
  };

  return (
    <div className="flex w-[364px] shrink-0 items-center gap-2">
      <AccountLogoAvatar
        account={account}
        className="shrink-0"
        data-testid="AccountLogoAvatar__748dd1" />
      {mode === IDENTIFIER_MODE.FULL ? (
        <div className="flex min-w-0 flex-col">
          <span className="text-xs leading-4 text-[hsl(var(--muted-foreground))]">
            {isCard ? ui('financeAccountDetailCardNumber') : 'IBAN'}
          </span>
          <div className="flex items-center gap-0.5">
            <span
              data-testid="iban-text"
              className="truncate text-xs leading-4 text-[hsl(var(--muted-foreground))]"
            >
              {isCard ? account?.maskedPan : formatIban(account?.iban)}
            </span>
            {!isCard && account?.iban ? (
              <button
                type="button"
                onClick={handleCopyIban}
                data-testid="iban-copy-button"
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[hsl(var(--text-disabled))] hover:bg-[hsl(var(--muted))]"
                aria-label={ui('financeAccountDetailIbanCopyAria')}
              >
                <Copy className="h-4 w-4" data-testid="Copy__748dd1" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Horizontal strip shown under the movements toolbar.
 * Displays IBAN with copy button + three KPI figures (balance, inflows, outflows).
 *
 * `totals.windowSuffix` is an optional `{ key, params }` descriptor used to render
 * the date-range hint next to Inflows/Outflows (e.g. "(7D)", "(hoy)", "(rango)").
 *
 * @param {{
 *   account: object|null,
 *   totals: {
 *     balance: number,
 *     inflows: number,
 *     outflows: number,
 *     currency: string,
 *     windowSuffix?: { key: string, params: object|null } | null,
 *   },
 *   loading: boolean,
 * }} props
 */
export function AccountSummaryStrip({ account, totals, loading }) {
  const ui = useUI();
  const suffixText = totals.windowSuffix
    ? ui(totals.windowSuffix.key, totals.windowSuffix.params ?? undefined)
    : null;
  const suffix = suffixText ? ` (${suffixText})` : '';

  const identifierMode = resolveIdentifierMode(account);

  if (loading) {
    return (
      <div className="px-2 py-1">
        <div className="flex items-center gap-5 rounded-lg border border-[hsl(var(--border-subtle))] px-3 py-2">
          <Skeleton className="h-8 w-8 rounded-full" data-testid="Skeleton__748dd1" />
          <Skeleton className="h-5 w-48" data-testid="Skeleton__748dd1" />
          <div className="ml-auto flex gap-5">
            <Skeleton className="h-6 w-28" data-testid="Skeleton__748dd1" />
            <Skeleton className="h-6 w-28" data-testid="Skeleton__748dd1" />
            <Skeleton className="h-6 w-28" data-testid="Skeleton__748dd1" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-2 py-1">
      <div className="flex items-center gap-5 rounded-lg border border-[hsl(var(--border-subtle))] px-3 py-2">

        {/* Avatar + identifier — hidden for cash, and for a card with neither PAN nor logo. */}
        {identifierMode === IDENTIFIER_MODE.HIDDEN ? null : (
          <AccountIdentifierBlock
            account={account}
            mode={identifierMode}
            data-testid="AccountIdentifierBlock__748dd1" />
        )}

        {/* Saldo total */}
        <div data-testid="kpi-balance" className="flex flex-1 flex-col gap-0.5">
          <span className="text-xs leading-4 text-[hsl(var(--muted-foreground))]">
            {ui('financeAccountDetailKpiBalance')}
          </span>
          <MoneyAmount
            value={totals.balance}
            currency={totals.currency}
            tone="neutral"
            className="text-base font-medium leading-6"
            data-testid="MoneyAmount__748dd1" />
        </div>

        {/* Entradas — sufijo dinámico según el filtro de fecha activo */}
        <div data-testid="kpi-inflows" className="flex flex-1 flex-col gap-0.5">
          <span className="text-xs leading-4 text-[hsl(var(--muted-foreground))]">
            {ui('financeAccountDetailKpiInflows')}{suffix}
          </span>
          <MoneyAmount
            value={totals.inflows}
            currency={totals.currency}
            tone="positive"
            className="text-base font-medium leading-6"
            data-testid="MoneyAmount__748dd1" />
        </div>

        {/* Salidas — mismo sufijo que Entradas */}
        <div data-testid="kpi-outflows" className="flex flex-1 flex-col gap-0.5">
          <span className="text-xs leading-4 text-[hsl(var(--muted-foreground))]">
            {ui('financeAccountDetailKpiOutflows')}{suffix}
          </span>
          <MoneyAmount
            value={totals.outflows}
            currency={totals.currency}
            tone="negative"
            className="text-base font-medium leading-6"
            data-testid="MoneyAmount__748dd1" />
        </div>

      </div>
    </div>
  );
}
