import { useRef, useEffect, useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Loader2, Download, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { useAnimatedOpen } from '@/lib/useAnimatedOpen.js';
import { hasClientPdf, buildClientPdfBlob, buildClientHtml } from '@/windows/custom/shared/documentPdfRegistry.js';

/**
 * Posts rendered HTML to jsreport (through the Vite `/jsreport` proxy) and
 * returns the resulting PDF blob.
 *
 * This is the one hop that has NO server-side friendly-error handling of its
 * own (unlike `/api/reports/{id}/render`, which the dev server already wraps
 * with a readable message — see `tools/app-shell/vite-plugins/report-api.js`).
 * When the jsreport container is down, the Vite proxy either rejects the
 * `fetch()` outright or forwards a bare 500 `text/plain` body, so every
 * failure mode is classified here and turned into one translated, actionable
 * message instead of reaching the caller as an unhandled rejection.
 *
 * `translate` is a `(key) => string` function — normally `useUI()`'s `ui`,
 * or an injected translator for non-hook call sites (see `printDocuments`).
 */
async function renderPdfViaJsreport(htmlContent, translate = (key) => key) {
  let pdfRes;
  try {
    pdfRes = await fetch('/jsreport/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template: { content: htmlContent, engine: 'none', recipe: 'chrome-pdf', chrome: { format: 'A4', marginTop: '10mm', marginBottom: '10mm', marginLeft: '10mm', marginRight: '10mm' } },
        data: {},
      }),
    });
  } catch (networkErr) {
    // fetch() itself rejects (TypeError) when the jsreport container is
    // unreachable through the proxy (connection refused/reset) — the proxy
    // never gets to produce an HTTP response at all.
    console.error('[DocumentPrintDrawer] jsreport request failed (service unreachable):', networkErr);
    throw new Error(translate('reportServiceUnavailable'));
  }

  if (!pdfRes.ok) {
    const detail = await pdfRes.text().catch(() => '');
    console.error(`[DocumentPrintDrawer] jsreport responded ${pdfRes.status}:`, detail);
    throw new Error(translate('pdfGenerationFailed'));
  }

  const contentType = typeof pdfRes.headers?.get === 'function' ? (pdfRes.headers.get('content-type') || '') : 'application/pdf';
  if (!contentType.includes('application/pdf')) {
    const detail = await pdfRes.text().catch(() => '');
    console.error('[DocumentPrintDrawer] jsreport returned a non-PDF response:', contentType, detail);
    throw new Error(translate('pdfGenerationFailed'));
  }

  return pdfRes.blob();
}

/**
 * Preview drawer: shows document preview one at a time with < > navigation.
 * Report ID convention: print-{windowName} (e.g., print-purchase-order)
 */
/*
 * ETP-4912 — which template this drawer shows.
 *
 * For a window listed in `documentPdfRegistry.js` the drawer builds the SAME
 * client-rendered PDF the preview panel and the email modal show, so all three are one
 * document. For every other window it renders that window's `print-*` artifact, exactly
 * as before.
 *
 * This changes only WHICH template a print produces — never whether the Print button is
 * offered. Visibility still comes from `hidePrint` / `hidePrintWhen` in the window's
 * decisions.json, evaluated by DetailView/ListView as it always was.
 */
export default function DocumentPrintDrawer({ open, onClose, windowName, documentIds = [], token, apiBaseUrl }) {
  const ui = useUI();
  const { shouldRender, isClosing } = useAnimatedOpen(open, 200);
  const iframeRef = useRef(null);
  // Object URL of the client-rendered PDF, reused by Download/Print and revoked
  // when it is replaced or the drawer closes, so paging through documents does not
  // leak one blob per view.
  const clientUrlRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState(null);

  const reportId = `print-${windowName}`;
  const total = documentIds.length;
  const currentDocId = documentIds[currentIndex];

  const renderDocument = useCallback(async (docId) => {
    // Design A when this window has a client-side builder.
    if (hasClientPdf(windowName) && docId && token) {
      console.info(`[print-drawer] ${docId}: client-rendered PDF (same template as preview/email)`);
      setLoading(true);
      setError(null);
      try {
        const blob = await buildClientPdfBlob({ windowName, documentId: docId, apiBaseUrl, token, ui });
        if (clientUrlRef.current) URL.revokeObjectURL(clientUrlRef.current);
        const url = URL.createObjectURL(blob);
        clientUrlRef.current = url;
        const iframe = iframeRef.current;
        if (iframe) iframe.src = `${url}#toolbar=0&navpanes=0`;
      } catch (err) {
        console.error('[print-drawer] client PDF failed:', err);
        setError(err.message);
      }
      setLoading(false);
      return;
    }
    if (!reportId || !docId || !token) return;
    console.info(`[print-drawer] ${docId}: rendering the ${reportId} artifact (separate design)`);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ format: 'html', params: { documentId: docId } }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const html = await res.text();
      const iframe = iframeRef.current;
      if (iframe) {
        iframe.src = 'about:blank';
        iframe.onload = () => {
          try { const doc = iframe.contentDocument; doc.open(); doc.write(html); doc.close(); } catch {}
          iframe.onload = null;
        };
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [reportId, token, windowName, apiBaseUrl, ui]);

  useEffect(() => { if (open && currentDocId) renderDocument(currentDocId); }, [open, currentDocId, renderDocument]);
  useEffect(() => { if (open) setCurrentIndex(0); }, [open]);
  useEffect(() => () => {
    if (clientUrlRef.current) { URL.revokeObjectURL(clientUrlRef.current); clientUrlRef.current = null; }
  }, []);

  const handleDownload = async () => {
    if (!currentDocId || downloading) return;
    setDownloading(true);
    try {
      if (clientUrlRef.current) {
        const a = document.createElement('a');
        a.href = clientUrlRef.current;
        a.download = `${windowName}-${currentDocId.slice(0, 8)}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setDownloading(false);
        return;
      }
      // Get HTML
      const res = await fetch(`/api/reports/${reportId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ format: 'html', params: { documentId: currentDocId } }),
      });
      if (!res.ok) throw new Error(ui('actionFailed'));
      const html = await res.text();
      // Generate PDF via jsreport
      const blob = await renderPdfViaJsreport(html, ui);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${windowName}-${currentDocId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[DocumentPrintDrawer] handleDownload failed:', err);
      toast.error(err.message);
    }
    setDownloading(false);
  };

  // ETP-4728 (Hallazgo 2) — the drawer previously offered only Download +
  // a disabled "send by email" placeholder, with no actual print action.
  // Reuses `printDocuments()` (below) for the single document currently
  // open in the drawer instead of duplicating its PDF-generation/window.open
  // logic — same error handling (toast) as Download already has.
  const handlePrint = async () => {
    if (!currentDocId || printing) return;
    setPrinting(true);
    try {
      if (clientUrlRef.current) {
        const printWin = window.open(clientUrlRef.current, '_blank');
        if (printWin) printWin.onload = () => { printWin.print(); };
      } else {
        await printDocuments(windowName, [currentDocId], token, ui);
      }
    } finally {
      setPrinting(false);
    }
  };

  if (!shouldRender || !reportId) return null;

  return (
    <>
      <div className={`fixed inset-0 bg-foreground/30 z-50 ${isClosing ? 'scrim-fade-out' : 'scrim-fade-in'}`} onClick={onClose} />
      <div className={`fixed top-[10%] left-[20%] right-[20%] bottom-[10%] z-50 flex flex-col bg-card rounded-xl shadow-2xl overflow-hidden ${isClosing ? 'inset-panel-exit' : 'inset-panel-enter'}`}>
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/30 bg-muted shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-foreground">{ui('documentPreview')}</span>
            {total > 1 && (
              <div className="flex items-center gap-1 ml-2">
                <button onClick={() => setCurrentIndex(i => Math.max(0, i - 1))} disabled={currentIndex === 0} className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30">
                  <ChevronLeft className="h-4 w-4" data-testid="ChevronLeft__8d2ae7" />
                </button>
                <span className="text-xs font-medium text-muted-foreground tabular-nums">{currentIndex + 1} / {total}</span>
                <button onClick={() => setCurrentIndex(i => Math.min(total - 1, i + 1))} disabled={currentIndex === total - 1} className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30">
                  <ChevronRight className="h-4 w-4" data-testid="ChevronRight__8d2ae7" />
                </button>
              </div>
            )}
            {loading && <Loader2
              className="h-4 w-4 animate-spin text-muted-foreground"
              data-testid="Loader2__8d2ae7" />}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={printing || !currentDocId}
              className="h-8 px-3 flex items-center gap-1.5 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 bg-card text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {printing ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__8d2ae7" /> : <Printer className="h-3.5 w-3.5" data-testid="Printer__8d2ae7" />}
              {printing ? ui('generating') : ui('print')}
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading || !currentDocId}
              className="h-8 px-3 flex items-center gap-1.5 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 bg-card text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__8d2ae7" /> : <Download className="h-3.5 w-3.5" data-testid="Download__8d2ae7" />}
              {downloading ? ui('generating') : ui('download')}
            </button>
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 ml-1">
              <X className="h-4 w-4" data-testid="X__8d2ae7" />
            </button>
          </div>
        </div>
        {/* Document area */}
        <div className="flex-1 overflow-hidden bg-muted p-6 flex justify-center">
          <div className="bg-card rounded-lg shadow-lg w-full max-w-[850px] overflow-hidden relative">
            {loading && <div className="absolute inset-0 flex items-center justify-center bg-card/80 z-10 gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__8d2ae7" /><span>{ui('generating')}</span></div>}
            {error && <div className="absolute inset-0 flex items-center justify-center bg-card/90 z-10 text-destructive text-sm px-8 text-center">{error}</div>}
            <iframe ref={iframeRef} title="Document Print" className="w-full h-full border-0" />
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Print all selected documents: generates a combined PDF and opens print dialog.
 * Call this function directly — no drawer needed.
 *
 * `translate` is a `(key) => string` i18n function — this is module-scope code
 * with no hooks, so callers (e.g. `ListView`) must inject their own `useUI()`
 * result. Falls back to the raw key when no translator is passed, mirroring
 * the injected-translate convention used elsewhere for non-hook code
 * (see `windows/custom/contacts/contactsImportDescriptor.js`).
 *
 * Any failure — including a jsreport outage — is caught here and surfaced via
 * `toast.error()` instead of propagating as an unhandled promise rejection
 * (the previous behavior: this function's caller never awaits/catches it).
 */
export async function printDocuments(windowName, documentIds, token, translate = (key) => key, apiBaseUrl = null) {
  const reportId = `print-${windowName}`;
  if (!reportId || !token || documentIds.length === 0) return;

  try {
    // Which template each document uses — same rule as the drawer: design A when the
    // window is in the registry, its print-* artifact otherwise. Selecting rows in the
    // list and printing them must not produce a different layout than printing them one
    // by one from the detail view (ETP-4912).
    const useClient = hasClientPdf(windowName) && apiBaseUrl;
    const renderMode = useClient
      ? 'client-rendered (same template as preview/email)'
      : `${reportId} artifact`;
    console.info(`[print-documents] ${windowName} x${documentIds.length}: ${renderMode}`);

    // HTML per document, so they can be concatenated into ONE pdf below. Design A is
    // asked for as HTML (jsreport `recipe: html`) rather than as a PDF for exactly this
    // reason — concatenating PDFs in the browser would need a pdf library.
    const htmlParts = [];
    for (const docId of documentIds) {
      if (useClient) {
        htmlParts.push(await buildClientHtml({
          windowName, documentId: docId, apiBaseUrl, token, ui: translate,
        }));
        continue;
      }
      const res = await fetch(`/api/reports/${reportId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ format: 'html', params: { documentId: docId } }),
      });
      if (!res.ok) throw new Error(translate('actionFailed'));
      htmlParts.push(await res.text());
    }

    // Combine with page breaks
    const combined = htmlParts.join('<div style="page-break-after: always;"></div>');

    // Generate PDF via jsreport
    const blob = await renderPdfViaJsreport(combined, translate);
    const url = URL.createObjectURL(blob);

    // Open in new window for print dialog
    const printWin = window.open(url, '_blank');
    if (printWin) {
      printWin.onload = () => { printWin.print(); };
    }
  } catch (err) {
    console.error('[DocumentPrintDrawer] printDocuments failed:', err);
    toast.error(err.message);
  }
}
