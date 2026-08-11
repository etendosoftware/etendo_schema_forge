import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext.jsx';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip.jsx';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover.jsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.jsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { UserAvatarButton } from '@/components/UserAvatarButton.jsx';
import {
  PanelLeftOpen,
  PanelLeftClose,
  ChevronRight,
  ChevronDown,
  Headphones,
  FileJson,
  Loader2,
} from 'lucide-react';
import {
  ClipboardText as ClipboardCheck,
  House,
  Star,
  IdentificationCard,
  ShareNetwork,
  TrendUp,
  Receipt,
  Bank,
  Package,
  Briefcase,
  Users,
  Presentation,
  Plug,
  Gear,
  Flask,
  SquaresFour,
  Eye,
  FileCode,
  Storefront,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils.js';
import { useMenuLabel, useUI, useLocaleSwitch } from '@/i18n';
import { useFavorites } from '@/components/layout/FavoritesContext';
import {
  useFeatureFlag,
  PROOF_OF_CONCEPT_MENU,
  TENANT_UPGRADE,
} from '@/lib/flags';
import { useEnvironmentSwitch } from '@/hooks/useEnvironmentSwitch.js';
import { environmentPlanLabelKey } from '@/lib/environmentPresentation.js';
import menuConfig from '@/menu.json';

const ICON_MAP = {
  ClipboardCheck,
  Home:           House,
  Star,
  Contact2:       IdentificationCard,
  Share2:         ShareNetwork,
  TrendingUp:     TrendUp,
  Receipt,
  Building2:      Bank,
  Package,
  Briefcase,
  Users,
  Presentation,
  Plug,
  Settings:       Gear,
  FlaskConical:   Flask,
  LayoutDashboard: SquaresFour,
  Eye,
  FileJson:       FileCode,
  Store:          Storefront,
};

function CollapsedGroupPopover({
  group,
  iconKey,
  isGroupActive,
  items,
  currentPath,
  locationSearch,
  tMenu,
  emptyLabel,
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  const GroupIcon = ICON_MAP[iconKey] || Package;
  return (
    <Popover open={open} onOpenChange={setOpen} data-testid="Popover__247c75">
      <PopoverTrigger asChild data-testid="PopoverTrigger__247c75">
        <button
          type="button"
          aria-label={tMenu(group)}
          onMouseEnter={() => { cancelClose(); setOpen(true); }}
          onMouseLeave={scheduleClose}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
            isGroupActive
              ? 'bg-accent-highlight text-accent-highlight-foreground'
              : 'bg-page-bg text-muted-foreground hover:text-foreground'
          )}
        >
          <GroupIcon
            weight={isGroupActive ? 'fill' : 'regular'}
            className="h-5 w-5"
            data-testid="GroupIcon__247c75" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        sideOffset={8}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        className="w-52 p-0 overflow-hidden"
        data-testid="PopoverContent__247c75">
        <p className="px-3 pt-3 pb-1 text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
          {tMenu(group)}
        </p>
        <div className="pb-2">
          {items.length === 0 && emptyLabel && (
            <p className="px-3 py-2 text-xs text-muted-foreground italic">
              {emptyLabel}
            </p>
          )}
          {items.map((item) => {
            const itemPath = item.path || item.name;
            const currentFull = currentPath + locationSearch;
            const isItemActive = matchesItem(item, currentPath, currentFull);
            return (
              <NavLink
                key={item.name}
                to={`/${itemPath}`}
                className={cn(
                  'flex w-full items-center px-3 py-2 text-sm transition-colors',
                  isItemActive
                    ? 'bg-accent-highlight text-accent-highlight-foreground font-semibold'
                    : 'text-foreground hover:bg-muted/50'
                )}
                data-testid={`menu-item-${item.slug || item.name?.replace(/\s+/g, '-').toLowerCase()}`}>
                {tMenu(item.label)}
              </NavLink>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function matchesItem(item, currentPath, currentFull) {
  const target = item.path || item.name;
  if (target.includes('?')) {
    return currentFull === target;
  }
  return currentPath === target || currentPath.startsWith(target + '/');
}

export function findActiveGroup(menuGroups, pathname, search) {
  const currentPath = pathname.replace(/^\//, '');
  const currentFull = currentPath + (search || '');
  return menuGroups.find((g) =>
    g.group !== 'Favorites' &&
    g.items.some((item) => matchesItem(item, currentPath, currentFull))
  ) || null;
}

const COLLAPSED_W = 56;
const EXPANDED_W = 240;

function deriveMenuGroupRenderProps(gIdx, resolvedMenuGroups, expanded, g, activeGroup, openGroups) {
  const prevSection = gIdx > 0 ? resolvedMenuGroups[gIdx - 1].section : null;
  const showSectionLabel = expanded && g.section && g.section !== prevSection;
  const Icon = ICON_MAP[g.icon] || Package;
  const isGroupActive = activeGroup?.group === g.group && g.group !== 'Favorites';
  const isOpen = openGroups[g.group];
  const visibleItems = g.items.filter(i => !i.hidden);
  const isDirect = visibleItems.length === 1 && g.group !== 'Favorites';
  return {showSectionLabel, Icon, isGroupActive, isOpen, visibleItems, isDirect};
}

function ExpandedDirectLink({ group, singleItem, Icon, showSectionLabel, sectionLabel, isItemActive, isGroupActive, itemLabel }) {
  const itemPath = singleItem.path || singleItem.name;
  const isActive = isItemActive || isGroupActive;
  return (
    <div>
      {showSectionLabel && (
        <div className="px-4 pt-4 pb-1">
          <span className="text-xs text-[hsl(var(--muted-foreground))]">{sectionLabel}</span>
        </div>
      )}
      <div className="px-2 py-0.5">
        <NavLink
          to={`/${itemPath}`}
          className={cn(
            'flex w-full items-center gap-2.5 px-3 py-1.5 text-sm transition-colors border-l-[3px] border-transparent',
            isActive
              ? 'bg-accent-highlight text-accent-highlight-foreground font-medium'
              : 'hover:bg-muted/50'
          )}
          data-testid={`menu-item-${singleItem.slug || singleItem.name?.replace(/\s+/g, '-').toLowerCase()}`}>
          <Icon
            weight={isActive ? 'fill' : 'regular'}
            className={cn('h-5 w-5 shrink-0', !isActive && 'text-muted-foreground')}
            data-testid="Icon__247c75" />
          <span className={cn('flex-1 text-left truncate', !isActive && 'text-text-primary')}>
            {itemLabel}
          </span>
        </NavLink>
      </div>
    </div>
  );
}

function getGroupHeaderClass(isGroupActive, isOpen) {
  if (isGroupActive && !isOpen) {
    return 'bg-accent-highlight text-accent-highlight-foreground font-medium border-accent-highlight';
  } else {
    if (isGroupActive) {
      return 'font-medium hover:bg-muted/50 border-accent-highlight';
    } else {
      return 'hover:bg-muted/50 border-transparent';
    }
  }
}

function ExpandedGroupSection({
  group,
  Icon,
  showSectionLabel,
  sectionLabel,
  groupLabel,
  isOpen,
  isGroupActive,
  onToggle,
  emptyFavoritesLabel,
  visibleItems,
  overflowItems,
  isFavorites,
  favOverflowOpen,
  onShowMoreFavorites,
  andNMoreLabel,
  renderItem,
  renderFavoriteOverflowItem,
}) {
  return (
    <div>
      {showSectionLabel && (
        <div className="px-4 pt-4 pb-1">
          <span className="text-xs text-[hsl(var(--muted-foreground))]">{sectionLabel}</span>
        </div>
      )}
      <div className="px-2 py-0.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!!isOpen}
          data-testid={`menu-group-${group.group.replace(/\s+/g, '-').toLowerCase()}`}
          className={cn(
            'flex w-full items-center gap-2.5 px-3 py-1.5 text-sm transition-colors border-l-[3px]',
            getGroupHeaderClass(isGroupActive, isOpen)
          )}
        >
          <Icon
            weight={isGroupActive ? 'fill' : 'regular'}
            className={cn('h-5 w-5 shrink-0', !isGroupActive && 'text-muted-foreground')}
            data-testid="Icon__247c75" />
          <span className={cn('flex-1 text-left truncate', !(isGroupActive && !isOpen) && 'text-text-primary')}>
            {groupLabel}
          </span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 transition-transform duration-200 text-muted-foreground',
              isOpen && 'rotate-180'
            )}
            data-testid="ChevronDown__247c75" />
        </button>
      </div>
      {isOpen && (
        <div className="py-0.5">
          {isFavorites && group.items.length === 0 && (
            <p className="pl-[52px] pr-4 py-1.5 text-xs text-muted-foreground italic">
              {emptyFavoritesLabel}
            </p>
          )}
          {visibleItems.map(renderItem)}
          {isFavorites && overflowItems.length > 0 && (
            favOverflowOpen
              ? overflowItems.map(renderFavoriteOverflowItem)
              : (
                <button
                  type="button"
                  onClick={onShowMoreFavorites}
                  className="relative flex w-full items-center pl-[52px] pr-4 py-1.5 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
                >
                  <span className="absolute left-[33px] top-0 bottom-0 w-px bg-[hsl(var(--border-subtle))]" />
                  <span className="flex-1 text-left">{andNMoreLabel}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" data-testid="ChevronDown__247c75" />
                </button>
              )
          )}
        </div>
      )}
    </div>
  );
}

function UnreadBadge({ unreadCount, expanded }) {
  if (unreadCount <= 0) return null;
  const label = unreadCount > 9 ? '9+' : unreadCount;
  if (expanded) {
    return (
      <span
        className="flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold leading-none"
        style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--foreground))' }}
      >
        {label}
      </span>
    );
  }
  return (
    <span
      className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold leading-none ring-2 ring-background"
      style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--foreground))' }}
    >
      {label}
    </span>
  );
}

function HelpEntryPoint({ expanded, onClick, unreadCount, ui }) {
  if (!expanded) {
    return (
      <Tooltip delayDuration={0} data-testid="Tooltip__247c75">
        <TooltipTrigger asChild data-testid="TooltipTrigger__247c75">
          <button
            type="button"
            onClick={onClick}
            aria-label={ui('helpAndSupport')}
            className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-page-bg text-muted-foreground hover:text-foreground transition-colors"
          >
            <Headphones className="h-5 w-5" data-testid="Headphones__247c75" />
            <UnreadBadge
              unreadCount={unreadCount}
              expanded={false}
              data-testid="UnreadBadge__247c75" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" data-testid="TooltipContent__247c75">{ui('helpAndSupport')}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-foreground hover:bg-muted/50 transition-colors"
    >
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Headphones className="h-4 w-4" data-testid="Headphones__247c75" />
      </span>
      <span className="flex-1 text-left truncate">{ui('helpAndSupport')}</span>
      <UnreadBadge unreadCount={unreadCount} expanded data-testid="UnreadBadge__247c75" />
      {unreadCount === 0 && (
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground"
          data-testid="ChevronRight__247c75" />
      )}
    </button>
  );
}

function ArtifactsLink({ expanded, isActive, tMenu }) {
  if (!expanded) {
    return (
      <Tooltip delayDuration={0} data-testid="Tooltip__247c75">
        <TooltipTrigger asChild data-testid="TooltipTrigger__247c75">
          <NavLink
            to="/artifacts"
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
              isActive ? 'text-foreground bg-muted' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
            data-testid="NavLink__247c75">
            <FileJson className="h-5 w-5" data-testid="FileJson__247c75" />
          </NavLink>
        </TooltipTrigger>
        <TooltipContent side="right" data-testid="TooltipContent__247c75">{tMenu('Artifacts')}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <NavLink
      to="/artifacts"
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors',
        isActive ? 'text-foreground bg-muted' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      )}
      data-testid="NavLink__247c75">
      <FileJson className="h-4 w-4" data-testid="FileJson__247c75" />
      <span>{tMenu('Artifacts')}</span>
    </NavLink>
  );
}

function SideMenuFooter({ expanded, onHelpClick, unreadCount, ui, isArtifactsActive, tMenu }) {
  return (
    <div className={cn(
      'flex flex-col shrink-0 pb-2',
      expanded ? 'px-2 gap-1 pt-2' : 'px-2 gap-1'
    )}>
      <div className={cn('border-t border-[hsl(var(--border-subtle))] mb-1', expanded ? 'mx-[-8px]' : 'w-10')} />
      <HelpEntryPoint
        expanded={expanded}
        onClick={onHelpClick}
        unreadCount={unreadCount}
        ui={ui}
        data-testid="HelpEntryPoint__247c75" />
      <div className={cn('flex items-center', expanded ? '' : 'justify-center')}>
        <UserAvatarButton expanded={expanded} data-testid="UserAvatarButton__247c75" />
      </div>
      {import.meta.env.VITE_SHOW_ARTIFACTS === 'true' && (
        <ArtifactsLink
          expanded={expanded}
          isActive={isArtifactsActive}
          tMenu={tMenu}
          data-testid="ArtifactsLink__247c75" />
      )}
    </div>
  );
}

export default function SideMenu({
  menuGroups,
  expanded,
  onToggle,
  onHelpClick,
  unreadCount = 0,
  logoSrc = '/favicon.png',
}) {
  const { selectedOrg } = useAuth();
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\//, '');
  const { favorites } = useFavorites();
  // Switching between tenants only means something once an account can own more
  // than one, so the switcher rides the same flag as the upgrade flow. With the
  // flag off this renders exactly what it did before: the current company alone.
  const multiTenantEnabled = useFeatureFlag(TENANT_UPGRADE);
  // This is visual gating only. The windows remain protected by normal AD role
  // filtering; the flag merely stops offering this internal menu section.
  const showProofOfConceptMenu = useFeatureFlag(PROOF_OF_CONCEPT_MENU);
  const { environments, switchTo, switching, currentClientId } = useEnvironmentSwitch({
    enabled: multiTenantEnabled,
  });

  const favNameMap = useMemo(() => {
    const map = {};
    for (const g of menuConfig.menu) {
      if (g.group === 'Favorites') continue;
      for (const item of g.items || []) {
        map[item.path || item.name] = item.favname || item.label;
      }
    }
    return map;
  }, []);

  const resolvedMenuGroups = menuGroups
    .filter(g => g.group !== 'Proof of Concept' || showProofOfConceptMenu)
    .map((g) => {
      if (g.group !== 'Favorites') return g;
      return { ...g, items: favorites };
    });

  const activeGroup = findActiveGroup(resolvedMenuGroups, location.pathname, location.search);
  const tMenu = useMenuLabel();
  const ui = useUI();
  const { locale } = useLocaleSwitch();

  const [openGroups, setOpenGroups] = useState(() => {
    const initial = {};
    if (activeGroup) initial[activeGroup.group] = true;
    return initial;
  });

  useEffect(() => {
    setOpenGroups(activeGroup ? { [activeGroup.group]: true } : {});
    // `activeGroup?.group` (a stable primitive, not the whole recomputed-every-
    // render object) is also a dependency: `menuGroups` can change without any
    // navigation when role-filtered data (ETP-4598's allowedIds) resolves after
    // an initial render where AD-backed items were filtered out. Without this,
    // a direct/deep-link page load into a filtered group's route could permanently
    // leave that group collapsed — the active group only gets (re)computed here
    // on location changes, never in reaction to menuGroups itself changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, activeGroup?.group]);

  const [favOverflowOpen, setFavOverflowOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const FAVORITES_VISIBLE = 2;

  const toggleGroup = (group) => {
    if (group === 'Favorites') setFavOverflowOpen(false);
    setOpenGroups(prev => ({ [group]: !prev[group] }));
  };

  const handleHelpClick = () => {
    if (typeof onHelpClick === 'function') {
      onHelpClick();
      return;
    }
    setHelpOpen(true);
  };

  const width = expanded ? EXPANDED_W : COLLAPSED_W;

  return (
    <TooltipProvider data-testid="TooltipProvider__247c75">
      <nav
        aria-label={ui('navigation')}
        className="fixed inset-y-0 left-0 z-40 flex flex-col bg-page-bg transition-[width] duration-200 ease-in-out overflow-hidden"
        style={{ width }}
      >
        {/* Header */}
        {expanded ? (
          <div className="relative flex shrink-0 items-center h-[62px] px-3 gap-2">
            <DropdownMenu data-testid="DropdownMenu__247c75">
              <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__247c75">
                <button
                  type="button"
                  aria-label={ui('switchCompany')}
                  className="flex flex-1 min-w-0 items-center gap-2 h-10 pl-1 pr-2 rounded-full hover:bg-muted/60 transition-colors"
                >
                  <img
                    src={logoSrc}
                    alt="Etendo"
                    className="h-8 w-8 shrink-0 rounded-full"
                  />
                  <span className="flex-1 text-left text-sm font-semibold text-foreground truncate">
                    {selectedOrg?.name || ui('yourCompany')}
                  </span>
                  <ChevronDown
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    data-testid="ChevronDown__247c75" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56" data-testid="DropdownMenuContent__247c75">
                <DropdownMenuLabel data-testid="DropdownMenuLabel__247c75">{ui('switchCompany')}</DropdownMenuLabel>
                <DropdownMenuSeparator data-testid="DropdownMenuSeparator__247c75" />
                {environments.length > 0 ? (
                  environments.map((env) => {
                    const isCurrent = env.clientId === currentClientId;
                    return (
                      <DropdownMenuItem
                        key={env.clientId}
                        disabled={isCurrent || switching !== null}
                        onSelect={() => { if (!isCurrent) switchTo(env); }}
                        data-testid={`company-option-${env.clientId}`}
                      >
                        <img
                          src={logoSrc}
                          alt=""
                          className="h-5 w-5 mr-2 rounded-full"
                        />
                        <span className="flex-1 truncate">
                          {env.clientName || env.orgName || ui('yourCompany')}
                        </span>
                        <span className={cn(
                          'ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                          env.plan === 'productive'
                            ? 'bg-status-success text-status-success-foreground'
                            : 'bg-muted text-muted-foreground'
                        )}>
                          {ui(environmentPlanLabelKey(env))}
                        </span>
                        {switching === env.clientId && (
                          <Loader2
                            className="h-3.5 w-3.5 ml-2 shrink-0 animate-spin"
                            data-testid="Loader2__247c75" />
                        )}
                      </DropdownMenuItem>
                    );
                  })
                ) : (
                  // No platform token, or the list could not be read: showing the
                  // current company alone beats an empty menu.
                  (<DropdownMenuItem disabled data-testid="DropdownMenuItem__247c75">
                    <img
                      src={logoSrc}
                      alt=""
                      className="h-5 w-5 mr-2 rounded-full"
                    />
                    <span className="flex-1 truncate">
                      {selectedOrg?.name || ui('yourCompany')}
                    </span>
                  </DropdownMenuItem>)
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              onClick={onToggle}
              aria-label={ui('collapseMenu')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <PanelLeftClose className="h-4 w-4" data-testid="PanelLeftClose__247c75" />
            </button>
            <div className="absolute bottom-0 left-3 right-3 border-t border-border/50" />
          </div>
        ) : (
          <div className="flex flex-row items-center justify-center h-[63px] px-2">
            <div className="flex items-center w-10 h-full border-b border-[hsl(var(--border-subtle))]">
              <Tooltip delayDuration={0} data-testid="Tooltip__247c75">
                <TooltipTrigger asChild data-testid="TooltipTrigger__247c75">
                  <button
                    type="button"
                    onClick={onToggle}
                    aria-label={ui('expandMenu')}
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-page-bg text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <PanelLeftOpen className="h-5 w-5" data-testid="PanelLeftOpen__247c75" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" data-testid="TooltipContent__247c75">{ui('expandMenu')}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}

        {/* Menu groups */}
        <div className={cn('flex-1 overflow-auto sidebar-scroll', expanded ? 'py-2' : 'flex flex-col py-2 px-2 gap-3')}>
          {resolvedMenuGroups.map((g, gIdx) => {
            const {
              showSectionLabel,
              Icon,
              isGroupActive,
              isOpen,
              visibleItems,
              isDirect
            } = deriveMenuGroupRenderProps(gIdx, resolvedMenuGroups, expanded, g, activeGroup, openGroups);

            /* ── COLLAPSED ── */
            if (!expanded) {
              if (isDirect) {
                const singleItem = visibleItems[0];
                const itemPath = singleItem.path || singleItem.name;
                const isItemActive = matchesItem(singleItem, currentPath, currentPath + location.search);
                return (
                  <div
                    key={g.group}
                    className="flex justify-center"
                  >
                    <Tooltip delayDuration={0} data-testid="Tooltip__247c75">
                      <TooltipTrigger asChild data-testid="TooltipTrigger__247c75">
                        <NavLink
                          to={`/${itemPath}`}
                          className={cn(
                            'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                            isItemActive || isGroupActive
                              ? 'bg-accent-highlight text-accent-highlight-foreground'
                              : 'bg-page-bg text-muted-foreground hover:text-foreground'
                          )}
                          data-testid={`menu-item-${singleItem.slug || singleItem.name?.replace(/\s+/g, '-').toLowerCase()}`}>
                          <Icon
                            weight={isItemActive || isGroupActive ? 'fill' : 'regular'}
                            className="h-5 w-5"
                            data-testid="Icon__247c75" />
                        </NavLink>
                      </TooltipTrigger>
                      <TooltipContent side="right" data-testid="TooltipContent__247c75">{tMenu(singleItem.label)}</TooltipContent>
                    </Tooltip>
                  </div>
                );
              }

              return (
                <div
                  key={g.group}
                  className="flex justify-center"
                >
                  <CollapsedGroupPopover
                    group={g.group}
                    iconKey={g.icon}
                    isGroupActive={isGroupActive}
                    items={g.items}
                    currentPath={currentPath}
                    locationSearch={location.search}
                    tMenu={tMenu}
                    emptyLabel={g.group === 'Favorites' ? ui('noFavoritesYet') : null}
                    data-testid="CollapsedGroupPopover__247c75" />
                </div>
              );
            }

            /* ── EXPANDED — direct link ── */
            if (isDirect) {
              const singleItem = visibleItems[0];
              const itemPath = singleItem.path || singleItem.name;
              const isItemActive = matchesItem(singleItem, currentPath, currentPath + location.search);
              return (
                <ExpandedDirectLink
                  key={g.group}
                  group={g}
                  singleItem={singleItem}
                  Icon={Icon}
                  showSectionLabel={showSectionLabel}
                  sectionLabel={tMenu(g.section)}
                  isItemActive={isItemActive}
                  isGroupActive={isGroupActive}
                  itemLabel={tMenu(singleItem.label)}
                  data-testid="ExpandedDirectLink__247c75" />
              );
            }

            /* ── EXPANDED — group with sub-items ── */
            const isFavorites = g.group === 'Favorites';
            const renderMenuItemLink = (item) => {
              const itemPath = item.path || item.name;
              const currentFull = currentPath + location.search;
              const isItemActive = !isFavorites && matchesItem(item, currentPath, currentFull);
              return (
                <NavLink
                  key={item.name}
                  to={`/${itemPath}`}
                  className={cn(
                    'relative flex w-full items-center pl-[52px] pr-4 py-1.5 text-sm transition-colors',
                    isItemActive
                      ? 'text-accent-highlight-foreground font-semibold'
                      : 'text-text-primary hover:bg-muted/50'
                  )}
                  data-testid={`menu-item-${item.slug || item.name?.replace(/\s+/g, '-').toLowerCase()}`}>
                  <span className={cn(
                    'absolute left-[33px] top-0 bottom-0 w-px',
                    isItemActive ? 'bg-card/40' : 'bg-[hsl(var(--border-subtle))]'
                  )} />
                  {isItemActive && (
                    <span className="absolute left-[33px] right-2 top-0 bottom-0 bg-accent-highlight" />
                  )}
                  <span className="relative z-10">
                    {isFavorites
                      ? (item.labels?.[locale] || tMenu(favNameMap[item.path || item.name] || item.label))
                      : tMenu(item.label)}
                  </span>
                </NavLink>
              );
            };
            const renderFavoriteOverflowItem = (item) => {
              const itemPath = item.path || item.name;
              return (
                <NavLink
                  key={item.name}
                  to={`/${itemPath}`}
                  className="relative flex w-full items-center pl-[52px] pr-4 py-1.5 text-sm text-text-primary hover:bg-muted/50 transition-colors"
                  data-testid="NavLink__247c75">
                  <span className="absolute left-[33px] top-0 bottom-0 w-px bg-[hsl(var(--border-subtle))]" />
                  <span className="relative z-10">
                    {item.labels?.[locale] || tMenu(favNameMap[itemPath] || item.label)}
                  </span>
                </NavLink>
              );
            };
            const visibleSubItems = isFavorites ? g.items.slice(0, FAVORITES_VISIBLE) : g.items;
            const overflowSubItems = isFavorites ? g.items.slice(FAVORITES_VISIBLE) : [];
            return (
              <ExpandedGroupSection
                key={g.group}
                group={g}
                Icon={Icon}
                showSectionLabel={showSectionLabel}
                sectionLabel={tMenu(g.section)}
                groupLabel={tMenu(g.group)}
                isOpen={isOpen}
                isGroupActive={isGroupActive}
                onToggle={() => toggleGroup(g.group)}
                emptyFavoritesLabel={ui('noFavoritesYet')}
                visibleItems={visibleSubItems}
                overflowItems={overflowSubItems}
                isFavorites={isFavorites}
                favOverflowOpen={favOverflowOpen}
                onShowMoreFavorites={() => setFavOverflowOpen(true)}
                andNMoreLabel={ui('andNMore', { n: g.items.length - FAVORITES_VISIBLE })}
                renderItem={renderMenuItemLink}
                renderFavoriteOverflowItem={renderFavoriteOverflowItem}
                data-testid="ExpandedGroupSection__247c75" />
            );
          })}
        </div>

        <SideMenuFooter
          expanded={expanded}
          onHelpClick={handleHelpClick}
          unreadCount={unreadCount}
          ui={ui}
          isArtifactsActive={location.pathname.startsWith('/artifacts')}
          tMenu={tMenu}
          data-testid="SideMenuFooter__247c75" />
      </nav>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen} data-testid="Dialog__247c75">
        <DialogContent data-testid="DialogContent__247c75">
          <DialogHeader data-testid="DialogHeader__247c75">
            <DialogTitle data-testid="DialogTitle__247c75">{ui('helpAndSupport')}</DialogTitle>
            <DialogDescription data-testid="DialogDescription__247c75">{ui('helpComingSoon')}</DialogDescription>
          </DialogHeader>
          <DialogFooter data-testid="DialogFooter__247c75">
            <Button
              variant="outline"
              onClick={() => setHelpOpen(false)}
              data-testid="Button__247c75">
              {ui('close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
