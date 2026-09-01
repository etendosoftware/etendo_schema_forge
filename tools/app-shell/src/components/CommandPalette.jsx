import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUI, useMenuLabel } from '@/i18n';
import { useGlobalSearch } from '@/components/global-search/GlobalSearchContext.jsx';
import { getApiBase } from '@/hooks/useNeoResource.js';
import {
  resolveVectorSearchTargetForPath,
  resolveVectorSearchTargets,
  resolveWindowSearchSuggestions,
} from '@/lib/vectorSearchConfig.js';
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

const windowContractLoaders = Object.entries(import.meta.glob('@generated/*/contract.json'));

function specNameFromContractPath(path) {
  return path.split('/').at(-2);
}

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

const RECENT_SEARCHES_KEY = 'schema-forge:recent-searches';
const MAX_RECENT_SEARCHES = 5;

function readRecentSearches() {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item) => item && typeof item.query === 'string') : [];
  } catch {
    return [];
  }
}

export function CommandPalette() {
  const { open, setOpen, query, setQuery, registerKeyboardHandler } = useGlobalSearch();
  const [recentSearches, setRecentSearches] = useState(readRecentSearches);
  const [keyboardIndex, setKeyboardIndex] = useState(-1);
  const openRef = useRef(false);
  const keyboardIndexRef = useRef(-1);
  const dropdownInteractionRef = useRef(false);
  const targetPickerRef = useRef(null);
  const targetPickerTriggerRef = useRef(null);
  const [vectorMatches, setVectorMatches] = useState([]);
  const [vectorSearchContracts, setVectorSearchContracts] = useState([]);
  const [isVectorSearchLoading, setIsVectorSearchLoading] = useState(false);
  const [selectedVectorTargetKeys, setSelectedVectorTargetKeys] = useState(null);
  const [isTargetPickerOpen, setIsTargetPickerOpen] = useState(false);
  const [scopeOverride, setScopeOverride] = useState(null);
  const vectorContractsLoaded = useRef(false);
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

  useEffect(() => {
    if (!open || vectorSearchTargets.length === 0 || selectedVectorTargetKeys === null) return;
    document.dispatchEvent(new CustomEvent('schema-forge:vector-search-selection', {
      detail: { pathname: location.pathname, targets: requestedVectorSearchTargetKeys },
    }));
  }, [location.pathname, open, requestedVectorSearchTargetKeys, selectedVectorTargetKeys, vectorSearchTargets.length]);

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
      if (import.meta.env.DEV) console.debug('[CommandPalette] navigate', { key, itemCount: items.length, index: keyboardIndexRef.current });
      if (items.length === 0) return;
      if (key === 'Enter') {
        const selectedItem = items[keyboardIndexRef.current >= 0 ? keyboardIndexRef.current : 0];
        setOpen(false);
        selectedItem?.click();
        return;
      }
      const delta = key === 'ArrowUp' ? -1 : 1;
      const next = (keyboardIndexRef.current + delta + items.length) % items.length;
      keyboardIndexRef.current = next;
      setKeyboardIndex(next);
    };
    const unregister = registerKeyboardHandler(navigateKeyboard);
    if (import.meta.env.DEV) console.debug('[CommandPalette] keyboard handler registered');
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
      setScopeOverride({
        pathname,
        targets: Array.isArray(targets)
          ? targets
          : vectorSearchTarget ? [vectorSearchTarget] : null,
      });
    };
    document.addEventListener('schema-forge:vector-search-scope', setExternalScope);
    return () => document.removeEventListener('schema-forge:vector-search-scope', setExternalScope);
  }, []);

  useEffect(() => {
    if (!open || vectorContractsLoaded.current) return undefined;
    let active = true;
    vectorContractsLoaded.current = true;

    Promise.all(windowContractLoaders.map(async ([path, loadContract]) => ({
      contract: await loadContract(),
      specName: specNameFromContractPath(path),
    })))
      .then((contracts) => {
        if (active) setVectorSearchContracts(contracts);
      })
      .catch(() => {
        if (active) setVectorSearchContracts([]);
      });

    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (!open) {
      initializedScopeTarget.current = null;
      setSelectedVectorTargetKeys(null);
      setIsTargetPickerOpen(false);
      return;
    }

    if (scopeOverrideTargets === undefined && currentWindowVectorTarget && selectedVectorTargetKeys === null) {
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
  }, [currentWindowVectorTarget, open, scopeOverrideTargets, selectedVectorTargetKeys]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (requestedVectorSearchTargetKeys.length === 0 || normalizedQuery.length < 3) {
      setVectorMatches([]);
      setIsVectorSearchLoading(false);
      return undefined;
    }

    setVectorMatches([]);
    setIsVectorSearchLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const token = localStorage.getItem('sf_auth_token');
        const params = new URLSearchParams({
          query: normalizedQuery,
          targets: requestedVectorSearchTargetKeys.join(','),
        });
        const response = await fetch(`${getApiBase()}/sws/neo/vectorsearch?${params}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Vector search failed: ${response.status}`);
        const payload = await response.json();
        setVectorMatches(Array.isArray(payload?.matches) ? payload.matches : []);
        if (normalizedQuery.length >= 3) {
          setRecentSearches((current) => {
            const next = [
              { query: normalizedQuery, targets: requestedVectorSearchTargetKeys, timestamp: Date.now() },
              ...current.filter((item) => item.query.toLowerCase() !== normalizedQuery.toLowerCase()),
            ].slice(0, MAX_RECENT_SEARCHES);
            try { localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
            return next;
          });
        }
      } catch (error) {
        if (error.name !== 'AbortError') setVectorMatches([]);
      } finally {
        if (!controller.signal.aborted) setIsVectorSearchLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [query, requestedVectorSearchTargetKeys]);

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

  return (
    <CommandDialog open={open} onOpenChange={setOpen} data-testid="CommandDialog__73263e">
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
            <X className="h-3 w-3 shrink-0" aria-hidden="true" />
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
                      onSelect={() => {
                        if (Array.isArray(item.targets)) {
                          setSelectedVectorTargetKeys(item.targets.length === vectorSearchTargetKeys.length ? null : item.targets);
                        }
                        setQuery(item.query);
                      }}
                    data-testid="recent-search-item"
                  >
                    <Clock3 className="mr-2 h-4 w-4 text-muted-foreground" />
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
                  <Sparkles className="mr-2 h-4 w-4 text-muted-foreground" />
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
        {vectorMatches.length > 0 && (
          <CommandGroup heading={ui('semanticSearchResults')} data-testid="vector-search-results">
            {vectorMatches.map((match) => {
              const fields = Object.values(match.fields || {}).filter(Boolean);
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
                  <Search className="mr-2 h-4 w-4 shrink-0" strokeWidth={2} />
                  <span>{label}</span>
                  {entityLabel && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {entityLabel}
                    </span>
                  )}
                  {score && <span className="ml-auto text-xs text-muted-foreground">{score}</span>}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
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
                    <span>{translatedLabel}</span>
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
