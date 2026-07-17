import { cn } from '@/lib/utils';
import { useSpecDetail } from './useDiscovery';

const METHOD_COLORS = {
  GET: 'bg-status-success/20 text-status-success-foreground',
  POST: 'bg-status-info/20 text-status-info-foreground',
  PUT: 'bg-status-warning/20 text-status-warning-foreground',
  PATCH: 'bg-status-warning/20 text-status-warning-foreground',
  DELETE: 'bg-destructive/20 text-destructive',
};

export default function EntityPanel({ specName, selectedEntity, onSelectEntity }) {
  const { spec, loading, error } = useSpecDetail(specName);

  if (!specName) {
    return <div className="p-4 text-sm text-inverse-muted">Select a spec</div>;
  }
  if (loading) return <div className="p-4 text-sm text-inverse-muted">Loading...</div>;
  if (error) return <div className="p-4 text-sm text-destructive">{error}</div>;
  if (!spec) return null;

  const entities = spec.entities || [];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2 border-b border-inverse-border">
        <div className="text-xs font-semibold text-inverse-muted uppercase tracking-wider">
          {spec.name}
        </div>
        <div className="text-[10px] text-inverse-muted mt-0.5">
          {spec.type === 'W' ? 'Window' : 'Process'} · {entities.length} entities
        </div>
      </div>

      {entities.map(entity => (
        <button
          key={entity.name}
          onClick={() => onSelectEntity(entity)}
          className={cn(
            'w-full text-left px-3 py-3 border-b border-inverse-border/50 transition-colors',
            selectedEntity?.name === entity.name
              ? 'bg-inverse-muted'
              : 'hover:bg-inverse-muted/50'
          )}
          style={{ paddingLeft: `${12 + (entity.tabLevel || 0) * 16}px` }}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm text-inverse-foreground font-medium">{entity.name}</span>
            {entity.tabLevel > 0 && (
              <span className="text-[10px] text-inverse-muted">L{entity.tabLevel}</span>
            )}
          </div>
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {(entity.methods || []).map(m => (
              <span
                key={m}
                className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold',
                  METHOD_COLORS[m] || 'bg-inverse-muted text-inverse-foreground'
                )}
              >
                {m}
              </span>
            ))}
          </div>
          {entity.fields && (
            <div className="text-[10px] text-inverse-muted mt-1">
              {entity.fields.length} fields
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
