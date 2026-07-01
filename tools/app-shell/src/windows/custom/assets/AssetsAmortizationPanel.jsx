import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowUpRight } from 'lucide-react';
import { useUI } from '@/i18n';
import { StatusTag } from '@/components/ui/status-tag';
import { useCurrency } from '@/hooks/useCurrency';
import { formatCurrency } from '@/lib/formatCurrency';

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
                <th className="text-left text-sm font-semibold text-foreground py-2.5 pr-4">{ui('assetsPeriod')}</th>
                <th className="text-left text-sm font-semibold text-foreground py-2.5 pr-4">{ui('assetsPercentage')}</th>
                <th className="text-left text-sm font-semibold text-foreground py-2.5 pr-4">{ui('amount')}</th>
                <th className="text-left text-sm font-semibold text-foreground py-2.5">{ui('assetsStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {lines.map((line) => (
                <tr
                  key={line.id ?? line.sEQNoAsset}
                  className="hover:bg-muted/30"
                >
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
              ))}
            </tbody>
          </table>
        </div>
    );
  };

  return (
    <div className="pt-2 pb-5">
      {renderBody()}
    </div>
  );
}
