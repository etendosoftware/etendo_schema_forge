import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMenuLabel, useUI } from '@/i18n';
import { useEnvironmentSwitch } from '@/hooks/useEnvironmentSwitch.js';
import { useGuardedNavigate } from '@/hooks/useGuardedNavigate.js';
import { isProductiveEnvironment } from '@/lib/environmentPresentation.js';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover.jsx';
import {
  Search,
  Mic,
  Sparkles,
  MoreVertical,
  MoreHorizontal,
  Star,
  HelpCircle,
  ArrowLeft,
  X,
} from 'lucide-react';
import {
  BREADCRUMB_SEPARATOR,
  breadcrumbToText,
  normalizeBreadcrumb,
  splitBreadcrumb,
} from './breadcrumb.js';

/**
 * ETP-5504 — below this viewport width the right-side quick actions collapse to Copilot +
 * Tutorials + a "more actions" menu. UX has not confirmed the exact value yet (target is the
 * 1280×720 minimum resolution); change it here and nowhere else.
 *
 * Why 1366: with the rail expanded (240px) the header gets `viewport - 240`. The search is
 * centered in the bar (see HEADER_GRID), so each side column gets `(header - search 392 - 2 gaps
 * 40) / 2`, and the actions get that minus their own 24px right inset: ~323px at 1366, enough for
 * Tutorials/Copilot + 5 quick actions (~304px), but only ~280px at 1280. So 1280-class screens go
 * compact and the common 1366 laptop keeps every action inline.
 */
export const TOPBAR_COMPACT_BELOW_PX = 1366;
const COMPACT_MEDIA_QUERY = `(max-width: ${TOPBAR_COMPACT_BELOW_PX - 0.02}px)`;

function getIsCompact() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return Boolean(window.matchMedia(COMPACT_MEDIA_QUERY)?.matches);
}

function useIsCompactTopBar() {
  const [isCompact, setIsCompact] = useState(getIsCompact);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia(COMPACT_MEDIA_QUERY);
    if (!mql) return undefined;
    const onChange = () => setIsCompact(Boolean(mql.matches));
    onChange();
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);
  return isCompact;
}

/**
 * ETP-5509 — three-column grid: left (title block) | search | right (quick actions).
 * The two side tracks are equal `1fr` tracks, so the `auto` search track sits at the exact
 * center of the bar whatever the side contents are. The left track has a 0 minimum: it takes
 * all the space beside the search and its title/breadcrumb elide inside it. The right track's
 * minimum is its `max-content`: the icons are never cut; only if they ever needed more than half
 * of the free space would the search shift left (instead of being overlapped). Each block is
 * placed on an explicit column so the search stays in the middle when there is no left block.
 * The header itself has no horizontal padding (the 24px right inset lives on the actions group,
 * inside its own track), so the tracks span the whole visible bar and the search is centered on
 * the header's border box, not on a padding-shifted content box. The column gap is 20px (`gap-5`,
 * ETP-5504 QA): the left column, and so the title/breadcrumb block, ends exactly 20px before the
 * search's left edge.
 */
const HEADER_GRID = 'grid grid-cols-[minmax(0,1fr)_auto_minmax(max-content,1fr)]';

/**
 * ETP-5504 QA (OBS-1) — shrink priority of the breadcrumb levels. The structured breadcrumb is a
 * one-row grid, not a flex row: with flex, every shrinkable level takes a share of the shortage,
 * and even a sub-pixel share makes `text-overflow: ellipsis` eat the end of a short ancestor
 * ("Compr…"). Grid sizing gives the `minmax(0,max-content)` ancestor tracks their whole width
 * first and hands only the leftover to the current page's `minmax(4rem,1fr)` track, so the
 * current page elides first; the ancestors give way (equally) only when even 4rem is not left.
 * Each ancestor label is also capped (beyond it, it elides; the whole trail is in the tooltip).
 * Cap value pending UX confirmation.
 */
const BREADCRUMB_ANCESTOR_CLASS = 'max-w-[160px]';
const BREADCRUMB_ANCESTOR_TRACK = 'minmax(0,max-content)';
const BREADCRUMB_OVERFLOW_TRACK = 'max-content';
const BREADCRUMB_CURRENT_TRACK = 'minmax(4rem,1fr)';

function breadcrumbGridColumns(ancestorCount, hasOverflow) {
  const tracks = Array.from({ length: ancestorCount }, () => BREADCRUMB_ANCESTOR_TRACK);
  if (hasOverflow) tracks.push(BREADCRUMB_OVERFLOW_TRACK);
  tracks.push(BREADCRUMB_CURRENT_TRACK);
  return tracks.join(' ');
}

function BreadcrumbLevel({ item, onNavigate, className }) {
  const navigable = Boolean(item.href || item.onClick);
  if (!navigable) {
    return <span className={cn('min-w-0 truncate', className)}>{item.label}</span>;
  }
  return (
    <button
      type="button"
      onClick={() => onNavigate(item)}
      className={cn('min-w-0 truncate hover:text-foreground hover:underline', className)}
    >
      {item.label}
    </button>
  );
}

function TopBarBreadcrumb({ breadcrumb, ui }) {
  // Guarded: a breadcrumb click from a dirty record must raise the unsaved-changes prompt.
  const navigate = useGuardedNavigate();
  const items = normalizeBreadcrumb(breadcrumb);
  const fullText = breadcrumbToText(breadcrumb);

  const handleNavigate = (item) => {
    if (item.onClick) item.onClick();
    else if (item.href) navigate(item.href);
  };

  // Legacy: a React node breadcrumb is rendered as-is, only truncated.
  if (!items) {
    return (
      <span className="text-xs text-topbar-breadcrumb truncate" data-testid="topbar-breadcrumb">
        {breadcrumb}
      </span>
    );
  }
  if (items.length === 0) return null;

  const { head, hidden, current } = splitBreadcrumb(items);
  // ≤3 levels with nothing navigable: one plain line that elides at the end, exactly as before.
  const plain = hidden.length === 0 && head.every((item) => !item.href && !item.onClick);
  if (plain) {
    return (
      <Tooltip delayDuration={300} data-testid="Tooltip__topbar-breadcrumb">
        <TooltipTrigger asChild data-testid="TooltipTrigger__topbar-breadcrumb">
          <span
            className="text-xs text-topbar-breadcrumb truncate"
            data-testid="topbar-breadcrumb"
          >
            {fullText}
          </span>
        </TooltipTrigger>
        <TooltipContent data-testid="TooltipContent__topbar-breadcrumb">{fullText}</TooltipContent>
      </Tooltip>
    );
  }

  const separator = (
    <span aria-hidden="true" className="shrink-0 whitespace-pre">{BREADCRUMB_SEPARATOR}</span>
  );

  return (
    <Tooltip delayDuration={300} data-testid="Tooltip__topbar-breadcrumb">
      <TooltipTrigger asChild data-testid="TooltipTrigger__topbar-breadcrumb">
        <nav
          aria-label={ui('topbarBreadcrumb')}
          className="grid min-w-0 items-center text-xs leading-4 text-topbar-breadcrumb"
          style={{ gridTemplateColumns: breadcrumbGridColumns(head.length, hidden.length > 0) }}
          data-testid="topbar-breadcrumb"
        >
          {head.map((item, index) => (
            <span key={`${item.label}-${index}`} className="flex min-w-0 items-center">
              <BreadcrumbLevel
                item={item}
                onNavigate={handleNavigate}
                className={BREADCRUMB_ANCESTOR_CLASS}
                data-testid="BreadcrumbLevel__topbar"
              />
              {separator}
            </span>
          ))}
          {hidden.length > 0 && (
            <span className="flex shrink-0 items-center">
              <DropdownMenu data-testid="DropdownMenu__topbar-breadcrumb-overflow">
                <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__topbar-breadcrumb-overflow">
                  <button
                    type="button"
                    aria-label={ui('more')}
                    className="flex h-4 items-center rounded px-0.5 hover:bg-muted hover:text-foreground"
                    data-testid="topbar-breadcrumb-overflow"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" data-testid="MoreHorizontal__topbar-breadcrumb" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="max-w-xs"
                  data-testid="topbar-breadcrumb-overflow-menu"
                >
                  {hidden.map((item, index) => (
                    <DropdownMenuItem
                      key={`${item.label}-${index}`}
                      disabled={!item.href && !item.onClick}
                      onSelect={() => handleNavigate(item)}
                      data-testid="topbar-breadcrumb-overflow-item"
                    >
                      <span className="truncate">{item.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {separator}
            </span>
          )}
          <span
            className="min-w-0 truncate"
            aria-current="page"
            data-testid="topbar-breadcrumb-current"
          >
            {current.label}
          </span>
        </nav>
      </TooltipTrigger>
      <TooltipContent data-testid="TooltipContent__topbar-breadcrumb">{fullText}</TooltipContent>
    </Tooltip>
  );
}

function QuickActionButton({ action }) {
  const Icon = action.icon;
  return (
    <Tooltip delayDuration={0} data-testid="Tooltip__topbar-quick-action">
      <TooltipTrigger asChild data-testid="TooltipTrigger__topbar-quick-action">
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          aria-label={action.label}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-topbar-icon transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          data-testid={`topbar-quick-action-${action.id}`}
        >
          {Icon ? <Icon className="h-5 w-5" data-testid="Icon__133e64" /> : action.label}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" data-testid="TooltipContent__topbar-quick-action">{action.label}</TooltipContent>
    </Tooltip>
  );
}

function QuickActionsOverflowMenu({ actions, extras, ui }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen} data-testid="Popover__topbar-quick-actions-overflow">
      <PopoverTrigger asChild data-testid="PopoverTrigger__topbar-quick-actions-overflow">
        <button
          type="button"
          aria-label={ui('quickAction.more')}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-topbar-icon transition-colors hover:bg-muted hover:text-foreground"
          data-testid="topbar-quick-actions-overflow"
        >
          <MoreVertical className="h-5 w-5" data-testid="MoreVertical__topbar-quick-actions-overflow" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-56 p-1"
        data-testid="topbar-quick-actions-overflow-menu"
      >
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              disabled={action.disabled}
              onClick={() => {
                setOpen(false);
                action.onClick?.();
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
              data-testid={`topbar-quick-action-${action.id}`}
            >
              {Icon && <Icon className="h-4 w-4 text-muted-foreground" data-testid="Icon__133e64" />}
              <span className="truncate">{action.label}</span>
            </button>
          );
        })}
        {extras != null && extras !== false && (
          <div
            className="flex flex-wrap items-center gap-1 px-1 py-1"
            data-testid="topbar-quick-actions-overflow-extras"
          >
            {extras}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

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

function DemoTrialIndicator({ ui }) {
  const navigate = useNavigate();
  const { environments, currentClientId } = useEnvironmentSwitch();
  const environment = environments.find(item => item.clientId === currentClientId);
  if (!environment) return null;
  const productive = isProductiveEnvironment(environment);
  if (productive) return null;
  const hasTrial = Number.isInteger(environment.trialDaysRemaining);
  if (!hasTrial) return null;
  const expired = environment.trialDaysRemaining <= 0;
  const start = Date.parse(environment.trialStartedAt);
  const end = Date.parse(environment.trialExpiresAt);
  const total = end - start;
  const remaining = Math.max(0, end - Date.now());
  const progress = total > 0
    ? Math.min(100, Math.max(0, (remaining / total) * 100)) : 0;
  const label = expired
    ? ui('environmentDemoExpired')
    : ui('environmentTrialDaysRemaining', { days: environment.trialDaysRemaining });
  return (
    <div
      className={cn(
        'flex min-h-[46px] w-full flex-wrap items-center justify-start gap-x-4 gap-y-2 border-b px-6 py-2 text-sm',
        expired
          ? 'border-status-danger-border bg-status-danger text-status-danger-foreground'
          : 'border-status-warning-border bg-status-warning text-status-warning-foreground'
      )}
      aria-label={label}
      title={environment.trialExpiresAt || undefined}
      data-testid="topbar-demo-trial-indicator"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className={cn(
          'rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide',
          expired
            ? 'border-status-danger-border bg-status-danger text-status-danger-foreground'
            : 'border-status-warning-border bg-status-warning text-status-warning-foreground'
        )}>
          {ui('environmentDemo')}
        </span>
        <span className="truncate font-semibold text-foreground">{label}</span>
      </div>
      <div className="flex w-full max-w-[360px] items-center gap-3">
        <div
          className={cn(
            'h-2 min-w-20 flex-1 overflow-hidden rounded-full',
            expired ? 'bg-status-danger-border' : 'bg-status-warning-border'
          )}
          aria-hidden="true"
        >
          <div
            className={cn(
              'h-full rounded-full',
              expired ? 'bg-status-danger-foreground' : 'bg-status-warning-foreground'
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => navigate('/upgrade')}
        className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
        data-testid="topbar-go-to-payment"
      >
        {ui('upgradeGoToPayment')}
      </button>
      {/* ETP-5364 — the two caveats a user has to read BEFORE paying: this environment never
          talks to Hacienda, and going productive carries over only contacts and products. They
          sit next to the button rather than inside the upgrade flow because by then the
          decision is already made. No link on "crear un entorno productivo": the button
          immediately to its left is that link, and two controls with one destination 8px apart
          read as a mistake. `flex-1` with a min width keeps the block on the same row when
          there is space and wraps it onto a second line of the same (already `flex-wrap`) bar
          when there is not.

          TWO KEYS, TWO PARAGRAPHS — not one string with a `\n`. The caveats are independent
          sentences and each gets its own line, so the break is structural and a translator
          cannot drop it by losing an escape inside a JSON string. */}
      <div
        className="min-w-[16rem] flex-1 text-xs leading-snug"
        data-testid="topbar-demo-fiscal-notice"
      >
        <p data-testid="topbar-demo-fiscal-notice-tax">{ui('environmentDemoFiscalNotice')}</p>
        <p data-testid="topbar-demo-fiscal-notice-migration">
          {ui('environmentDemoMigrationNotice')}
        </p>
      </div>
    </div>
  );
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
  quickActions,
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

  // ETP-5504 — right-side quick actions. Copilot and Tutorials are always inline; everything
  // else (structured `quickActions` such as Notifications/New, plus any `rightExtras` node)
  // is inline on wide screens and moves into the right "⋯" menu at the compact breakpoint.
  const isCompact = useIsCompactTopBar();
  const overflowActions = Array.isArray(quickActions) ? quickActions.filter(Boolean) : [];
  const hasExtras = rightExtras != null && rightExtras !== false;
  const showOverflowMenu = isCompact && (overflowActions.length > 0 || hasExtras);

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
      <div className="flex min-w-0 shrink-0 flex-col">
        <DemoTrialIndicator ui={ui} data-testid="DemoTrialIndicator__133e64" />
        <header
          className={cn(
            'relative h-[62px] shrink-0 items-center gap-5 px-0 bg-page-bg',
            HEADER_GRID,
            className
          )}
        >
        {/* Left: back button + title + breadcrumb + 3-dot menu. Stretches over the whole left
            column (min-w-0) so the title block can use all of it and shrink below it. */}
        {(title || onBack) && (
          <div className="relative z-10 col-start-1 flex min-w-0 items-center gap-1">
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
            {/* ETP-5509: no fixed width cap. This block is content-sized and shrinkable
                (`min-w-0`), so it uses the whole left grid column when needed and a long
                title/breadcrumb (e.g. a bank account's full name + IBAN) elides at the column
                edge instead of pushing the search. No `items-start`: the title row and the
                breadcrumb must stretch to this block's width for their `truncate` to act.
                ETP-5504 QA: the title `⋯` lives in the title row, right after the title, not
                beside this block — so a long breadcrumb or title reaches the column edge (20px
                before the search) instead of stopping a kebab's width short of it. */}
            <div
              className="flex flex-col justify-center min-w-0 h-12"
              data-testid="topbar-title-block"
            >
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
                  <span
                    className="inline-flex items-center justify-center w-7 h-6 px-2 py-1 text-xs font-medium text-muted-foreground bg-page-bg border border-[hsl(var(--border-control))] rounded-lg shrink-0"
                    data-testid="topbar-record-count">
                    {recordCount}
                  </span>
                )}
                {titleExtra && (
                  <span className="flex items-center shrink-0">{titleExtra}</span>
                )}
                {hasMenu && (
                  <DropdownMenu data-testid="DropdownMenu__133e64">
                    <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__133e64">
                      <button
                        type="button"
                        aria-label={ui('more')}
                        data-testid="topbar-more-actions"
                        className="-ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-topbar-icon hover:bg-muted hover:text-foreground transition-colors"
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
              {breadcrumb && (
                <TopBarBreadcrumb breadcrumb={breadcrumb} ui={ui} data-testid="TopBarBreadcrumb__133e64" />
              )}
            </div>
          </div>
        )}

        {/* Center: search — fixed 392px in the middle grid column (ETP-5509: exactly centered in
            the bar, see HEADER_GRID). It used to be `absolute inset-0` over the whole header,
            which ignored the Navigation Rail width and covered the title at 1280px. `min-w-0` +
            `max-w-full` let it shrink instead of overlapping if the bar ever gets too narrow. */}
        <div className="col-start-2 flex min-w-0 items-center justify-center" data-testid="topbar-search-slot">
          <div
            className="relative flex h-11 w-[392px] max-w-full items-center rounded-full border border-transparent bg-search-bg px-4 text-sm transition-colors hover:bg-search-bg/80 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20"
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
        <div className="col-start-3 flex items-center justify-self-end gap-1 shrink-0 pr-6" data-testid="topbar-quick-actions">
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

          {!isCompact && overflowActions.map((action) => (
            <QuickActionButton key={action.id} action={action} data-testid="QuickActionButton__133e64" />
          ))}
          {!isCompact && rightExtras}
          {showOverflowMenu && (
            <QuickActionsOverflowMenu
              actions={overflowActions}
              extras={hasExtras ? rightExtras : null}
              ui={ui}
              data-testid="QuickActionsOverflowMenu__133e64" />
          )}
        </div>
        </header>
      </div>
    </TooltipProvider>
  );
}
