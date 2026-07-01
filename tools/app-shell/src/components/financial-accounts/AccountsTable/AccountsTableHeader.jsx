import { TableHeader, TableRow, TableHead } from '@/components/ui/table';
import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { ACCOUNT_COLUMNS, ACCOUNT_CELL_RENDERERS } from './accountColumns.jsx';

const HEAD_BASE = 'text-xs font-semibold leading-4 text-[#121217]';

export function AccountsTableHeader() {
  const ui = useUI();
  return (
    <TableHeader data-testid="TableHeader__18040e">
      <TableRow
        className="h-10 border-b border-[#E8EAEF] bg-white hover:bg-white"
        data-testid="TableRow__18040e">
        {/* Contract-driven data columns (decisions.json → contract.json) */}
        {ACCOUNT_COLUMNS.map((col) => {
          const meta = ACCOUNT_CELL_RENDERERS[col.name];
          return (
            <TableHead
              key={col.name}
              className={cn(meta?.headClass, HEAD_BASE)}
              data-testid="TableHead__18040e">
              {meta ? ui(meta.labelKey) : col.label}
            </TableHead>
          );
        })}
        {/* Fixed synthetic + structural columns */}
        <TableHead
          className={cn('w-[280px] px-2', HEAD_BASE)}
          data-testid="TableHead__18040e">
          {ui('financeAccountsColPending')}
        </TableHead>
        <TableHead className="min-w-[90px]" data-testid="TableHead__18040e" />
      </TableRow>
    </TableHeader>
  );
}
