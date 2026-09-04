import { useEffect, useMemo, useState } from 'react';
import { useMenuLabel, useUI } from '@/i18n';
import { useCopilot } from '@/components/CopilotContext';
import { WalkthroughLauncher } from '@etendosoftware/app-shell-core/walkthrough';
import { cn } from '@/lib/utils.js';
import { useGlobalSearch } from '@/components/global-search/GlobalSearchContext.jsx';
import {
  resolveVectorSearchTargetForPath,
  resolveVectorSearchTargets,
} from '@/lib/vectorSearchConfig.js';
import { useVectorSearchContracts } from '@/hooks/useVectorSearchContracts.js';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip.jsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.jsx';
import {
  Search,
  Mic,
  Sparkles,
  Plus,
  Bell,
  MoreVertical,
  Star,
  HelpCircle,
  ArrowLeft,
  X,
} from 'lucide-react';

function resolveSelectedScope(searchSelectionTargets, currentWindowScope, vectorSearchTargets, ui) {
  if (searchSelectionTargets === null) return currentWindowScope;
  if (searchSelectionTargets.length === vectorSearchTargets.length) return null;
  if (searchSelectionTargets.length === 1) {
    return vectorSearchTargets.find((target) => target.target === searchSelectionTargets[0]);
  }
  const label = searchSelectionTargets.length === 0
    ? ''
    : ui('selectedWindows').replace('{count}', searchSelectionTargets.length);
  return { label };
}

function resolveScopeLabel(scope, tMenu) {
  if (!scope?.target) return scope?.label;
  return tMenu(scope.label) || scope.label;
}

export default function TopBar({
  onBack,
  title,
  titleExtra,
  breadcrumb,
  recordCount,
  menuAction,
  onAddToFavorites,
  isFavorite = false,
  onPageHelp = () => {},
  onSearchClick,
  searchPlaceholder,
  onAIClick,
  onNewClick,
  onBellClick,
  rightExtras,
  className,
}) {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const copilot = useCopilot();
  const vectorSearchContracts = useVectorSearchContracts();
  const [isCurrentWindowScopeEnabled, setIsCurrentWindowScopeEnabled] = useState(true);
  const [searchSelectionTargets, setSearchSelectionTargets] = useState(null);
  const { open: searchOpen, setOpen: setSearchOpen, query: searchValue, setQuery: setSearchValue, inputRef: searchInputRef, handleKeyDown: handleSearchKeyDown } = useGlobalSearch();
  const currentPathname = window.location.pathname;
  const vectorSearchTargets = useMemo(
    () => resolveVectorSearchTargets(vectorSearchContracts),
    [vectorSearchContracts],
  );
  const currentWindowVectorTarget = useMemo(
    () => resolveVectorSearchTargetForPath(currentPathname, vectorSearchTargets),
    [currentPathname, vectorSearchTargets],
  );

  const resolvedPlaceholder = searchPlaceholder ?? ui('searchPlaceholder');
  const handleSearchClick = onSearchClick ?? (() => {
    setSearchOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  });
  const handleAIClick = onAIClick ?? copilot?.toggle;

  const hasMenu = onAddToFavorites || onPageHelp || menuAction;

  useEffect(() => {
    setIsCurrentWindowScopeEnabled(true);
    setSearchSelectionTargets(null);
  }, [currentPathname]);

  useEffect(() => {
    const handleSelection = (event) => {
      if (event.detail?.pathname !== currentPathname) return;
      setSearchSelectionTargets(Array.isArray(event.detail.targets) ? event.detail.targets : null);
    };
    document.addEventListener('schema-forge:vector-search-selection', handleSelection);
    return () => document.removeEventListener('schema-forge:vector-search-selection', handleSelection);
  }, [currentPathname]);

  const clearCurrentWindowScope = (event) => {
    event?.stopPropagation();
    setIsCurrentWindowScopeEnabled(false);
    const allTargets = vectorSearchTargets.map(({ target }) => target);
    setSearchSelectionTargets(allTargets);
    document.dispatchEvent(new CustomEvent('schema-forge:vector-search-selection', {
      detail: { pathname: currentPathname, targets: allTargets },
    }));
    document.dispatchEvent(new CustomEvent('schema-forge:vector-search-scope', {
      detail: { pathname: currentPathname, vectorSearchTarget: null },
    }));
  };

  const currentWindowScope = isCurrentWindowScopeEnabled ? currentWindowVectorTarget : null;
  const selectedScope = resolveSelectedScope(
    searchSelectionTargets,
    currentWindowScope,
    vectorSearchTargets,
    ui,
  );
  const selectedScopeLabel = resolveScopeLabel(selectedScope, tMenu);

  return (
    <TooltipProvider data-testid="TooltipProvider__133e64">
      <header
        className={cn(
          'relative flex h-[62px] shrink-0 items-center gap-4 pl-0 pr-6 bg-page-bg',
          className
        )}
      >
        {/* Left: back button + title + breadcrumb + 3-dot menu */}
        {(title || onBack) && (
          <div className="relative z-10 flex items-center gap-1 shrink-0 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label={ui('back')}
                data-testid="topbar-back"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-topbar-icon hover:bg-muted hover:text-foreground transition-colors shrink-0"
              >
                <ArrowLeft className="h-4 w-4" data-testid="ArrowLeft__133e64" />
              </button>
            )}
            {/* max-w caps this block regardless of the wrapper's shrink-0 above (max-width still
                clamps a flex item even when it won't shrink under sibling pressure) — without it,
                `truncate` below never activates: the center search is `absolute`, so it applies
                no flex pressure of its own, and a long title/breadcrumb (e.g. a bank account's
                full name + IBAN) just grows underneath it instead of eliding.
                No `items-start`: that made this column's children size to their own content
                instead of stretching to the max-w cap, so the cap capped this box but never
                propagated down to the title row / breadcrumb span for `truncate` to act on —
                they simply overflowed the (non-clipping) parent. Text stays left-aligned either
                way; only the box-stretch behavior needed to change. */}
            <div className="flex flex-col justify-center min-w-0 h-12 max-w-[320px]">
              <div className="flex min-w-0 items-center gap-2">
                <Tooltip delayDuration={300} data-testid="Tooltip__topbar-title">
                  <TooltipTrigger asChild data-testid="TooltipTrigger__topbar-title">
                    <span className="min-w-0 truncate text-xl font-semibold leading-8 text-text-primary">
                      {title}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent data-testid="TooltipContent__topbar-title">{title}</TooltipContent>
                </Tooltip>
                {recordCount != null && (
                  <span className="inline-flex items-center justify-center w-7 h-6 px-2 py-1 text-xs font-medium text-muted-foreground bg-page-bg border border-[hsl(var(--border-control))] rounded-lg shrink-0">
                    {recordCount}
                  </span>
                )}
                {titleExtra && (
                  <span className="flex items-center shrink-0">{titleExtra}</span>
                )}
              </div>
              {breadcrumb && (
                <span className="text-xs text-topbar-breadcrumb truncate">
                  {breadcrumb}
                </span>
              )}
            </div>

            {hasMenu && (
              <DropdownMenu data-testid="DropdownMenu__133e64">
                <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__133e64">
                  <button
                    type="button"
                    aria-label={ui('more')}
                    data-testid="topbar-more-actions"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-topbar-icon hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <MoreVertical className="h-4 w-4" data-testid="MoreVertical__133e64" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52" data-testid="DropdownMenuContent__133e64">
                  {onAddToFavorites && (
                    <DropdownMenuItem onClick={onAddToFavorites} data-testid="DropdownMenuItem__133e64">
                      <Star
                        className={cn(
                          'h-4 w-4 mr-2',
                          isFavorite
                            ? 'fill-accent-highlight text-accent-highlight'
                            : 'text-muted-foreground'
                        )}
                        data-testid="Star__133e64" />
                      {isFavorite ? ui('removeFromFavorites') : ui('addToFavorites')}
                    </DropdownMenuItem>
                  )}
                  {onPageHelp && (
                    <DropdownMenuItem onClick={onPageHelp} data-testid="DropdownMenuItem__133e64">
                      <HelpCircle
                        className="h-4 w-4 mr-2 text-muted-foreground"
                        data-testid="HelpCircle__133e64" />
                      {ui('pageHelp')}
                    </DropdownMenuItem>
                  )}
                  {menuAction && (onAddToFavorites || onPageHelp) && (
                    <DropdownMenuSeparator data-testid="DropdownMenuSeparator__133e64" />
                  )}
                  {menuAction && (
                    <DropdownMenuItem
                      onClick={menuAction.onClick}
                      disabled={menuAction.disabled}
                      data-testid="DropdownMenuItem__133e64">
                      {menuAction.icon && (
                        <menuAction.icon className="h-4 w-4 mr-2 text-muted-foreground" />
                      )}
                      {menuAction.label}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}

        {/* Center: search — absolutely centered so it never shifts with title width */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-6">
          <div
            className="pointer-events-auto relative flex h-11 w-full max-w-[min(48rem,calc(100vw-28rem))] items-center rounded-full border border-transparent bg-search-bg px-4 text-sm transition-colors hover:bg-search-bg/80 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20"
            onClick={(event) => {
              handleSearchClick(event);
              requestAnimationFrame(() => searchInputRef.current?.focus());
            }}
            data-testid="global-search-trigger"
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === 'Enter' || event.key === ' ') handleSearchClick(event);
            }}
          >
            <Search className="mr-2 h-5 w-5 shrink-0 text-search-placeholder" data-testid="Search__133e64" />
            {selectedScope && selectedScope.label && (
              <span
                className="mr-2 inline-flex min-w-0 max-w-[12rem] shrink items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
                data-testid="topbar-vector-search-scope"
              >
                <span className="truncate">{selectedScopeLabel}</span>
                <button
                  type="button"
                  onClick={clearCurrentWindowScope}
                  aria-label={ui('clearSearchScope')}
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-accent hover:text-foreground"
                  data-testid="topbar-vector-search-scope-clear"
                >
                  <X className="h-3 w-3" aria-hidden="true" data-testid="X__133e64" />
                </button>
              </span>
            )}
            <input
              ref={searchInputRef}
              value={searchValue}
              onChange={(event) => {
                const nextValue = event.target.value;
                setSearchValue(nextValue);
                if (nextValue.length === 0) {
                  clearCurrentWindowScope();
                }
              }}
              onFocus={handleSearchClick}
              onMouseDown={() => setSearchOpen(true)}
              onClick={(event) => {
                event.stopPropagation();
                handleSearchClick(event);
              }}
              onKeyDown={(event) => {
                // When the input owns focus, handle the shortcut here and stop
                // propagation so the document listener cannot toggle twice.
                if (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  event.stopPropagation();
                  setSearchOpen((isOpen) => !isOpen);
                  return;
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setSearchOpen(false);
                  return;
                }
                if (!searchOpen && event.key !== 'Escape') setSearchOpen(true);
                const atStart = event.currentTarget.selectionStart === 0
                  && event.currentTarget.selectionEnd === 0;
                if (event.key === 'Backspace' && atStart) {
                  event.preventDefault();
                  clearCurrentWindowScope(event);
                  return;
                }
                const result = handleSearchKeyDown(event);
                if (event.key === 'Enter' && !result?.keepOpen) setSearchOpen(false);
              }}
              placeholder={resolvedPlaceholder}
              aria-label={resolvedPlaceholder}
              cmdk-input=""
              className="min-w-0 flex-1 bg-transparent text-left text-sm text-foreground outline-none placeholder:text-search-placeholder"
              data-testid="global-search-input"
            />
            <Tooltip delayDuration={0} data-testid="Tooltip__133e64">
              <TooltipTrigger asChild data-testid="TooltipTrigger__133e64">
                <span role="button" tabIndex={-1} aria-label={ui('searchWithVoice')} className="ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-search-placeholder">
                  <Mic className="h-4 w-4" data-testid="Mic__133e64" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" data-testid="TooltipContent__133e64">{ui('searchWithVoice')}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Right: action icons */}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {/* ETP-5144 — guided walkthroughs. Hardcoded here rather than passed
              via `rightExtras` (which comes from per-page PageMeta) so the
              entry point is reachable from every screen. Renders nothing when
              no WalkthroughProvider is mounted above it. */}
          <WalkthroughLauncher data-testid="WalkthroughLauncher__133e64" />

          <Tooltip delayDuration={0} data-testid="Tooltip__133e64">
            <TooltipTrigger asChild data-testid="TooltipTrigger__133e64">
              <button
                type="button"
                onClick={handleAIClick}
                aria-label={ui('aiAssistant')}
                className="copilot-btn flex h-10 w-10 items-center justify-center rounded-lg text-topbar-icon transition-colors"
              >
                <Sparkles className="h-5 w-5" data-testid="Sparkles__133e64" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" data-testid="TooltipContent__133e64">{ui('aiAssistant')}</TooltipContent>
          </Tooltip>

          <Tooltip delayDuration={0} data-testid="Tooltip__133e64">
            <TooltipTrigger asChild data-testid="TooltipTrigger__133e64">
              <button
                type="button"
                onClick={onNewClick}
                aria-label={ui('newRecord')}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-topbar-icon hover:text-foreground hover:bg-muted transition-colors"
              >
                <Plus className="h-5 w-5" data-testid="Plus__133e64" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" data-testid="TooltipContent__133e64">{ui('newRecord')}</TooltipContent>
          </Tooltip>

          <Tooltip delayDuration={0} data-testid="Tooltip__133e64">
            <TooltipTrigger asChild data-testid="TooltipTrigger__133e64">
              <button
                type="button"
                onClick={onBellClick}
                aria-label={ui('notifications')}
                data-testid="topbar-notifications"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-topbar-icon hover:text-foreground hover:bg-muted transition-colors"
              >
                <Bell className="h-5 w-5" data-testid="Bell__133e64" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" data-testid="TooltipContent__133e64">{ui('notifications')}</TooltipContent>
          </Tooltip>

          {rightExtras}
        </div>
      </header>
    </TooltipProvider>
  );
}
