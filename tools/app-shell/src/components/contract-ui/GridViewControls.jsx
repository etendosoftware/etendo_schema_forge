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

function statusKey(gridView) {
  if (gridView.loading) return 'gridViewLoading';
  if (gridView.loadError) return 'gridViewLoadFailed';
  if (gridView.saveState === 'error') return 'gridViewSaveFailed';
  if (gridView.dirty) return 'gridViewUnsaved';
  if (gridView.saveState === 'saved') return 'gridViewSaved';
  return null;
}

function ColumnToggleItem({ column, gridView, t }) {
  const id = gridViewColumnId(column);
  const labelKey = column.column ?? column.label ?? column.key;
  const visible = gridView.columnVisibility[id] !== false;
  const lastVisible = visible && gridView.visibleIds.length <= 1;
  return (
    <DropdownMenuCheckboxItem
      checked={visible}
      disabled={!gridView.active || !gridView.canHide(id) || lastVisible}
      onCheckedChange={(checked) => gridView.setVisibility(id, checked)}
      data-testid={`grid-view-column-${column.key}`}>
      {t(labelKey) ?? column.label ?? column.key}
    </DropdownMenuCheckboxItem>
  );
}

function SaveIcon({ saving }) {
  return saving
    ? <Loader2 className="h-4 w-4 animate-spin" data-testid="Loader2__3b8cf2" />
    : <Save className="h-4 w-4" data-testid="Save__3b8cf2" />;
}

export function GridViewControls({ gridView, gridColumns, ui, t }) {
  return (
    <div className="flex items-center gap-1" data-testid="grid-view-controls">
      <DropdownMenu data-testid="DropdownMenu__3b8cf2">
        <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__3b8cf2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!gridView.active}
            className="px-2"
            title={ui('gridViewColumns')}
            aria-label={ui('gridViewColumns')}
            data-testid="grid-view-columns-trigger">
            <Columns3 className="h-4 w-4" data-testid="Columns3__3b8cf2" />
            <span className="sr-only">{ui('gridViewColumns')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-80 overflow-y-auto"
          data-testid="DropdownMenuContent__3b8cf2">
          <DropdownMenuLabel data-testid="DropdownMenuLabel__3b8cf2">{ui('gridViewColumns')}</DropdownMenuLabel>
          <DropdownMenuSeparator data-testid="DropdownMenuSeparator__3b8cf2" />
          {gridColumns.map((column) => (
            <ColumnToggleItem
              key={gridViewColumnId(column)}
              column={column}
              gridView={gridView}
              t={t}
              data-testid="ColumnToggleItem__3b8cf2" />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="px-2"
        title={gridView.saveState === 'saving' ? ui('gridViewSaving') : ui('gridViewSave')}
        disabled={!gridView.active || !gridView.dirty || gridView.saveState === 'saving'}
        onClick={() => gridView.save()}
        data-testid="grid-view-save">
        <SaveIcon saving={gridView.saveState === 'saving'} data-testid="SaveIcon__3b8cf2" />
        <span className="sr-only">{gridView.saveState === 'saving' ? ui('gridViewSaving') : ui('gridViewSave')}</span>
      </Button>
      <span role={gridView.loadError || gridView.saveState === 'error' ? 'alert' : 'status'} className="sr-only" data-testid="grid-view-status">
        {statusKey(gridView) ? ui(statusKey(gridView)) : ''}
      </span>
      {gridView.loadError && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={gridView.retryLoad}
          data-testid="Button__3b8cf2">
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
