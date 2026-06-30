import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowUpRight } from 'lucide-react';
import { useUI } from '@/i18n';
import { StatusTag } from '@/components/ui/status-tag';
import { useCurrency } from '@/hooks/useCurrency';
import { formatCurrency } from '@/lib/formatCurrency';
import { Checkbox } from '@/components/ui/checkbox';
import LinesSelectionBar from '@/components/contract-ui/LinesSelectionBar.jsx';

function PeriodLink({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex items-center gap-1 text-sm font-medium text-[#121217]"
    >
      <span className="border-b border-[#828FA3] group-hover:border-[#121217] transition-colors leading-6">
        {label}
      </span>
      <ArrowUpRight className="h-4 w-4 text-[#121217]" data-testid="ArrowUpRight__34159c" />
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
  const [barRect, setBarRect] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const barAnchorRef = useRef(null);

  useEffect(() => {
    if (!barVisible) return;
    const el = barAnchorRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBarRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure, true);
    };
  }, [barVisible]);

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

  const renderBody = () => {
    if (loading) {
      return (
        <div className="text-xs text-gray-400 py-4 text-center inline-flex items-center gap-1.5 justify-center w-full">
          <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__34159c" />
          {ui('assetsLoading')}
        </div>
      );
    }

    if (lines.length === 0) {
      return (
        <div className="text-xs text-gray-400 py-6 text-center border border-dashed border-gray-200 rounded-lg">
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
          </table>
        </div>
    );
  };

  return (
    <div className="pt-2 pb-5">
      {renderBody()}
      <div ref={barAnchorRef} style={{ height: 48 }} />
      <LinesSelectionBar
        visible={barVisible}
        closing={barClosing}
        barRect={barRect}
        count={selectedRows.size}
        selectedLabel={ui('selected', { count: selectedRows.size }) ?? `${selectedRows.size} Seleccionados`}
        deleting={deleting}
        deleteTitle={ui('delete') ?? 'Eliminar'}
        closeTitle={ui('close') ?? 'Cerrar'}
        onDelete={handleDeleteSelected}
        onClose={clearSelection}
        compact />
    </div>
  );
}
