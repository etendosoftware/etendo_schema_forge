import { useState, useMemo, useCallback, useEffect } from 'react';
import { ChevronRight, ChevronDown, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import NewAccountModal from './NewAccountModal';
import { ACCOUNT_TYPE_UI_KEYS, accountTypeLabel } from './accountTypeLabels';
import { jsonHeaders } from '@/lib/sessionHeaders.js';

// A tree needs its FULL leaf list upfront to know which top-level folders exist —
// it can't discover them via ListView's incremental "scroll near bottom, load a bit
// more" pagination (ListView only fetches one BATCH_SIZE page per `data` prop, and
// does not forward `hasMore`/`loadMore` to the Table it renders). So this component
// fetches its own complete dataset directly, mirroring the precedent already
// established by NewAccountModal's parent-selector fetch (see NewAccountModal.jsx).
// `_endRow=9999` comfortably covers realistic charts of accounts (a live GOClient
// tenant has 659 leaf accounts across 4 root headings) with generous headroom, and
// the backend handler (ChartOfAccountsHandler#fetchElementValuesDirectly) derives
// its page size directly from the requested endRow with no smaller server-side cap.
const FULL_FETCH_END_ROW = 9999;

// Persists which folder rows are expanded across navigation/reloads. Folder ids are
// `group-<ancestor-code-path>` (e.g. `group-A|A.A`), derived from stable account codes
// rather than DB record ids, so they stay valid across sessions.
const EXPANDED_STORAGE_KEY = 'sf.chartOfAccounts.expandedFolderIds';

function loadPersistedExpanded() {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY);
    if (!raw) return new Set();
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? new Set(ids) : new Set();
  } catch {
    return new Set();
  }
}

function persistExpanded(expanded) {
  try {
    localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(Array.from(expanded)));
  } catch {
    // Storage unavailable (private mode, quota, etc.) — expand/collapse still works
    // in-memory for this session, it just won't persist across reloads.
  }
}

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
      enumLabels: Object.fromEntries(
        Object.entries(ACCOUNT_TYPE_UI_KEYS).map(([code, uiKey]) => [code, ui(uiKey)]),
      ),
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
 *   id, searchKey, name, accountType,
 *   parentId, depth, hasChildren, summaryLevel, elementLevel,
 *   ancestors (full root-to-leaf ancestor chain — see buildGroupedTree below),
 *   parentCode4, parentCode4Name (legacy 4-digit grouping, kept for fallback
 *   and for NewAccountModal's parent selector)
 *
 * Defaults: every folder is collapsed on first-ever load. Expand/collapse state is
 * persisted to localStorage (per browser, `EXPANDED_STORAGE_KEY`) so navigating away
 * and back to this window restores exactly what the user left open.
 *
 * "New Sub-account" is always available. If a row is selected, NewAccountModal
 * auto-populates the parent from that row; otherwise the selector starts empty.
 */

/**
 * Builds a genuine N-level nested tree from the flat list of subaccounts, mirroring
 * Etendo Classic's "Combinación de cuentas" grouped view (e.g. for account `20000000`:
 * `A` (Heading) → `A.A` (Heading) → `A.A.I` (Heading) → `200` (Account) → `2000`
 * (Breakdown) → `20000000` (Subaccount)).
 *
 * Each leaf's `ancestors` array (injected by the chart-of-accounts NeoHandler, ordered
 * root-to-leaf) drives the folder path: one virtual folder node per ancestor, keyed by
 * its position in the path so two leaves sharing a partial ancestor chain (e.g. the same
 * `A.A.I` heading) reuse the same folder nodes instead of duplicating them.
 *
 * Legacy fallback: if a record has no `ancestors` (older API response, or partial
 * rollout), it falls back to the previous 2-level grouping by its 4-digit `parentCode4`
 * so the tree still renders something sensible instead of dropping the record.
 *
 * Returns { tree: rootNodes[], indexById: Map<id, node> } where indexById only
 * contains real account nodes (not virtual folder headers).
 */
function buildGroupedTree(items) {
  const indexById = new Map();
  const rootChildren = [];
  const folderIndex = new Map(); // path key → folder node (shared across leaves)

  for (const item of items) {
    indexById.set(item.id, item);

    const ancestors = Array.isArray(item.ancestors) ? item.ancestors : null;

    if (ancestors && ancestors.length > 0) {
      let siblings = rootChildren;
      let pathKey = '';
      ancestors.forEach((ancestor, idx) => {
        const segmentKey = String(ancestor?.value ?? `L${idx}`);
        pathKey = pathKey ? `${pathKey}|${segmentKey}` : segmentKey;
        let folder = folderIndex.get(pathKey);
        if (!folder) {
          folder = {
            id: `group-${pathKey}`,
            searchKey: segmentKey,
            name: ancestor?.name ?? segmentKey,
            elementLevel: ancestor?.elementLevel ?? null,
            summaryLevel: 'Y',
            isVirtual: true,
            depth: idx,
            hasChildren: true,
            children: [],
          };
          folderIndex.set(pathKey, folder);
          siblings.push(folder);
        }
        siblings = folder.children;
      });
      siblings.push({ ...item, depth: ancestors.length });
    } else if (item.parentCode4) {
      const code = item.parentCode4;
      let folder = folderIndex.get(code);
      if (!folder) {
        folder = {
          id: `group-${code}`,
          searchKey: code,
          name: item.parentCode4Name ?? code,
          summaryLevel: 'Y',
          isVirtual: true,
          depth: 0,
          hasChildren: true,
          children: [],
        };
        folderIndex.set(code, folder);
        rootChildren.push(folder);
      }
      folder.children.push({ ...item, depth: 1 });
    }
  }

  // Sort every level by searchKey, recursively.
  const sortRecursive = (nodes) => {
    nodes.sort((a, b) => String(a.searchKey).localeCompare(String(b.searchKey)));
    for (const node of nodes) {
      if (node.children?.length) sortRecursive(node.children);
    }
  };
  sortRecursive(rootChildren);

  return { tree: rootChildren, indexById };
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

/**
 * A leaf subaccount whose code ends in "0000" is a protected parent-like placeholder
 * (e.g. `20000000` under breakdown `2000`) — it is technically `issummary='N'` in the DB
 * but must render as non-editable, matching the backend's
 * `ChartOfAccountsHandler.isProtectedParentLikeSubaccount` rule (enforced server-side via
 * `readOnlyLogic: "@ProtectedParentLikeSubaccount@='Y'"` in decisions.json). Real
 * subaccounts (e.g. `20000001`) remain fully editable.
 */
function isProtectedLeafCode(item) {
  if (item.isVirtual) return false;
  if (item.protectedParentLikeSubaccount === 'Y') return true;
  return typeof item.searchKey === 'string' && item.searchKey.endsWith('0000');
}

function AccountTreeRow({ item, isExpanded, isSelected, onToggle, onRowClick, ui }) {
  const isSummary = item.summaryLevel === 'Y';
  const indent = (item.depth ?? 0) * 16;
  const isProtected = isProtectedLeafCode(item);

  return (
    <div
      data-testid={`account-tree-row-${item.id}`}
      role="row"
      aria-selected={isSelected}
      className={[
        'flex items-center gap-3 px-4 py-2 cursor-pointer text-sm select-none transition-colors',
        isSelected ? 'bg-[hsl(var(--card))]' : 'hover:bg-[hsl(var(--card))]',
        isSummary ? 'font-semibold text-[hsl(var(--foreground))]' : 'font-normal text-[hsl(var(--foreground))]',
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
            className="flex items-center justify-center w-4 h-4 text-[var(--status-info-fg)] hover:text-[hsl(var(--foreground))] transition-colors"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? ui('collapse') : ui('expand')}
          >
            {isExpanded ? <ChevronDown size={13} data-testid="ChevronDown__acc34a" /> : <ChevronRight size={13} data-testid="ChevronRight__acc34a" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
      </span>

      {/* Account code — monospace, fixed width */}
      <span className="shrink-0 w-24 font-mono text-xs text-[var(--status-info-fg)] tabular-nums">
        {item.searchKey}
      </span>

      {/* Account name — fills remaining space */}
      <span className="flex-1 min-w-0 truncate flex items-center gap-1.5">
        {item.name}
        {isProtected && (
          <Lock
            size={12}
            className="shrink-0 text-[hsl(var(--border-subtle))]"
            data-testid={`account-tree-locked-${item.id}`}
            role="img"
            aria-label={ui('accountTreeReadOnlyPlaceholder')}
          />
        )}
      </span>

      {/* Account type */}
      <span className="shrink-0 w-40 truncate text-[hsl(var(--foreground))]">
        {accountTypeLabel(ui, item.accountType)}
      </span>
    </div>
  );
}

/**
 * AccountTreeView — main component.
 *
 * Props it uses:
 *   data          — flat list of account records from NEO (with tree fields).
 *                   ListView.jsx only ever hands this one paginated BATCH_SIZE
 *                   page (`hook.items`), so it is used as the initial/fallback
 *                   dataset — see the self-fetch note below.
 *   onNavigate    — (item) => void — called when a non-virtual row is clicked (receives the full row object)
 *   onDataMutated — () => void  — called after a new sub-account is saved
 *   token         — JWT for API calls (forwarded to NewAccountModal, used for self-fetch)
 *   apiBaseUrl    — NEO base URL (forwarded to NewAccountModal, used for self-fetch)
 *
 * Self-fetch: when `apiBaseUrl` is provided, the component fetches its own complete
 * leaf-account dataset (see FULL_FETCH_END_ROW above) on mount and after every save,
 * and renders that instead of the paginated `data` prop once the fetch resolves. This
 * is what makes every root-level heading (not just the ones with leaves in ListView's
 * first page) show up. Until the fetch resolves (or if it fails, or if `apiBaseUrl` is
 * absent — e.g. direct unit tests that only pass `data`), the component renders `data`
 * as-is, so plain `data`-driven tests keep working without needing to mock `fetch`.
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

  // Self-fetch: the full leaf-account list, loaded directly (bypassing ListView's
  // one-page `data` prop) whenever `apiBaseUrl` is available. See the component
  // docblock above for why the tree needs this instead of incremental pagination.
  const [fetchedData, setFetchedData] = useState(null);
  const [isFetchingFull, setIsFetchingFull] = useState(false);
  const [fetchGeneration, setFetchGeneration] = useState(0);

  useEffect(() => {
    if (!apiBaseUrl) return undefined;

    let cancelled = false;

    (async () => {
      setIsFetchingFull(true);
      try {
        const res = await fetch(
          `${apiBaseUrl}/elementValue?_startRow=0&_endRow=${FULL_FETCH_END_ROW}`,
          { headers: jsonHeaders() },
        );
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const json = await res.json();
        const rows = json?.response?.data;
        if (!cancelled && Array.isArray(rows)) {
          setFetchedData(rows);
        }
      } catch {
        if (!cancelled) {
          toast.error(ui('accountTreeFetchError'));
        }
      } finally {
        if (!cancelled) setIsFetchingFull(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBaseUrl, token, fetchGeneration]);

  // Refetch the complete dataset after a new sub-account is saved, in addition to
  // whatever `onDataMutated` triggers on the caller's side (ListView's own
  // one-page refresh).
  const refetchFull = useCallback(() => setFetchGeneration((g) => g + 1), []);

  // Until the self-fetch resolves — or when it's not applicable (`apiBaseUrl` absent,
  // e.g. direct unit tests) — fall back to the `data` prop so behavior is unchanged.
  const effectiveData = fetchedData ?? data;

  const { tree } = useMemo(() => buildGroupedTree(effectiveData), [effectiveData]);

  const [expanded, setExpanded] = useState(loadPersistedExpanded);

  // Persist expand/collapse state so it survives navigating away and back.
  useEffect(() => {
    persistExpanded(expanded);
  }, [expanded]);

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
    refetchFull();
  }, [onDataMutated, refetchFull]);

  return (
    <div data-testid="account-tree" role="grid" {...rest}>
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[hsl(var(--card))] bg-card">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={expandAll}
            className="text-xs text-[var(--status-info-fg)] hover:text-[hsl(var(--foreground))] transition-colors"
          >
            {ui('expand')}
          </button>
          <span className="text-[hsl(var(--card))] select-none">|</span>
          <button
            type="button"
            onClick={collapseAll}
            className="text-xs text-[var(--status-info-fg)] hover:text-[hsl(var(--foreground))] transition-colors"
          >
            {ui('collapse')}
          </button>
          {isFetchingFull && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-3 w-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              {ui('accountTreeLoadingFull')}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 bg-[hsl(var(--foreground))] text-primary-foreground rounded-full hover:bg-[hsl(var(--foreground))] transition-colors"
        >
          + {ui('newSubAccount')}
        </button>
      </div>

      {effectiveData.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          {ui('accountTreeNoAccounts')}
        </div>
      ) : (
        <>
          {/* ── Column headers ── */}
          <div
            role="row"
            className="flex items-center gap-3 px-4 py-2 border-b border-[hsl(var(--card))] bg-[hsl(var(--card))]"
          >
            {/* Spacer for toggle column */}
            <span className="w-4 shrink-0" />
            <span className="shrink-0 w-24 text-xs font-medium text-[var(--status-info-fg)] uppercase tracking-wide">
              {ui('accountTreeCode')}
            </span>
            <span className="flex-1 min-w-0 text-xs font-medium text-[var(--status-info-fg)] uppercase tracking-wide">
              {ui('name')}
            </span>
            <span className="shrink-0 w-40 text-xs font-medium text-[var(--status-info-fg)] uppercase tracking-wide">
              {ui('accountTreeFilterType')}
            </span>
          </div>

          {/* ── Tree rows ── */}
          <div role="rowgroup" className="divide-y divide-[hsl(var(--card))]">
            {visibleRows.map((item) => (
              <AccountTreeRow
                key={item.id}
                item={item}
                isExpanded={expanded.has(item.id)}
                isSelected={item.id === selectedId}
                onToggle={handleToggle}
                onRowClick={handleRowClick}
                ui={ui}
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
        allAccounts={effectiveData}
        apiBaseUrl={apiBaseUrl}
        token={token}
        data-testid="NewAccountModal__acc34a"
      />
    </div>
  );
}
