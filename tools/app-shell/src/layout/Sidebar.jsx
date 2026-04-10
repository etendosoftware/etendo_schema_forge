import { useState } from 'react';
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
  Eye,
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Calculator,
  Package,
  Users,
  Settings,
  FolderKanban,
  Target,
  FileJson,
  PanelLeftOpen,
  PanelLeftClose,
  ChevronRight,
  Plug,
} from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { getSectionColor } from '@/lib/sectionColors.js';
import { useMenuLabel } from '@/i18n';

const ICON_MAP = {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Calculator,
  Package,
  Users,
  Settings,
  FolderKanban,
  Target,
  Eye,
  FileJson,
  Plug,
};

export function findActiveGroup(menuGroups, pathname, search) {
  const currentPath = pathname.replace(/^\//, '');
  const currentFull = currentPath + (search || '');
  return menuGroups.find((g) =>
    g.items.some((item) => {
      const itemPath = item.path || item.name;
      // Exact match including query params for items that use ?category=
      if (item.path && item.path.includes('?')) {
        return currentFull === itemPath;
      }
      return item.name === currentPath;
    })
  ) || null;
}

const COLLAPSED_W = 60;
const EXPANDED_W = 240;

export default function AppSidebar({ menuGroups, expanded, onToggle }) {
  const { selectedOrg } = useAuth();
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\//, '');
  const activeGroup = findActiveGroup(menuGroups, location.pathname, location.search);
  const tMenu = useMenuLabel();

  const [openGroups, setOpenGroups] = useState(() => {
    const initial = {};
    if (activeGroup) initial[activeGroup.group] = true;
    return initial;
  });
  const toggleGroup = (group) => {
    setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const width = expanded ? EXPANDED_W : COLLAPSED_W;

  return (
    <TooltipProvider>
      <nav
        className="fixed inset-y-0 left-0 z-50 flex flex-col bg-background transition-[width] duration-200 ease-in-out overflow-hidden border-l-[3px] border-l-blue-500"
        style={{ width }}
      >
        {/* Header: logo + toggle */}
        <div className={cn(
          'flex shrink-0 items-center h-14',
          expanded ? 'px-4 gap-3' : 'justify-center'
        )}>
          <img
            src="/favicon.png"
            alt="Etendo"
            className="h-9 w-9 shrink-0 rounded-lg"
          />
          {expanded && (
            <div className="flex flex-col leading-none min-w-0 flex-1 text-left">
              <span className="text-sm font-semibold text-foreground truncate">{selectedOrg?.name || tMenu('Your company')}</span>
            </div>
          )}
          <button
            onClick={onToggle}
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
              expanded ? 'ml-auto' : 'hidden'
            )}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>


        {/* Expand button (only when collapsed) */}
        {!expanded && (
          <div className="flex justify-center py-2">
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={onToggle}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{tMenu('Expand menu')}</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Menu groups */}
        <div className="flex-1 overflow-auto py-2">
          {menuGroups.map((g, gIdx) => {
            // Show section label if this group starts a new section
            const prevSection = gIdx > 0 ? menuGroups[gIdx - 1].section : null;
            const showSectionLabel = expanded && g.section && g.section !== prevSection;
            const Icon = ICON_MAP[g.icon] || Package;
            const isGroupActive = activeGroup?.group === g.group;
            const color = getSectionColor(tMenu(g.group));
            const isOpen = openGroups[g.group];
            const visibleItems = g.items.filter(i => !i.hidden);
            const isDirect = visibleItems.length === 1;

            if (!expanded) {
              // Collapsed: direct icon link for single-item groups, popover for multi-item
              if (isDirect) {
                const singleItem = visibleItems[0];
                const itemPath = singleItem.path || singleItem.name;
                const isItemActive = singleItem.path?.includes('?')
                  ? (currentPath + location.search) === itemPath
                  : currentPath === singleItem.name;
                return (
                  <div key={g.group} className="flex justify-center py-0.5">
                    <Tooltip delayDuration={0}>
                      <TooltipTrigger asChild>
                        <NavLink
                          to={`/${itemPath}`}
                          className={cn(
                            'flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
                            isItemActive || isGroupActive
                              ? 'bg-foreground text-white shadow-sm'
                              : 'text-muted-foreground hover:bg-white hover:text-foreground'
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </NavLink>
                      </TooltipTrigger>
                      <TooltipContent side="right">{tMenu(singleItem.label)}</TooltipContent>
                    </Tooltip>
                  </div>
                );
              }

              // Collapsed: popover submenu
              return (
                <div key={g.group} className="flex justify-center py-0.5">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
                          isGroupActive
                            ? 'bg-foreground text-white shadow-sm'
                            : 'text-muted-foreground hover:bg-white hover:text-foreground'
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="right"
                      className="w-48 p-1.5"
                    >
                      <p className="px-2 py-1 text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                        {tMenu(g.group)}
                      </p>
                      {g.items.map((item) => {
                        const itemPath = item.path || item.name;
                        const currentFull = currentPath + location.search;
                        const isItemActive = item.path?.includes('?')
                          ? currentFull === itemPath
                          : currentPath === item.name;
                        return (
                          <NavLink
                            key={item.name}
                            to={`/${itemPath}`}
                            className={cn(
                              'block px-2 py-1.5 text-sm rounded-md transition-colors',
                              isItemActive
                                ? 'text-foreground bg-muted font-medium'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                            )}
                          >
                            {tMenu(item.label)}
                          </NavLink>
                        );
                      })}
                    </PopoverContent>
                  </Popover>
                </div>
              );
            }

            // Expanded: direct NavLink for single-item groups, collapsible for multi-item
            if (isDirect) {
              const singleItem = visibleItems[0];
              const itemPath = singleItem.path || singleItem.name;
              const isItemActive = singleItem.path?.includes('?')
                ? (currentPath + location.search) === itemPath
                : currentPath === singleItem.name;
              return (
                <div key={g.group}>
                  {showSectionLabel && (
                    <div className="px-4 pt-4 pb-1">
                      <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">{tMenu(g.section)}</span>
                    </div>
                  )}
                  <NavLink
                    to={`/${itemPath}`}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-4 py-2 text-sm transition-colors',
                      isItemActive || isGroupActive
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                    style={isItemActive || isGroupActive ? { borderLeft: `3px solid ${color.accent}` } : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left truncate">{tMenu(singleItem.label)}</span>
                  </NavLink>
                </div>
              );
            }

            // Expanded: group with collapsible items
            return (
              <div key={g.group}>
                {showSectionLabel && (
                  <div className="px-4 pt-4 pb-1">
                    <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">{tMenu(g.section)}</span>
                  </div>
                )}
                <button
                  onClick={() => toggleGroup(g.group)}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-4 py-2 text-sm transition-colors',
                    isGroupActive
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                  style={isGroupActive ? { borderLeft: `3px solid ${color.accent}` } : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left truncate">{tMenu(g.group)}</span>
                  <ChevronRight className={cn(
                    'h-3.5 w-3.5 shrink-0 transition-transform duration-200',
                    isOpen && 'rotate-90'
                  )} />
                </button>
                {isOpen && (
                  <div className="ml-7 border-l border-border/50 pl-2 py-0.5">
                    {g.items.map((item) => {
                      const itemPath = item.path || item.name;
                      const currentFull = currentPath + location.search;
                      const isItemActive = item.path?.includes('?')
                        ? currentFull === itemPath
                        : currentPath === item.name;
                      return (
                        <NavLink
                          key={item.name}
                          to={`/${itemPath}`}
                          className={cn(
                            'block px-3 py-1.5 text-sm rounded-md transition-colors',
                            isItemActive
                              ? 'text-foreground font-semibold'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                          )}
                        >
                          {tMenu(item.label)}
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className={cn(
          'flex flex-col border-t border-border/50 pt-3 pb-3',
          expanded ? 'px-2 gap-1' : 'items-center gap-1.5'
        )}>
          {/* Artifacts (Solo visible en desarrollo si se activa la flag) */}
          {import.meta.env.VITE_SHOW_ARTIFACTS === 'true' && (
            !expanded ? (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <NavLink
                    to="/artifacts"
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                      location.pathname.startsWith('/artifacts')
                        ? 'text-foreground bg-muted'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <FileJson className="h-5 w-5" />
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right">{tMenu('Artifacts')}</TooltipContent>
              </Tooltip>
            ) : (
              <NavLink
                to="/artifacts"
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors',
                  location.pathname.startsWith('/artifacts')
                    ? 'text-foreground bg-muted'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <FileJson className="h-4 w-4" />
                <span>{tMenu('Artifacts')}</span>
              </NavLink>
            )
          )}

        </div>
      </nav>
    </TooltipProvider>
  );
}
