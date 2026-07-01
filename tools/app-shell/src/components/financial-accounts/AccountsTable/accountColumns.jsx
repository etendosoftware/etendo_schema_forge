// Contract-driven column definitions for the Cuentas list (AccountsTable).
//
// Which data columns appear, their order and visibility come from the window
// contract (entity `account`, fields with grid:true + gridOrder) — editing
// decisions.json + regen hides/reorders a column with no JSX change. The rich
// per-cell rendering (logo, IBAN, sync, balance colouring) stays here in a
// renderer registry. The synthetic "Por conciliar" pill and the row menu are
// NOT contract columns (computed aggregates / structural) — they stay fixed in
// AccountsTableHeader / AccountRow.
import { Copy, GripVertical } from 'lucide-react';
import { TableCell } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { ACCOUNT_TYPE } from '../tokens';
import { AccountLogoAvatar } from '../AccountLogoAvatar.jsx';
import { SyncStatusInline } from '../SyncStatusInline.jsx';
import { getContractGridColumns } from '../contractColumns';

const TYPE_LABEL_KEY = {
  [ACCOUNT_TYPE.BANK]: 'financeAccountsTypeBank',
  [ACCOUNT_TYPE.CASH]: 'financeAccountsTypeCash',
  [ACCOUNT_TYPE.CARD]: 'financeAccountsTypeCard',
};

function chunkIban(iban) {
  if (!iban) return '';
  return iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

function NameCell({ account, ui, onConnect }) {
  const isCashLike = account.type === ACCOUNT_TYPE.CASH;
  // In T1 the PSD2 column is not yet populated, so anything not explicitly
  // psd2Connected === true is treated as offline for bank/card rows.
  const isDisconnected = !isCashLike && account.psd2Connected !== true;
  return (
    <TableCell className="w-[480px] p-0" data-testid="TableCell__dc050f">
      <div className="flex h-full items-center">
        <div className="flex w-[44px] shrink-0 items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <GripVertical
            className="h-5 w-5 text-[#828FA3]"
            aria-hidden="true"
            data-testid="GripVertical__dc050f" />
        </div>
        <AccountLogoAvatar account={account} data-testid="AccountLogoAvatar__dc050f" />
        <div className="flex flex-1 flex-col justify-center gap-1 px-2 py-2">
          <div className="flex items-center gap-1">
            <span className="text-sm font-semibold leading-5 text-[#121217]">{account.name}</span>
            {isDisconnected ? (
              <span className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full bg-[#F5F7F9] px-2 py-1 text-xs font-normal leading-4 text-[#3F3F50]">
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
    </TableCell>
  );
}

function TypeCell({ account, ui }) {
  const typeLabel = ui(TYPE_LABEL_KEY[account.type] ?? 'financeAccountsTypeBank');
  const cardNumber = account.type === ACCOUNT_TYPE.CARD ? account.maskedPan : '';
  const copyIban = (e) => {
    e.stopPropagation();
    if (account.iban && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(account.iban);
    }
  };
  return (
    <TableCell className="w-[340px] px-2 py-2" data-testid="TableCell__dc050f">
      <div className="flex flex-col justify-center">
        <span className="text-sm font-normal leading-5 text-[#121217]">{typeLabel}</span>
        {account.iban && (
          <span className="inline-flex items-center gap-1 text-xs leading-4 text-[#6C6C89]">
            {chunkIban(account.iban)}
            <button
              type="button"
              onClick={copyIban}
              aria-label={ui('financeAccountsCopyIban')}
              data-testid={`account-row-copy-iban-${account.id}`}
              className="rounded-full p-0.5 text-[#828FA3] opacity-0 transition-opacity hover:bg-[#E8EAEF] group-hover:opacity-100"
            >
              <Copy className="h-3.5 w-3.5" data-testid="Copy__dc050f" />
            </button>
          </span>
        )}
        {!account.iban && cardNumber && (
          <span className="text-xs leading-4 text-[#6C6C89]" data-testid={`account-row-card-number-${account.id}`}>
            {cardNumber}
          </span>
        )}
        {!account.iban && !cardNumber && <span className="text-xs leading-4 text-[#6C6C89]">—</span>}
      </div>
    </TableCell>
  );
}

function BalanceCell({ account }) {
  const isNegative = Number(account.currentBalance) < 0;
  return (
    <TableCell className="w-[200px] px-2 text-right" data-testid="TableCell__dc050f">
      <span className={cn('text-sm font-semibold leading-5 tabular-nums', isNegative ? 'text-[#D50B3E]' : 'text-[#121217]')}>
        {formatCurrency(account.currencyIso, account.currentBalance)}
      </span>
    </TableCell>
  );
}

// Contract field name → header meta + cell/skeleton renderers.
export const ACCOUNT_CELL_RENDERERS = {
  name: {
    headClass: 'w-[480px] pl-[84px] pr-2',
    labelKey: 'financeAccountsColAccount',
    renderCell: (account, ctx) => <NameCell account={account} ui={ctx.ui} onConnect={ctx.onConnect} data-testid="NameCell__dc050f" />,
    renderSkeleton: (key) => (
      <TableCell key={key} className="w-[480px] p-0" data-testid="TableCell__dc050f">
        <div className="flex items-center">
          <div className="w-[44px]" />
          <Skeleton className="h-8 w-8 rounded-full" data-testid="Skeleton__dc050f" />
          <div className="flex flex-1 flex-col gap-1 px-3">
            <Skeleton className="h-4 w-32" data-testid="Skeleton__dc050f" />
            <Skeleton className="h-3 w-24" data-testid="Skeleton__dc050f" />
          </div>
        </div>
      </TableCell>
    ),
  },
  type: {
    headClass: 'w-[340px] px-2',
    labelKey: 'financeAccountsColType',
    renderCell: (account, ctx) => <TypeCell account={account} ui={ctx.ui} data-testid="TypeCell__dc050f" />,
    renderSkeleton: (key) => (
      <TableCell key={key} className="w-[340px]" data-testid="TableCell__dc050f">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-4 w-16" data-testid="Skeleton__dc050f" />
          <Skeleton className="h-3 w-40" data-testid="Skeleton__dc050f" />
        </div>
      </TableCell>
    ),
  },
  currentBalance: {
    headClass: 'w-[200px] px-2',
    labelKey: 'financeAccountsColBalance',
    renderCell: (account) => <BalanceCell account={account} data-testid="BalanceCell__dc050f" />,
    renderSkeleton: (key) => (
      <TableCell
        key={key}
        className="w-[200px] text-right"
        data-testid="TableCell__dc050f">
        <Skeleton className="ml-auto h-4 w-24" data-testid="Skeleton__dc050f" />
      </TableCell>
    ),
  },
};

export const ACCOUNT_COLUMNS = getContractGridColumns('account');
