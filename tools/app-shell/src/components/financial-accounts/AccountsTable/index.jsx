import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useUI } from '@/i18n';
import { AccountsTableHeader } from './AccountsTableHeader.jsx';
import { AccountRow } from './AccountRow.jsx';
import { ACCOUNT_COLUMNS, ACCOUNT_CELL_RENDERERS } from './accountColumns.jsx';

// Total column count = contract data columns + Pending + menu, used for the
// empty/error colSpan so it always matches the (possibly reconfigured) header.
const TOTAL_COL_COUNT = ACCOUNT_COLUMNS.length + 2;

const SKELETON_ROW_KEYS = [
  'skeleton-row-1',
  'skeleton-row-2',
  'skeleton-row-3',
  'skeleton-row-4',
  'skeleton-row-5',
];

function LoadingRows() {
  return (
    <>
      {SKELETON_ROW_KEYS.map((rowKey) => (
        <TableRow key={rowKey} className="h-16" data-testid="TableRow__db8970">
          {ACCOUNT_COLUMNS.map((col) => {
            const renderer = ACCOUNT_CELL_RENDERERS[col.name];
            const cellKey = `${rowKey}-${col.name}`;
            return renderer
              ? renderer.renderSkeleton(cellKey)
              : <TableCell key={cellKey} data-testid="TableCell__db8970"><Skeleton className="h-4 w-full" data-testid="Skeleton__db8970" /></TableCell>;
          })}
          <TableCell className="w-[280px]" data-testid="TableCell__db8970">
            <Skeleton className="h-5 w-24 rounded-full" data-testid="Skeleton__db8970" />
          </TableCell>
          <TableCell className="min-w-[90px]" data-testid="TableCell__db8970" />
        </TableRow>
      ))}
    </>
  );
}

function EmptyState({ message }) {
  return (
    <TableRow data-testid="TableRow__db8970">
      <TableCell
        colSpan={TOTAL_COL_COUNT}
        className="py-12 text-center text-sm text-[#6c6c89]"
        data-testid="TableCell__db8970">
        {message}
      </TableCell>
    </TableRow>
  );
}

function ErrorState({ message, onRetry, retryLabel }) {
  return (
    <TableRow data-testid="TableRow__db8970">
      <TableCell
        colSpan={TOTAL_COL_COUNT}
        className="py-12 text-center"
        data-testid="TableCell__db8970">
        <p className="text-sm text-[#d50b3e]">{message}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 text-xs font-medium text-[#121217] underline underline-offset-4"
          >
            {retryLabel}
          </button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export function AccountsTable({
  accounts,
  loading,
  error,
  onOpen,
  onReconcile,
  onEdit,
  onArchive,
  onPsd2Action,
  onTransfer,
  onRetry,
}) {
  const ui = useUI();
  const rowCount = accounts?.length ?? 0;

  const renderBody = () => {
    if (loading) {
      return <LoadingRows data-testid="LoadingRows__db8970" />;
    }
    if (error) {
      return (
        <ErrorState
          message={ui('financeAccountsLoadError')}
          onRetry={onRetry}
          retryLabel={ui('financeAccountsRetry')}
          data-testid="ErrorState__db8970" />
      );
    }
    if (rowCount === 0) {
      return <EmptyState message={ui('financeAccountsEmpty')} data-testid="EmptyState__db8970" />;
    }
    return accounts.map((account) => (
      <AccountRow
        key={account.id}
        account={account}
        onOpen={onOpen}
        onReconcile={onReconcile}
        onEdit={onEdit}
        onArchive={onArchive}
        onPsd2Action={onPsd2Action}
        onTransfer={onTransfer}
        data-testid="AccountRow__db8970" />
    ));
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-white [&>div]:overflow-visible">
      <Table data-testid="Table__db8970">
        <AccountsTableHeader data-testid="AccountsTableHeader__db8970" />
        <TableBody
          className="[&_tr:last-child]:border-b [&_tr:last-child]:border-[#E8EAEF]"
          data-testid="TableBody__db8970">
          {renderBody()}
        </TableBody>
      </Table>
    </div>
  );
}
