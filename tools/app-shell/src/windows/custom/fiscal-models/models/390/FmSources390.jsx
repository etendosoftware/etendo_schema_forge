// Modelo 390 — the "Facturas" tab (ETP-5716): the invoice-tax lines behind the invoice boxes
// (`GET /fiscal390/sources`), with box chips, filters Casilla / Tipo / Impuesto, a search box,
// CSV export, the totals of what is filtered and pagination.
//
// The filter is owned by FmModel390Page.jsx so "Ver facturas" (Casillas tab, incidents) can open
// the tab already filtered by a box (`sourcesFilterForBox` of sources390.js). Filtering, totals
// and paging happen on the backend: with a box filter, `totals.box` is the sum of every row's
// contribution to that box, which equals the box value.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, ReceiptText, Search, CircleCheck, TriangleAlert, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { EmptyState } from '../../FmCommon.jsx';
import { formatAmount, triggerDownload } from '../../fiscalModelsUtils.js';
import { fetchSources390 } from './fm390Api.js';
import { parseAmount } from './fm390Layouts.js';
import {
  SOURCES_PAGE_SIZE, SOURCE_TYPES, boxLabel, buildSources390Csv, hasSourcesFilter, pageCount,
  rowBoxAmount, sourceBoxes, sourceTypeLabel, sourcesCsvFileName, sourcesQueryParams, emptySourcesFilter,
} from './sources390.js';

const SEARCH_DEBOUNCE_MS = 300;
const sameCents = (a, b) => {
  const x = parseAmount(a);
  const y = parseAmount(b);
  return x != null && y != null && Math.round(x * 100) === Math.round(y * 100);
};

function BoxChips({ boxes, active, onSelect, t }) {
  if (boxes.length === 0) return null;
  return (
    <div className="fm-390-sources__chips" role="group" aria-label={t('fm.m390.sources.chips')} data-testid="FmSources390__chips">
      {boxes.map(({ box, amount }) => {
        const on = active === box;
        return (
          <button
            key={box}
            type="button"
            className={`fm-toolbar__pill${on ? ' fm-toolbar__pill--active-dark' : ''}`}
            aria-pressed={on}
            onClick={() => onSelect(on ? null : box)}
            data-testid={`FmSources390__chip_${box}`}
          >
            <span className="fm-390-sources__chip-box">[{boxLabel(box)}]</span>
            {formatAmount(parseAmount(amount))}
          </button>
        );
      })}
    </div>
  );
}

function Pager({ page, pages, onPage, t }) {
  if (pages <= 1) return null;
  return (
    <div className="fm-390-sources__pager" data-testid="FmSources390__pager">
      <button type="button" className="fm-btn fm-btn--cancel-pill" disabled={page <= 1} onClick={() => onPage(page - 1)} data-testid="FmSources390__prev">
        <ChevronLeft size={14} strokeWidth={1.75} data-testid="ChevronLeft__fmSources390" />
        {t('fm.m390.pager.prev')}
      </button>
      <span data-testid="FmSources390__page">{t('fm.m390.sources.page', { page, pages })}</span>
      <button type="button" className="fm-btn fm-btn--cancel-pill" disabled={page >= pages} onClick={() => onPage(page + 1)} data-testid="FmSources390__next">
        {t('fm.m390.pager.next')}
        <ChevronRight size={14} strokeWidth={1.75} data-testid="ChevronRight__fmSources390" />
      </button>
    </div>
  );
}

/**
 * @param {object}   props.decl           the declaration (`year`, `period`)
 * @param {object}   props.filter         `{ box, type, tax, q }` (sources390.js)
 * @param {Function} props.onFilterChange (nextFilter) => void
 * @param {boolean}  [props.isSubmitted]  presented: the per-invoice detail is not kept
 * @param {*}        [props.refreshKey]   changes after a recompute, to reload the rows
 */
export default function FmSources390({
  decl, token, apiBaseUrl, filter, onFilterChange, isSubmitted = false, refreshKey, t, bcpLocale = 'es-ES',
  onCountChange,
}) {
  const current = filter ?? emptySourcesFilter();
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [qDraft, setQDraft] = useState(current.q ?? '');
  // The last search text this component sent: a filter change carrying another one came from
  // outside (e.g. "Ver facturas", "Limpiar filtros") and resets the search box.
  const sentQ = useRef(current.q ?? '');
  const filterKey = JSON.stringify([current.box, current.type, current.tax, current.q]);

  useEffect(() => {
    setPage(1);
    if ((current.q ?? '') !== sentQ.current) {
      sentQ.current = current.q ?? '';
      setQDraft(current.q ?? '');
    }
  }, [filterKey]);

  const sendSearch = (q) => {
    sentQ.current = q;
    onFilterChange?.({ ...current, q });
  };

  useEffect(() => {
    if ((qDraft ?? '') === (current.q ?? '')) return undefined;
    const timer = setTimeout(() => sendSearch(qDraft), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [qDraft]);

  useEffect(() => {
    if (isSubmitted || !apiBaseUrl) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSources390(decl, { token, apiBaseUrl, params: sourcesQueryParams(current, { page }) })
      .then(res => {
        if (cancelled) return;
        setData(res);
        // The unfiltered count is the tab badge (like the 303 "Facturas N").
        if (!hasSourcesFilter(current) && res?.count != null) onCountChange?.(Number(res.count) || 0);
      })
      .catch(err => { if (!cancelled) setError(err?.serverMessage || t('fm.m390.sources.load_error')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [decl.id, decl.year, filterKey, page, refreshKey, isSubmitted, apiBaseUrl, token]);

  const boxes = useMemo(() => sourceBoxes(data?.boxes), [data?.boxes]);
  const taxes = data?.taxes ?? [];
  const rows = data?.rows ?? [];
  const count = Number(data?.count) || 0;
  const pages = pageCount(count, SOURCES_PAGE_SIZE);
  const set = (patch) => onFilterChange?.({ ...current, ...patch });

  async function exportCsv() {
    setExporting(true);
    try {
      const all = await fetchSources390(decl, {
        token, apiBaseUrl, params: sourcesQueryParams(current, { page: 1, pageSize: 0 }),
      });
      const csv = buildSources390Csv(all.rows ?? [], t, { box: current.box });
      triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), sourcesCsvFileName(decl.year, current.box));
    } catch (_) {
      toast.error(t('fm.m390.sources.export_error'));
    } finally {
      setExporting(false);
    }
  }

  if (isSubmitted) {
    return (
      <div className="fm-snapshot-note" style={{ padding: 24, color: 'hsl(var(--muted-foreground))' }} data-testid="FmSources390__submitted">
        {t('fm.snapshot.invoice_detail_not_kept')}
      </div>
    );
  }

  const fmtDate = (iso) => (iso ? formatCalendarDate(iso, bcpLocale) : '—');
  const boxSelected = current.box != null;
  const boxValue = boxSelected ? data?.boxes?.[String(current.box)] : null;
  const boxTotal = data?.totals?.box;
  const colSpan = boxSelected ? 11 : 10;

  return (
    <div className="fm-390-sources" data-testid="FmSources390">
      <div className="fm-390-sources__toolbar">
        <div className="fm-390-search__field">
          <Search size={14} strokeWidth={1.75} data-testid="Search__fmSources390" />
          <input
            type="search"
            value={qDraft}
            placeholder={t('fm.m390.sources.search')}
            aria-label={t('fm.m390.sources.search')}
            onChange={e => setQDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendSearch(qDraft); } }}
            data-testid="FmSources390__search"
          />
        </div>
        <select
          className="fm-390-sources__select"
          value={current.box ?? ''}
          aria-label={t('fm.m390.sources.filter.box')}
          onChange={e => set({ box: e.target.value === '' ? null : Number(e.target.value) })}
          data-testid="FmSources390__boxFilter"
        >
          <option value="">{t('fm.m390.sources.filter.box_all')}</option>
          {current.box != null && !boxes.some(b => b.box === current.box) && (
            <option value={current.box}>{`[${boxLabel(current.box)}]`}</option>
          )}
          {boxes.map(({ box }) => <option key={box} value={box}>{`[${boxLabel(box)}]`}</option>)}
        </select>
        <select
          className="fm-390-sources__select"
          value={current.type ?? ''}
          aria-label={t('fm.m390.sources.filter.type')}
          onChange={e => set({ type: e.target.value })}
          data-testid="FmSources390__typeFilter"
        >
          <option value="">{t('fm.m390.sources.filter.type_all')}</option>
          {SOURCE_TYPES.map(type => <option key={type} value={type}>{sourceTypeLabel(type, t)}</option>)}
        </select>
        <select
          className="fm-390-sources__select"
          value={current.tax ?? ''}
          aria-label={t('fm.m390.sources.filter.tax')}
          onChange={e => set({ tax: e.target.value })}
          data-testid="FmSources390__taxFilter"
        >
          <option value="">{t('fm.m390.sources.filter.tax_all')}</option>
          {taxes.map(tx => <option key={tx.id} value={tx.id}>{tx.name}</option>)}
        </select>
        {hasSourcesFilter(current) && (
          <button type="button" className="fm-link-btn" onClick={() => onFilterChange?.(emptySourcesFilter())} data-testid="FmSources390__clear">
            {t('fm.m390.sources.clear_filters')}
          </button>
        )}
        <span className="fm-toolbar__space" />
        <button
          type="button"
          className="fm-btn fm-btn--cancel-pill"
          onClick={exportCsv}
          disabled={exporting || count === 0}
          data-testid="FmSources390__exportCsv"
        >
          {exporting
            ? <Loader2 size={14} strokeWidth={1.75} style={{ animation: 'spin 1s linear infinite' }} data-testid="Loader2__fmSources390Export" />
            : <Download size={14} strokeWidth={1.75} data-testid="Download__fmSources390" />}
          {t('fm.m390.sources.export_csv')}
        </button>
      </div>

      <BoxChips boxes={boxes} active={current.box} onSelect={box => set({ box })} t={t} />

      {error && (
        <p className="fm-390-inline-error" role="alert" style={{ padding: '0 20px' }} data-testid="FmSources390__error">{error}</p>
      )}

      {!error && data && count === 0 && !hasSourcesFilter(current) ? (
        <EmptyState
          icon={<ReceiptText size={28} strokeWidth={1.5} data-testid="ReceiptText__fmSources390" />}
          title={t('fm.sources.empty')}
          sub={t('fm.m390.sources.empty_sub')}
          data-testid="FmSources390__empty" />
      ) : (
        <div className="fm-table-wrap fm-390-sources__table">
          <table className="fm-dtable fm-dtable--plain" aria-busy={loading}>
            <thead>
              <tr>
                <th>{t('fm.sources.col.date')}</th>
                <th>{t('fm.sources.col.accountingDate')}</th>
                <th>{t('fm.sources.col.ref')}</th>
                <th>{t('fm.sources.col.type')}</th>
                <th>{t('fm.sources.col.party')}</th>
                <th>{t('fm.m390.sources.col.tax')}</th>
                <th className="num">{t('fm.sources.col.base')}</th>
                <th className="num">{t('fm.sources.col.vat')}</th>
                <th className="num">{t('fm.sources.col.total')}</th>
                <th>{t('fm.sources.col.boxes')}</th>
                {boxSelected && <th className="num">{t('fm.m390.sources.col.box_amount', { box: boxLabel(current.box) })}</th>}
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr><td colSpan={colSpan} className="fm-390-sources__placeholder" data-testid="FmSources390__loading">
                  <Loader2 size={16} strokeWidth={1.75} style={{ animation: 'spin 1s linear infinite' }} data-testid="Loader2__fmSources390" />
                </td></tr>
              )}
              {!loading && data && rows.length === 0 && (
                <tr><td colSpan={colSpan} className="fm-390-sources__placeholder" data-testid="FmSources390__noMatch">{t('fm.m390.sources.no_match')}</td></tr>
              )}
              {rows.map(r => (
                <tr key={r.id} data-testid={`FmSources390__row_${r.id}`}>
                  <td className="strong">{fmtDate(r.date)}</td>
                  <td>{fmtDate(r.accountingDate)}</td>
                  <td>{r.ref}</td>
                  <td>{sourceTypeLabel(r.type, t)}</td>
                  <td>{r.party}</td>
                  <td>{r.tax}</td>
                  <td className="num">{formatAmount(parseAmount(r.base))}</td>
                  <td className="num">{formatAmount(parseAmount(r.vat))}</td>
                  <td className="num strong">{formatAmount(parseAmount(r.total))}</td>
                  <td>{String(r.boxes ?? '').split(',').filter(Boolean).map(boxLabel).join(', ') || '—'}</td>
                  {boxSelected && <td className="num strong">{formatAmount(parseAmount(rowBoxAmount(r, current.box)))}</td>}
                </tr>
              ))}
            </tbody>
            {data && count > 0 && (
              <tfoot>
                <tr className="fm-390-sources__totals" data-testid="FmSources390__totals">
                  <td colSpan={6}>{t('fm.m390.sources.totals', { count })}</td>
                  <td className="num" data-testid="FmSources390__totalBase">{formatAmount(parseAmount(data.totals?.base))}</td>
                  <td className="num" data-testid="FmSources390__totalVat">{formatAmount(parseAmount(data.totals?.vat))}</td>
                  <td className="num" data-testid="FmSources390__totalTotal">{formatAmount(parseAmount(data.totals?.total))}</td>
                  <td />
                  {boxSelected && <td className="num" data-testid="FmSources390__totalBox">{formatAmount(parseAmount(boxTotal))}</td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <div className="fm-390-sources__footer">
        {boxSelected && data && boxTotal != null && (
          sameCents(boxTotal, boxValue ?? 0)
            ? (
              <span className="fm-390-sources__match" data-testid="FmSources390__boxMatch">
                <CircleCheck size={14} strokeWidth={1.75} data-testid="CircleCheck__fmSources390" />
                {t('fm.m390.sources.box_matches', { box: boxLabel(current.box), amount: formatAmount(parseAmount(boxValue ?? 0)) })}
              </span>
            )
            : (
              <span className="fm-390-sources__mismatch" role="status" data-testid="FmSources390__boxMismatch">
                <TriangleAlert size={14} strokeWidth={1.75} data-testid="TriangleAlert__fmSources390" />
                {t('fm.m390.sources.box_mismatch', { box: boxLabel(current.box), amount: formatAmount(parseAmount(boxValue ?? 0)) })}
              </span>
            )
        )}
        <span className="fm-toolbar__space" />
        <Pager page={page} pages={pages} onPage={setPage} t={t} />
      </div>
    </div>
  );
}
