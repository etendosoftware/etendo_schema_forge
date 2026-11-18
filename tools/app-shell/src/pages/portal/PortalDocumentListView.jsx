import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowsClockwiseIcon } from '@phosphor-icons/react';
import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DateRangePopover } from '@/components/ui/date-range-popover';
import { getDateBounds } from '@/lib/dateRangeBounds.js';
import { PORTAL_ERROR, fetchPortalDocuments } from '@/lib/portal/portalApi.js';
import { PortalCustomer, PortalLanguageSwitch } from './PortalShell.jsx';
import {
  PortalCountChip, PortalDate, PortalDesktopHeader, PortalDocumentStatus, PortalDueDate, PortalMain,
  PortalMoney, PortalPaymentStatus, PortalRowBadge, PortalSearchPill, PortalValidUntil,
  PORTAL_ROW_FOCUS, PortalInvoiceTypeBadge, portalRowActivation,
} from './PortalBits.jsx';
import {
  PORTAL_KIND_GROUPS, PORTAL_KIND_META, documentLabelKey, initialPortalRange, quotationValidity,
  toCalendarParam,
} from './portalPresentation.js';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * One document kind's list (design Listado / Movil-Listado).
 *
 * The header carries the title with the count chip, the breadcrumb and the search (by number or
 * reference) as a centred pill. The toolbar: the kind's status groups as segmented tabs (the
 * customer-facing groups of `PORTAL_KIND_GROUPS`, the tab in the URL), the date button (the
 * rolling last month by default, D-2; all time when the link named a group) and refresh. Columns follow the design,
 * adapted per kind: quotations show "Válido hasta" with its dot, invoices their due date,
 * payment state and outstanding; shipments carry no amounts. A totals row closes the table and
 * "Todos los registros cargados" the list. Checkboxes, "Descargar seleccionados" and the advanced
 * "Filtros" are agreed OUT items.
 */
export default function PortalDocumentListView({
  apiFetch, token, kind, group = null, identity = null, onNavigate, onInvalid,
}) {
  const ui = useUI();
  const [range, setRange] = useState(() => initialPortalRange(group));
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reload, setReload] = useState(0);

  // A new kind starts from the defaults: the rolling last month, or all time when the link named a
  // status group (`initialPortalRange`). Switching tabs inside the list keeps the chosen range.
  useEffect(() => {
    setRange(initialPortalRange(group));
    setSearchInput('');
    setSearch('');
    // Only a new kind resets the range: a tab (group) change keeps what the customer chose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const query = useMemo(() => {
    const { from, to } = getDateBounds(range);
    return {
      kind,
      group,
      dateFrom: toCalendarParam(from),
      dateTo: toCalendarParam(to),
      search,
    };
  }, [kind, group, range, search]);

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
  const hasMore = documents.length < totalCount;
  const plural = ui(PORTAL_KIND_META[kind].pluralKey);
  const open = (document) => onNavigate({ view: 'doc', kind: document.kind || kind, id: document.id });
  const selectGroup = (code) => onNavigate(code ? { view: 'list', kind, group: code } : { view: 'list', kind });

  const tabs = [{ code: null, labelKey: 'portalStatusAll' }, ...(PORTAL_KIND_GROUPS[kind] ?? [])];
  const renderTabs = (mobile) => (
    <div
      role="tablist"
      aria-label={ui('portalColStatus')}
      // Never wraps (M1): on a narrow phone the segmented control scrolls sideways with no visible
      // scrollbar, as the app's horizontal rails do (`PendingTasksRail`).
      className={cn('flex overflow-x-auto rounded-[10px] bg-muted p-1 md:rounded-lg', mobile ? 'gap-1' : 'gap-0.5')}
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {tabs.map((tab) => {
        const selected = (group ?? null) === tab.code;
        return (
          <button
            key={tab.code ?? 'all'}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => selectGroup(tab.code)}
            className={cn(
              'rounded-lg font-medium text-foreground',
              'shrink-0 whitespace-nowrap',
              mobile ? 'h-11 flex-1 px-3 text-[15px]' : 'h-8 px-3',
              selected ? 'bg-card shadow-sm' : '',
            )}
            data-testid={`portal-status-tab-${(tab.code ?? 'all').toLowerCase()}${mobile ? '-mobile' : ''}`}
          >
            {ui(tab.labelKey)}
          </button>
        );
      })}
    </div>
  );

  const searchPill = (mobile) => (
    <PortalSearchPill
      value={searchInput}
      onChange={setSearchInput}
      placeholder={ui('portalSearchPlaceholder')}
      testId={mobile ? 'portal-search-mobile' : 'portal-search'}
      className={mobile ? 'flex-1' : undefined}
      data-testid="PortalSearchPill__c7f7d2" />
  );

  const footer = documents.length > 0 ? (
    <div className="flex flex-col items-center gap-2" data-testid="portal-pagination">
      <p className="text-sm text-muted-foreground md:text-xs">
        {hasMore
          ? ui('portalShowingDocuments', { shown: documents.length, total: totalCount })
          : ui('portalAllLoaded')}
      </p>
      {hasMore ? (
        <Button variant="outline" onClick={loadMore} disabled={loadingMore} data-testid="portal-load-more">
          {ui('portalLoadMore')}
        </Button>
      ) : null}
    </div>
  ) : null;

  let state = null;
  if (failed) {
    state = (
      <p className="text-sm text-destructive" role="alert" data-testid="portal-list-error">
        {ui('portalLoadErrorDescription')}
      </p>
    );
  } else if (!loading && documents.length === 0) {
    state = (
      <div className="flex flex-col items-center px-6 py-12 text-center" data-testid="portal-list-empty">
        <p className="font-medium">{ui('portalListEmpty')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{ui('portalListEmptyHint')}</p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile header (design Movil-Listado) */}
      <header className="flex shrink-0 flex-col gap-3.5 border-b border-border bg-card px-4 py-4 sm:px-6 md:hidden">
        <div className="flex items-center justify-between gap-3">
          {/* At 360 px the title steps down to 24 px so it, the count, the language and the avatar
              share one line; the board's 28 px from 640 up. */}
          <div className="flex min-w-0 items-center gap-2.5">
            <h1 className="truncate text-2xl font-bold leading-9 sm:text-[28px]">{plural}</h1>
            <PortalCountChip count={totalCount} data-testid="PortalCountChip__c7f7d2" />
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <PortalLanguageSwitch
              align="end"
              side="bottom"
              compact
              data-testid="PortalLanguageSwitch__c7f7d2" />
            <PortalCustomer identity={identity} variant="avatar" data-testid="PortalCustomer__c7f7d2" />
          </div>
        </div>
        <div className="flex gap-2.5">{searchPill(true)}</div>
        {renderTabs(true)}
      </header>

      <PortalDesktopHeader
        title={plural}
        count={totalCount}
        breadcrumb={`${ui('portalNavMyDocuments')} / ${plural}`}
        search={searchPill(false)}
        data-testid="PortalDesktopHeader__c7f7d2" />

      <PortalMain
        className="overflow-y-auto px-6 pb-28 pt-5 md:pb-3 md:pt-3"
        testId="portal-document-list"
        data-testid="PortalMain__c7f7d2">
        <div className="hidden flex-wrap items-center gap-2 md:flex" data-kind={kind}>
          {renderTabs(false)}
          <DateRangePopover
            value={range}
            onChange={setRange}
            testId="portal-date-range"
            data-testid="DateRangePopover__c7f7d2" />
          <div className="flex-1" />
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10"
            aria-label={ui('portalRefresh')}
            onClick={() => setReload((value) => value + 1)}
            data-testid="portal-refresh"
          >
            <ArrowsClockwiseIcon className="h-4 w-4" aria-hidden="true" data-testid="RefreshCw__c7f7d2" />
          </Button>
        </div>

        {state}

        {documents.length > 0 ? (
          <>
            <DesktopTable
              kind={kind}
              page={page}
              documents={documents}
              onOpen={open}
              data-testid="DesktopTable__c7f7d2" />
            <ul className="flex flex-col gap-3 md:hidden" data-testid="portal-document-cards">
              {documents.map((document) => (
                <li key={document.id}>
                  <MobileCard
                    document={document}
                    kind={kind}
                    onOpen={open}
                    data-testid="MobileCard__c7f7d2" />
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {footer}
      </PortalMain>
    </>
  );
}

function DesktopTable({ kind, page, documents, onOpen }) {
  const ui = useUI();
  const isInvoice = kind === 'INVOICE';
  const isQuotation = kind === 'QUOTATION';
  const hasAmounts = kind !== 'SHIPMENT';
  const singleTotal = (page?.totals ?? []).length === 1 ? page.totals[0] : null;
  // Columns before the amounts: date, number, reference, status, plus validity / due date, and
  // for invoices the document type and the payment state.
  const leadingColumns = 4 + (isQuotation || isInvoice ? 1 : 0) + (isInvoice ? 2 : 0);
  // Headers stay on one line, as the design's (L2): the table scrolls sideways before it wraps.
  const th = 'whitespace-nowrap px-2 py-3 font-semibold';
  // Every column keeps its content width on one line; "Referencia" alone takes what is left and
  // truncates (full text as a tooltip), so the amounts at the right always fit at 1280 px.
  const td = 'whitespace-nowrap px-2 py-2.5';
  // Invoices carry three more columns than the design's quotation list (due date, payment state,
  // outstanding). Up to and including a 1280 px screen the tax base gives way (shown from 2xl,
  // 1536 px), so "Imp. total" and "Pendiente" always fit and "Referencia" keeps a usable width;
  // the tax base is still in the detail's summary. Tailwind's xl starts AT 1280, so it would not
  // hide the column at 1280.
  const taxBaseVisibility = isInvoice ? 'hidden 2xl:table-cell' : '';
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full border-collapse" data-testid="portal-document-table">
        <thead>
          <tr className="border-b border-border text-left text-xs leading-4">
            <th className={`${th} pl-3`}>{ui(PORTAL_KIND_META[kind].dateColumnKey)}</th>
            {/* The app's sales-invoice list: date, document type, number (`InvoiceHeaderTable`). */}
            {isInvoice ? <th className={th}>{ui('documentType')}</th> : null}
            <th className={th}>{ui('portalColDocumentNo')}</th>
            <th className={`${th} w-full`}>{ui('portalColReference')}</th>
            {isQuotation ? <th className={th}>{ui('portalColValidUntil')}</th> : null}
            {isInvoice ? <th className={th}>{ui('portalColDueDate')}</th> : null}
            <th className={th}>{ui('portalColStatus')}</th>
            {isInvoice ? <th className={th}>{ui('portalColPaymentStatus')}</th> : null}
            {hasAmounts ? <th className={`${th} ${taxBaseVisibility} text-right`}>{ui('portalColTaxBase')}</th> : null}
            {hasAmounts ? <th className={`${th} pr-3 text-right`}>{ui('portalColTotal')}</th> : null}
            {isInvoice ? <th className={`${th} pr-3 text-right`}>{ui('portalColOutstanding')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => (
            <tr
              key={document.id}
              className={`cursor-pointer border-b border-border hover:bg-muted ${PORTAL_ROW_FOCUS}`}
              {...portalRowActivation(() => onOpen(document), `${ui(documentLabelKey(document))} ${document.documentNo ?? ''}`.trim())}
              data-testid="portal-document-row"
            >
              <td className={`${td} pl-3 tabular-nums`}><PortalDate value={document.date} data-testid="PortalDate__c7f7d2" /></td>
              {isInvoice ? <td className={td}><PortalInvoiceTypeBadge document={document} data-testid="PortalInvoiceTypeBadge__c7f7d2" /></td> : null}
              <td className={`${td} whitespace-nowrap`}>
                {/* The number stays its own link-like control; the row opens the same document. */}
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); onOpen(document); }}
                  className="hover:text-primary"
                  data-testid="portal-document-open"
                >
                  {document.documentNo}
                </button>
              </td>
              <td className={`${td} w-full max-w-0 truncate text-muted-foreground`} title={document.reference || undefined}>{document.reference || '—'}</td>
              {isQuotation ? <td className={`${td} tabular-nums`}><PortalValidUntil document={document} data-testid="PortalValidUntil__c7f7d2" /></td> : null}
              {isInvoice ? <td className={`${td} tabular-nums`}><PortalDueDate document={document} data-testid="PortalDueDate__c7f7d2" /></td> : null}
              <td className={td}><PortalDocumentStatus
                status={document.documentStatus}
                data-testid="PortalDocumentStatus__c7f7d2" /></td>
              {isInvoice ? <td className={td}><PortalPaymentStatus document={document} data-testid="PortalPaymentStatus__c7f7d2" /></td> : null}
              {hasAmounts ? (
                <td className={`${td} ${taxBaseVisibility} text-right tabular-nums`}>
                  <PortalMoney
                    currency={document.currency}
                    value={document.taxBase}
                    data-testid="PortalMoney__c7f7d2" />
                </td>
              ) : null}
              {hasAmounts ? (
                <td className={`${td} pr-3 text-right tabular-nums`}>
                  <PortalMoney
                    currency={document.currency}
                    value={document.grandTotal}
                    data-testid="PortalMoney__c7f7d2" />
                </td>
              ) : null}
              {isInvoice ? (
                <td className={`${td} pr-3 text-right tabular-nums`}>
                  <PortalMoney
                    currency={document.currency}
                    value={document.outstandingAmount}
                    data-testid="PortalMoney__c7f7d2" />
                </td>
              ) : null}
            </tr>
          ))}
          {singleTotal && hasAmounts ? (
            <tr className="font-semibold" data-testid="portal-document-totals">
              <td colSpan={leadingColumns} />
              <td className={`px-2 py-3 ${taxBaseVisibility} text-right tabular-nums`}>
                <PortalMoney
                  currency={singleTotal.currency}
                  value={singleTotal.taxBase}
                  data-testid="PortalMoney__c7f7d2" />
              </td>
              <td className="px-2 py-3 pr-3 text-right tabular-nums">
                <PortalMoney
                  currency={singleTotal.currency}
                  value={singleTotal.grandTotal}
                  data-testid="PortalMoney__c7f7d2" />
              </td>
              {isInvoice ? <td /> : null}
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/** The line under a mobile card's date: validity, the generated order, or the due date. */
function CardSecondaryLine({ document }) {
  const ui = useUI();
  if (document.kind === 'QUOTATION') {
    if (document.orderNo) return <span>{ui('portalKindOrder')} {document.orderNo}</span>;
    const validity = quotationValidity(document);
    if (validity?.state === 'expired') {
      return (
        <span className="text-destructive">
          {ui('portalExpiredOnPrefix')} <PortalDate value={document.validUntil} data-testid="PortalDate__c7f7d2" />
        </span>
      );
    }
    if (document.validUntil) {
      return <span>{ui('portalColValidUntil')} <PortalDate value={document.validUntil} data-testid="PortalDate__c7f7d2" /></span>;
    }
    return null;
  }
  if (document.kind === 'INVOICE' && document.dueDate) {
    return <span>{ui('portalDueOnPrefix')} <PortalDate value={document.dueDate} data-testid="PortalDate__c7f7d2" /></span>;
  }
  return null;
}

/** One mobile card (design Movil-Listado). */
function MobileCard({ document, kind, onOpen }) {
  const ui = useUI();
  const isInvoice = kind === 'INVOICE';
  return (
    <button
      type="button"
      onClick={() => onOpen(document)}
      className={`flex w-full cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-[18px] text-left ${PORTAL_ROW_FOCUS}`}
      data-testid="portal-document-card"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="font-semibold">{document.documentNo}</span>
          {isInvoice ? <PortalInvoiceTypeBadge document={document} data-testid="PortalInvoiceTypeBadge__c7f7d2" /> : null}
        </span>
        {/* An invoice shows its payment state; its document status too when it is not the plain
            "completed" every listed invoice shares (closed, voided), like the table. */}
        <span className="flex flex-wrap items-center justify-end gap-1">
          {isInvoice && document.documentStatus !== 'CO'
            ? <PortalDocumentStatus
            status={document.documentStatus}
            className="text-[13px] leading-[18px]"
            data-testid="PortalDocumentStatus__c7f7d2" />
            : null}
          <PortalRowBadge
            document={document}
            className="text-[13px] leading-[18px]"
            data-testid="PortalRowBadge__c7f7d2" />
        </span>
      </span>
      {document.reference ? <span className="truncate text-muted-foreground">{document.reference}</span> : null}
      <span className="flex items-end justify-between border-t border-border pt-3">
        <span className="flex flex-col text-sm">
          <span className="text-muted-foreground"><PortalDate value={document.date} data-testid="PortalDate__c7f7d2" /></span>
          <CardSecondaryLine document={document} data-testid="CardSecondaryLine__c7f7d2" />
        </span>
        <span className="flex flex-col items-end">
          <PortalMoney
            currency={document.currency}
            value={document.grandTotal}
            className="text-xl font-semibold leading-7 tabular-nums"
            data-testid="PortalMoney__c7f7d2" />
          {isInvoice ? (
            <span className="text-sm text-muted-foreground" data-testid="portal-card-outstanding">
              {ui('portalColOutstanding')}{' '}
              <PortalMoney
                currency={document.currency}
                value={document.outstandingAmount}
                className="tabular-nums"
                data-testid="PortalMoney__c7f7d2" />
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
