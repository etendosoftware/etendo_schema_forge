import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Inbox } from 'lucide-react';
import { FieldHighlight } from '@/components/inspector/FieldHighlight.jsx';
import { useLabel } from '@/i18n';

/**
 * Map a status string to a Badge variant and optional className override.
 */
function getStatusBadgeProps(status) {
  const s = String(status ?? '').toLowerCase();
  if (s === 'draft' || s === 'dr') {
    return { variant: 'secondary', children: status };
  }
  if (s === 'completed' || s === 'complete' || s === 'booked' || s === 'co') {
    return { variant: 'default', className: 'bg-emerald-600 hover:bg-emerald-700 border-transparent text-white', children: status };
  }
  if (s === 'voided' || s === 'cancelled' || s === 'void' || s === 'vo') {
    return { variant: 'destructive', children: status };
  }
  if (s === 'in process' || s === 'ip') {
    return { variant: 'outline', className: 'border-amber-300 bg-amber-50 text-amber-700', children: status };
  }
  return { variant: 'outline', children: status };
}

/**
 * Loading skeleton that mimics a table layout.
 */
function TableSkeleton({ columns }) {
  return (
    <div className="space-y-2">
      {/* Header skeleton */}
      <div className="flex gap-3 px-2">
        {columns.map(col => (
          <Skeleton key={col.key} className="h-4 flex-1" />
        ))}
      </div>
      {/* Row skeletons */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3 px-2">
          {columns.map(col => (
            <Skeleton key={col.key} className="h-8 flex-1" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Empty state shown when the table has no data (or all rows are filtered out).
 */
function EmptyState({ hasFilter, totalCount }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <Inbox className="h-10 w-10 mb-3 opacity-40" />
      {hasFilter ? (
        <>
          <p className="text-sm font-medium">No matching records</p>
          <p className="text-xs mt-1">Try adjusting your filters to find what you are looking for.</p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">No records yet</p>
          <p className="text-xs mt-1">Create a new record to get started.</p>
        </>
      )}
    </div>
  );
}

/**
 * Inline editable row rendered at the bottom of the table for rapid line entry.
 * Controlled by the `addRow` prop on DataTable.
 */
function InlineAddRow({ columns, fields, onAdd, onCancel, data }) {
  const t = useLabel();
  const fieldMap = useMemo(() => {
    const map = {};
    for (const f of fields) map[f.key] = f;
    return map;
  }, [fields]);

  // Auto-compute lineNo default
  const defaultLineNo = useMemo(() => {
    const nums = (data || []).map(r => Number(r.lineNo) || 0);
    return (nums.length > 0 ? Math.max(...nums) : 0) + 10;
  }, [data]);

  const buildEmpty = useCallback(() => {
    const empty = {};
    for (const f of fields) {
      empty[f.key] = f.key === 'lineNo' ? defaultLineNo : '';
    }
    return empty;
  }, [fields, defaultLineNo]);

  const [values, setValues] = useState(buildEmpty);
  const firstInputRef = useRef(null);

  // Reset values when fields or data change
  useEffect(() => {
    setValues(buildEmpty());
  }, [buildEmpty]);

  // Auto-focus first input when row appears
  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  const handleChange = (key, val) => {
    setValues(prev => ({ ...prev, [key]: val }));
  };

  const handleConfirm = () => {
    onAdd(values);
    // Reset for next rapid entry — recompute lineNo
    const nums = [...(data || []).map(r => Number(r.lineNo) || 0), Number(values.lineNo) || 0];
    const nextLineNo = Math.max(...nums) + 10;
    const next = {};
    for (const f of fields) {
      next[f.key] = f.key === 'lineNo' ? nextLineNo : '';
    }
    setValues(next);
    // Re-focus first input for rapid entry
    setTimeout(() => firstInputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  let firstInputAssigned = false;

  return (
    <TableRow className="bg-blue-50/50 border-t-2 border-primary/20">
      {columns.map(col => {
        const field = fieldMap[col.key];
        if (!field) {
          return (
            <TableCell key={col.key} className="text-muted-foreground text-sm">
              &mdash;
            </TableCell>
          );
        }
        const isFirst = !firstInputAssigned;
        if (isFirst) firstInputAssigned = true;
        return (
          <TableCell key={col.key} className="py-1 px-2">
            <input
              ref={isFirst ? firstInputRef : undefined}
              type={field.type === 'number' ? 'number' : 'text'}
              inputMode={field.inputMode}
              value={values[field.key] ?? ''}
              onChange={(e) => handleChange(field.key, e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t(field.column) ?? field.label ?? field.key}
              required={field.required}
              className="w-full h-8 text-sm rounded-md border border-input bg-background px-2 focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </TableCell>
        );
      })}
    </TableRow>
  );
}

/**
 * Generic data table driven by column/filter declarations.
 *
 * Props:
 *  - columns: Array<{ key, label, type }>  (type can be 'string' | 'amount' | 'status')
 *  - filters: string[] of column keys that are searchable
 *  - data: array of row objects
 *  - onRowSelect: (row) => void
 *  - onNavigate: (row) => void — when provided, clicking a row calls onNavigate instead of onRowSelect
 *  - selectedId: string | number
 *  - compact: boolean (reserved for narrower layout)
 *  - loading: boolean (shows skeleton when true)
 *  - addRow: { active, fields, onAdd, onCancel, catalogs } — inline add row config
 */
export function DataTable({ entity, columns = [], filters = [], data = [], onRowSelect, onNavigate, selectedId, compact, loading, addRow }) {
  const t = useLabel();
  const [searchQuery, setSearchQuery] = useState('');

  const hasActiveFilter = searchQuery.length > 0;

  const filteredData = useMemo(() => {
    if (!searchQuery) return data;
    const q = searchQuery.toLowerCase();
    return data.filter(row =>
      filters.some(key => String(row[key] ?? '').toLowerCase().includes(q))
    );
  }, [data, filters, searchQuery]);

  const renderCellValue = (row, col) => {
    // Link styling on first string column
    if (col === columns[0] && col.type === 'string') {
      return <span className="font-medium text-primary">{row[col.key]}</span>;
    }
    if (col.type === 'status') {
      const badgeProps = getStatusBadgeProps(row[col.key]);
      return <Badge {...badgeProps} />;
    }
    if (col.type === 'boolean') {
      const val = row[col.key];
      if (val === true || val === 'Y') return <span className="text-emerald-600">Yes</span>;
      if (val === false || val === 'N') return <span className="text-slate-400">No</span>;
      return <span className="text-slate-300">&mdash;</span>;
    }
    if (col.type === 'amount') {
      return <span className="tabular-nums">{row[col.key]?.toLocaleString()}</span>;
    }
    return row[col.key];
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <TableSkeleton columns={columns.length > 0 ? columns : [{ key: '_1' }, { key: '_2' }, { key: '_3' }]} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Global search input */}
      {filters.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 focus:ring-2 focus:ring-primary focus:outline-none transition-colors duration-200"
            aria-label="Search records"
          />
        </div>
      )}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border/50">
              {columns.map(col => {
                const colLabel = t(col.column) ?? col.label ?? col.key;
                return (
                  <TableHead key={col.key} className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <FieldHighlight entityName={entity} fieldName={col.key}>
                      {colLabel}
                    </FieldHighlight>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length || 1} className="p-0">
                  <EmptyState hasFilter={hasActiveFilter} totalCount={data.length} />
                </TableCell>
              </TableRow>
            ) : (
              filteredData.map((row, idx) => (
                <TableRow
                  key={row.id ?? idx}
                  onClick={() => onNavigate ? onNavigate(row) : onRowSelect?.(row)}
                  className={[
                    'cursor-pointer transition-colors',
                    row.id === selectedId ? 'bg-primary/10 border-l-2 border-l-primary' : '',
                    'hover:bg-muted/50',
                  ].filter(Boolean).join(' ')}
                >
                  {columns.map(col => (
                    <TableCell key={col.key}>{renderCellValue(row, col)}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
            {addRow?.active && (
              <InlineAddRow
                columns={columns}
                fields={addRow.fields}
                onAdd={addRow.onAdd}
                onCancel={addRow.onCancel}
                data={data}
              />
            )}
          </TableBody>
        </Table>
      </div>
      {addRow?.active && (
        <p className="text-xs text-muted-foreground mt-1 text-center">
          Enter to add &middot; Esc to cancel
        </p>
      )}
      <p className="text-xs text-muted-foreground">{filteredData.length} of {data.length} records</p>
    </div>
  );
}
