// The rich cell bodies of the Cuentas list: bank logo + name, type + IBAN, balance.
//
// WHICH columns appear, in what order and under what label is not decided here —
// that comes from the window contract (`decisions.json` → `grid`/`gridOrder`/
// `gridLabelKey`, read through `contractColumns.js`). This file only owns HOW a cell
// paints, and the binding column → renderer lives in `accountCellTypes.jsx`.
//
// ETP-4658 removed the hand-rolled `AccountsTable` host (header/row/table) that used
// to consume these through an `ACCOUNT_CELL_RENDERERS` registry; the generic
// `DataTable` now supplies its own `<TableCell>` around whatever `col.render` returns,
// which is why these are exported as bare bodies with no wrapper of their own.
import { Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { ACCOUNT_TYPE } from '../tokens';
import { AccountLogoAvatar } from '../AccountLogoAvatar.jsx';
import { SyncStatusInline } from '../SyncStatusInline.jsx';

const TYPE_LABEL_KEY = {
  [ACCOUNT_TYPE.BANK]: 'financeAccountsTypeBank',
  [ACCOUNT_TYPE.CASH]: 'financeAccountsTypeCash',
  [ACCOUNT_TYPE.CARD]: 'financeAccountsTypeCard',
};

function chunkIban(iban) {
  if (!iban) return '';
  return iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

// The reveal-on-row-hover affordance (the copy-IBAN button) carries BOTH Tailwind group
// variants on purpose. The host in production, `DataTable`, marks its row as a NAMED
// group (`group/row`, DataTable.jsx:1201), and `group-hover:` does not match
// `.group/row` — carrying only the unnamed variant is exactly what made the reveal
// silently invisible when the list moved onto DataTable. The unnamed one is kept as
// cheap insurance for any future host that marks rows as a plain `group`: one dead class
// token costs nothing, whereas dropping it reintroduces a bug that jsdom cannot catch
// (no Tailwind, no computed opacity).
//
// A drag grip used to sit here too, in a 44px slot ahead of the avatar. It was purely
// decorative — aria-hidden, no draggable attribute, no handlers, and the repo has no
// drag-and-drop library at all — so it advertised a row reordering that does not exist.
// Removed with its slot; COLUMN_CHROME.name's left padding in AccountsHeaderTable
// mirrors this cell's leading offset and was reduced to match.
export function NameCell({ account, ui, onConnect }) {
  const isCashLike = account.type === ACCOUNT_TYPE.CASH;
  // In T1 the connection column is not yet populated, so anything not explicitly
  // bankConnected === true is treated as offline for bank/card rows.
  const isDisconnected = !isCashLike && account.bankConnected !== true;
  return (
    <div className="flex h-full items-center">
        <AccountLogoAvatar account={account} data-testid="AccountLogoAvatar__dc050f" />
        <div className="flex flex-1 flex-col justify-center gap-1 px-2 py-2">
          <div className="flex items-center gap-1">
            <span className="text-sm font-semibold leading-5 text-[hsl(var(--foreground))]">{account.name}</span>
            {isDisconnected ? (
              <span className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full bg-[hsl(var(--muted))] px-2 py-1 text-xs font-normal leading-4 text-[hsl(var(--muted-foreground))]">
                {ui('financeAccountsBadgeOffline')}
              </span>
            ) : null}
          </div>
          <SyncStatusInline
            account={account}
            onConnect={onConnect ? () => onConnect(account) : undefined}
            data-testid="SyncStatusInline__dc050f" />
        </div>
    </div>
  );
}

export function TypeCell({ account, ui }) {
  const typeLabel = ui(TYPE_LABEL_KEY[account.type] ?? 'financeAccountsTypeBank');
  const cardNumber = account.type === ACCOUNT_TYPE.CARD ? account.maskedPan : '';
  const copyIban = (e) => {
    e.stopPropagation();
    if (account.iban && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(account.iban);
    }
  };
  return (
    <div className="flex flex-col justify-center">
        <span className="text-sm font-normal leading-5 text-[hsl(var(--foreground))]">{typeLabel}</span>
        {account.iban && (
          <span className="inline-flex items-center gap-1 text-xs leading-4 text-[hsl(var(--muted-foreground))]">
            {chunkIban(account.iban)}
            <button
              type="button"
              onClick={copyIban}
              aria-label={ui('financeAccountsCopyIban')}
              data-testid={`account-row-copy-iban-${account.id}`}
              className="rounded-full p-0.5 text-[hsl(var(--text-disabled))] opacity-0 transition-opacity hover:bg-[hsl(var(--border-subtle))] group-hover:opacity-100 group-hover/row:opacity-100"
            >
              <Copy className="h-3.5 w-3.5" data-testid="Copy__dc050f" />
            </button>
          </span>
        )}
        {!account.iban && cardNumber && (
          <span className="text-xs leading-4 text-[hsl(var(--muted-foreground))]" data-testid={`account-row-card-number-${account.id}`}>
            {cardNumber}
          </span>
        )}
        {!account.iban && !cardNumber && <span className="text-xs leading-4 text-[hsl(var(--muted-foreground))]">—</span>}
    </div>
  );
}

/** Plain "País" column (ETP-4896) — `countryName` is populated server-side for every account by
 *  `FinancialAccountHandler.enrichRecord`; falls back to the ISO code and finally an em dash for
 *  accounts that predate ETP-4896 or were never assigned one. */
export function CountryCell({ account }) {
  const label = account.countryName || account.countryIso || '';
  return (
    <span className="text-sm font-normal leading-5 text-[hsl(var(--foreground))]">
      {label || '—'}
    </span>
  );
}

export function BalanceCell({ account }) {
  const isNegative = Number(account.currentBalance) < 0;
  return (
    <span className={cn('text-sm font-semibold leading-5 tabular-nums', isNegative ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--foreground))]')}>
      {formatCurrency(account.currencyIso, account.currentBalance)}
    </span>
  );
}
