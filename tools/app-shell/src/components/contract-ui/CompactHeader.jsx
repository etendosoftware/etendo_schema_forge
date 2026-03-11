import { useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { SummaryBar } from './SummaryBar.jsx';

/**
 * Compact card header for master-detail entities.
 *
 * Collapsed: title + subtitle + summary fields (read-only, dense).
 * Expanded: full Form component with all editable fields.
 *
 * Props:
 *  - title: string (e.g. "SO-002")
 *  - subtitle: string (e.g. "Beta LLC")
 *  - summary: Array<{ key, column, type }> — read-only summary fields
 *  - data: object with current field values
 *  - Form: React component (e.g. OrderForm)
 *  - entity: string — entity name for Form
 *  - onChange: (key, value) => void — field change handler
 *  - catalogs: object — FK catalog data for Form
 *  - defaultExpanded: boolean — start expanded (for new records)
 */
export function CompactHeader({
  title,
  subtitle,
  summary = [],
  data,
  Form,
  entity,
  onChange,
  catalogs,
  defaultExpanded = false,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      {/* Always visible: title + summary */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground truncate">{title}</h2>
              {subtitle && (
                <span className="text-sm text-muted-foreground truncate">&middot; {subtitle}</span>
              )}
            </div>
            {!expanded && summary.length > 0 && (
              <div className="mt-1.5">
                <SummaryBar fields={summary} data={data} />
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-xs gap-1"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>Close <ChevronUp className="h-3 w-3" /></>
            ) : (
              <>Edit <ChevronDown className="h-3 w-3" /></>
            )}
          </Button>
        </div>
      </div>

      {/* Expandable form */}
      <div
        className="transition-all duration-200 ease-out"
        style={{
          maxHeight: expanded ? '2000px' : '0px',
          opacity: expanded ? 1 : 0,
          overflow: 'hidden',
        }}
      >
        <div className="px-4 pb-4 pt-1 border-t">
          <Form
            entity={entity}
            data={data}
            onChange={onChange}
            catalogs={catalogs}
          />
        </div>
      </div>
    </div>
  );
}
