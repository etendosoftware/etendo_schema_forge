import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowUpRight, Trash2 } from 'lucide-react';
import { useUI } from '@/i18n';
import { StatusTag } from '@/components/ui/status-tag';
import { useCurrency } from '@/hooks/useCurrency';
import { formatCurrency } from '@/lib/formatCurrency';
import { Checkbox } from '@/components/ui/checkbox';
import SelectionToolbar from '@/components/contract-ui/SelectionToolbar.jsx';

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

export default function AssetsAmortizationPanel({ data, recordId: recordIdProp, token, apiBaseUrl, onCountChange }) {
  const ui = useUI();
  const navigate = useNavigate();
  const orgCurrency = useCurrency() ?? 'USD';
  const [lines, setLines] = useState([]);
  const [processedMap, setProcessedMap] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const recordId = recordIdProp ?? data?.id;

  const [selectedRows, setSelectedRows] = useState(new Set());
  const [barVisible, setBarVisible] = useState(false);
  const [barClosing, setBarClosing] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    const url = `${apiBaseUrl}/amortizationLine?parentId=${recordId}&_startRow=0&_endRow=500&_sortBy=sEQNoAsset+asc`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
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
            fetch(`${amortBase}/header/${id}`, { headers: { Authorization: `Bearer ${token}` } })
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
  }, [recordId, apiBaseUrl, token]);

  const handleDeleteSelected = useCallback(async () => {
    if (!apiBaseUrl || selectedRows.size === 0) return;
    setDeleting(true);
    try {
      await Promise.allSettled(
        [...selectedRows].map(id =>
          fetch(`${apiBaseUrl}/amortizationLine/${id}`, {
            method: 'DELETE',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          })
        )
      );
      clearSelection();
      fetchLines();
    } finally {
      setDeleting(false);
    }
  }, [apiBaseUrl, token, selectedRows, fetchLines]);

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
  const expectedAmortizationAmount = data?.depreciationAmt;
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50">
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
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {lines.map((line) => {
                const rowId = line.id ?? line.sEQNoAsset;
                const isSelected = selectedRows.has(rowId);
                return (
                  <tr
                    key={rowId}
                    className="hover:bg-muted/30"
                  >
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
                        ? `${Number(line.amortizationPercentage).toFixed(2)}%`
                        : '—'}
                    </td>
                    <td className="py-3 pr-4 text-foreground">{formatCurrency(orgCurrency, line.amortizationAmount)}</td>
                    <td className="py-3">
                      <StatusBadge
                        isProcessed={processedMap.get(line.amortization) ?? false}
                        ui={ui}
                        data-testid="StatusBadge__34159c" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/50 font-semibold">
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
              </tr>
            </tfoot>
          </table>
        </div>
    );
  };

  return (
    <div className="pt-2 pb-5">
      {renderBody()}
      <SelectionToolbar
        visible={barVisible}
        closing={barClosing}
        onClose={clearSelection}
        closeTitle={ui('close') ?? 'Cerrar'}
        data-testid="SelectionToolbar__34159c">
        <span className="text-sm font-medium">
          {ui('selected', { count: selectedRows.size }) ?? `${selectedRows.size} Seleccionados`}
        </span>
        {/* ETP-4972 — icon-only, no visible "Eliminar" label: the applied Figma
            instance has this button's Button Text property set to false. */}
        <button
          type="button"
          disabled={deleting}
          title={ui('delete') ?? 'Eliminar'}
          aria-label={ui('delete') ?? 'Eliminar'}
          onClick={handleDeleteSelected}
          className="inline-flex items-center justify-center rounded-md border border-destructive p-2 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" data-testid="Trash2__34159c" />
        </button>
      </SelectionToolbar>
    </div>
  );
}
