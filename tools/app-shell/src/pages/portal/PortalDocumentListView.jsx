import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { useLocale, useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { DateRangePopover } from '@/components/ui/date-range-popover';
import { statusLabel } from '@/lib/statusBadge.js';
import { getDateBounds } from '@/lib/dateRangeBounds.js';
import { PORTAL_ERROR, fetchPortalDocuments } from '@/lib/portal/portalApi.js';
import {
  PortalDate, PortalDocumentStatus, PortalDueDate, PortalMoney, PortalPaymentStatus,
} from './PortalBits.jsx';
import {
  PORTAL_KIND_META, defaultPortalRange, documentLabelKey, toCalendarParam,
} from './portalPresentation.js';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * One document kind's list (design Listado / Movil-Listado).
 *
 * Quick filters only, per the PO: status tabs (the kind's visible statuses, as the backend lists
 * them), a date range defaulting to the rolling last month (D-2) and a search by number or
 * reference. Columns follow the design, adapted per kind: invoices add payment status, due date
 * and outstanding; shipments carry no amounts ("—"). Checkboxes, "Descargar seleccionados" and
 * the advanced "Filtros" are out of scope.
 */
export default function PortalDocumentListView({ apiFetch, token, kind, onNavigate, onInvalid }) {
  const ui = useUI();
  const dictionary = useLocale();
  const [status, setStatus] = useState(null);
  const [range, setRange] = useState(() => defaultPortalRange());
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reload, setReload] = useState(0);

  // A new kind starts from the defaults: its statuses differ, and so does what "all" means.
  useEffect(() => {
    setStatus(null);
    setRange(defaultPortalRange());
    setSearchInput('');
    setSearch('');
  }, [kind]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const query = useMemo(() => {
    const { from, to } = getDateBounds(range);
    return {
      kind,
      statuses: status ? [status] : [],
      dateFrom: toCalendarParam(from),
      dateTo: toCalendarParam(to),
      search,
    };
  }, [kind, status, range, search]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    fetchPortalDocuments(apiFetch, token, query).then((result) => {
      if (!active) return;
      setPage(result);
      setLoading(false);
    }).catch((error) => {
      if (!active) return;
      if (error?.code === PORTAL_ERROR.invalidLink) {
        onInvalid();
        return;
      }
      setFailed(true);
      setLoading(false);
    });
    return () => { active = false; };
  }, [apiFetch, token, query, reload, onInvalid]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const next = await fetchPortalDocuments(apiFetch, token, {
        ...query, offset: page?.documents?.length ?? 0,
      });
      setPage((current) => (current
        ? { ...next, documents: [...current.documents, ...next.documents] } : next));
    } catch (error) {
      if (error?.code === PORTAL_ERROR.invalidLink) onInvalid();
      else setFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }, [apiFetch, token, query, page?.documents?.length, onInvalid]);

  const documents = page?.documents ?? [];
  const totalCount = page?.totalCount ?? 0;
  const statuses = page?.statuses ?? [];
  const hasMore = documents.length < totalCount;
  const isInvoice = kind === 'INVOICE';
  const isShipment = kind === 'SHIPMENT';
  const singleTotal = (page?.totals ?? []).length === 1 ? page.totals[0] : null;
  const open = (document) => onNavigate({ view: 'doc', kind: document.kind || kind, id: document.id });

  return (
    <div className="flex flex-col gap-3" data-testid="portal-document-list" data-kind={kind}>
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label={ui('portalColStatus')} className="flex flex-wrap gap-0.5 rounded-lg bg-muted p-1">
          {[null, ...statuses].map((code) => (
            <button
              key={code ?? 'all'}
              type="button"
              role="tab"
              aria-selected={status === code}
              onClick={() => setStatus(code)}
              className={`h-8 rounded-lg px-3 text-sm font-medium ${status === code ? 'bg-card shadow-sm' : 'text-foreground/80 hover:text-foreground'}`}
              data-testid={`portal-status-tab-${(code ?? 'all').toLowerCase()}`}
            >
              {code ? statusLabel(code, dictionary, ui) : ui('portalStatusAll')}
            </button>
          ))}
        </div>
        <DateRangePopover value={range} onChange={setRange} />
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-muted px-3.5 sm:max-w-xs">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            aria-label={ui('portalSearchPlaceholder')}
            placeholder={ui('portalSearchPlaceholder')}
            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
            data-testid="portal-search"
          />
        </label>
        <Button
          variant="outline"
          size="icon"
          aria-label={ui('portalRefresh')}
          onClick={() => setReload((value) => value + 1)}
          data-testid="portal-refresh"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {failed ? (
        <p className="text-sm text-destructive" role="alert" data-testid="portal-list-error">
          {ui('portalLoadErrorDescription')}
        </p>
      ) : null}

      {!loading && documents.length === 0 && !failed ? (
        <div className="flex flex-col items-center px-6 py-12 text-center" data-testid="portal-list-empty">
          <p className="font-medium">{ui('portalListEmpty')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{ui('portalListEmptyHint')}</p>
        </div>
      ) : null}

      {documents.length > 0 ? (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm" data-testid="portal-document-table">
              <thead>
                <tr className="border-b border-border text-left text-xs leading-4">
                  <th className="px-2 py-3 pl-3 font-semibold">{ui(PORTAL_KIND_META[kind].dateColumnKey)}</th>
                  <th className="px-2 py-3 font-semibold">{ui('portalColDocumentNo')}</th>
                  <th className="px-2 py-3 font-semibold">{ui('portalColReference')}</th>
                  {kind === 'QUOTATION' ? <th className="px-2 py-3 font-semibold">{ui('portalColValidUntil')}</th> : null}
                  {isInvoice ? <th className="px-2 py-3 font-semibold">{ui('portalColDueDate')}</th> : null}
                  <th className="px-2 py-3 font-semibold">{ui('portalColStatus')}</th>
                  {isInvoice ? <th className="px-2 py-3 font-semibold">{ui('portalColPaymentStatus')}</th> : null}
                  {!isShipment ? <th className="px-2 py-3 text-right font-semibold">{ui('portalColTaxBase')}</th> : null}
                  {!isShipment ? <th className="px-2 py-3 pr-3 text-right font-semibold">{ui('portalColTotal')}</th> : null}
                  {isInvoice ? <th className="px-2 py-3 pr-3 text-right font-semibold">{ui('portalColOutstanding')}</th> : null}
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr key={document.id} className="border-b border-border" data-testid="portal-document-row">
                    <td className="px-2 py-2.5 pl-3 tabular-nums"><PortalDate value={document.date} /></td>
                    <td className="px-2 py-2.5">
                      <button
                        type="button"
                        onClick={() => open(document)}
                        className="font-medium hover:text-primary"
                        data-testid="portal-document-open"
                      >
                        {document.documentNo}
                      </button>
                      {document.isCreditNote ? (
                        <span className="ml-2 text-xs text-muted-foreground">{ui('portalKindCreditNote')}</span>
                      ) : null}
                    </td>
                    <td className="max-w-[16rem] truncate px-2 py-2.5 text-muted-foreground">{document.reference || '—'}</td>
                    {kind === 'QUOTATION' ? (
                      <td className="px-2 py-2.5 tabular-nums"><PortalDate value={document.validUntil} /></td>
                    ) : null}
                    {isInvoice ? <td className="px-2 py-2.5 tabular-nums"><PortalDueDate document={document} /></td> : null}
                    <td className="px-2 py-2.5"><PortalDocumentStatus status={document.documentStatus} /></td>
                    {isInvoice ? <td className="px-2 py-2.5"><PortalPaymentStatus document={document} /></td> : null}
                    {!isShipment ? (
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        <PortalMoney currency={document.currency} value={document.taxBase} />
                      </td>
                    ) : null}
                    {!isShipment ? (
                      <td className="px-2 py-2.5 pr-3 text-right tabular-nums">
                        <PortalMoney currency={document.currency} value={document.grandTotal} />
                      </td>
                    ) : null}
                    {isInvoice ? (
                      <td className="px-2 py-2.5 pr-3 text-right tabular-nums">
                        <PortalMoney currency={document.currency} value={document.outstandingAmount} />
                      </td>
                    ) : null}
                  </tr>
                ))}
                {singleTotal && !isShipment ? (
                  <tr className="font-semibold" data-testid="portal-document-totals">
                    <td colSpan={isInvoice ? 6 : (kind === 'QUOTATION' ? 5 : 4)} />
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      <PortalMoney currency={singleTotal.currency} value={singleTotal.taxBase} />
                    </td>
                    <td className="px-2 py-2.5 pr-3 text-right tabular-nums">
                      <PortalMoney currency={singleTotal.currency} value={singleTotal.grandTotal} />
                    </td>
                    {isInvoice ? <td /> : null}
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="flex flex-col gap-2 md:hidden" data-testid="portal-document-cards">
            {documents.map((document) => (
              <li key={document.id}>
                <button
                  type="button"
                  onClick={() => open(document)}
                  className="flex w-full flex-col gap-1.5 rounded-lg border border-border p-3 text-left"
                  data-testid="portal-document-card"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{document.documentNo}</span>
                    {isInvoice
                      ? <PortalPaymentStatus document={document} />
                      : <PortalDocumentStatus status={document.documentStatus} />}
                  </span>
                  {document.reference ? <span className="truncate text-sm text-muted-foreground">{document.reference}</span> : null}
                  {document.isCreditNote ? <span className="text-xs text-muted-foreground">{ui(documentLabelKey(document))}</span> : null}
                  <span className="flex items-end justify-between gap-2 text-xs text-muted-foreground">
                    <span className="flex flex-col">
                      <PortalDate value={document.date} />
                      {kind === 'QUOTATION' && document.validUntil ? (
                        <span>{ui('portalColValidUntil')} <PortalDate value={document.validUntil} /></span>
                      ) : null}
                      {isInvoice && document.dueDate ? (
                        <span>{ui('portalDueOnPrefix')} <PortalDate value={document.dueDate} /></span>
                      ) : null}
                    </span>
                    <PortalMoney
                      currency={document.currency}
                      value={document.grandTotal}
                      className="text-sm font-semibold tabular-nums text-foreground"
                    />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {documents.length > 0 ? (
        <div className="flex flex-col items-center gap-2 pt-1" data-testid="portal-pagination">
          <p className="text-xs text-muted-foreground">
            {hasMore
              ? ui('portalShowingDocuments', { shown: documents.length, total: totalCount })
              : ui('portalAllLoaded')}
          </p>
          {hasMore ? (
            <Button variant="outline" onClick={loadMore} disabled={loadingMore} data-testid="portal-load-more">
              {loadingMore ? ui('loading') : ui('portalLoadMore')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
