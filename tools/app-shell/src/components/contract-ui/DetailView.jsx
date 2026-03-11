import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Separator } from '@/components/ui/separator.jsx';
import { ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { useEntity } from '@/hooks/useEntity';
import { SummaryBar } from './SummaryBar.jsx';
import { CompactHeader } from './CompactHeader.jsx';

function getStatusBadgeProps(status) {
  if (!status) return { variant: 'outline' };
  const s = String(status).toLowerCase();
  if (s === 'draft' || s === 'dr') return { variant: 'secondary' };
  if (s === 'completed' || s === 'complete' || s === 'booked' || s === 'co')
    return { variant: 'default', className: 'bg-emerald-600 hover:bg-emerald-500 text-white border-transparent' };
  if (s === 'voided' || s === 'cancelled' || s === 'void' || s === 'vo')
    return { variant: 'destructive' };
  return { variant: 'outline' };
}

function statusLabel(status) {
  const MAP = { DR: 'Draft', CO: 'Complete', VO: 'Void', IP: 'In Process' };
  return MAP[status] || status;
}

/**
 * Full-page detail view for a single entity record.
 *
 * Props:
 *  - entity, detailEntity, Form, DetailTable: same as MasterDetailPage
 *  - summary, statusField, processes, addLineFields, catalogs: same as MasterDetailPage
 *  - entityLabel, detailLabel, titleField: same as MasterDetailPage
 *  - windowName: string (URL slug)
 *  - recordId: string ('new' for creation)
 *  - token, apiBaseUrl: string
 */
export function DetailView({
  entity,
  detailEntity,
  Form,
  DetailTable,
  summary = [],
  statusField,
  processes = [],
  addLineFields = { entry: [], derived: [] },
  catalogs,
  entityLabel,
  detailLabel,
  titleField = 'documentNo',
  windowName,
  recordId,
  token,
  apiBaseUrl,
}) {
  const hook = useEntity(entity, detailEntity, { token, apiBaseUrl });
  const navigate = useNavigate();
  const [addingLine, setAddingLine] = useState(false);

  // Select the record once items are loaded
  const isNew = recordId === 'new';
  const currentItem = useMemo(() => {
    if (isNew) return null;
    return hook.items.find(item => String(item.id) === String(recordId)) || null;
  }, [hook.items, recordId, isNew]);

  // Auto-select when item is found (or create new)
  useEffect(() => {
    if (isNew && !hook.editing) {
      hook.handleNew();
    }
  }, [isNew]);

  // Select item when loaded
  useEffect(() => {
    if (currentItem && (!hook.selected || String(hook.selected.id) !== String(recordId))) {
      hook.handleSelect(currentItem);
    }
  }, [currentItem, recordId]);

  // Prev/Next navigation
  const currentIdx = hook.items.findIndex(item => String(item.id) === String(recordId));
  const prevItem = currentIdx > 0 ? hook.items[currentIdx - 1] : null;
  const nextItem = currentIdx >= 0 && currentIdx < hook.items.length - 1 ? hook.items[currentIdx + 1] : null;

  const data = hook.editing || currentItem || {};
  const title = isNew
    ? `New ${entityLabel || entity}`
    : `${data[titleField] || data.id || ''}`;

  // Subtitle: first non-titleField summary field value (e.g., business partner name)
  const subtitleField = summary.find(f => f.key !== titleField);
  const subtitle = subtitleField ? data[subtitleField.key] : null;

  // Add-line support
  const allEntryFields = addLineFields.entry ?? [];

  if (hook.loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7.5rem)]">
      {/* Sticky breadcrumb bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 bg-background/95 backdrop-blur border-b px-1 py-2.5">
        <button
          onClick={() => navigate(`/${windowName}`)}
          className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{entityLabel || entity}</span>
        </button>

        <div className="flex-1" />

        {statusField && data[statusField] && (
          <Badge {...getStatusBadgeProps(data[statusField])}>
            {statusLabel(data[statusField])}
          </Badge>
        )}

        {/* Process buttons */}
        {processes.map(p => {
          const btnClass = p.style === 'destructive'
            ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
            : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
          return (
            <Button
              key={p.name}
              variant="outline"
              size="sm"
              className={btnClass}
              onClick={() => hook.handleProcess?.(p.name)}
            >
              {p.label}
            </Button>
          );
        })}

        <Button size="sm" onClick={() => hook.handleSave(data)}>
          Save
        </Button>

        {!isNew && hook.selected && (
          <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={hook.handleDelete}>
            Delete
          </Button>
        )}

        <Separator orientation="vertical" className="h-5" />

        {/* Prev/Next */}
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          disabled={!prevItem}
          onClick={() => prevItem && navigate(`/${windowName}/${prevItem.id}`)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          disabled={!nextItem}
          onClick={() => nextItem && navigate(`/${windowName}/${nextItem.id}`)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-1 py-5 space-y-6">

          {/* Master-detail: compact card + prominent lines */}
          {DetailTable ? (
            <>
              <CompactHeader
                title={title}
                subtitle={subtitle}
                summary={summary}
                data={data}
                Form={Form}
                entity={entity}
                onChange={hook.handleChange}
                catalogs={catalogs}
                defaultExpanded={isNew}
              />

              {/* Lines section — prominent, takes most space */}
              <div>
                <div className="flex items-center justify-between pb-3">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                    {detailLabel || detailEntity || 'Lines'}
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setAddingLine(!addingLine)}
                  >
                    {addingLine ? 'Cancel' : '+ Add'}
                  </Button>
                </div>

                <DetailTable
                  data={hook.children}
                  entity={detailEntity}
                  addRow={{
                    active: addingLine,
                    fields: allEntryFields,
                    onAdd: (lineData) => {
                      hook.handleAddChild?.(lineData);
                    },
                    onCancel: () => setAddingLine(false),
                    catalogs,
                  }}
                />
              </div>
            </>
          ) : (
            /* Simple entity: current layout (title + summary + full form) */
            <>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-bold text-foreground">{title}</h1>
                  {subtitle && (
                    <span className="text-base text-muted-foreground">&middot; {subtitle}</span>
                  )}
                </div>
                {summary.length > 0 && (
                  <div className="mt-1">
                    <SummaryBar fields={summary} data={data} />
                  </div>
                )}
              </div>

              <div>
                <Form
                  entity={entity}
                  data={data}
                  onChange={hook.handleChange}
                  catalogs={catalogs}
                />
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
