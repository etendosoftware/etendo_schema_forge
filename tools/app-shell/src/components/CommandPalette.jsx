import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUI, useMenuLabel } from '@/i18n';
import { useGlobalSearch } from '@/components/global-search/GlobalSearchContext.jsx';
import { useVectorSearchContracts } from '@/hooks/useVectorSearchContracts.js';
import { useRecentSearches } from '@/hooks/useRecentSearches.js';
import { useVectorSearch } from '@/hooks/useVectorSearch.js';
import {
  resolveVectorSearchTargetForPath,
  resolveVectorSearchTargets,
  resolveWindowSearchSuggestions,
} from '@/lib/vectorSearchConfig.js';
import { rankVectorMatches } from '@/lib/vectorSearchRanking.js';
import {
  GlobalSearchDialog as CommandDialog,
  GlobalSearchEmpty as CommandEmpty,
  GlobalSearchGroup as CommandGroup,
  GlobalSearchItem as CommandItem,
  GlobalSearchList as CommandList,
} from '@/components/global-search/GlobalSearchPrimitives.jsx';
import menuConfig from '../menu.json';

import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Calculator,
  Package,
  Users,
  FolderKanban,
  Settings,
  Search,
  X,
  Clock3,
  Sparkles,
} from 'lucide-react';

const ICON_MAP = {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Calculator,
  Package,
  Users,
  FolderKanban,
  Settings,
};

function HighlightedQuery({ text, query }) {
  const value = String(text ?? '');
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return value;
  const escapedQuery = normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = value.split(new RegExp(`(${escapedQuery})`, 'ig'));
  return parts.map((part, index) => (
    part.toLowerCase() === normalizedQuery.toLowerCase()
      ? <mark key={`${part}-${index}`} data-testid="search-text-highlight" className="rounded bg-accent-highlight/40 px-0.5 text-inherit">{part}</mark>
      : part
  ));
}

export function CommandPalette() {
  const { open, setOpen, query, setQuery, registerKeyboardHandler } = useGlobalSearch();
  const { recentSearches, addRecentSearch } = useRecentSearches();
  const [keyboardIndex, setKeyboardIndex] = useState(-1);
  const openRef = useRef(false);
  const keyboardIndexRef = useRef(-1);
  const dropdownInteractionRef = useRef(false);
  const targetPickerRef = useRef(null);
  const targetPickerTriggerRef = useRef(null);
  const vectorSearchContracts = useVectorSearchContracts(open);
  const [selectedVectorTargetKeys, setSelectedVectorTargetKeys] = useState(null);
  const [isTargetPickerOpen, setIsTargetPickerOpen] = useState(false);
  const [scopeOverride, setScopeOverride] = useState(null);
  const initializedScopeTarget = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const ui = useUI();
  const tMenu = useMenuLabel();
  const vectorSearchTargets = useMemo(
    () => resolveVectorSearchTargets(vectorSearchContracts),
    [vectorSearchContracts],
  );
  const windowSearchSuggestions = useMemo(
    () => resolveWindowSearchSuggestions(vectorSearchContracts),
    [vectorSearchContracts],
  );
  const vectorSearchTargetKeys = useMemo(
    () => vectorSearchTargets.map(({ target }) => target),
    [vectorSearchTargets],
  );
  const vectorSearchTargetsByKey = useMemo(
    () => new Map(vectorSearchTargets.map((target) => [target.target, target])),
    [vectorSearchTargets],
  );
  const currentWindowVectorTarget = useMemo(
    () => resolveVectorSearchTargetForPath(location.pathname, vectorSearchTargets),
    [location.pathname, vectorSearchTargets],
  );
  const requestedVectorSearchTargetKeys = useMemo(() => {
    if (!selectedVectorTargetKeys) return vectorSearchTargetKeys;
    return selectedVectorTargetKeys.filter((target) => vectorSearchTargetsByKey.has(target));
  }, [selectedVectorTargetKeys, vectorSearchTargetKeys, vectorSearchTargetsByKey]);
  const selectedVectorTargets = useMemo(() => (
    selectedVectorTargetKeys
      ? selectedVectorTargetKeys
        .map((target) => vectorSearchTargetsByKey.get(target))
        .filter(Boolean)
      : []
  ), [selectedVectorTargetKeys, vectorSearchTargetsByKey]);
  const scopeOverrideTargets = scopeOverride?.pathname === location.pathname
    ? scopeOverride.targets
    : undefined;
  const { matches: vectorMatches, isLoading: isVectorSearchLoading } = useVectorSearch({
    query,
    requestedTargetKeys: requestedVectorSearchTargetKeys,
    selectedTargetKeys: selectedVectorTargetKeys,
    onSearch: addRecentSearch,
  });

  useEffect(() => {
    if (!open || vectorSearchTargets.length === 0) return;
    const targets = selectedVectorTargetKeys === null
      ? (initializedScopeTarget.current ? vectorSearchTargetKeys : null)
      : requestedVectorSearchTargetKeys;
    if (!targets) return;
    document.dispatchEvent(new CustomEvent('schema-forge:vector-search-selection', {
      detail: { pathname: location.pathname, targets },
    }));
  }, [location.pathname, open, requestedVectorSearchTargetKeys, selectedVectorTargetKeys, vectorSearchTargetKeys, vectorSearchTargets.length]);

  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { keyboardIndexRef.current = keyboardIndex; }, [keyboardIndex]);

  useEffect(() => {
    keyboardIndexRef.current = -1;
    setKeyboardIndex(-1);
    document.querySelector('[data-testid="CommandList__73263e"]')?.scrollTo?.({ top: 0 });
  }, [query]);

  useEffect(() => {
    const navigateKeyboard = (key) => {
      const items = Array.from(document.querySelectorAll('[data-testid="CommandDropdown__8e5d1a"] [data-global-search-item="true"]:not(:disabled)'));
      if (items.length === 0) return;
      if (key === 'Enter') {
        const selectedItem = items[keyboardIndexRef.current >= 0 ? keyboardIndexRef.current : 0];
        const keepOpen = selectedItem?.dataset.searchKind === 'recent';
        if (!keepOpen) setOpen(false);
        selectedItem?.click();
        return { keepOpen };
      }
      const delta = key === 'ArrowUp' ? -1 : 1;
      const next = (keyboardIndexRef.current + delta + items.length) % items.length;
      keyboardIndexRef.current = next;
      setKeyboardIndex(next);
    };
    const unregister = registerKeyboardHandler(navigateKeyboard);
    return unregister;
  }, [registerKeyboardHandler]);

  useEffect(() => {
    const down = (e) => {
      if (e.key === 'Escape' && openRef.current) {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  useEffect(() => {
    if (!isTargetPickerOpen) return undefined;
    const closePickerOutside = (event) => {
      if (targetPickerRef.current?.contains(event.target)) return;
      if (targetPickerTriggerRef.current?.contains(event.target)) return;
      setIsTargetPickerOpen(false);
    };
    document.addEventListener('pointerdown', closePickerOutside, true);
    document.addEventListener('focusin', closePickerOutside, true);
    return () => {
      document.removeEventListener('pointerdown', closePickerOutside, true);
      document.removeEventListener('focusin', closePickerOutside, true);
    };
  }, [isTargetPickerOpen]);

  useEffect(() => {
    const preserveDropdownClick = (event) => {
      const dropdown = document.querySelector('[data-testid="CommandDropdown__8e5d1a"]');
      if (dropdown?.contains(event.target)) dropdownInteractionRef.current = true;
    };
    const closeOnFocusOut = () => {
      window.setTimeout(() => {
        if (!openRef.current) return;
        if (dropdownInteractionRef.current) {
          dropdownInteractionRef.current = false;
          return;
        }
        const active = document.activeElement;
        const input = document.querySelector('[data-testid="global-search-input"]');
        const dropdown = document.querySelector('[data-testid="CommandDropdown__8e5d1a"]');
        if (!input?.contains(active) && !dropdown?.contains(active)) setOpen(false);
      }, 0);
    };
    document.addEventListener('focusout', closeOnFocusOut);
    document.addEventListener('pointerdown', preserveDropdownClick, true);
    return () => {
      document.removeEventListener('focusout', closeOnFocusOut);
      document.removeEventListener('pointerdown', preserveDropdownClick, true);
    };
  }, []);

  useEffect(() => {
    const items = Array.from(document.querySelectorAll('[data-testid="CommandDropdown__8e5d1a"] [data-global-search-item="true"]'));
    items.forEach((item, index) => {
      const selected = index === keyboardIndex && !item.disabled;
      item.setAttribute('data-selected', selected ? 'true' : 'false');
      item.setAttribute('aria-selected', selected ? 'true' : 'false');
      item.classList.toggle('bg-accent', selected);
      item.classList.toggle('text-accent-foreground', selected);
      if (selected) {
        item.scrollIntoView?.({ block: 'nearest' });
      }
    });
  }, [keyboardIndex, query, vectorMatches, recentSearches, open, isTargetPickerOpen]);

  useEffect(() => {
    const setExternalScope = (event) => {
      const { pathname, vectorSearchTarget, vectorSearchTargets: targets } = event.detail ?? {};
      if (typeof pathname !== 'string') return;
      if (!Array.isArray(targets) && vectorSearchTarget === null) {
        setSelectedVectorTargetKeys(null);
        setScopeOverride({ pathname, targets: null });
        return;
      }
      const selectedTargets = Array.isArray(targets)
        ? targets
        : vectorSearchTarget ? [vectorSearchTarget] : [];
      setSelectedVectorTargetKeys(selectedTargets);
      setScopeOverride(vectorSearchTarget || Array.isArray(targets) ? { pathname, targets: selectedTargets } : null);
    };
    document.addEventListener('schema-forge:vector-search-scope', setExternalScope);
    return () => document.removeEventListener('schema-forge:vector-search-scope', setExternalScope);
  }, []);

  useEffect(() => {
    if (!open) {
      initializedScopeTarget.current = null;
      setSelectedVectorTargetKeys(null);
      setIsTargetPickerOpen(false);
      return;
    }

    if (scopeOverrideTargets === undefined && currentWindowVectorTarget && initializedScopeTarget.current === null) {
      initializedScopeTarget.current = currentWindowVectorTarget.target;
      setSelectedVectorTargetKeys([currentWindowVectorTarget.target]);
      return;
    }

    if (scopeOverrideTargets !== undefined) {
      setSelectedVectorTargetKeys(scopeOverrideTargets);
      return;
    }

    if (!currentWindowVectorTarget || initializedScopeTarget.current === currentWindowVectorTarget.target) {
      return;
    }

    initializedScopeTarget.current = currentWindowVectorTarget.target;
    setSelectedVectorTargetKeys([currentWindowVectorTarget.target]);
  }, [currentWindowVectorTarget, open, scopeOverrideTargets]);

  const handleSelect = (name) => {
    setQuery('');
    navigate(`/${name}`);
    setOpen(false);
  };

  const handleVectorSelect = (match) => {
    const target = vectorSearchTargetsByKey.get(match.target);
    if (!target || !match.id) return;
    setQuery('');
    navigate(`/${target.specName}/${match.id}`);
    setOpen(false);
  };

  const clearVectorSearchScope = () => {
    setScopeOverride({ pathname: location.pathname, targets: null });
    setSelectedVectorTargetKeys(null);
    document.dispatchEvent(new CustomEvent('schema-forge:vector-search-selection', {
      detail: { pathname: location.pathname, targets: [] },
    }));
  };

  const toggleVectorSearchTarget = (targetKey) => {
    setSelectedVectorTargetKeys((current) => {
      const activeTargets = current ?? vectorSearchTargetKeys;
      const nextTargets = activeTargets.includes(targetKey)
        ? activeTargets.filter((target) => target !== targetKey)
        : [...activeTargets, targetKey];
      return nextTargets.length === vectorSearchTargetKeys.length ? null : nextTargets;
    });
  };

  const vectorSearchScopeLabel = selectedVectorTargets.length === 1
    ? tMenu(selectedVectorTargets[0].label) || selectedVectorTargets[0].label
    : selectedVectorTargets.length > 1
      ? ui('selectedWindows').replace('{count}', selectedVectorTargets.length)
      : ui('allWindows');
  const visibleWindowSearchSuggestions = windowSearchSuggestions.filter((suggestion) => {
    const target = vectorSearchTargets.find((item) => item.specName === suggestion.specName);
    return !target || requestedVectorSearchTargetKeys.includes(target.target);
  });
  const visibleRecentSearches = recentSearches.filter((item) => {
    if (item.query.trim().length === 0) return false;
    if (requestedVectorSearchTargetKeys.length === vectorSearchTargetKeys.length) return true;
    if (!Array.isArray(item.targets) || item.targets.length === 0) return true;
    return item.targets.some((target) => requestedVectorSearchTargetKeys.includes(target));
  });
  const {
    exact: exactVectorMatches,
    semantic: semanticVectorMatches,
    related: relatedVectorMatches,
    concentrated: vectorMatchesConcentrated,
  } = rankVectorMatches(
    vectorMatches,
    query,
    false,
  );

  const renderVectorMatch = (match) => {
    const fields = Object.entries(match.fields || {})
      .filter(([fieldName, value]) => value && fieldName.toLowerCase() !== 'issotrx')
      .map(([, value]) => value);
    const label = fields.join(' · ') || match.id;
    const target = vectorSearchTargetsByKey.get(match.target);
    const entityLabel = target ? tMenu(target.label) || target.label : null;
    const score = Number.isFinite(match.score) ? `${Math.round(match.score * 100)}%` : null;
    return (
      <CommandItem
        key={`${match.target}:${match.id}`}
        value={`${query} ${label} ${match.target} ${match.id}`}
        disabled={!target || !match.id}
        onSelect={() => handleVectorSelect(match)}
        data-testid="vector-search-result"
      >
        <Search
          className="mr-2 h-4 w-4 shrink-0"
          strokeWidth={2}
          data-testid="Search__73263e" />
        <span><HighlightedQuery text={label} query={query} data-testid="HighlightedQuery__73263e" /></span>
        {entityLabel && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{entityLabel}</span>}
        {score && <span className="ml-auto text-xs text-muted-foreground">{score}</span>}
      </CommandItem>
    );
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} data-testid="CommandDialog__73263e">
      {vectorSearchTargets.length > 0 && (
        <div className="relative border-b border-[hsl(var(--border-control))] bg-card px-4 py-3" data-testid="vector-search-scope-panel">
          <h2 className="mb-2 text-base font-semibold text-foreground">{ui('searchIn')}</h2>
          <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={clearVectorSearchScope}
            className="inline-flex max-w-56 items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={ui('clearSearchScope')}
            data-testid="vector-search-scope"
          >
            <span className="truncate">{vectorSearchScopeLabel}</span>
            <X className="h-3 w-3 shrink-0" aria-hidden="true" data-testid="X__73263e" />
          </button>
          <button
            type="button"
            onClick={() => setIsTargetPickerOpen((isOpen) => !isOpen)}
            ref={targetPickerTriggerRef}
            className="rounded-full bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-expanded={isTargetPickerOpen}
            data-testid="vector-search-target-picker-trigger"
          >
            {ui('filterWindows')}
          </button>
          </div>
          {isTargetPickerOpen && (
          <div ref={targetPickerRef} className="absolute left-[300px] top-12 z-20 w-72 rounded-2xl border bg-popover p-2 shadow-lg" data-testid="vector-search-target-picker">
            {vectorSearchTargets.map((target) => {
              const checked = !selectedVectorTargetKeys || selectedVectorTargetKeys.includes(target.target);
              const label = tMenu(target.label) || target.label;
              return (
                <label key={target.target} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleVectorSearchTarget(target.target)}
                    className="h-4 w-4 rounded border-input"
                    data-testid="vector-search-target-option"
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
          )}
        </div>
      )}
      {isVectorSearchLoading && (
        <div
          role="status"
          className="px-3 py-2 text-sm text-muted-foreground"
          data-testid="vector-search-loading"
        >
          {ui('searching')}
        </div>
      )}
      <CommandList data-testid="CommandList__73263e">
        {query.trim().length > 0 && !isVectorSearchLoading && vectorMatches.length === 0 && (
          <CommandEmpty data-testid="CommandEmpty__73263e">{ui('noResultsFound')}</CommandEmpty>
        )}
        {query.trim().length === 0 && (
          <>
            {visibleRecentSearches.length > 0 && (
              <CommandGroup heading={ui('recentSearches')} data-testid="recent-searches">
                {visibleRecentSearches.map((item) => (
                    <CommandItem
                      key={`${item.query}:${item.timestamp}`}
                      value={item.query}
                      onSelect={(event) => {
                        if (Array.isArray(item.targets)) {
                          setSelectedVectorTargetKeys(item.targets.length === vectorSearchTargetKeys.length ? null : item.targets);
                        }
                        setQuery(item.query);
                        if (event?.detail !== 0) setOpen(false);
                      }}
                    data-testid="recent-search-item"
                    data-search-kind="recent"
                  >
                    <Clock3
                      className="mr-2 h-4 w-4 text-muted-foreground"
                      data-testid="Clock3__73263e" />
                    <span>{item.query}</span>
                    {item.targets?.length === 1 && vectorSearchTargetsByKey.has(item.targets[0]) && (
                      <span className="ml-auto rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                        {tMenu(vectorSearchTargetsByKey.get(item.targets[0]).label) || vectorSearchTargetsByKey.get(item.targets[0]).label}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}
        {query.trim().length === 0 && visibleWindowSearchSuggestions.length > 0 && (
          <CommandGroup heading={ui('suggestions')} data-testid="window-filter-suggestions">
            {visibleWindowSearchSuggestions.map((suggestion) => {
              const target = vectorSearchTargets.find((item) => item.specName === suggestion.specName);
              const targetLabel = target ? tMenu(target.label) || target.label : null;
              return (
                <CommandItem
                  key={suggestion.path}
                  value={`${tMenu(suggestion.label)} ${suggestion.path}`}
                  onSelect={() => {
                    setQuery('');
                    navigate(suggestion.path);
                    setOpen(false);
                  }}
                  data-testid="window-filter-suggestion"
                >
                  <Sparkles
                    className="mr-2 h-4 w-4 text-muted-foreground"
                    data-testid="Sparkles__73263e" />
                  <span>{ui(suggestion.label) || tMenu(suggestion.label) || suggestion.label}</span>
                  {targetLabel && (
                    <span className="ml-auto rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                      {targetLabel}
                    </span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
        {exactVectorMatches.length > 0 && <CommandGroup heading={ui('exactSearchResults')} data-testid="vector-search-exact">{exactVectorMatches.map(renderVectorMatch)}</CommandGroup>}
        {semanticVectorMatches.length > 0 && <CommandGroup heading={ui('relevantSearchResults')} data-testid="vector-search-relevant">{semanticVectorMatches.map(renderVectorMatch)}</CommandGroup>}
        {relatedVectorMatches.length > 0 && !vectorMatchesConcentrated && <CommandGroup heading={ui('relatedSearchResults')} data-testid="vector-search-related">{relatedVectorMatches.map(renderVectorMatch)}</CommandGroup>}
        {menuConfig.menu.filter(g => !g.hidden).map((group) => {
          const Icon = ICON_MAP[group.icon] || Package;
          const visibleItems = group.items.filter(i => !i.hidden);
          if (visibleItems.length === 0) return null;
          return (
            <CommandGroup
              key={group.group}
              heading={tMenu(group.group)}
              data-testid="CommandGroup__73263e">
              {visibleItems.map((item) => {
                const translatedLabel = tMenu(item.label);
                return (
                  <CommandItem
                    key={item.name}
                    value={`${translatedLabel} ${item.label} ${item.name}`}
                    onSelect={() => handleSelect(item.name)}
                    data-testid="CommandItem__73263e">
                    <Icon className="mr-2 h-4 w-4" data-testid="Icon__73263e" />
                    <span><HighlightedQuery
                      text={translatedLabel}
                      query={query}
                      data-testid="HighlightedQuery__73263e" /></span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          );
        })}
      </CommandList>
      <div className="flex h-10 shrink-0 items-center justify-between border-t border-[hsl(var(--border-control))] bg-muted/30 px-3 text-sm text-muted-foreground" data-testid="command-search-help">
        <div className="flex items-center gap-2">
          <span className="rounded-md border bg-card px-2 py-1 font-mono text-xs">↑</span>
          <span className="rounded-md border bg-card px-2 py-1 font-mono text-xs">↓</span>
          <span>{ui('searchNavigate')}</span>
          <span className="ml-3 rounded-md border bg-card px-2 py-1 font-mono text-xs">↵</span>
          <span>{ui('searchOpen')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md border bg-card px-2 py-1 font-mono text-xs">Esc</span>
          <span>{ui('close')}</span>
        </div>
      </div>
    </CommandDialog>
  );
}
