import { useState, useMemo, useCallback, useEffect } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { useUI } from '@/i18n';
import NewAccountModal from './NewAccountModal';

function buildTreeColumns(ui) {
  return [
    {
      key: 'searchKey',
      column: 'accountTreeFilterCode',
      type: 'string',
      label: ui('accountTreeFilterCode'),
      required: true,
      backendSortKey: 'searchKey',
    },
    {
      key: 'name',
      column: 'accountTreeFilterName',
      type: 'string',
      label: ui('accountTreeFilterName'),
      required: true,
    },
    {
      key: 'accountType',
      column: 'accountTreeFilterType',
      type: 'enum',
      label: ui('accountTreeFilterType'),
      required: true,
      enumLabels: {
        A: ui('accountTypeAsset'),
        E: ui('accountTypeExpense'),
        L: ui('accountTypeLiability'),
        M: ui('accountTypeMemo'),
        O: ui('accountTypeOwnersEquity'),
        R: ui('accountTypeRevenue'),
      },
    },
    {
      key: 'active',
      column: 'accountTreeFilterActive',
      type: 'boolean',
      label: ui('accountTreeFilterActive'),
      required: true,
      badgeLabels: {
        true: ui('yes'),
        false: ui('no'),
      },
    },
    {
      key: 'ytdDebit',
      column: 'accountTreeDebit',
      type: 'amount',
      label: ui('accountTreeDebit'),
      filterable: false,
    },
    {
      key: 'ytdCredit',
      column: 'accountTreeCredit',
      type: 'amount',
      label: ui('accountTreeCredit'),
      filterable: false,
    },
    {
      key: 'ytdBalance',
      column: 'accountTreeBalance',
      type: 'amount',
      label: ui('accountTreeBalance'),
      filterable: false,
    },
  ];
}

/**
 * AccountTreeView — collapsible/expandable tree for the Chart of Accounts.
 *
 * Acts as a `customComponents.headerTable` replacement — receives the same
 * props as the generated ElementValueTable from ListView.jsx.
 *
 * The flat list from the NEO API must include fields injected by the
 * chart-of-accounts NeoHandler:
 *   id, searchKey, name, ytdDebit, ytdCredit, ytdBalance,
 *   parentId, depth, hasChildren, summaryLevel
 *
 * Defaults: levels 0 and 1 expanded, deeper nodes collapsed.
 *
 * "New Sub-account" is always available. If a row is selected, NewAccountModal
 * auto-populates the parent from that row; otherwise the selector starts empty.
 */

const FMT = new Intl.NumberFormat('es', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

function fmtNum(n) {
  if (n == null) return '—';
  return FMT.format(Number(n));
}

/**
 * Groups the flat list of subaccounts by parentCode4, creating virtual group header
 * nodes for each 4-digit parent. All API records are leaves (issummary='N'); the
 * hierarchy comes from parentCode4 / parentCode4Name injected by the NeoHandler.
 *
 * Returns { tree: groupNodes[], indexById: Map<id, node> } where indexById only
 * contains real account nodes (not virtual group headers).
 */
function buildGroupedTree(items) {
  const indexById = new Map();
  const groupMap = new Map(); // parentCode4 → groupNode

  for (const item of items) {
    indexById.set(item.id, item);

    const code = item.parentCode4;
    if (code) {
      if (!groupMap.has(code)) {
        groupMap.set(code, {
          id: `group-${code}`,
          searchKey: code,
          name: item.parentCode4Name ?? code,
          summaryLevel: 'Y',
          isVirtual: true,
          depth: 0,
          hasChildren: true,
          ytdDebit: 0,
          ytdCredit: 0,
          ytdBalance: 0,
          children: [],
        });
      }
      const group = groupMap.get(code);
      group.ytdDebit += Number(item.ytdDebit ?? 0);
      group.ytdCredit += Number(item.ytdCredit ?? 0);
      group.ytdBalance += Number(item.ytdBalance ?? 0);
      group.children.push({ ...item, depth: 1 });
    }
  }

  // Sort groups by code; sort children within each group by searchKey
  const tree = [...groupMap.values()].sort((a, b) =>
    a.searchKey.localeCompare(b.searchKey),
  );
  for (const group of tree) {
    group.children.sort((a, b) => a.searchKey.localeCompare(b.searchKey));
  }

  return { tree, indexById };
}

/**
 * DFS walk that returns only nodes whose ancestors are all expanded.
 */
function flattenVisible(nodes, expanded) {
  const result = [];
  function walk(list) {
    for (const node of list) {
      result.push(node);
      if (node.hasChildren && expanded.has(node.id) && node.children?.length) {
        walk(node.children);
      }
    }
  }
  walk(nodes);
  return result;
}

function AccountTreeRow({ item, isExpanded, isSelected, onToggle, onRowClick }) {
  const isSummary = item.summaryLevel === 'Y';
  const indent = (item.depth ?? 0) * 16;
  const balance = Number(item.ytdBalance ?? 0);

  return (
    <div
      data-testid={`account-tree-row-${item.id}`}
      role="row"
      aria-selected={isSelected}
      className={[
        'flex items-center gap-3 px-4 py-2 cursor-pointer text-sm select-none transition-colors',
        isSelected ? 'bg-[#F4F5FF]' : 'hover:bg-[#F9FAFB]',
        isSummary ? 'font-semibold text-[#121217]' : 'font-normal text-[#3C3C4D]',
      ].join(' ')}
      onClick={() => onRowClick(item)}
    >
      {/* Indent spacer — grows proportional to depth */}
      {indent > 0 && <span style={{ minWidth: indent, flexShrink: 0 }} />}

      {/* Toggle chevron or placeholder */}
      <span className="flex items-center justify-center w-4 h-4 shrink-0">
        {item.hasChildren ? (
          <button
            type="button"
            data-testid={`account-tree-toggle-${item.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(item.id);
            }}
            className="flex items-center justify-center w-4 h-4 text-[#6C6C89] hover:text-[#121217] transition-colors"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Contraer' : 'Expandir'}
          >
            {isExpanded ? <ChevronDown size={13} data-testid="ChevronDown__acc34a" /> : <ChevronRight size={13} data-testid="ChevronRight__acc34a" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
      </span>

      {/* Account code — monospace, fixed width */}
      <span className="shrink-0 w-24 font-mono text-xs text-[#6C6C89] tabular-nums">
        {item.searchKey}
      </span>

      {/* Account name — fills remaining space */}
      <span className="flex-1 min-w-0 truncate">{item.name}</span>

      {/* YTD Debit */}
      <span className="shrink-0 w-28 text-right tabular-nums text-[#3C3C4D]">
        {fmtNum(item.ytdDebit)}
      </span>

      {/* YTD Credit */}
      <span className="shrink-0 w-28 text-right tabular-nums text-[#3C3C4D]">
        {fmtNum(item.ytdCredit)}
      </span>

      {/* Net Balance — red when negative */}
      <span
        className={[
          'shrink-0 w-28 text-right tabular-nums',
          balance < 0 ? 'text-red-600' : 'text-[#121217]',
        ].join(' ')}
      >
        {fmtNum(item.ytdBalance)}
      </span>
    </div>
  );
}

/**
 * AccountTreeView — main component.
 *
 * Props it uses:
 *   data          — flat list of account records from NEO (with tree fields)
 *   onNavigate    — (id) => void — called when a row is clicked
 *   onDataMutated — () => void  — called after a new sub-account is saved
 *   token         — JWT for API calls (forwarded to NewAccountModal)
 *   apiBaseUrl    — NEO base URL (forwarded to NewAccountModal)
 *
 * The remaining props mirror what ListView passes to a headerTable component
 * (sorting, filtering, selection, etc.). They are accepted but not acted on
 * here since the tree has its own navigation model.
 */
export default function AccountTreeView({
  data = [],
  onNavigate,
  onDataMutated,
  token,
  apiBaseUrl,
  // Accepted but intentionally unused — ListView always passes them
  entity: _entity,
  specName: _specName,
  onSelectionChange: _onSelectionChange,
  isRowSelectable: _isRowSelectable,
  compact: _compact,
  sortColumn: _sortColumn,
  sortDirection: _sortDirection,
  onSort: _onSort,
  onColumnsReady,
  api: _api,
  labelOverrides: _labelOverrides,
  onFilterChange: _onFilterChange,
  onClearAllFilters: _onClearAllFilters,
  columnFilters: _columnFilters,
  onCloneRow: _onCloneRow,
  rowFilter: _rowFilter,
  hoverRowActions: _hoverRowActions,
  clearSelectionTrigger: _clearSelectionTrigger,
  rowQuickActions: _rowQuickActions,
  hiddenColumns: _hiddenColumns,
  ...rest
}) {
  const ui = useUI();
  const treeColumns = useMemo(() => buildTreeColumns(ui), [ui]);

  const { tree } = useMemo(() => buildGroupedTree(data), [data]);

  const [expanded, setExpanded] = useState(() => new Set());

  // Expand all group headers whenever the tree is first populated (async data load)
  useEffect(() => {
    if (tree.length > 0) {
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const node of tree) {
          if (node.isVirtual) next.add(node.id);
        }
        return next;
      });
    }
  }, [tree]);

  useEffect(() => {
    onColumnsReady?.(treeColumns);
  }, [onColumnsReady, treeColumns]);

  const [selectedId, setSelectedId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleToggle = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleRowClick = useCallback(
    (item) => {
      setSelectedId(item.id);
      if (!item.isVirtual) {
        onNavigate?.(item);
      }
    },
    [onNavigate],
  );

  const visibleRows = useMemo(
    () => flattenVisible(tree, expanded),
    [tree, expanded],
  );

  const selectedRecord = useMemo(
    () => (selectedId ? visibleRows.find((row) => row.id === selectedId) : null),
    [visibleRows, selectedId],
  );

  const expandAll = useCallback(
    () => setExpanded(new Set(tree.filter((n) => n.isVirtual).map((n) => n.id))),
    [tree],
  );
  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  const handleSaved = useCallback(() => {
    setIsModalOpen(false);
    onDataMutated?.();
  }, [onDataMutated]);

  return (
    <div data-testid="account-tree" role="grid" {...rest}>
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#E8EAEF] bg-white">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={expandAll}
            className="text-xs text-[#6C6C89] hover:text-[#121217] transition-colors"
          >
            {ui('expand')}
          </button>
          <span className="text-[#D1D4DB] select-none">|</span>
          <button
            type="button"
            onClick={collapseAll}
            className="text-xs text-[#6C6C89] hover:text-[#121217] transition-colors"
          >
            {ui('collapse')}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 bg-[#121217] text-white rounded-full hover:bg-[#28282F] transition-colors"
        >
          + {ui('newSubAccount')}
        </button>
      </div>

      {data.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          {ui('accountTreeNoAccounts')}
        </div>
      ) : (
        <>
          {/* ── Column headers ── */}
          <div
            role="row"
            className="flex items-center gap-3 px-4 py-2 border-b border-[#E8EAEF] bg-[#FAFAFA]"
          >
            {/* Spacer for toggle column */}
            <span className="w-4 shrink-0" />
            <span className="shrink-0 w-24 text-xs font-medium text-[#6C6C89] uppercase tracking-wide">
              {ui('accountTreeCode')}
            </span>
            <span className="flex-1 min-w-0 text-xs font-medium text-[#6C6C89] uppercase tracking-wide">
              {ui('name')}
            </span>
            <span className="shrink-0 w-28 text-right text-xs font-medium text-[#6C6C89] uppercase tracking-wide">
              {ui('accountTreeDebit')}
            </span>
            <span className="shrink-0 w-28 text-right text-xs font-medium text-[#6C6C89] uppercase tracking-wide">
              {ui('accountTreeCredit')}
            </span>
            <span className="shrink-0 w-28 text-right text-xs font-medium text-[#6C6C89] uppercase tracking-wide">
              {ui('accountTreeBalance')}
            </span>
          </div>

          {/* ── Tree rows ── */}
          <div role="rowgroup" className="divide-y divide-[#F4F5F7]">
            {visibleRows.map((item) => (
              <AccountTreeRow
                key={item.id}
                item={item}
                isExpanded={expanded.has(item.id)}
                isSelected={item.id === selectedId}
                onToggle={handleToggle}
                onRowClick={handleRowClick}
                data-testid="AccountTreeRow__acc34a"
              />
            ))}
          </div>
        </>
      )}

      {/* ── New Sub-account modal ── */}
      <NewAccountModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={handleSaved}
        currentRecord={selectedRecord}
        allAccounts={data}
        apiBaseUrl={apiBaseUrl}
        token={token}
        data-testid="NewAccountModal__acc34a"
      />
    </div>
  );
}
