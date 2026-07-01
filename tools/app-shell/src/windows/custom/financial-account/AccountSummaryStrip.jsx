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

  const isCash = account?.type === ACCOUNT_TYPE.CASH;
  const isCard = account?.type === ACCOUNT_TYPE.CARD;
  // Cash has no IBAN; a card shows its masked card number instead of an IBAN.
  // Hide the whole identifier block for cash, and for a card without a PAN.
  const showIdentifier = !isCash && (!isCard || !!account?.maskedPan);

  const handleCopyIban = () => {
    if (account?.iban) {
      navigator.clipboard.writeText(account.iban).then(() => {
        toast.success(ui('financeAccountDetailIbanCopied'));
      });
    }
  };

  if (loading) {
    return (
      <div className="px-2 py-1">
        <div className="flex items-center gap-5 rounded-lg border border-[#E8EAEF] px-3 py-2">
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
      <div className="flex items-center gap-5 rounded-lg border border-[#E8EAEF] px-3 py-2">

        {/* Avatar + identifier — fixed width, never grows or shrinks. Hidden for
            cash accounts (no IBAN) and for cards without a masked PAN. Banks show
            the IBAN (with "—" when none stored); cards show their card number. */}
        {showIdentifier ? (
          <div className="flex w-[364px] shrink-0 items-center gap-2">
            <AccountLogoAvatar
              account={account}
              className="h-8 w-8 shrink-0"
              data-testid="AccountLogoAvatar__748dd1" />
            <div className="flex min-w-0 flex-col">
              <span className="text-xs leading-4 text-[#3F3F50]">
                {isCard ? ui('financeAccountDetailCardNumber') : 'IBAN'}
              </span>
              <div className="flex items-center gap-0.5">
                <span
                  data-testid="iban-text"
                  className="truncate text-xs leading-4 text-[#6C6C89]"
                >
                  {isCard ? account?.maskedPan : formatIban(account?.iban)}
                </span>
                {!isCard && account?.iban ? (
                  <button
                    type="button"
                    onClick={handleCopyIban}
                    data-testid="iban-copy-button"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#828FA3] hover:bg-[#F5F7F9]"
                    aria-label={ui('financeAccountDetailIbanCopyAria')}
                  >
                    <Copy className="h-4 w-4" data-testid="Copy__748dd1" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {/* Saldo total */}
        <div data-testid="kpi-balance" className="flex flex-1 flex-col gap-0.5">
          <span className="text-xs leading-4 text-[#3F3F50]">
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
          <span className="text-xs leading-4 text-[#3F3F50]">
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
          <span className="text-xs leading-4 text-[#3F3F50]">
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
