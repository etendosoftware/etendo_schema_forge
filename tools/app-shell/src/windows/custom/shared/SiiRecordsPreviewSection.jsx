import { useEffect, useState } from 'react';
import { Loader2, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { InfoBanner } from '@/components/InfoBanner.jsx';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useLocaleSwitch } from '@/i18n';
import { formatCurrency, formatGroupedNumber } from '@/lib/formatCurrency';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import SiiPanelCard from '@/windows/custom/shared/SiiPanelCard.jsx';

/**
 * ETP-6284 (alcance 4) — "Registros que se enviarán al SII": a read-only preview of the records
 * the SII module will build for this purchase invoice when it is sent (forwarder F1, one F5 per
 * DUA, LC, F6), served by `GET <neo>/purchase-invoice/header/{id}/action/siiRecordsPreview`
 * (com.etendoerp.go, NEO GET-action; the object below is the top level of the body, warnings
 * already translated per Accept-Language). Contract:
 *
 *   { applicable, deferredVat,
 *     records: [{ type, number, date: 'yyyy-MM-dd', counterpartyName, counterpartyTaxId,
 *                 specialRegime, lines: [{ rate, base, taxAmount }], total }],
 *     warnings: [{ code, message }] }
 *
 * The preview is fetched by SifTab (`useSiiRecordsPreview`) because the import-taxes card also
 * needs `deferredVat` (compensatory-line button). It reflects the SAVED invoice: SifTab refetches
 * after every import-tax write and every header save.
 */
export const PREVIEW_TYPE_KEYS = new Set(['F5', 'LC']);

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Normalizes a preview response into the contract shape, tolerating missing keys. */
export function normalizePreview(body) {
  const src = body?.response?.data && !Array.isArray(body.response.data) ? body.response.data : body;
  const records = Array.isArray(src?.records) ? src.records : [];
  return {
    applicable: src?.applicable === true,
    deferredVat: src?.deferredVat === true,
    records: records.map((r, index) => ({
      key: `${r?.type ?? ''}-${r?.number ?? ''}-${index}`,
      type: r?.type ?? '',
      number: r?.number ?? '',
      date: r?.date ?? '',
      counterpartyName: r?.counterpartyName ?? '',
      counterpartyTaxId: r?.counterpartyTaxId ?? '',
      specialRegime: r?.specialRegime ?? '',
      lines: (Array.isArray(r?.lines) ? r.lines : []).map(l => ({
        rate: toNumber(l?.rate), base: toNumber(l?.base), taxAmount: toNumber(l?.taxAmount),
      })),
      total: toNumber(r?.total),
    })),
    warnings: (Array.isArray(src?.warnings) ? src.warnings : [])
      .filter(w => w && (w.message || w.code))
      .map(w => ({ code: w.code ?? '', message: w.message ?? w.code })),
  };
}

/** Rate shown on a preview line ("21%"). */
export function formatPreviewRate(rate) {
  return `${formatGroupedNumber(toNumber(rate), { maximumFractionDigits: 2 })}%`;
}

/**
 * Loads the preview while `enabled`; refetches whenever `refreshKey` changes.
 *
 * @returns {{ preview: object|null, loading: boolean, error: boolean }}
 */
export function useSiiRecordsPreview({ apiBaseUrl, recordId, enabled, refreshKey }) {
  const apiFetch = useApiFetch(apiBaseUrl);
  const [state, setState] = useState({ preview: null, loading: false, error: false });
  useEffect(() => {
    if (!enabled || !recordId || !apiBaseUrl) {
      setState({ preview: null, loading: false, error: false });
      return undefined;
    }
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: false }));
    apiFetch(`/header/${encodeURIComponent(recordId)}/action/siiRecordsPreview`)
      .then(async res => {
        if (!res.ok) throw new Error(String(res.status));
        const preview = normalizePreview(await res.json());
        if (!cancelled) setState({ preview, loading: false, error: false });
      })
      .catch(() => { if (!cancelled) setState({ preview: null, loading: false, error: true }); });
    return () => { cancelled = true; };
  }, [apiFetch, apiBaseUrl, recordId, enabled, refreshKey]);
  return state;
}

function RecordCard({ ui, record, currency, locale }) {
  const testId = `SiiRecordsPreviewSection__record_${record.key}`;
  return (
    <div className="rounded-lg border border-border p-3 space-y-2" data-testid={testId}>
      <div className="flex flex-wrap items-baseline justify-between gap-2" data-testid={`${testId}_head`}>
        <div className="flex items-baseline gap-2 min-w-0" data-testid={`${testId}_id`}>
          <Badge variant="secondary" data-testid={`${testId}_type`}>{record.type}</Badge>
          <span className="text-sm font-medium text-foreground truncate" data-testid={`${testId}_number`}>
            {record.number || '—'}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums" data-testid={`${testId}_date`}>
            {record.date ? formatCalendarDate(record.date, locale) : '—'}
          </span>
        </div>
        <span className="text-sm font-semibold tabular-nums text-foreground" data-testid={`${testId}_total`}>
          {formatCurrency(currency, record.total)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground" data-testid={`${testId}_counterparty`}>
        {[record.counterpartyName, record.counterpartyTaxId].filter(Boolean).join(' · ') || '—'}
      </p>
      {record.lines.length > 0 && (
        <table className="w-full table-fixed text-xs" data-testid={`${testId}_lines`}>
          <thead data-testid={`${testId}_linesHead`}>
            <tr className="text-muted-foreground" data-testid={`${testId}_linesHeadRow`}>
              <th className="w-16 py-1 text-right font-medium" data-testid={`${testId}_thRate`}>{ui('sifDataTabs.importTaxes.rate')}</th>
              <th className="py-1 text-right font-medium" data-testid={`${testId}_thBase`}>{ui('sifDataTabs.importTaxes.taxableAmount')}</th>
              <th className="py-1 text-right font-medium" data-testid={`${testId}_thAmount`}>{ui('sifDataTabs.importTaxes.taxAmount')}</th>
            </tr>
          </thead>
          <tbody data-testid={`${testId}_linesBody`}>
            {record.lines.map((line, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <tr key={i} className="tabular-nums" data-testid={`${testId}_line_${i}`}>
                <td className="py-1 text-right" data-testid={`${testId}_lineRate`}>{formatPreviewRate(line.rate)}</td>
                <td className="py-1 text-right" data-testid={`${testId}_lineBase`}>{formatCurrency(currency, line.base)}</td>
                <td className="py-1 text-right" data-testid={`${testId}_lineAmount`}>{formatCurrency(currency, line.taxAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function SiiRecordsPreviewSection({ ui, recordId, currency, previewState, step }) {
  const { locale } = useLocaleSwitch();
  const { preview, loading, error } = previewState ?? {};
  if (recordId && preview && !preview.applicable) return null;
  return (
    <SiiPanelCard
      step={step}
      title={ui('sifDataTabs.preview.title')}
      subtitle={ui('sifDataTabs.preview.subtitle')}
      testId="SiiRecordsPreviewSection__card"
      data-testid="SiiPanelCard__siiRecordsPreview">
      {!recordId && (
        <p className="text-xs text-muted-foreground" data-testid="SiiRecordsPreviewSection__saveFirst">
          {ui('sifDataTabs.preview.saveFirst')}
        </p>
      )}
      {recordId && loading && !preview && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="SiiRecordsPreviewSection__loading">
          <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__siiRecordsPreview" />
          {ui('loading')}
        </p>
      )}
      {recordId && error && (
        <p className="text-xs text-muted-foreground" data-testid="SiiRecordsPreviewSection__error">
          {ui('sifDataTabs.preview.unavailable')}
        </p>
      )}
      {preview?.warnings.map(w => (
        <InfoBanner
          key={`${w.code}-${w.message}`}
          tone="warning"
          icon={TriangleAlert}
          dismissible={false}
          data-testid="SiiRecordsPreviewSection__warning">
          {w.message}
        </InfoBanner>
      ))}
      {preview?.records.length > 0 && (
        <div className="space-y-2" data-testid="SiiRecordsPreviewSection__records">
          {preview.records.map(record => (
            <RecordCard
              key={record.key}
              ui={ui}
              record={record}
              currency={currency}
              locale={locale}
              data-testid="RecordCard__siiRecordsPreview" />
          ))}
        </div>
      )}
      {preview && preview.records.length === 0 && (
        <p className="text-xs text-muted-foreground" data-testid="SiiRecordsPreviewSection__empty">
          {ui('sifDataTabs.preview.empty')}
        </p>
      )}
    </SiiPanelCard>
  );
}
