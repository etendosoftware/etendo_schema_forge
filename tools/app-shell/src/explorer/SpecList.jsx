import { cn } from '@/lib/utils';
import { useSpecs } from './useDiscovery';

export default function SpecList({ selected, onSelect, useAdmin = false }) {
  const { specs, loading, error } = useSpecs({ useAdmin });

  if (loading) return <div className="p-4 text-sm text-inverse-muted">Loading specs...</div>;
  if (error) return <div className="p-4 text-sm text-red-400">Error: {error}</div>;

  const windowSpecs = specs.filter(s => s.type === 'W');
  const processSpecs = specs.filter(s => s.type === 'P');

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {windowSpecs.length > 0 && (
        <div>
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-inverse-muted">
            Windows
          </div>
          {windowSpecs.map(s => (
            <button
              key={s.name}
              onClick={() => onSelect(s.name)}
              className={cn(
                'w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between',
                selected === s.name
                  ? 'bg-blue-600/15 text-blue-400 border-l-2 focus:border-focus-ring'
                  : 'text-inverse-foreground hover:bg-inverse-muted border-l-2 border-transparent'
              )}
            >
              <span className="truncate">{s.name}</span>
              {s.entities && (
                <span className="text-[10px] text-inverse-muted ml-1">{s.entities.length}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {processSpecs.length > 0 && (
        <div className="mt-2">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-inverse-muted">
            Processes
          </div>
          {processSpecs.map(s => (
            <button
              key={s.name}
              onClick={() => onSelect(s.name)}
              className={cn(
                'w-full text-left px-3 py-2 text-sm transition-colors flex items-center',
                selected === s.name
                  ? 'bg-purple-600/15 text-purple-400 border-l-2 border-purple-500'
                  : 'text-inverse-foreground hover:bg-inverse-muted border-l-2 border-transparent'
              )}
            >
              <span className="truncate">{s.name}</span>
            </button>
          ))}
        </div>
      )}

      {specs.length === 0 && (
        <div className="p-4 text-sm text-inverse-muted">No specs found</div>
      )}
    </div>
  );
}
