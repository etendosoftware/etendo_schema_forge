import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import NewAccountModal from './NewAccountModal';
import { ACCOUNT_TYPE_UI_KEYS, accountTypeLabel, ELEMENT_LEVEL_UI_KEYS, elementLevelLabel } from './accountTypeLabels';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { runInlineToggleRequest } from '@/components/contract-ui/DataTable.jsx';

import { useApiFetch } from '@/auth/useApiFetch.js';
// ETP-5101: this component's self-fetch (below) bypasses useEntity/normalizeRecord, the
// place that normally remembers each row's `updated` concurrency token. Without this, the
// grid's inline active toggle (runInlineToggleRequest) PATCHes with no remembered token and
// the backend correctly refuses it with 400 missing_updated, no matter how fresh the row is.
import { rememberRecordVersions } from '@etendosoftware/app-shell-core/lib/recordVersions.js';
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
      filterable: false,
    },
    {
      key: 'name',
      column: 'accountTreeFilterName',
      type: 'string',
      label: ui('accountTreeFilterName'),
      required: true,
      filterable: false,
    },
    {
      key: 'elementLevel',
      column: 'accountTreeFilterElementLevel',
      type: 'enum',
      label: ui('accountTreeFilterElementLevel'),
      required: true,
      enumLabels: Object.fromEntries(
        Object.entries(ELEMENT_LEVEL_UI_KEYS).map(([code, uiKey]) => [code, ui(uiKey)]),
      ),
      filterable: false,
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
      filterable: false,
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
      filterable: false,
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
 * Returns { tree: rootNodes[], indexById: Map<id, node> }. The index contains real
 * accounts and virtual folders from the unfiltered tree.
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
          indexById.set(folder.id, folder);
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
        indexById.set(folder.id, folder);
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
 * Recursively collects the id of every virtual (folder) node in a tree, at every
 * depth — not just the root siblings. Shared by `expandAll` and by the filter's
 * ancestor-auto-expand logic (see `filterTree` below) so both use the same genuine
 * deep walk. `expandAll`'s previous bug was exactly a shallow, root-array-only
 * check — this helper exists so that mistake has one fix point, not two.
 */
function collectVirtualIds(nodes, acc = []) {
  for (const node of nodes) {
    if (node.isVirtual) {
      acc.push(node.id);
      if (node.children?.length) collectVirtualIds(node.children, acc);
    }
  }
  return acc;
}

const ALL_FILTER = 'all';

function matchesTextFilter(item, text) {
  if (!text) return true;
  const q = text.toLowerCase();
  return [item.searchKey, item.name].some((value) => String(value ?? '').toLowerCase().includes(q));
}

function matchesAccountType(item, accountType) {
  return accountType === ALL_FILTER || item.accountType === accountType;
}

/** A leaf matches when it satisfies both active filter criteria. */
function matchesLeafFilter(item, filters) {
  return matchesTextFilter(item, filters.text) && matchesAccountType(item, filters.accountType);
}

/**
 * Keeps a virtual folder's complete subtree while still applying the account
 * type filter to descendant leaves. This is used only when the folder itself
 * matches the text query, so unrelated branches remain filtered out.
 */
function filterTreeByAccountType(nodes, accountType) {
  const result = [];
  for (const node of nodes) {
    if (node.isVirtual) {
      const children = filterTreeByAccountType(node.children ?? [], accountType);
      if (children.length > 0) result.push({ ...node, children });
    } else if (matchesAccountType(node, accountType)) {
      result.push(node);
    }
  }
  return result;
}

/**
 * Recursively prunes a tree, keeping only leaves that match `filters` and every
 * virtual ancestor that leads to at least one match. Must walk `node.children`
 * at every depth — a shallow top-level-only check here would repeat the exact
 * `expandAll` bug (Task 1): matches nested more than one level deep would be
 * silently dropped instead of surfaced.
 */
function filterTree(nodes, filters) {
  const result = [];
  for (const node of nodes) {
    if (node.isVirtual) {
      const children = matchesTextFilter(node, filters.text)
        ? filterTreeByAccountType(node.children ?? [], filters.accountType)
        : filterTree(node.children ?? [], filters);
      if (children.length > 0) {
        result.push({ ...node, children });
      }
    } else if (matchesLeafFilter(node, filters)) {
      result.push(node);
    }
  }
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

/**
 * Full-page loading state for the initial (never-yet-settled) self-fetch — mirrors
 * DataTable.jsx's TableSkeleton convention. Matches the real header row's 5 columns
 * (code, name, Element Level, account type, active) plus the toggle-chevron spacer,
 * so it doesn't read as a stale/different table while it's showing.
 */
function AccountTreeSkeleton() {
  return (
    <div data-testid="account-tree-skeleton" className="divide-y divide-[hsl(var(--border-subtle))]">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5" style={{ opacity: 1 - i * 0.1 }}>
          <Skeleton className="h-4 w-4 shrink-0" />
          <Skeleton className="h-4 w-24 shrink-0" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-32 shrink-0" />
          <Skeleton className="h-4 w-40 shrink-0" />
          <Skeleton className="h-4 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}

function AccountTreeRow({ item, isExpanded, isSelected, onToggle, onRowClick, ui, activeChecked, activeDisabled, onActiveToggle }) {
  const isSummary = item.summaryLevel === 'Y';
  const indent = (item.depth ?? 0) * 16;
  const isProtected = isProtectedLeafCode(item);

  return (
    <div
      data-testid={`account-tree-row-${item.id}`}
      role="row"
      aria-selected={isSelected}
      className={[
        'flex items-center gap-3 px-4 py-2.5 cursor-pointer text-sm select-none transition-colors',
        isSelected ? 'bg-[hsl(var(--muted))]' : 'hover:bg-[hsl(var(--muted))]/50',
        isSummary ? 'font-semibold text-[hsl(var(--foreground))]' : 'font-normal text-[hsl(var(--muted-foreground))]',
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
            className="flex items-center justify-center w-4 h-4 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
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
      <span className="shrink-0 w-24 font-mono text-xs text-[hsl(var(--muted-foreground))] tabular-nums">
        {item.searchKey}
      </span>

      {/* Account name — fills remaining space */}
      <span className="flex-1 min-w-0 truncate flex items-center gap-1.5">
        {item.name}
        {isProtected && (
          <Lock
            size={12}
            className="shrink-0 text-[hsl(var(--text-disabled))]"
            data-testid={`account-tree-locked-${item.id}`}
            role="img"
            aria-label={ui('accountTreeReadOnlyPlaceholder')}
          />
        )}
      </span>

      {/* Element level */}
      <span className="shrink-0 w-32 truncate text-[hsl(var(--muted-foreground))]">
        {elementLevelLabel(ui, item.elementLevel)}
      </span>

      {/* Account type */}
      <span className="shrink-0 w-40 truncate text-[hsl(var(--muted-foreground))]">
        {accountTypeLabel(ui, item.accountType)}
      </span>

      {/* Active/inactive toggle — leaf rows only, disabled for protected placeholders.
          Folder rows keep an empty cell of the same width (ETP-5399): without it the
          flex-1 name cell grows and pushes Element Level / Account Type out of line. */}
      {item.isVirtual && (
        <span
          className="shrink-0 w-10"
          aria-hidden="true"
          data-testid={`account-tree-active-placeholder-${item.id}`}
        />
      )}
      {!item.isVirtual && (
        <span
          className="shrink-0 flex items-center justify-center w-10"
          onClick={(e) => e.stopPropagation()}
        >
          <Switch
            checked={activeChecked}
            disabled={isProtected || activeDisabled}
            onCheckedChange={(next) => onActiveToggle(item, next)}
            aria-label={ui('active')}
            data-testid={`account-tree-active-toggle-${item.id}`}
          />
        </span>
      )}
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
  // Bumped by ListView's toolbar Refresh button only (ETP-5387). Destructured so it never
  // reaches the DOM through `...rest`.
  userRefreshTrigger = 0,
  ...rest
}) {
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);
  const treeColumns = useMemo(() => buildTreeColumns(ui), [ui]);

  // Self-fetch: the full leaf-account list, loaded directly (bypassing ListView's
  // one-page `data` prop) whenever `apiBaseUrl` is available. See the component
  // docblock above for why the tree needs this instead of incremental pagination.
  const [fetchedData, setFetchedData] = useState(null);
  const [isFetchingFull, setIsFetchingFull] = useState(() => !!apiBaseUrl);
  const [fetchGeneration, setFetchGeneration] = useState(0);
  // "Has any self-fetch attempt ever settled, success or failure?" — set once in
  // the effect's `finally` and never reset. This is deliberately NOT the same as
  // `fetchedData !== null`: a failed first attempt leaves `fetchedData` null
  // forever, but must still stop gating on the initial skeleton on every later
  // background retry (save, active-toggle) — otherwise a retry after a failed
  // first load would wipe the already-visible fallback tree and re-show the
  // full-page skeleton for what should be a quiet background refresh.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  // ETP-5387 — true while a refetch the USER asked for (toolbar Refresh) is in flight. Unlike
  // the quiet background refetches (save, active toggle), it blocks the tree with the same
  // skeleton as the first load, so pressing Refresh visibly does something. Cleared when that
  // fetch settles; on failure the previous tree comes back (fetchedData is only replaced on
  // success) alongside the error toast.
  const [isUserRefreshing, setIsUserRefreshing] = useState(false);

  useEffect(() => {
    if (!apiBaseUrl) return undefined;

    let cancelled = false;

    (async () => {
      setIsFetchingFull(true);
      try {
        const res = await apiFetch(
          `/elementValue?_startRow=0&_endRow=${FULL_FETCH_END_ROW}`,
          { token },
        );
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const json = await res.json();
        const rows = json?.response?.data;
        if (!cancelled && Array.isArray(rows)) {
          rememberRecordVersions(rows);
          setFetchedData(rows);
        }
      } catch {
        if (!cancelled) {
          toast.error(ui('accountTreeFetchError'));
        }
      } finally {
        if (!cancelled) {
          setIsFetchingFull(false);
          setHasLoadedOnce(true);
          setIsUserRefreshing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBaseUrl, token, apiFetch, fetchGeneration]);

  // Refetch the complete dataset after a new sub-account is saved, in addition to
  // whatever `onDataMutated` triggers on the caller's side (ListView's own
  // one-page refresh).
  const refetchFull = useCallback(() => setFetchGeneration((g) => g + 1), []);

  // React to ListView's Refresh button. The initial value is the baseline, not a request —
  // the mount-time fetch above already covers it. Without `apiBaseUrl` there is nothing to
  // refetch, so the flag must not be raised (it would never be cleared).
  const lastUserRefreshTriggerRef = useRef(userRefreshTrigger);
  useEffect(() => {
    if (userRefreshTrigger === lastUserRefreshTriggerRef.current) return;
    lastUserRefreshTriggerRef.current = userRefreshTrigger;
    if (!apiBaseUrl) return;
    setIsUserRefreshing(true);
    refetchFull();
  }, [userRefreshTrigger, apiBaseUrl, refetchFull]);

  const [optimisticActiveToggles, setOptimisticActiveToggles] = useState({});
  const [savingActiveToggles, setSavingActiveToggles] = useState({});

  const handleActiveToggle = useCallback((item, nextChecked) => {
    const toggleKey = `${item.id}:active`;
    runInlineToggleRequest({
      apiBaseUrl,
      entity: 'elementValue',
      row: { id: item.id },
      col: { key: 'active' },
      token,
      checked: nextChecked,
      toggleKey,
      setOptimisticToggles: setOptimisticActiveToggles,
      setSavingToggles: setSavingActiveToggles,
      onDataMutated: refetchFull,
      ui,
    }).catch((err) => {
      console.error('[AccountTreeView] Failed to toggle account active status:', err);
    });
  }, [apiBaseUrl, token, refetchFull, ui]);

  // Until the self-fetch resolves — or when it's not applicable (`apiBaseUrl` absent,
  // e.g. direct unit tests) — fall back to the `data` prop so behavior is unchanged.
  const effectiveData = fetchedData ?? data;

  // True only from first render through the FIRST attempt settling (success or
  // failure); false forever after, including every later background refetch. Gates
  // the tree render so the partial `data` prop is never painted while the real
  // dataset is still in flight — see the component docblock and ETP-5387.
  const showInitialSkeleton = !!apiBaseUrl && !hasLoadedOnce && isFetchingFull;
  const showBlockingSkeleton = showInitialSkeleton || isUserRefreshing;

  const { tree, indexById } = useMemo(() => buildGroupedTree(effectiveData), [effectiveData]);

  const [expanded, setExpanded] = useState(loadPersistedExpanded);

  // Persist expand/collapse state so it survives navigating away and back.
  useEffect(() => {
    persistExpanded(expanded);
  }, [expanded]);

  const [filterText, setFilterText] = useState('');
  const [filterAccountType, setFilterAccountType] = useState(ALL_FILTER);

  const hasActiveFilter =
    filterText.trim() !== '' || filterAccountType !== ALL_FILTER;

  const filters = useMemo(
    () => ({ text: filterText.trim(), accountType: filterAccountType }),
    [filterText, filterAccountType],
  );

  const filteredTree = useMemo(
    () => (hasActiveFilter ? filterTree(tree, filters) : tree),
    [tree, filters, hasActiveFilter],
  );

  // While a filter is active, every surviving virtual folder must be expanded —
  // this OVERRIDES the manual `expanded` state without mutating it, so clearing
  // the filter reveals the manual state exactly as the user left it.
  const effectiveExpanded = useMemo(
    () => (hasActiveFilter ? new Set(collectVirtualIds(filteredTree)) : expanded),
    [hasActiveFilter, filteredTree, expanded],
  );

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
    () => flattenVisible(filteredTree, effectiveExpanded),
    [filteredTree, effectiveExpanded],
  );

  const selectedRecord = useMemo(
    () => (selectedId ? visibleRows.find((row) => row.id === selectedId) : null),
    [visibleRows, selectedId],
  );

  // Filtered virtual nodes have pruned children; modal resolution needs the full tree node.
  const currentRecordForModal = useMemo(
    () => (selectedRecord ? (indexById.get(selectedRecord.id) ?? selectedRecord) : null),
    [selectedRecord, indexById],
  );

  const expandAll = useCallback(
    () => setExpanded(new Set(collectVirtualIds(tree))),
    [tree],
  );
  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  const handleSaved = useCallback(() => {
    setIsModalOpen(false);
    onDataMutated?.();
    refetchFull();
  }, [onDataMutated, refetchFull]);

  let treeBody;
  if (showBlockingSkeleton) {
    treeBody = <AccountTreeSkeleton />;
  } else if (effectiveData.length === 0) {
    treeBody = (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        {ui('accountTreeNoAccounts')}
      </div>
    );
  } else if (hasActiveFilter && visibleRows.length === 0) {
    treeBody = (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        {ui('noResultsFound')}
      </div>
    );
  } else {
    treeBody = (
      <>
        {/* ── Column headers ── */}
        <div
          role="row"
          className="flex items-center gap-3 px-4 h-11 border-b border-[hsl(var(--border-subtle))]"
        >
          {/* Spacer for toggle column */}
          <span className="w-4 shrink-0" />
          <span className="shrink-0 w-24 text-sm font-medium text-[hsl(var(--muted-foreground))]">
            {ui('accountTreeCode')}
          </span>
          <span className="flex-1 min-w-0 text-sm font-medium text-[hsl(var(--muted-foreground))]">
            {ui('name')}
          </span>
          <span className="shrink-0 w-32 text-sm font-medium text-[hsl(var(--muted-foreground))]">
            {ui('accountTreeFilterElementLevel')}
          </span>
          <span className="shrink-0 w-40 text-sm font-medium text-[hsl(var(--muted-foreground))]">
            {ui('accountTreeFilterType')}
          </span>
          <span className="shrink-0 w-10 text-sm font-medium text-[hsl(var(--muted-foreground))] text-center">
            {ui('accountTreeFilterActive')}
          </span>
        </div>

        {/* ── Tree rows ── */}
        <div role="rowgroup" className="divide-y divide-[hsl(var(--border-subtle))]">
          {visibleRows.map((item) => {
            const toggleKey = `${item.id}:active`;
            const rawActive = Object.hasOwn(optimisticActiveToggles, toggleKey)
              ? optimisticActiveToggles[toggleKey]
              : item.active;
            return (
              <AccountTreeRow
                key={item.id}
                item={item}
                isExpanded={expanded.has(item.id)}
                isSelected={item.id === selectedId}
                onToggle={handleToggle}
                onRowClick={handleRowClick}
                ui={ui}
                activeChecked={rawActive === true || rawActive === 'Y' || rawActive === 'true'}
                activeDisabled={!!savingActiveToggles[toggleKey]}
                onActiveToggle={handleActiveToggle}
                data-testid="AccountTreeRow__acc34a"
              />
            );
          })}
        </div>
      </>
    );
  }

  return (
    <div data-testid="account-tree" role="grid" {...rest}>
      <div
        data-testid="account-tree-controls"
        className="sticky top-0 z-20 bg-card"
      >
        {/* ── Toolbar ── */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-[hsl(var(--border-subtle))]">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={expandAll}
              data-testid="account-tree-expand-button"
            >
              {ui('expand')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={collapseAll}
              data-testid="account-tree-collapse-button"
            >
              {ui('collapse')}
            </Button>
            {isFetchingFull && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-3 w-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                {ui('accountTreeLoadingFull')}
              </span>
            )}
          </div>

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="shrink-0 whitespace-nowrap"
            data-testid="account-tree-new-subaccount-button"
          >
            + {ui('newSubAccount')}
          </Button>
        </div>

        {/* ── Filter row ── */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-[hsl(var(--border-subtle))]">
          <input
            type="text"
            data-testid="account-tree-filter-text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder={ui('search')}
            className="h-8 w-full min-w-0 rounded-md border border-[hsl(var(--border-control))] bg-card px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[hsl(var(--foreground))] sm:w-auto sm:min-w-[12rem] sm:flex-1 sm:max-w-xs"
          />
          <select
            data-testid="account-tree-filter-type"
            value={filterAccountType}
            onChange={(e) => setFilterAccountType(e.target.value)}
            className="h-8 shrink-0 rounded-md border border-[hsl(var(--border-control))] bg-card px-2 text-xs cursor-pointer"
          >
            <option value={ALL_FILTER}>{ui('all')}</option>
            {Object.entries(ACCOUNT_TYPE_UI_KEYS).map(([code, uiKey]) => (
              <option key={code} value={code}>{ui(uiKey)}</option>
            ))}
          </select>
        </div>
      </div>

      {treeBody}

      {/* ── New Sub-account modal ── */}
      <NewAccountModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={handleSaved}
        currentRecord={currentRecordForModal}
        allAccounts={effectiveData}
        apiBaseUrl={apiBaseUrl}
        token={token}
        data-testid="NewAccountModal__acc34a"
      />
    </div>
  );
}
