import { Fragment } from 'react';
import { TableRow, TableCell } from '@/components/ui/table';
import { useUI } from '@/i18n';
import { ReconcilePill } from '../ReconcilePill.jsx';
import { AccountRowActions } from '../AccountRowActions.jsx';
import { ACCOUNT_COLUMNS, ACCOUNT_CELL_RENDERERS } from './accountColumns.jsx';

export function AccountRow({ account, onOpen, onReconcile, onEdit, onArchive, onPsd2Action, onTransfer, onNewMovement }) {
  const ui = useUI();
  const cellCtx = {
    ui,
    onConnect: onPsd2Action ? (acc) => onPsd2Action('connect', acc) : undefined,
  };

  return (
    <TableRow
      data-testid={`account-row-${account.id}`}
      className="group relative h-16 cursor-pointer bg-card transition-shadow hover:z-10 hover:bg-card hover:shadow-lg"
      onClick={() => onOpen?.(account)}
    >
      {/* Contract-driven data columns (decisions.json → contract.json) */}
      {ACCOUNT_COLUMNS.map((col) => {
        const renderer = ACCOUNT_CELL_RENDERERS[col.name];
        return (
          <Fragment key={col.name} data-testid="Fragment__90174f">
            {renderer
              ? renderer.renderCell(account, cellCtx)
              : <TableCell className="px-2 text-sm text-[hsl(var(--foreground))]" data-testid="TableCell__90174f">{account[col.name] ?? '—'}</TableCell>}
          </Fragment>
        );
      })}
      <TableCell className="w-[280px] px-2" data-testid="TableCell__90174f">
        <span
          onClick={(e) => e.stopPropagation()}
          role="presentation"
          className="inline-flex"
        >
          <ReconcilePill
            pendingCount={account.pendingCount}
            onClick={() => onReconcile?.(account)}
            data-testid="ReconcilePill__90174f" />
        </span>
      </TableCell>
      <TableCell
        className="min-w-[90px] px-2"
        onClick={(e) => e.stopPropagation()}
        data-testid="TableCell__90174f">
        <AccountRowActions
          account={account}
          onOpen={onOpen}
          onEdit={onEdit}
          onArchive={onArchive}
          onPsd2Action={onPsd2Action}
          onTransfer={onTransfer}
          onNewMovement={onNewMovement}
          data-testid="AccountRowActions__90174f" />
      </TableCell>
    </TableRow>
  );
}
