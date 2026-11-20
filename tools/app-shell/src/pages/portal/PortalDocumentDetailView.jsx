import {
  ArrowLeftIcon,
  FileXIcon,
  CornersOutIcon,
  DotsThreeVerticalIcon,
  DownloadSimpleIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';

import { useLocale, useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import PdfViewer, { usePdfZoom } from '@/windows/custom/shared/PdfViewer.jsx';
import FileLightbox from '@/windows/custom/shared/FileLightbox.jsx';
import SummaryCard, { InfoRow, MovementSummaryCard } from '@/windows/custom/shared/preview-cards/SummaryCard.jsx';
import RelatedDocumentsCard from '@/windows/custom/shared/preview-cards/RelatedDocumentsCard.jsx';
import { STATUS_BADGE } from '@/components/related-documents/constants.jsx';
import { statusLabel } from '@/lib/statusBadge.js';
import { formatCurrency, formatGroupedNumber } from '@/lib/formatCurrency.js';
import {
  PORTAL_ERROR, fetchPortalDocument, fetchPortalDocumentPdf,
} from '@/lib/portal/portalApi.js';
import { portalPdfFileName } from '@/lib/portal/portalInvoices.js';
import { saveBlobAsFile } from '@/lib/portal/portalDownload.js';
import {
  PortalDate, PortalMain, PortalMoney, PortalPaymentStatus, PortalSection, PORTAL_SECTION_TITLE,
  PORTAL_FIGMA_BUTTON_SECONDARY, PORTAL_FIGMA_SHADOW, PortalCreatedWithHeaderLink, PortalCreatedWithTile,
} from './PortalBits.jsx';

import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  Sheet, SheetOverlay, SheetPortal, SheetTitle,
} from '@/components/ui/sheet';
import { PORTAL_KIND_META, documentLabelKey } from './portalPresentation.js';
import PortalDecisionActions from './PortalDecisionActions.jsx';
import { PortalDetailsCard, PortalRelatedList } from './PortalDetailPanel.jsx';

/** Quantities may be fractional (kg, hours): never round them to an integer. */
function formatQuantity(value) {
  return value == null ? '—'
    : formatGroupedNumber(value, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

/** Money inside a sentence ("2 × 75,00 €"), through the same canonical formatter. */
function formatMoneyText(currency, value) {
  return value == null ? '—' : formatCurrency(currency, value);
}

/**
 * One document, read-only (design Documento / Movil-Documento).
 *
 * Desktop: the header (back, "<Kind> <Nº>", breadcrumb); the real printable on the left — the
 * document's main attachment, the very file the email links to — in the app's PDF viewer with
 * zoom in / full screen / zoom out; on the right the title with "Emitido por", "Descargar PDF",
 * the summary card and "Documentos relacionados". Only when the document has no printable does
 * the left pane fall back to a sheet drawn from the data, under a "PDF no disponible" note.
 *
 * Mobile: a top bar with back, title, "Emitido por" and a download button; the summary card;
 * the lines with "Ver PDF" (the printable at full screen); the related documents.
 *
 * Comments and Accept / Reject (quotations) are agreed OUT items (Part C), so their slots are
 * left out.
 */
/**
 * The desktop drawer the detail opens in (Figma prototype, 2026-11-17): over the list it was opened
 * from, a dimming backdrop over the whole viewport and "Panel PDC" as a sheet 8px from the top,
 * right and bottom edges, 1008px wide at 1440 (70% of the viewport, 720–1344px; the side panel
 * stays 320px). Closes with the panel's X, Escape or a click on the backdrop; Radix traps the focus
 * inside and gives it back to what opened it (the list row). A 200ms slide-in, only without
 * reduced motion. Built on the shared `Sheet` pieces with the Radix content directly, like the
 * invoice inbox's review drawer, because `SheetContent` draws its own close button.
 */
const DETAIL_DRAWER = [
  'fixed bottom-2 right-2 top-2 z-50 flex w-[clamp(720px,70vw,1344px)] max-w-[calc(100vw-16px)] flex-col',
  'overflow-hidden rounded-xl outline-none',
  'motion-safe:data-[state=open]:[animation:slide-in-from-right_200ms_ease-out]',
].join(' ');

function PortalDetailDrawer({ title, onClose, children }) {
  return (
    <Sheet open onOpenChange={(next) => { if (!next) onClose(); }} data-testid="Sheet__6a1d3b">
      <SheetPortal data-testid="SheetPortal__6a1d3b">
        <SheetOverlay className="bg-[hsl(var(--scrim)/0.35)]" data-testid="portal-detail-backdrop" />
        <DialogPrimitive.Content aria-describedby={undefined} className={DETAIL_DRAWER} data-testid="portal-detail-drawer">
          <SheetTitle className="sr-only" data-testid="SheetTitle__6a1d3b">{title}</SheetTitle>
          {children}
        </DialogPrimitive.Content>
      </SheetPortal>
    </Sheet>
  );
}

export default function PortalDocumentDetailView({
  apiFetch, token, kind, id, identity, logoUrl, onNavigate, onInvalid,
  listGroup = null, presentation = 'page',
}) {
  const ui = useUI();
  const [document, setDocument] = useState(null);
  const [state, setState] = useState('loading');
  const [pdf, setPdf] = useState({ status: 'idle', blob: null, url: null });
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setState('loading');
    setDocument(null);
    fetchPortalDocument(apiFetch, token, kind, id).then((loaded) => {
      if (!active) return;
      setDocument(loaded);
      setState('ready');
    }).catch((error) => {
      if (!active) return;
      if (error?.code === PORTAL_ERROR.invalidLink) {
        onInvalid();
        return;
      }
      setState(error?.status === 404 ? 'notFound' : 'failed');
    });
    return () => { active = false; };
  }, [apiFetch, token, kind, id, onInvalid]);

  /**
   * The printable is fetched as soon as the detail says there is one (stored, or renderable: the
   * server renders and stores a missing one on this request, ETP-6209): it is the left pane itself.
   * The blob is rebuilt as `application/pdf` whatever the server labelled it, so a main attachment
   * that is not a PDF is handed to the PDF renderer — where it fails to render — and never parsed
   * as a document that could run script in the SPA's origin (review N-d).
   */
  useEffect(() => {
    if (!document?.hasPdf) return undefined;
    let active = true;
    let objectUrl = null;
    setPdf({ status: 'loading', blob: null, url: null });
    fetchPortalDocumentPdf(apiFetch, token, kind, id).then((blob) => {
      if (!active) return;
      const typed = new Blob([blob], { type: 'application/pdf' });
      objectUrl = URL.createObjectURL(typed);
      setPdf({ status: 'ready', blob: typed, url: objectUrl });
    }).catch((error) => {
      if (!active) return;
      if (error?.code === PORTAL_ERROR.invalidLink) {
        onInvalid();
        return;
      }
      // 404: the document has no printable and the server could not render one (ETP-6209: it
      // renders a missing PDF on this request) — "PDF no disponible", not a download error.
      setPdf({ status: error?.status === 404 ? 'unavailable' : 'failed', blob: null, url: null });
    });
    // An object URL pins its blob until released.
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [apiFetch, token, kind, id, document?.hasPdf, onInvalid]);

  const fileName = portalPdfFileName(document ?? { id });
  const downloadPdf = useCallback(() => {
    if (pdf.blob) saveBlobAsFile(pdf.blob, fileName);
  }, [pdf.blob, fileName]);

  // "Documentos relacionados" refresh: re-reads the document quietly (no loading screen) and
  // keeps everything else on the page as it is.
  const [refreshingRelated, setRefreshingRelated] = useState(false);
  const refreshRelated = useCallback(() => {
    setRefreshingRelated(true);
    fetchPortalDocument(apiFetch, token, kind, id).then(setDocument).catch((error) => {
      if (error?.code === PORTAL_ERROR.invalidLink) onInvalid();
    }).finally(() => setRefreshingRelated(false));
  }, [apiFetch, token, kind, id, onInvalid]);

  const plural = ui(PORTAL_KIND_META[kind].pluralKey);
  // Back to the list underneath, on the tab it was opened from.
  const back = () => onNavigate(listGroup ? { view: 'list', kind, group: listGroup } : { view: 'list', kind });
  const drawer = presentation === 'drawer';

  if (state !== 'ready') {
    const notReady = (
      <DocumentNotReady
        state={state}
        title={ui(PORTAL_KIND_META[kind].singularKey)}
        plural={plural}
        onBack={back}
        onNavigate={onNavigate}
        data-testid="DocumentNotReady__6a1d3b" />
    );
    if (!drawer) return notReady;
    return (
      <PortalDetailDrawer title={ui(PORTAL_KIND_META[kind].singularKey)} onClose={back} data-testid="PortalDetailDrawer__6a1d3b">
        <div className="flex min-h-0 flex-1 flex-col rounded-xl bg-card p-2">{notReady}</div>
      </PortalDetailDrawer>
    );
  }

  const title = `${ui(documentLabelKey(document))} ${document.documentNo ?? ''}`.trim();
  const issuer = document.issuer || identity?.tenantName || '';
  const pdfReady = pdf.status === 'ready';
  const showSheet = !document.hasPdf || pdf.status === 'failed' || pdf.status === 'unavailable';

  const lightbox = pdfReady ? (
    <FileLightbox
      open={lightboxOpen}
      onClose={() => setLightboxOpen(false)}
      file={{ objectUrl: pdf.url, fileName, mimeType: 'application/pdf' }}
      data-testid="portal-pdf-lightbox"
    />
  ) : null;

  // The page presentation (mobile, and desktop when not in the drawer) keeps its own headers: the
  // mobile top bar and the desktop back + breadcrumb. The drawer has neither (Figma prototype).
  const pageHeaders = (
    <>
      {/* Mobile top bar (design Movil-Documento) */}
      <header className="flex h-20 shrink-0 items-center gap-3 border-b border-border bg-card px-4 md:hidden">
        <button
          type="button"
          aria-label={ui('portalBack', { list: plural })}
          onClick={back}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px]"
          data-testid="portal-back-mobile"
        >
          <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" data-testid="ArrowLeft__6a1d3b" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate text-xl font-semibold leading-7">{title}</h1>
          <span className="truncate text-[13px] leading-[18px] text-muted-foreground">{ui('portalIssuedBy', { name: issuer })}</span>
        </div>
        {/* Etendo link left of the other controls, as on the Inicio bar (provisional until the
            mobile design arrives). */}
        <PortalCreatedWithTile data-testid="PortalCreatedWithTile__6a1d3b" />
        {document.hasPdf ? (
          <button
            type="button"
            aria-label={ui('portalDownloadPdf')}
            onClick={downloadPdf}
            disabled={!pdfReady}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border border-border bg-card disabled:opacity-50"
            data-testid="portal-download-pdf-mobile"
          >
            <DownloadSimpleIcon className="h-5 w-5" aria-hidden="true" data-testid="Download__6a1d3b" />
          </button>
        ) : null}
      </header>

      <DesktopHeader
        title={title}
        breadcrumb={`${ui('portalNavMyDocuments')} / ${plural} / ${document.documentNo ?? ''}`}
        plural={plural}
        onBack={back}
        data-testid="DesktopHeader__6a1d3b" />
    </>
  );

  const main = (
      <main
        // Desktop: the Figma's "Panel PDC" — the PDF area and the 320px side panel side by side,
        // full height, rounded only at the outer ends; the shell's 8px padding frames it.
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pb-28 pt-1 md:flex-row md:items-stretch md:gap-0 md:overflow-hidden md:p-0"
        data-testid="portal-document-detail"
      >
        {/* Left pane: the printable, or the data sheet when there is none */}
        <section
          aria-label={ui('portalPreviewLabel')}
          className="relative isolate hidden min-w-0 flex-1 overflow-hidden rounded-l-xl bg-[#E3E7EC] md:flex md:flex-col"
          data-testid="portal-document-preview"
        >
          <PreviewPane
            showSheet={showSheet}
            pdf={pdf}
            document={document}
            issuer={issuer}
            logoUrl={logoUrl}
            onFullScreen={() => setLightboxOpen(true)}
            onDownload={downloadPdf}
            data-testid="PreviewPane__6a1d3b" />
        </section>

        {/* Right pane */}
        <aside className="flex min-w-0 flex-col gap-4 md:w-[320px] md:flex-none md:gap-0 md:overflow-y-auto md:rounded-r-xl md:bg-white">
          {/* Desktop panel (Figma, 2026-11-17): the title with "Emitido por" and the close button,
              then "Botones principales" — Aceptar / Rechazar where they apply, Descargar PDF. */}
          {/* Cabecera: 68px, padding 12px, the close button 36×36 at the top right. */}
          <div className="relative hidden h-[68px] shrink-0 flex-col justify-center border-b border-[#E3E7EC] p-3 pr-12 md:flex">
            <h2 className="truncate text-xl font-semibold leading-7 tracking-[-0.005em] text-[#1B1A1F]" data-testid="portal-panel-title">{title}</h2>
            <span className="truncate text-xs leading-4 tracking-[-0.005em] text-[#6B7280]">{ui('portalIssuedBy', { name: issuer })}</span>
            <button
              type="button"
              aria-label={ui('close')}
              title={ui('close')}
              onClick={back}
              className="absolute right-2 top-1 flex h-9 w-9 items-center justify-center rounded-lg text-[#81848F] hover:bg-[#F3F5F9]"
              data-testid="portal-panel-close"
            >
              <XIcon size={20} aria-hidden="true" data-testid="X__6a1d3b" />
            </button>
          </div>
          <div className="hidden flex-wrap gap-2 px-3 pt-2 md:flex" data-testid="portal-panel-buttons">
            <PortalDecisionActions
              apiFetch={apiFetch}
              token={token}
              document={document}
              tenantName={identity?.tenantName}
              onInvalid={onInvalid}
              variant="inline"
              data-testid="PortalDecisionActions__6a1d3b" />
            {document.hasPdf ? (
              <button type="button" className={PORTAL_FIGMA_BUTTON_SECONDARY} onClick={downloadPdf} disabled={!pdfReady} data-testid="portal-download-pdf">
                <DownloadSimpleIcon size={20} className="text-[#81848F]" aria-hidden="true" data-testid="DownloadSimple__6a1d3b" />
                <span className="px-1">{ui('portalDownloadPdf')}</span>
              </button>
            ) : null}
          </div>

          {/* "Tabla": the details card and the related documents (desktop). */}
          <div className="hidden flex-col gap-4 py-3 md:flex" data-testid="portal-document-details">
            <div className="px-3">
              <PortalDetailsCard document={document} data-testid="PortalDetailsCard__6a1d3b" />
            </div>
            {document.kind === 'INVOICE' && document.installments.length > 1 ? (
              <div className="px-3"><Installments document={document} data-testid="Installments__6a1d3b" /></div>
            ) : null}
            <div className="px-3">
              <PortalRelatedList
                related={document.related}
                refreshing={refreshingRelated}
                onRefresh={refreshRelated}
                onOpen={(item) => onNavigate({ view: 'doc', kind: item.kind, id: item.id, ...(listGroup && item.kind === kind ? { group: listGroup } : {}) })}
                data-testid="PortalRelatedList__6a1d3b" />
            </div>
          </div>

          {/* Mobile: the app's own preview cards (`windows/custom/shared/preview-cards`), as the
              quotation, order, invoice and shipment previews use them; they bring their own
              margins. The desktop panel above follows the Figma instead. */}
          <div className="flex flex-col pb-4 md:hidden" data-testid="portal-document-cards-panel">
            <PortalSummary document={document} data-testid="PortalSummary__6a1d3b" />
            {document.kind === 'INVOICE' && document.installments.length > 1 ? (
              <div className="mx-4 mt-5"><Installments document={document} data-testid="Installments__6a1d3b" /></div>
            ) : null}
            <div className="mx-4 mt-5 md:hidden">
              <MobileLines
                document={document}
                canViewPdf={pdfReady}
                onViewPdf={() => setLightboxOpen(true)}
                data-testid="MobileLines__6a1d3b" />
            </div>
            <RelatedDocumentsCard
              items={document.related.map(toRelatedItem)}
              onOpen={(type, doc) => onNavigate({ view: 'doc', kind: doc.portalKind, id: doc.id })}
              data-testid="portal-related"
            />
            {/* Part C on mobile: the board's bottom action bar (Movil-Documento). */}
            <div className="mx-4 mt-5 md:hidden">
              <PortalDecisionActions
                apiFetch={apiFetch}
                token={token}
                document={document}
                tenantName={identity?.tenantName}
                onInvalid={onInvalid}
                variant="bar"
                data-testid="PortalDecisionActions__6a1d3b" />
            </div>
          </div>
        </aside>
      </main>
  );

  if (drawer) {
    return (
      <PortalDetailDrawer title={title} onClose={back} data-testid="PortalDetailDrawer__6a1d3b">
        {main}
        {lightbox}
      </PortalDetailDrawer>
    );
  }
  return (
    <>
      {pageHeaders}
      {main}
      {lightbox}
    </>
  );
}

function DesktopHeader({ title, breadcrumb, plural, onBack }) {
  const ui = useUI();
  return (
    <header className="hidden items-center gap-3 px-1 pb-3 pt-1 md:flex" data-testid="portal-view-header">
      <button
        type="button"
        aria-label={ui('portalBack', { list: plural })}
        onClick={onBack}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card"
        data-testid="portal-back"
      >
        <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" data-testid="ArrowLeft__6a1d3b" />
      </button>
      <div className="flex min-w-0 flex-col">
        <h1 className="truncate text-lg font-semibold leading-7" data-testid="portal-view-title">{title}</h1>
        <span className="truncate text-xs leading-4 text-muted-foreground" data-testid="portal-breadcrumb">{breadcrumb}</span>
      </div>
      {/* The Etendo link on the right, as in the home and list headers. */}
      <div className="ml-auto flex shrink-0 items-center">
        <PortalCreatedWithHeaderLink data-testid="PortalCreatedWithHeaderLink__6a1d3b" />
      </div>
    </header>
  );
}

/** The PDF area's padding (Figma "Panel PDC": 24px top, 28px sides, none at the bottom). */
const PREVIEW_PADDING = Object.freeze({ top: 24, right: 28, bottom: 0, left: 28 });

/** One 44×38 button of the toolbar group. */
const PREVIEW_TOOL = 'flex h-[38px] w-11 items-center justify-center bg-white text-[#81848F] hover:bg-[#F3F5F9] disabled:cursor-not-allowed disabled:opacity-40';

/**
 * The printable in the app's PDF viewer (`PdfViewer`, as the invoice and file previews use it),
 * laid out as the Figma's "Panel PDC" PDF area: on #E3E7EC, the page fills the area's width minus
 * its 28px sides, starts 24px from the top and runs into the bottom edge, scrolling inside the area
 * (the page keeps the viewer's own white sheet and shadow-md). `usePdfZoom`'s scale multiplies that
 * fitted width.
 *
 * The toolbar is the Figma's button group at the area's top right: zoom in, full screen (the app's
 * `FileLightbox`, as before), zoom out and a kebab. The design gives the kebab no behaviour, so it
 * offers only what the portal already does for this document: "Descargar PDF".
 */
function PortalPdfPreview({ url, onFullScreen, onDownload }) {
  const ui = useUI();
  const zoom = usePdfZoom();
  const divider = 'w-px self-stretch bg-[#E3E7EC]';
  return (
    <div className="relative min-h-0 flex-1" data-testid="portal-pdf-pane">
      <div
        className={`absolute right-2 top-2 z-10 flex overflow-hidden rounded-lg border border-[#C7CBD3] p-px ${PORTAL_FIGMA_SHADOW}`}
        data-testid="portal-pdf-controls"
      >
        <button type="button" onClick={zoom.zoomIn} disabled={!zoom.canZoomIn} aria-label={ui('pdfViewerZoomIn')} className={`${PREVIEW_TOOL} rounded-l-[7px]`} data-testid="portal-pdf-zoom-in">
          <MagnifyingGlassPlusIcon size={20} aria-hidden="true" data-testid="MagnifyingGlassPlus__6a1d3b" />
        </button>
        <span className={divider} aria-hidden="true" />
        <button type="button" onClick={onFullScreen} aria-label={ui('portalFullScreen')} className={PREVIEW_TOOL} data-testid="portal-pdf-full-screen">
          <CornersOutIcon size={20} aria-hidden="true" data-testid="CornersOut__6a1d3b" />
        </button>
        <span className={divider} aria-hidden="true" />
        <button type="button" onClick={zoom.zoomOut} disabled={!zoom.canZoomOut} aria-label={ui('pdfViewerZoomOut')} className={PREVIEW_TOOL} data-testid="portal-pdf-zoom-out">
          <MagnifyingGlassMinusIcon size={20} aria-hidden="true" data-testid="MagnifyingGlassMinus__6a1d3b" />
        </button>
        <span className={divider} aria-hidden="true" />
        <DropdownMenu data-testid="DropdownMenu__6a1d3b">
          <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__6a1d3b">
            <button type="button" aria-label={ui('moreOptions')} className={`${PREVIEW_TOOL} rounded-r-[7px]`} data-testid="portal-pdf-more">
              <DotsThreeVerticalIcon size={20} aria-hidden="true" data-testid="DotsThreeVertical__6a1d3b" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" data-testid="DropdownMenuContent__6a1d3b">
            <DropdownMenuItem onSelect={onDownload} data-testid="portal-pdf-more-download">
              <DownloadSimpleIcon size={16} className="mr-2 text-[#81848F]" aria-hidden="true" data-testid="DownloadSimple__6a1d3b" />
              {ui('portalDownloadPdf')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="absolute inset-0">
        <PdfViewer
          url={url}
          zoom={zoom}
          hideToolbar
          contentPadding={PREVIEW_PADDING}
          data-testid="PdfViewer__6a1d3b" />
      </div>
    </div>
  );
}

/** Portal kind → the app's related-document chip type (`DOCUMENT_CHIP_TYPES`). */
const CHIP_TYPE_OF_KIND = Object.freeze({
  QUOTATION: 'sales-quotation',
  ORDER: 'sales-order',
  SHIPMENT: 'shipment',
  INVOICE: 'sales-invoice',
});

/** A portal related document as the shared card's `{ type, doc }` row, in the app's field names. */
function toRelatedItem(related) {
  return {
    type: CHIP_TYPE_OF_KIND[related.kind] ?? 'sales-invoice',
    doc: {
      id: related.id,
      portalKind: related.kind,
      documentNo: related.documentNo,
      grandTotalAmount: related.grandTotal,
      'currency$_identifier': related.currency,
      documentStatus: related.documentStatus,
    },
  };
}

/**
 * The summary: the app's own `SummaryCard`, fed the props each app preview passes for its kind
 * (QuotationPreview: valid until; InvoicePreview: due date), with the rows the portal adds as the
 * app adds its own (`InfoRow` children: payment state, outstanding, payment method, tax base,
 * taxes). A shipment has no amount, so — like the app's shipment and receipt previews — it uses
 * `MovementSummaryCard`.
 */
function PortalSummary({ document }) {
  const ui = useUI();
  const dictionary = useLocale();
  const statusText = statusLabel(document.documentStatus, dictionary, ui);
  const isInvoice = document.kind === 'INVOICE';
  const taxesTotal = document.taxes.reduce((sum, tax) => sum + (tax.taxAmount ?? 0), 0);
  const money = (value) => (value == null ? '—' : formatCurrency(document.currency, value));
  // The card's own labels end in a colon ("Contacto:", "Fecha:", "Estado:"); the rows the portal
  // adds follow it.
  const rowLabel = (key) => `${ui(key)}:`;

  if (document.kind === 'SHIPMENT') {
    return (
      <MovementSummaryCard
        title={ui('shipmentPreviewStatus')}
        rows={[
          { label: ui('shipmentPreviewDocNo'), value: document.documentNo || '—' },
          { label: ui('shipmentPreviewContact'), value: document.customer.name || '—' },
          { label: ui('shipmentPreviewDate'), value: <PortalDate value={document.date} data-testid="PortalDate__6a1d3b" /> },
        ]}
        statusRowLabel={ui('shipmentPreviewStatus')}
        statusLabel={statusText}
        statusBadgeClass={STATUS_BADGE[document.documentStatus] || 'bg-muted text-muted-foreground border-border-subtle'}
        data-testid="MovementSummaryCard__6a1d3b" />
    );
  }

  return (
    <SummaryCard
      currencyCode={document.currency ?? ''}
      grandTotal={document.grandTotal}
      contact={document.customer.name}
      date={document.date}
      statusCode={document.documentStatus}
      statusLabel={statusText}
      validUntil={document.kind === 'QUOTATION' ? (document.validUntil || null) : undefined}
      dueDate={isInvoice ? (document.dueDate ?? null) : undefined}
      data-testid="SummaryCard__6a1d3b">
      {isInvoice ? (
        <InfoRow label={rowLabel('portalColPaymentStatus')} data-testid="InfoRow__6a1d3b">
          <PortalPaymentStatus
            document={document}
            installments={document.installments}
            className="whitespace-normal text-right"
            data-testid="PortalPaymentStatus__6a1d3b" />
        </InfoRow>
      ) : null}
      {isInvoice ? <InfoRow
        label={rowLabel('portalColOutstanding')}
        value={money(document.outstandingAmount)}
        data-testid="InfoRow__6a1d3b" /> : null}
      {document.paymentMethod ? <InfoRow
        label={rowLabel('portalFieldPaymentMethod')}
        value={document.paymentMethod}
        data-testid="InfoRow__6a1d3b" /> : null}
      <InfoRow
        label={rowLabel('portalColTaxBase')}
        value={money(document.taxBase)}
        data-testid="InfoRow__6a1d3b" />
      <InfoRow
        label={rowLabel('portalFieldTaxes')}
        value={money(taxesTotal)}
        data-testid="InfoRow__6a1d3b" />
    </SummaryCard>
  );
}

/** An invoice's instalments, when there is more than one. */
/**
 * Pairs each row with a React key built from its own content (the API sends no line id), with a
 * counter only for rows that are identical, so a key never depends on the row's position alone.
 */
function withStableKeys(items, keyOf) {
  const seen = new Map();
  return (items ?? []).map((item) => {
    const base = keyOf(item);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return { item, key: count ? `${base}#${count}` : base };
  });
}

const installmentKey = (installment) => `${installment.dueDate}|${installment.amount}`;
const lineKey = (line) => `${line.productCode}|${line.product}|${line.description}|${line.quantity}|${line.amount}`;

/** The detail while it loads, or when it is not found or failed to load. */
function DocumentNotReady({ state, title, plural, onBack, onNavigate }) {
  const ui = useUI();
  return (
    <>
      <DesktopHeader
        title={title}
        breadcrumb={`${ui('portalNavMyDocuments')} / ${plural}`}
        plural={plural}
        onBack={onBack}
        data-testid="DesktopHeader__6a1d3b" />
      <PortalMain className="p-6" data-testid="PortalMain__6a1d3b">
        {state === 'loading' ? (
          <p className="text-sm text-muted-foreground" data-testid="portal-document-loading">{ui('loading')}</p>
        ) : (
          <div className="flex flex-col items-center px-6 py-12 text-center" data-testid="portal-document-unavailable">
            <FileXIcon
              className="h-8 w-8 text-muted-foreground"
              aria-hidden="true"
              data-testid="FileX__6a1d3b" />
            <p className="mt-3 font-medium">
              {ui(state === 'notFound' ? 'portalDocumentNotFoundTitle' : 'portalLoadErrorTitle')}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {ui(state === 'notFound' ? 'portalDocumentNotFoundDescription' : 'portalLoadErrorDescription')}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => onNavigate({ view: 'home' })}
              data-testid="Button__6a1d3b">
              {ui('portalBackToHome')}
            </Button>
          </div>
        )}
      </PortalMain>
    </>
  );
}

/** The left pane: the data sheet when there is no printable, else the PDF once it arrives. */
function PreviewPane({ showSheet, pdf, document, issuer, logoUrl, onFullScreen, onDownload }) {
  const ui = useUI();
  if (showSheet) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
        <p className="mx-auto w-full max-w-[640px] text-sm text-muted-foreground" data-testid="portal-pdf-unavailable">
          <span className="font-medium text-foreground">{ui('portalPdfUnavailable')}</span>
          {' · '}{ui(pdf.status === 'failed' ? 'portalDownloadFailed' : 'portalPdfUnavailableHint')}
        </p>
        <DocumentSheet
          document={document}
          issuer={issuer}
          logoUrl={logoUrl}
          data-testid="DocumentSheet__6a1d3b" />
      </div>
    );
  }
  if (pdf.status === 'ready') {
    return (
      <PortalPdfPreview
        url={pdf.url}
        onFullScreen={onFullScreen}
        onDownload={onDownload}
        data-testid="PortalPdfPreview__6a1d3b" />
    );
  }
  return <p className="m-auto text-sm text-muted-foreground" data-testid="portal-pdf-loading">{ui('loading')}</p>;
}

function Installments({ document }) {
  const ui = useUI();
  return (
    <div className="flex flex-col gap-2">
      <h2 className={`${PORTAL_SECTION_TITLE} text-muted-foreground`}>{ui('portalInstallments')}</h2>
      <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5 md:rounded-lg">
        {withStableKeys(document.installments, installmentKey).map(({ item: installment, key }) => (
          <div key={key} className="flex justify-between gap-3 text-sm tabular-nums" data-testid="portal-installment">
            <PortalDate value={installment.dueDate} data-testid="PortalDate__6a1d3b" />
            <span>
              <PortalMoney
                currency={document.currency}
                value={installment.amount}
                data-testid="PortalMoney__6a1d3b" />
              {' · '}{ui('portalColOutstanding')}{' '}
              <PortalMoney
                currency={document.currency}
                value={installment.outstandingAmount}
                data-testid="PortalMoney__6a1d3b" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mobile only: the lines, with "Ver PDF" (design Movil-Documento). */
function MobileLines({ document, canViewPdf, onViewPdf }) {
  const ui = useUI();
  const hasAmounts = document.kind !== 'SHIPMENT';
  return (
    <PortalSection
      title={ui('portalLines')}
      action={document.hasPdf ? (
        <button
          type="button"
          onClick={onViewPdf}
          disabled={!canViewPdf}
          className="text-sm font-medium disabled:opacity-50"
          data-testid="portal-view-pdf"
        >
          {ui('portalViewPdf')}
        </button>
      ) : null}
      className="rounded-xl md:hidden"
      testId="portal-document-lines-mobile"
      data-testid="PortalSection__6a1d3b">
      {document.lines.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">{ui('portalNoLines')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {withStableKeys(document.lines, lineKey).map(({ item: line, key }) => (
            <li key={key} className="flex justify-between gap-3 px-5 py-4">
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{line.product || line.description}</span>
                <span className="text-sm text-muted-foreground">
                  {[line.productCode,
                    hasAmounts
                      ? `${formatQuantity(line.quantity)} × ${formatMoneyText(document.currency, line.unitPrice)}`
                      : `${formatQuantity(line.quantity)} ${line.uom ?? ''}`.trim(),
                    line.tax].filter(Boolean).join(' · ')}
                </span>
              </span>
              {hasAmounts ? <PortalMoney
                currency={document.currency}
                value={line.amount}
                className="font-medium tabular-nums"
                data-testid="PortalMoney__6a1d3b" /> : null}
            </li>
          ))}
        </ul>
      )}
    </PortalSection>
  );
}

/** The fallback left pane when the document has no printable: a sheet drawn from its data. */
function DocumentSheet({ document, issuer, logoUrl }) {
  const ui = useUI();
  const hasAmounts = document.kind !== 'SHIPMENT';
  const taxesTotal = document.taxes.reduce((sum, tax) => sum + (tax.taxAmount ?? 0), 0);
  const label = 'text-[10px] uppercase tracking-[0.06em] text-muted-foreground';
  return (
    <article
      className="mx-auto flex w-full max-w-[640px] flex-col gap-5 rounded-md bg-card px-10 py-9 text-xs leading-[18px] shadow-sm"
      data-testid="portal-document-sheet"
    >
      <div className="flex items-center justify-between gap-4 rounded-[10px] border border-border px-5 py-[18px]">
        <div className="flex items-center gap-3.5">
          {logoUrl ? <img src={logoUrl} alt="" className="h-11 w-11 rounded-lg object-contain" /> : null}
          <b className="text-sm font-semibold">{issuer}</b>
        </div>
        <div className="flex flex-col items-end border-l border-border pl-[18px]">
          <span className={label}>{ui(documentLabelKey(document))}</span>
          <span className="text-xl font-bold leading-[26px]">{document.documentNo}</span>
          {document.currency ? <span className="text-muted-foreground">{document.currency}</span> : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        <div className="flex flex-col gap-0.5 rounded-[10px] border border-border px-4 py-3.5">
          <span className={cn(label, 'mb-1.5')}>{ui('portalCustomerData')}</span>
          <span><b className="font-semibold">{ui('portalCustomerLabel')}:</b> {document.customer.name}</span>
          {document.customer.address ? <span><b className="font-semibold">{ui('portalAddressLabel')}:</b> {document.customer.address}</span> : null}
        </div>
        <div className="flex flex-col gap-0.5 rounded-[10px] border border-border px-4 py-3.5">
          <span className={cn(label, 'mb-1.5')}>{ui('portalDocumentData')}</span>
          <span><b className="font-semibold">{ui('portalFieldDate')}:</b> <PortalDate value={document.date} data-testid="PortalDate__6a1d3b" /></span>
          {document.validUntil ? <span><b className="font-semibold">{ui('portalColValidUntil')}:</b> <PortalDate value={document.validUntil} data-testid="PortalDate__6a1d3b" /></span> : null}
          {document.paymentMethod ? <span><b className="font-semibold">{ui('portalFieldPaymentMethod')}:</b> {document.paymentMethod}</span> : null}
        </div>
      </div>
      {document.lines.length === 0 ? (
        <p className="text-muted-foreground">{ui('portalNoLines')}</p>
      ) : (
        <table className="w-full border-collapse" data-testid="portal-document-lines">
          <thead>
            <tr className={cn(label, 'border-b border-border text-left')}>
              <th className="py-2 pr-1.5 font-medium">{ui('portalLineCode')}</th>
              <th className="px-1.5 py-2 font-medium">{ui('portalLineDescription')}</th>
              <th className="px-1.5 py-2 text-right font-medium">{ui('portalLineQuantity')}</th>
              {hasAmounts ? <th className="px-1.5 py-2 text-right font-medium">{ui('portalLinePrice')}</th> : null}
              {document.kind === 'QUOTATION' || document.kind === 'ORDER'
                ? <th className="px-1.5 py-2 text-right font-medium">{ui('portalLineDiscount')}</th> : null}
              {hasAmounts ? <th className="px-1.5 py-2 font-medium">{ui('portalLineTax')}</th> : null}
              {hasAmounts ? <th className="py-2 pl-1.5 text-right font-medium">{ui('portalTotal')}</th> : null}
            </tr>
          </thead>
          <tbody>
            {withStableKeys(document.lines, lineKey).map(({ item: line, key }) => (
              <tr key={key}>
                <td className="py-2.5 pr-1.5 text-muted-foreground">{line.productCode || '—'}</td>
                <td className="px-1.5 py-2.5 font-semibold">{line.product || line.description}</td>
                <td className="px-1.5 py-2.5 text-right tabular-nums">
                  {formatQuantity(line.quantity)}{!hasAmounts && line.uom ? ` ${line.uom}` : ''}
                </td>
                {hasAmounts ? (
                  <td className="px-1.5 py-2.5 text-right tabular-nums"><PortalMoney
                    currency={document.currency}
                    value={line.unitPrice}
                    data-testid="PortalMoney__6a1d3b" /></td>
                ) : null}
                {document.kind === 'QUOTATION' || document.kind === 'ORDER' ? (
                  <td className="px-1.5 py-2.5 text-right tabular-nums">
                    {line.discount ? formatGroupedNumber(line.discount, { maximumFractionDigits: 2 }) : '–'}
                  </td>
                ) : null}
                {hasAmounts ? <td className="px-1.5 py-2.5">{line.tax || '—'}</td> : null}
                {hasAmounts ? (
                  <td className="py-2.5 pl-1.5 text-right tabular-nums"><PortalMoney
                    currency={document.currency}
                    value={line.amount}
                    data-testid="PortalMoney__6a1d3b" /></td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hasAmounts ? (
        <div className="flex justify-end border-t border-border pt-3">
          <div className="flex w-[260px] flex-col gap-1">
            <div className="flex justify-between"><span>{ui('portalSubtotal')}</span><PortalMoney
              currency={document.currency}
              value={document.taxBase}
              data-testid="PortalMoney__6a1d3b" /></div>
            <div className="flex justify-between"><span>{ui('portalFieldTaxes')}</span><PortalMoney
              currency={document.currency}
              value={taxesTotal}
              data-testid="PortalMoney__6a1d3b" /></div>
            <div className="mt-1 flex justify-between border-t border-border pt-2 text-sm font-bold">
              <span>{ui('portalTotal')}</span><PortalMoney
              currency={document.currency}
              value={document.grandTotal}
              data-testid="PortalMoney__6a1d3b" />
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
