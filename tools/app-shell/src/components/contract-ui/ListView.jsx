import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { useEntity } from '@/hooks/useEntity';
import { useMenuLabel } from '@/i18n';

/**
 * Full-width list view for an entity.
 *
 * Props:
 *  - entity: string
 *  - Table: React component (DataTable wrapper with columns/filters baked in)
 *  - entityLabel: string
 *  - windowName: string (URL slug, used for navigation)
 *  - token: string
 *  - apiBaseUrl: string
 */
export function ListView({
  entity,
  Table,
  entityLabel,
  windowName,
  token,
  apiBaseUrl,
}) {
  const hook = useEntity(entity, null, { token, apiBaseUrl });
  const navigate = useNavigate();
  const tMenu = useMenuLabel();
  const label = tMenu(entityLabel) || entityLabel || entity;

  return (
    <div className="h-[calc(100vh-7.5rem)] flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-1 pb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">{label}</h2>
          {!hook.loading && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {hook.items.length}
            </span>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => navigate(`/${windowName}/new`)}
        >
          + New
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
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
            compact={false}
          />
        )}
      </div>
    </div>
  );
}
