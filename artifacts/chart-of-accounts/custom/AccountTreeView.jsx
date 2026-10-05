import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { ACCOUNT_TYPE_UI_KEYS, accountTypeLabel, ELEMENT_LEVEL_UI_KEYS, elementLevelLabel } from './accountTypeLabels';
import { useChartOfAccountsFilters } from './chartOfAccountsFilters';
import {
  restorePersistedExpanded,
  setExpanded,
  setSelectedRecord,
  setTreeData,
  useChartOfAccountsTree,
} from './chartOfAccountsTreeStore';
import { ChartOfAccountsToolbarSlot } from './ChartOfAccountsToolbarSlot';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { runInlineToggleRequest } from '@/components/contract-ui/DataTable.jsx';
import { RowExpandToggle } from '@/components/contract-ui/RowExpandToggle.jsx';
import { ListProgressBar } from '@/components/contract-ui/ListProgressBar.jsx';

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

// The columns ListView reads (via onColumnsReady) for its Sort popover and Print.
// Only Código and Nombre are sortable (ETP-5593): folders have no type/status and the
// level is implied by the hierarchy. The never-displayed YTD amount columns were removed
// for the same reason — they leaked into Sort and Print.
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
      sortable: false,
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
      sortable: false,
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
      sortable: false,
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
 * Defaults: every folder is collapsed on first-ever load. Expand/collapse state lives
 * in `chartOfAccountsTreeStore` and is persisted to localStorage (per browser) so
 * navigating away and back to this window restores exactly what the user left open.
 *
 * Toolbar (ETP-5593): the tree renders no toolbar of its own. Its controls — Expandir /
 * Contraer todo, the search box and the account-type filter — are
 * `AccountTreeView.ToolbarQuickFilter` (ChartOfAccountsToolbarSlot), which ListView
 * renders in its own toolbar row. "Nueva subcuenta" is ListView's New button
 * (`newRecordComponent: NewSubAccountCreateModal`); it defaults the parent to the row
 * selected here, shared through the store.
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

function matchesTextFilter(item, text) {
  if (!text) return true;
  const q = text.toLowerCase();
  return [item.searchKey, item.name].some((value) => String(value ?? '').toLowerCase().includes(q));
}

// A null account type means "all types".
function matchesAccountType(item, accountType) {
  return !accountType || item.accountType === accountType;
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
          <Skeleton className="h-4 w-4 shrink-0" data-testid="Skeleton__c9cb6e" />
          <Skeleton className="h-4 w-24 shrink-0" data-testid="Skeleton__c9cb6e" />
          <Skeleton className="h-4 flex-1" data-testid="Skeleton__c9cb6e" />
          <Skeleton className="h-4 w-32 shrink-0" data-testid="Skeleton__c9cb6e" />
          <Skeleton className="h-4 w-40 shrink-0" data-testid="Skeleton__c9cb6e" />
          <Skeleton className="h-4 w-10 shrink-0" data-testid="Skeleton__c9cb6e" />
        </div>
      ))}
    </div>
  );
}

// Columns the toolbar's Sort popover may pick (see buildTreeColumns). Anything else —
// including ListView's own default (`creationDate`) — leaves the tree in code order.
const SORTABLE_KEYS = new Set(['searchKey', 'name']);

/**
 * Sorts the siblings at EVERY level by `key` (ETP-5593), returning new arrays — the
 * input tree (already in code order from buildGroupedTree) is not mutated. Folders
 * stay with their children: only the order among siblings changes.
 */
function sortTree(nodes, key, direction) {
  const factor = direction === 'desc' ? -1 : 1;
  const compare = (a, b) => factor * String(a[key] ?? '').localeCompare(String(b[key] ?? ''), undefined, { sensitivity: 'base' });
  const walk = (list) => list
    .map((node) => (node.children?.length ? { ...node, children: walk(node.children) } : node))
    .sort(compare);
  return walk(nodes);
}

function AccountTreeRow({ item, isExpanded, isSelected, onToggle, onRowClick, ui, activeChecked, activeDisabled, onActiveToggle }) {
  const isSummary = item.summaryLevel === 'Y';
  const indent = (item.depth ?? 0) * 16;
  const isProtected = isProtectedLeafCode(item);

  return (
    <TableRow
      data-testid={`account-tree-row-${item.id}`}
      aria-selected={isSelected}
      data-state={isSelected ? 'selected' : undefined}
      className={[
        'cursor-pointer text-sm select-none',
        isSummary ? 'font-semibold text-[hsl(var(--foreground))]' : 'font-normal text-[hsl(var(--muted-foreground))]',
      ].join(' ')}
      onClick={() => onRowClick(item)}
    >
      {/* Code — indent spacer (grows with depth), expand toggle, code in Space Mono */}
      <TableCell data-testid="TableCell__c9cb6e">
        <span className="flex items-center gap-2">
          {indent > 0 && <span style={{ minWidth: indent, flexShrink: 0 }} />}
          {item.hasChildren ? (
            <RowExpandToggle
              expanded={isExpanded}
              orientation="horizontal"
              stopPropagation
              onToggle={() => onToggle(item.id)}
              iconTestId={`account-tree-toggle-icon-${item.id}`}
              data-testid={`account-tree-toggle-${item.id}`} />
          ) : (
            <span className="w-7 shrink-0" />
          )}
          <span className="font-code tabular-nums">{item.searchKey}</span>
        </span>
      </TableCell>

      {/* Account name */}
      <TableCell data-testid="TableCell__c9cb6e">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{item.name}</span>
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
      </TableCell>

      <TableCell
        className="text-[hsl(var(--muted-foreground))]"
        data-testid="TableCell__c9cb6e">
        {elementLevelLabel(ui, item.elementLevel)}
      </TableCell>

      <TableCell
        className="text-[hsl(var(--muted-foreground))]"
        data-testid="TableCell__c9cb6e">
        {accountTypeLabel(ui, item.accountType)}
      </TableCell>

      {/* Status toggle — leaf rows only, disabled for protected placeholders. Folder rows
          keep the (empty) cell so the columns stay aligned (ETP-5399). */}
      <TableCell onClick={(e) => e.stopPropagation()} data-testid="TableCell__c9cb6e">
        {item.isVirtual ? (
          <span aria-hidden="true" data-testid={`account-tree-active-placeholder-${item.id}`} />
        ) : (
          <Switch
            checked={activeChecked}
            disabled={isProtected || activeDisabled}
            onCheckedChange={(next) => onActiveToggle(item, next)}
            aria-label={ui('active')}
            data-testid={`account-tree-active-toggle-${item.id}`}
          />
        )}
      </TableCell>
    </TableRow>
  );
}

const selectExpanded = (s) => s.expanded;
const selectSavedGeneration = (s) => s.savedGeneration;

/**
 * AccountTreeView — main component.
 *
 * Props it uses:
 *   data                — flat list of account records from NEO (with tree fields).
 *                         ListView.jsx only ever hands this one paginated BATCH_SIZE
 *                         page (`hook.items`), so it is used as the initial/fallback
 *                         dataset — see the self-fetch note below.
 *   onNavigate          — (item) => void — called when a non-virtual row is clicked (receives the full row object)
 *   onDataMutated       — () => void  — called after a new sub-account is saved
 *   token / apiBaseUrl  — used for the self-fetch and the active toggle
 *   sortColumn / sortDirection — ListView's sort (toolbar Sort popover). Only `searchKey`
 *                         and `name` reorder the tree (siblings at every level); anything
 *                         else keeps the default code order.
 *   onRecordCountChange — ListView's opt-in count hook: the tree reports its number of
 *                         ROOT folders (unfiltered), which the breadcrumb badge shows.
 *   userRefreshTrigger  — bumped by ListView's Refresh button (ETP-5387).
 *
 * Self-fetch: when `apiBaseUrl` is provided, the component fetches its own complete
 * leaf-account dataset (see FULL_FETCH_END_ROW above) on mount and after every save,
 * and renders that instead of the paginated `data` prop once the fetch resolves. This
 * is what makes every root-level heading (not just the ones with leaves in ListView's
 * first page) show up. Until the fetch resolves (or if it fails, or if `apiBaseUrl` is
 * absent — e.g. direct unit tests that only pass `data`), the component renders `data`
 * as-is, so plain `data`-driven tests keep working without needing to mock `fetch`.
 *
 * Filters (ETP-5593) come from the URL (`accountType`, `q` — chartOfAccountsFilters.js),
 * written by the toolbar slot. A filter SEEDS the expansion (every folder leading to a
 * match opens when the filter changes) but the user can still collapse; clearing the
 * filter restores the expansion the user had before filtering.
 *
 * The remaining props mirror what ListView passes to a headerTable component and are
 * accepted but not acted on here, since the tree has its own navigation model.
 */
export default function AccountTreeView({
  data = [],
  onNavigate,
  onDataMutated,
  token,
  apiBaseUrl,
  sortColumn,
  sortDirection,
  onColumnsReady,
  onRecordCountChange,
  // Accepted but intentionally unused — ListView always passes them
  entity: _entity,
  specName: _specName,
  meta: _meta,
  navigate: _navigate,
  selectedRows: _selectedRows,
  onSelectionChange: _onSelectionChange,
  isRowSelectable: _isRowSelectable,
  compact: _compact,
  onSort: _onSort,
  onSortSelect: _onSortSelect,
  onClearSort: _onClearSort,
  isDefaultSort: _isDefaultSort,
  api: _api,
  labelOverrides: _labelOverrides,
  onFilterChange: _onFilterChange,
  onClearAllFilters: _onClearAllFilters,
  columnFilters: _columnFilters,
  onCloneRow: _onCloneRow,
  rowFilter: _rowFilter,
  hoverRowActions: _hoverRowActions,
  clearSelectionTrigger: _clearSelectionTrigger,
  deselectTrigger: _deselectTrigger,
  deselectRowIds: _deselectRowIds,
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

  // A sub-account saved from the toolbar's "Nueva subcuenta" (NewSubAccountCreateModal)
  // bumps the store's savedGeneration: refetch the complete dataset, in addition to
  // whatever `onDataMutated` triggers on ListView's side (its own one-page refresh).
  const savedGeneration = useChartOfAccountsTree(selectSavedGeneration);
  const lastSavedGenerationRef = useRef(savedGeneration);
  useEffect(() => {
    if (savedGeneration === lastSavedGenerationRef.current) return;
    lastSavedGenerationRef.current = savedGeneration;
    onDataMutated?.();
    refetchFull();
  }, [savedGeneration, onDataMutated, refetchFull]);

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
  // A quiet background refetch (save, status toggle) over a tree already on screen.
  const showProgressBar = isFetchingFull && !showBlockingSkeleton;

  const { tree, indexById } = useMemo(() => buildGroupedTree(effectiveData), [effectiveData]);

  const sortedTree = useMemo(() => {
    if (!SORTABLE_KEYS.has(sortColumn)) return tree;
    if (sortColumn === 'searchKey' && sortDirection !== 'desc') return tree; // already code ASC
    return sortTree(tree, sortColumn, sortDirection);
  }, [tree, sortColumn, sortDirection]);

  // The breadcrumb badge counts ROOT accounts, from the unfiltered tree (ETP-5593).
  useEffect(() => {
    onRecordCountChange?.(tree.length);
  }, [onRecordCountChange, tree.length]);

  const { accountType, query } = useChartOfAccountsFilters();
  const filters = useMemo(() => ({ text: query.trim(), accountType }), [query, accountType]);
  const hasActiveFilter = filters.text !== '' || filters.accountType !== null;

  const filteredTree = useMemo(
    () => (hasActiveFilter ? filterTree(sortedTree, filters) : sortedTree),
    [sortedTree, filters, hasActiveFilter],
  );

  const expanded = useChartOfAccountsTree(selectExpanded);

  // Filter × expansion. When the filter changes, open every folder leading to a match
  // (`persist: false` — a filter's expansion is temporary). The user can still collapse
  // afterwards: later refetches under the same filter do NOT re-seed. Clearing the filter
  // restores the user's own (persisted) expansion.
  //
  // With a self-fetch, the first rows on screen may be ListView's partial page; a seed
  // made from them only counts once the full dataset has loaded, so a filter that came
  // in the URL (a shared link) also opens the folders whose matches were not on that page.
  const fullDataReady = !apiBaseUrl || hasLoadedOnce;
  const filterKey = hasActiveFilter ? `${filters.accountType ?? ''}|${filters.text}` : null;
  const seedRef = useRef({ key: null, seeded: false });
  useEffect(() => {
    const seed = seedRef.current;
    if (filterKey === null) {
      if (seed.key !== null) {
        restorePersistedExpanded();
        seedRef.current = { key: null, seeded: false };
      }
      return;
    }
    if (seed.key === filterKey && (seed.seeded || tree.length === 0)) return;
    setExpanded(new Set(collectVirtualIds(filteredTree)), { persist: false });
    seedRef.current = { key: filterKey, seeded: tree.length > 0 && fullDataReady };
  }, [filterKey, filteredTree, tree.length, fullDataReady]);

  // Share the accounts and the folders currently shown (for "Expandir todo") with the
  // toolbar slot and the create modal.
  useEffect(() => {
    setTreeData({ accounts: effectiveData, shownFolderIds: collectVirtualIds(filteredTree) });
  }, [effectiveData, filteredTree]);

  useEffect(() => {
    onColumnsReady?.(treeColumns);
  }, [onColumnsReady, treeColumns]);

  const [selectedId, setSelectedId] = useState(null);

  // The create modal defaults the parent to the selected row. It needs the UNFILTERED
  // node (filtered folders have pruned children), refreshed after every refetch.
  useEffect(() => {
    setSelectedRecord(selectedId ? (indexById.get(selectedId) ?? null) : null);
  }, [selectedId, indexById]);
  // A selection belongs to this mount: coming back from a record starts with none. The
  // same goes for a filter's temporary expansion — the next mount starts from the
  // persisted one.
  // Resetting the seed ref matters under StrictMode's simulated remount, which keeps refs:
  // without it a URL filter would not re-seed after this cleanup.
  useEffect(() => () => {
    setSelectedRecord(null);
    restorePersistedExpanded();
    seedRef.current = { key: null, seeded: false };
  }, []);

  const handleToggle = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    }, { persist: !hasActiveFilter });
  }, [hasActiveFilter]);

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
    () => flattenVisible(filteredTree, expanded),
    [filteredTree, expanded],
  );

  let treeBody;
  if (showBlockingSkeleton) {
    treeBody = <AccountTreeSkeleton data-testid="AccountTreeSkeleton__c9cb6e" />;
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
      <Table className="table-fixed" data-testid="account-tree-table">
        <colgroup>
          <col className="w-[16rem]" />
          <col />
          <col className="w-40" />
          <col className="w-44" />
          <col className="w-24" />
        </colgroup>
        <TableHeader data-testid="TableHeader__c9cb6e">
          <TableRow className="hover:bg-transparent" data-testid="TableRow__c9cb6e">
            <TableHead data-testid="TableHead__c9cb6e">{ui('accountTreeCode')}</TableHead>
            <TableHead data-testid="TableHead__c9cb6e">{ui('name')}</TableHead>
            <TableHead data-testid="TableHead__c9cb6e">{ui('accountTreeFilterElementLevel')}</TableHead>
            <TableHead data-testid="TableHead__c9cb6e">{ui('accountTreeFilterType')}</TableHead>
            <TableHead data-testid="TableHead__c9cb6e">{ui('accountTreeFilterActive')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody data-testid="TableBody__c9cb6e">
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
                data-testid="AccountTreeRow__c9cb6e" />
            );
          })}
        </TableBody>
      </Table>
    );
  }

  return (
    <div data-testid="account-tree" {...rest}>
      {showProgressBar && <ListProgressBar testId="account-tree-progress" data-testid="ListProgressBar__c9cb6e" />}
      {treeBody}
    </div>
  );
}

// ETP-5188 convention: ListView renders this in its own toolbar row (ETP-5593).
AccountTreeView.ToolbarQuickFilter = ChartOfAccountsToolbarSlot;
