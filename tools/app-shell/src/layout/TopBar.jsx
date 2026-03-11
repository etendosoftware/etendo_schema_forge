import { NavLink, useLocation } from 'react-router-dom';
import { useInspector } from '@/components/inspector/InspectorProvider.jsx';
import {
  Pencil,
  PencilOff,
  Save,
  Loader2,
  Search,
  LayoutGrid,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Separator } from '@/components/ui/separator.jsx';
import LocaleSwitcher from '@/components/LocaleSwitcher.jsx';
import { cn } from '@/lib/utils.js';
import { getSectionColor } from '@/lib/sectionColors.js';
import { findActiveGroup } from './Sidebar.jsx';

export default function TopBar({ menuGroups }) {
  const inspector = useInspector();
  const location = useLocation();
  const activeGroup = findActiveGroup(menuGroups, location.pathname);
  const currentPath = location.pathname.replace(/^\//, '');
  const sectionColor = getSectionColor(activeGroup?.group);

  // First item in the group is the "overview" page
  const overviewItem = activeGroup?.items[0];
  const isOnOverview = overviewItem?.name === currentPath;
  // Remaining items become tabs
  const tabItems = activeGroup?.items.slice(1) || [];

  return (
    <header
      className="flex h-14 shrink-0 items-center border-b-[3px] bg-background"
      style={{ borderBottomColor: sectionColor.accent }}
    >
      {/* Left: section name + overview + tabs */}
      <div className="flex min-w-0 flex-1 items-center gap-2 px-4">
        {activeGroup && (
          <>
            <span className="shrink-0 text-sm font-bold">{activeGroup.group}</span>
            <Separator orientation="vertical" className="mx-1 h-4" />

            {/* Overview badge */}
            {overviewItem && (
              <NavLink to={`/${overviewItem.name}`}>
                <Badge
                  variant={isOnOverview ? 'default' : 'outline'}
                  className={cn(
                    'shrink-0 cursor-pointer',
                    isOnOverview
                      ? ''
                      : 'bg-transparent hover:bg-muted'
                  )}
                >
                  Overview
                </Badge>
              </NavLink>
            )}

            {tabItems.length > 0 && (
              <Separator orientation="vertical" className="mx-1 h-4" />
            )}

            {/* Horizontal scrollable tabs */}
            <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {tabItems.map((item) => {
                const isTabActive = item.name === currentPath;
                return (
                  <NavLink
                    key={item.name}
                    to={`/${item.name}`}
                    className={cn(
                      'group relative flex shrink-0 items-center gap-1.5 px-3 py-1 text-sm transition-colors',
                      isTabActive
                        ? 'text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span>{item.label}</span>
                    <Plus className="h-3 w-3 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100" />
                    {/* Active indicator */}
                    {isTabActive && (
                      <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary" />
                    )}
                  </NavLink>
                );
              })}
            </div>
          </>
        )}

        {!activeGroup && (
          <span className="text-sm text-muted-foreground">
            {currentPath || 'Home'}
          </span>
        )}
      </div>

      {/* Right: inspector controls, search, locale */}
      <div className="flex shrink-0 items-center gap-2 px-4">
        {inspector.editMode && (
          <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
            Edit Mode
          </Badge>
        )}
        <Button
          variant="outline"
          className="relative h-8 w-full justify-start rounded-[0.5rem] bg-muted/50 text-sm font-normal text-muted-foreground shadow-none sm:pr-12 md:w-40 lg:w-64"
          onClick={() => {
            document.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'k', metaKey: true })
            );
          }}
        >
          <Search className="mr-2 h-4 w-4" />
          Search...
          <kbd className="pointer-events-none absolute right-[0.3rem] top-[0.3rem] hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
            <span className="text-xs">&#8984;</span>K
          </kbd>
        </Button>
        <LocaleSwitcher />
        {inspector.editMode && inspector.dirty && (
          <Button size="sm" onClick={inspector.save} disabled={inspector.saving}>
            {inspector.saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save &amp; Regenerate
          </Button>
        )}
        <Button
          variant={inspector.editMode ? 'default' : 'outline'}
          size="icon"
          onClick={() => inspector.setEditMode(!inspector.editMode)}
        >
          {inspector.editMode ? (
            <PencilOff className="h-4 w-4" />
          ) : (
            <Pencil className="h-4 w-4" />
          )}
          <span className="sr-only">Toggle edit mode</span>
        </Button>
      </div>
    </header>
  );
}
