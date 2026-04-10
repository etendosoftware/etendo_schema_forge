import { useState, useMemo, useEffect } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useUI } from '@/i18n';
import { useWarehouseStock } from './useWarehouseStock';

const TYPE_KEY_MAP = {
  'V+': 'movTypeVendorReceipt',
  'I+': 'movTypeInventoryIn',
  'I-': 'movTypeInventoryOut',
  'M+': 'movTypeMovementTo',
  'M-': 'movTypeMovementFrom',
  'P+': 'movTypeProductionIn',
  'P-': 'movTypeProductionOut',
  'C-': 'movTypeCustomerShipment',
  'D-': 'movTypeInternalConsumption',
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

function fmtQty(val) {
  const n = Number(val);
  return isNaN(n) ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function SortIcon({ field, sortKey, sortDir }) {
  if (sortKey !== field) return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-40" />;
  return sortDir === 'asc'
    ? <ArrowUp className="h-3 w-3 ml-1 inline" />
    : <ArrowDown className="h-3 w-3 ml-1 inline" />;
}

export default function WarehouseTransactionsTable({ parentId, token, apiBaseUrl, onCount }) {
  const ui = useUI();
  const { loading, error, transactions } = useWarehouseStock(parentId, token, apiBaseUrl);

  useEffect(() => {
    if (!loading && !error && transactions) {
      onCount?.(transactions.length);
    }
  }, [loading, error, transactions?.length]);

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('movementDate');
  const [sortDir, setSortDir] = useState('desc');

  const resolveTypeLabel = (tx) =>
    tx['movementType$_identifier'] ?? (TYPE_KEY_MAP[tx.movementType] ? ui(TYPE_KEY_MAP[tx.movementType]) : tx.movementType) ?? '';

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filtered = useMemo(() => {
    if (!transactions) return [];
    const q = search.trim().toLowerCase();
    return transactions.filter(tx => {
      if (!q) return true;
      const product = (tx['product$_identifier'] ?? tx.product ?? '').toLowerCase();
      const type = resolveTypeLabel(tx).toLowerCase();
      return product.includes(q) || type.includes(q);
    });
  }, [transactions, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av, bv;
      if (sortKey === 'movementDate') {
        av = new Date(a.movementDate).getTime();
        bv = new Date(b.movementDate).getTime();
      } else if (sortKey === 'product') {
        av = (a['product$_identifier'] ?? a.product ?? '').toLowerCase();
        bv = (b['product$_identifier'] ?? b.product ?? '').toLowerCase();
      } else if (sortKey === 'movementType') {
        av = resolveTypeLabel(a).toLowerCase();
        bv = resolveTypeLabel(b).toLowerCase();
      } else if (sortKey === 'movementQuantity') {
        av = Number(a.movementQuantity) || 0;
        bv = Number(b.movementQuantity) || 0;
      } else {
        return 0;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  if (loading) return <div className="text-sm text-muted-foreground p-6">{ui('warehouseLoadingTransactions')}</div>;
  if (error) return <div className="text-sm text-destructive p-6">{ui('warehouseTransactionsError', { error })}</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-border">
        <input
          type="text"
          placeholder={ui('warehouseFilterPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm text-sm bg-transparent border border-border rounded-md px-3 py-1.5 outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
        />
      </div>

      {sorted.length === 0 ? (
        <div className="text-sm text-muted-foreground p-6">
          {transactions?.length === 0 ? ui('warehouseNoTransactions') : ui('warehouseNoFilterResults')}
        </div>
      ) : (
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b border-border text-muted-foreground">
                <th
                  className="text-left py-2 px-4 font-medium cursor-pointer select-none whitespace-nowrap"
                  onClick={() => handleSort('movementDate')}
                >
                  {ui('warehouseDate')} <SortIcon field="movementDate" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th
                  className="text-left py-2 px-4 font-medium cursor-pointer select-none"
                  onClick={() => handleSort('product')}
                >
                  {ui('warehouseProduct')} <SortIcon field="product" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th
                  className="text-left py-2 px-4 font-medium cursor-pointer select-none whitespace-nowrap"
                  onClick={() => handleSort('movementType')}
                >
                  {ui('warehouseType')} <SortIcon field="movementType" sortKey={sortKey} sortDir={sortDir} />
                </th>
                <th
                  className="text-right py-2 px-4 font-medium cursor-pointer select-none"
                  onClick={() => handleSort('movementQuantity')}
                >
                  {ui('warehouseQty')} <SortIcon field="movementQuantity" sortKey={sortKey} sortDir={sortDir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((tx, i) => {
                const qty = Number(tx.movementQuantity);
                const typeLabel = resolveTypeLabel(tx);
                const product = tx['product$_identifier'] ?? tx.product ?? '—';
                return (
                  <tr key={tx.id ?? i} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 px-4 tabular-nums text-muted-foreground whitespace-nowrap">{fmtDate(tx.movementDate)}</td>
                    <td className="py-2 px-4">{product}</td>
                    <td className="py-2 px-4 text-muted-foreground">{typeLabel}</td>
                    <td className={`py-2 px-4 text-right tabular-nums ${qty < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                      {qty >= 0 ? '+' : ''}{fmtQty(qty)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
