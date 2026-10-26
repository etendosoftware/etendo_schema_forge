import { Columns3, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { gridViewColumnId } from '@/hooks/useGridView.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.jsx';

export function GridViewControls({ gridView, gridColumns, ui, t }) {
  return (
    <div className="flex items-center gap-1" data-testid="grid-view-controls">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!gridView.active}
            aria-label={ui('gridViewColumns')}
            data-testid="grid-view-columns-trigger">
            <Columns3 className="mr-1.5 h-4 w-4" />
            {ui('gridViewColumns')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
          <DropdownMenuLabel>{ui('gridViewColumns')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {gridColumns.map((column) => {
            const id = gridViewColumnId(column);
            const labelKey = column.column ?? column.label ?? column.key;
            const visible = gridView.columnVisibility[id] !== false;
            return (
              <DropdownMenuCheckboxItem
                key={id}
                checked={visible}
                disabled={!gridView.active || !gridView.canHide(id) || (visible && gridView.visibleIds.length <= 1)}
                onCheckedChange={(checked) => gridView.setVisibility(id, checked)}
                data-testid={`grid-view-column-${column.key}`}>
                {t(labelKey) ?? column.label ?? column.key}
              </DropdownMenuCheckboxItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!gridView.active || !gridView.dirty || gridView.saveState === 'saving'}
        onClick={() => { void gridView.save(); }}
        data-testid="grid-view-save">
        {gridView.saveState === 'saving'
          ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          : <Save className="mr-1.5 h-4 w-4" />}
        {gridView.saveState === 'saving' ? ui('gridViewSaving') : ui('gridViewSave')}
      </Button>
      <span role={gridView.loadError || gridView.saveState === 'error' ? 'alert' : 'status'} className="sr-only" data-testid="grid-view-status">
        {gridView.loading ? ui('gridViewLoading')
          : gridView.loadError ? ui('gridViewLoadFailed')
            : gridView.saveState === 'error' ? ui('gridViewSaveFailed')
              : gridView.dirty ? ui('gridViewUnsaved')
                : gridView.saveState === 'saved' ? ui('gridViewSaved') : ''}
      </span>
      {gridView.loadError && (
        <Button type="button" variant="ghost" size="sm" onClick={gridView.retryLoad}>
          {ui('gridViewRetry')}
        </Button>
      )}
      {gridView.announcement && (
        <span className="sr-only" aria-live="polite">
          {ui('gridColumnMoved', {
            column: t(gridView.labelFor(gridView.announcement.id)) ?? gridView.labelFor(gridView.announcement.id),
            position: gridView.announcement.position,
            count: gridView.announcement.count,
          })}
        </span>
      )}
    </div>
  );
}
