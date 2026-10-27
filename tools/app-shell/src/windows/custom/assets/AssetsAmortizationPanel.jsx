import { Children, cloneElement } from 'react';
import { useGridView } from '@/hooks/useGridView.js';
import { useFeatureFlag, GRID_COLUMN_VIEWS } from '@/lib/flags';
import { GridViewControls } from '@/components/contract-ui/GridViewControls.jsx';
import { gridHeaderProps, gridReorderHandle, gridResizeHandle } from '@/components/contract-ui/GridColumnHeaderControls.jsx';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowUpRight, Trash2 } from 'lucide-react';
import { useUI } from '@/i18n';
import { StatusTag } from '@/components/ui/status-tag';
import { useCurrency } from '@/hooks/useCurrency';
import { extractErrorMessage } from '@/hooks/useEntity';
import { useBatchDeleteDialog } from '@/hooks/useBatchDeleteDialog.jsx';
import { formatCurrency, formatPlainDecimal } from '@/lib/formatCurrency';
import { Checkbox } from '@/components/ui/checkbox';
import SelectionToolbar from '@/components/contract-ui/SelectionToolbar.jsx';

import { useApiFetch } from '@/auth/useApiFetch.js';
function PeriodLink({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex items-center gap-1 text-sm font-medium text-[hsl(var(--foreground))]"
    >
      <span className="border-b border-[hsl(var(--text-disabled))] group-hover:border-[hsl(var(--foreground))] transition-colors leading-6">
        {label}
      </span>
      <ArrowUpRight className="h-4 w-4 text-[hsl(var(--foreground))]" data-testid="ArrowUpRight__34159c" />
    </button>
  );
}

function StatusBadge({ isProcessed, ui }) {
  return (
    <StatusTag
      status={isProcessed ? 'CO' : 'IP'}
      label={isProcessed ? ui('assetsStatusProcessed') : ui('assetsStatusPlanned')}
      data-testid="StatusTag__34159c" />
  );
}

export default function AssetsAmortizationPanel({ data, recordId: recordIdProp, token, apiBaseUrl, onCountChange, accessReadOnly = false }) {
  const ui = useUI();
  const navigate = useNavigate();
  const orgCurrency = useCurrency() ?? 'USD';
  const [lines, setLines] = useState([]);

  const gridColumnViews = useFeatureFlag(GRID_COLUMN_VIEWS);
  const gridColumns = useMemo(() => [
    { key: 'amortization', column: 'A_Amortization_ID', label: ui('assetsPeriod'), sourceIndex: 1, required: true },
    { key: 'amortizationPercentage', column: 'Amortization_Percentage', label: ui('assetsPercentage'), sourceIndex: 2 },
    { key: 'amortizationAmount', column: 'Amortizationamt', label: ui('amount'), sourceIndex: 3 },
    { key: 'processed', label: ui('assetsStatus'), sourceIndex: 4 },
  ], [ui]);
  const gridSpec = 'assets';
  const gridView = useGridView({
    spec: gridSpec, entity: 'amortizationLine', columns: gridColumns, data: lines,
    enabled: gridColumnViews && Boolean(gridSpec), apiBaseUrl,
  });
  // Structural cells stay outside the personal view; existing editors and actions
  // retain their handlers and React keys when data cells move.
  const renderGridCells = (fragment) => {
    if (!gridColumnViews || !gridSpec) return fragment;
    const cells = Children.toArray(fragment.props.children);
    const visibleColumns = gridView.active ? gridView.columns : gridColumns;
    const count = visibleColumns.length + 1;
    if (cells.length === 1 && cells[0].props.colSpan) {
      return cloneElement(cells[0], { colSpan: count });
    }
    const dataCells = visibleColumns.map((column) => {
      const cell = cells[column.sourceIndex];
      if (!gridView.active) return cloneElement(cell, { key: column.key });
      const header = cell.type === 'th';
      const width = column.gridUserWidthPx;
      return cloneElement(cell, {
        key: column.key,
        'data-grid-column': column.key,
        style: { ...cell.props.style, ...(width != null ? { width, maxWidth: width, overflow: 'hidden' } : {}), ...(header ? { position: 'relative' } : {}) },
        ...(header ? gridHeaderProps(column, gridView) : {}),
      }, header ? <>{cell.props.children}{gridReorderHandle(column, gridView, column.label, ui)}{gridResizeHandle(column, gridView, column.label, ui)}</> : cell.props.children);
    });
    return [...cells.slice(0, 1), ...dataCells];
  };
  const gridControls = gridColumnViews && gridSpec ? (
    <GridViewControls
      gridView={gridView}
      gridColumns={gridColumns}
      ui={ui}
      t={(key) => gridColumns.find((column) => (column.column ?? column.label ?? column.key) === key)?.label ?? key}
      data-testid="GridViewControls__34159c" />
  ) : null;

  const [processedMap, setProcessedMap] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const recordId = recordIdProp ?? data?.id;
  const apiFetch = useApiFetch(apiBaseUrl);

  const [selectedRows, setSelectedRows] = useState(new Set());
  const [barVisible, setBarVisible] = useState(false);
  const [barClosing, setBarClosing] = useState(false);

  useEffect(() => {
    if (selectedRows.size > 0) {
      setBarVisible(true);
      setBarClosing(false);
    } else {
      setBarClosing(true);
      const t = setTimeout(() => { setBarVisible(false); setBarClosing(false); }, 250);
      return () => clearTimeout(t);
    }
  }, [selectedRows.size]);

  useEffect(() => { setSelectedRows(new Set()); }, [lines]);

  const allSelected = lines.length > 0 && selectedRows.size === lines.length;
  const someSelected = selectedRows.size > 0 && !allSelected;

  const toggleRow = (id) => setSelectedRows(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleAll = (checked) => setSelectedRows(
    checked ? new Set(lines.map(l => l.id ?? l.sEQNoAsset)) : new Set()
  );

  const clearSelection = () => setSelectedRows(new Set());

  const fetchLines = useCallback(() => {
    if (!recordId || !apiBaseUrl) return;
    setLoading(true);
    apiFetch(`/amortizationLine?parentId=${recordId}&_startRow=0&_endRow=500&_sortBy=sEQNoAsset+asc`)
      .then(r => r.ok ? r.json() : { data: [] })
      .then(json => {
        const rows = json?.response?.data ?? json?.data ?? json?.rows ?? [];
        const normalizedRows = Array.isArray(rows) ? rows : [];
        setLines(normalizedRows);
        onCountChange?.(normalizedRows.length);
        const amortBase = apiBaseUrl.replace(/\/[^/]+$/, '/amortization');
        const ids = [...new Set(normalizedRows.map(l => l.amortization).filter(Boolean))];
        return Promise.all(
          ids.map(id =>
            apiFetch(`${amortBase}/header/${id}`, { baseUrl: '' })
              .then(r => r.ok ? r.json() : null)
              .then(json => {
                const record = json?.response?.data?.[0] ?? json?.data?.[0] ?? json;
                return [id, record?.processed === 'Y'];
              })
              .catch(() => [id, false])
          )
        );
      })
      .then(entries => setProcessedMap(new Map(entries ?? [])))
      .catch(() => setLines([]))
      .finally(() => setLoading(false));
  }, [recordId, apiBaseUrl, apiFetch]);

  // ETP-4981 — a failed DELETE (e.g. blocked server-side for a line whose
  // amortization plan is already confirmed) was never surfaced: Promise
  // .allSettled swallowed every rejection and the panel always cleared the
  // selection + refetched, so the row silently reappeared with zero
  // feedback. Reuses the shared ETP-4656 triage/toast helpers, same
  // onSuccess contract as AmortizationLinesTable.bulkDelete: all succeeded
  // -> clear selection; partial -> keep only the failed ids selected; all
  // failed -> leave selection untouched and skip the refetch.
  //
  // ETP-5758 — goes through the generic `useBatchDeleteDialog`: the trash button
  // now asks for confirmation (it deleted straight away before), and the dialog
  // stays open and locked until the batch settles. The refused DELETE carries
  // its 4xx status so a one-line refusal toasts the backend's own reason.
  const { requestBatchDelete, batchDeleteDialog, deleting } = useBatchDeleteDialog({
    deleteOneFn: (id) =>
      apiFetch(`/amortizationLine/${id}`, { method: 'DELETE' }).then(async (res) => {
        if (!res.ok) {
          throw Object.assign(new Error(await extractErrorMessage(res, ui)), { status: res.status });
        }
        return id;
      }),
    onOutcome: (succeeded, failed) => {
      if (succeeded.length > 0) {
        setSelectedRows(new Set(failed));
        fetchLines();
      }
    },
  });
  const handleDeleteSelected = useCallback(() => {
    if (!apiBaseUrl || selectedRows.size === 0) return;
    requestBatchDelete([...selectedRows]);
  }, [apiBaseUrl, selectedRows, requestBatchDelete]);

  useEffect(() => {
    fetchLines();
  }, [fetchLines]);

  useEffect(() => {
    if (!recordId) return undefined;

    function handleProcessSuccess(event) {
      const detail = event?.detail ?? {};
      if (detail.entity !== 'assets') return;
      if (String(detail.recordId) !== String(recordId)) return;
      fetchLines();
    }

    window.addEventListener('neo:processSuccess', handleProcessSuccess);
    return () => window.removeEventListener('neo:processSuccess', handleProcessSuccess);
  }, [recordId, fetchLines]);

  const totalAmortizationAmount = useMemo(
    () => lines.reduce((sum, line) => sum + (Number(line.amortizationAmount) || 0), 0),
    [lines],
  );

  // Compare against the expected amount to amortize with a small tolerance,
  // since both values are floats. No expected value → never force the alert color.
  // ETP-5414 QA — `depreciationAmt` is the FULL amount to amortize, but the plan
  // lines only cover what's left to schedule: any `previouslyDepreciatedAmt`
  // (amortized before this plan existed) is not represented as a line, so it must
  // be subtracted from the expected total or a perfectly correct plan reads as a
  // mismatch (e.g. 2.000 to amortize, 200 previously amortized → lines sum to a
  // correct 1.800, but were compared against 2.000 and flagged red).
  const expectedAmortizationAmount = data?.depreciationAmt != null
    ? Number(data.depreciationAmt) - Number(data?.previouslyDepreciatedAmt ?? 0)
    : null;
  const amortizationTotalMismatch = expectedAmortizationAmount != null
    && Math.abs(
      Math.round(totalAmortizationAmount * 100) / 100 - Math.round(Number(expectedAmortizationAmount) * 100) / 100,
    ) > 0.005;

  const renderBody = () => {
    if (loading) {
      return (
        <div className="text-xs text-muted-foreground py-4 text-center inline-flex items-center gap-1.5 justify-center w-full">
          <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__34159c" />
          {ui('assetsLoading')}
        </div>
      );
    }

    if (lines.length === 0) {
      return (
        <div className="text-xs text-muted-foreground py-6 text-center border border-dashed border-border-subtle rounded-lg">
          {ui('assetsNoAmortizationLines')}
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
          {gridControls}
          <table className="w-full text-sm" style={gridView.active && gridView.columns.some((column) => column.gridUserWidthPx != null) ? { tableLayout: 'fixed' } : undefined}>
          {gridView.active && gridView.columns.some((column) => column.gridUserWidthPx != null) && <colgroup><col style={{ width: 40 }} />{gridView.columns.map((column) => <col key={column.key} style={{ width: column.gridUserWidthPx }} />)}</colgroup>}
            <thead>
              <tr className="border-b border-border/50">{renderGridCells(<>
                <th className="py-2.5 pr-2" style={{ width: 40, flexShrink: 0 }}>
                  <Checkbox
                    aria-label={ui('selectAll')}
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={() => toggleAll(!allSelected)}
                    data-testid="Checkbox__amort-all" />
                </th>
                <th className="text-left text-sm font-semibold text-foreground py-2.5 pr-4">{ui('assetsPeriod')}</th>
                <th className="text-left text-sm font-semibold text-foreground py-2.5 pr-4">{ui('assetsPercentage')}</th>
                <th className="text-left text-sm font-semibold text-foreground py-2.5 pr-4">{ui('amount')}</th>
                <th className="text-left text-sm font-semibold text-foreground py-2.5">{ui('assetsStatus')}</th>
              </>)}</tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {lines.map((line) => {
                const rowId = line.id ?? line.sEQNoAsset;
                const isSelected = selectedRows.has(rowId);
                // ETP-5030 — exactly ONE background per row, mirroring
                // `computeRowClassName` (contract-ui/InlineLinesPanel.jsx).
                // The `hover:` half is not optional: the pointer is over the
                // row at the instant the checkbox is clicked, so without it
                // `hover:bg-muted/30` would repaint over the tint at exactly
                // the moment the user looks for feedback.
                return (
                  <tr
                    key={rowId}
                    className={isSelected
                      ? 'bg-primary/5 hover:bg-primary/5'
                      : 'hover:bg-muted/30'}
                  >{renderGridCells(<>
                    <td className="py-3 pr-2" style={{ width: 40 }}>
                      <Checkbox
                        aria-label={ui('selectRow') ?? 'Select row'}
                        checked={isSelected}
                        onChange={() => toggleRow(rowId)}
                        data-testid={`Checkbox__amort-row-${rowId}`} />
                    </td>
                    <td className="py-3 pr-4">
                      {line.amortization ? (
                        <PeriodLink
                          label={line['amortization$_identifier'] ?? line.amortization}
                          onClick={() => navigate(`/amortization/${line.amortization}`)}
                          data-testid="PeriodLink__34159c" />
                      ) : (
                        <span className="text-foreground">{line['amortization$_identifier'] ?? '—'}</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-foreground">
                      {line.amortizationPercentage != null
                        ? `${formatPlainDecimal(Number(line.amortizationPercentage).toFixed(2))}%`
                        : '—'}
                    </td>
                    <td className="py-3 pr-4 text-foreground">{formatCurrency(orgCurrency, line.amortizationAmount)}</td>
                    <td className="py-3">
                      <StatusBadge
                        isProcessed={processedMap.get(line.amortization) ?? false}
                        ui={ui}
                        data-testid="StatusBadge__34159c" />
                    </td>
                  </>)}</tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/50 font-semibold">{renderGridCells(<>
                <td className="py-3 pr-2" style={{ width: 40 }} />
                <td className="py-3 pr-4" />
                <td className="py-3 pr-4" />
                <td
                  className={`py-3 pr-4 ${
                    amortizationTotalMismatch ? 'text-destructive' : 'text-foreground'
                  }`}
                >
                  {formatCurrency(orgCurrency, totalAmortizationAmount)}
                </td>
                <td className="py-3" />
              </>)}</tr>
            </tfoot>
          </table>
        </div>
    );
  };

  return (
    <div className="pt-2 pb-5">
      {renderBody()}
      <SelectionToolbar
        visible={barVisible && !accessReadOnly /* ETP-5830: its only action is delete */}
        closing={barClosing}
        onClose={clearSelection}
        closeTitle={ui('close') ?? 'Cerrar'}
        data-testid="SelectionToolbar__34159c">
        <span className="text-sm font-medium">
          {ui('selected', { count: selectedRows.size }) ?? `${selectedRows.size} Seleccionados`}
        </span>
        {/* ETP-4972 — icon-only, no border, no visible "Eliminar" label: the
            applied Figma instance's own canvas render has no stroke around
            this icon, just red icon color — ghost, like every other
            secondary action. */}
        <button
          type="button"
          disabled={deleting}
          title={ui('delete') ?? 'Eliminar'}
          aria-label={ui('delete') ?? 'Eliminar'}
          onClick={handleDeleteSelected}
          className="inline-flex items-center justify-center rounded-md p-2 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" data-testid="Trash2__34159c" />
        </button>
      </SelectionToolbar>
      {batchDeleteDialog}
    </div>
  );
}
