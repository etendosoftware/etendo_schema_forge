import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { DistinctValuesFilter } from '@etendosoftware/app-shell-core/components/ui/distinct-values-filter.jsx';
import { ACCOUNT_TYPE_UI_KEYS } from './accountTypeLabels';
import { useChartOfAccountsFilters } from './chartOfAccountsFilters';
import {
  collapseAll,
  expandAll,
  selectHasExpandedFolder,
  useChartOfAccountsTree,
} from './chartOfAccountsTreeStore';

/**
 * ChartOfAccountsToolbarSlot — the Chart of Accounts controls, rendered by ListView in
 * its OWN toolbar row through `AccountTreeView.ToolbarQuickFilter` (ETP-5188 convention,
 * ETP-5593). Left to right: Expandir/Contraer todo · Buscar · Tipo de cuenta.
 *
 * - The expand button is one dynamic control: "Expandir todo" while no shown folder is
 *   open, "Contraer todo" as soon as one is (by this button or by a row's chevron).
 *   State comes from `chartOfAccountsTreeStore`, shared with the tree.
 * - Search and type live in the URL (`q`, `accountType` — see chartOfAccountsFilters.js).
 *   The search box keeps a local draft so typing never waits on a URL round-trip, and
 *   follows the URL when it changes from outside (Back, a shared link).
 */
export function ChartOfAccountsToolbarSlot() {
  const ui = useUI();
  const { accountType, query, setAccountType, setQuery } = useChartOfAccountsFilters();
  const hasExpandedFolder = useChartOfAccountsTree(selectHasExpandedFolder);
  const filtering = query.trim() !== '' || accountType !== null;

  const [draft, setDraft] = useState(query);
  useEffect(() => { setDraft(query); }, [query]);

  // "Todos los tipos de cuenta" first, then the six types by translated label (A→Z).
  const typeCodes = useMemo(
    () => Object.keys(ACCOUNT_TYPE_UI_KEYS)
      .sort((a, b) => ui(ACCOUNT_TYPE_UI_KEYS[a]).localeCompare(ui(ACCOUNT_TYPE_UI_KEYS[b]))),
    [ui],
  );

  // A filter's expansion is temporary (see AccountTreeView), so don't persist it.
  const persistOptions = { persist: !filtering };

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="coa-toolbar">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 text-muted-foreground font-normal h-9 px-3 rounded-lg bg-card"
        onClick={() => (hasExpandedFolder ? collapseAll(persistOptions) : expandAll(persistOptions))}
        data-testid="coa-toggle-expand-all"
      >
        {hasExpandedFolder
          ? <ArrowUp className="h-3.5 w-3.5" data-testid="ArrowUp__coa" />
          : <ArrowDown className="h-3.5 w-3.5" data-testid="ArrowDown__coa" />}
        {hasExpandedFolder ? ui('collapseAll') : ui('expandAll')}
      </Button>

      <label
        className="flex h-9 w-56 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground focus-within:ring-2 focus-within:ring-focus-ring"
        data-testid="coa-search"
      >
        <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" data-testid="Search__coa" />
        <input
          type="search"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setQuery(e.target.value);
          }}
          placeholder={ui('search')}
          aria-label={ui('search')}
          className="min-w-0 flex-1 bg-transparent text-foreground placeholder:text-text-secondary focus:outline-none"
          data-testid="coa-search-input"
        />
      </label>

      <DistinctValuesFilter
        value={accountType}
        onChange={setAccountType}
        codes={typeCodes}
        labelFor={(code) => ui(ACCOUNT_TYPE_UI_KEYS[code])}
        allLabel={ui('allAccountTypes')}
        heading={ui('accountTreeFilterType')}
        searchable={false}
        searchPlaceholder={ui('searchValues')}
        triggerTestId="coa-filter-account-type"
        data-testid="DistinctValuesFilter__coatype" />
    </div>
  );
}

export default ChartOfAccountsToolbarSlot;
