import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { useEntity } from '@/hooks/useEntity';
import { useMenuLabel } from '@/i18n';
import { Search, ArrowUpDown, SlidersHorizontal, Eye, ChevronDown, MoreVertical, Plus, CalendarDays, Link2, Sparkles, Bell, Mic } from 'lucide-react';
import LocaleSwitcher from '@/components/LocaleSwitcher.jsx';
import { UserAvatarButton, UserContextSwitcher } from '@/components/UserContextSwitcher.jsx';

/**
 * Full-width list view for an entity.
 */
export function ListView({
  entity,
  Table,
  entityLabel,
  windowName,
  token,
  apiBaseUrl,
  breadcrumb,
}) {
  const hook = useEntity(entity, null, { token, apiBaseUrl });
  const navigate = useNavigate();
  const tMenu = useMenuLabel();
  const label = tMenu(entityLabel) || entityLabel || entity;
  const [selectedRows, setSelectedRows] = useState([]);
  const [showUserContext, setShowUserContext] = useState(false);

  return (
    <div className="h-full flex flex-col">
      {/* Top bar area (gray background, inherited from parent) */}
      <div className="px-6 pt-3 pb-3">
        {/* Row 1: Title + Global search + action icons */}
        <div className="flex items-center gap-4">
          {/* Left: title + count + menu */}
          <div className="shrink-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{label}</h1>
              {!hook.loading && (
                <span className="inline-flex items-center justify-center h-6 min-w-[1.5rem] px-2 text-xs font-medium text-muted-foreground bg-white/60 rounded-full">
                  {hook.items.length}
                </span>
              )}
              <button className="text-muted-foreground hover:text-foreground">
                <MoreVertical className="h-4 w-4" />
              </button>
            </div>
            {breadcrumb && (
              <p className="text-sm text-muted-foreground mt-0.5">{breadcrumb}</p>
            )}
          </div>

          {/* Center: global search */}
          <div className="flex-1 flex justify-center">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search clients, orders, invoices..."
                readOnly
                tabIndex={-1}
                className="w-full h-9 rounded-lg border border-border/50 bg-white/60 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-colors cursor-default"
              />
              <Mic className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
            </div>
          </div>

          {/* Right: action icons */}
          <div className="flex items-center gap-1 shrink-0">
            <button className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <Sparkles className="h-4 w-4" />
            </button>
            <button className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <Plus className="h-4 w-4" />
            </button>
            <button className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="h-4 w-4" />
            </button>
            <LocaleSwitcher />
            <UserAvatarButton isOpen={showUserContext} onClick={() => setShowUserContext(v => !v)} />
            {showUserContext && <UserContextSwitcher onClose={() => setShowUserContext(false)} />}
          </div>
        </div>
      </div>

      {/* White content card with rounded top-left corner */}
      <div className="flex-1 flex flex-col bg-white rounded-tl-2xl overflow-hidden min-h-0">
        {/* Selection bar or filter bar */}
        {selectedRows.length > 0 ? (
          <div className="flex items-center justify-between px-6 py-3 border-b border-border/30">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">{selectedRows.length} Selected</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="text-muted-foreground" onClick={() => setSelectedRows([])}>
                Clear
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground font-normal h-9 px-3 rounded-lg bg-white">
                All statuses
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground font-normal h-9 px-3 rounded-lg bg-white">
                <CalendarDays className="h-3.5 w-3.5" />
                Last year
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <button className="h-9 w-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button className="h-9 w-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
                <Search className="h-4 w-4" />
              </button>
              <button className="h-9 w-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
                <Link2 className="h-4 w-4" />
              </button>
              <button className="h-9 w-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
                <ArrowUpDown className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-1.5 ml-1">
                <button className="h-9 w-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
                  <Eye className="h-4 w-4" />
                </button>
                {!hook.loading && (
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {hook.items.length}
                  </span>
                )}
              </div>
              {/* Split "New" button */}
              <div className="inline-flex items-stretch rounded-lg overflow-hidden shadow-sm ml-3">
                <Button
                  className="rounded-none rounded-l-lg gap-1.5 px-4"
                  onClick={() => navigate(`/${windowName}/new`)}
                >
                  <Plus className="h-4 w-4" />
                  New {label.replace(/s$/, '')}
                </Button>
                <div className="w-px bg-primary-foreground/20" />
                <Button
                  className="rounded-none rounded-r-lg px-2"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto px-6 pb-6">
          {hook.loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <Table
              entity={entity}
              data={hook.items}
              onNavigate={(row) => navigate(`/${windowName}/${row.id}`)}
              onSelectionChange={setSelectedRows}
              compact={false}
            />
          )}
        </div>
      </div>
    </div>
  );
}
