import { useRef, useEffect, useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Loader2, Send, Download } from 'lucide-react';
import { useUI } from '@/i18n';
import { useAnimatedOpen } from '@/lib/useAnimatedOpen.js';

/**
 * Preview drawer: shows document preview one at a time with < > navigation.
 * Report ID convention: print-{windowName} (e.g., print-purchase-order)
 */
export default function DocumentPrintDrawer({ open, onClose, windowName, documentIds = [], token }) {
  const ui = useUI();
  const { shouldRender, isClosing } = useAnimatedOpen(open, 200);
  const iframeRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  const reportId = `print-${windowName}`;
  const total = documentIds.length;
  const currentDocId = documentIds[currentIndex];

  const renderDocument = useCallback(async (docId) => {
    if (!reportId || !docId || !token) return;
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
  }, [reportId, token]);

  useEffect(() => { if (open && currentDocId) renderDocument(currentDocId); }, [open, currentDocId, renderDocument]);
  useEffect(() => { if (open) setCurrentIndex(0); }, [open]);

  const handleDownload = async () => {
    if (!currentDocId || downloading) return;
    setDownloading(true);
    try {
      // Get HTML
      const res = await fetch(`/api/reports/${reportId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ format: 'html', params: { documentId: currentDocId } }),
      });
      if (!res.ok) throw new Error('Failed to render');
      const html = await res.text();
      // Generate PDF via jsreport
      const pdfRes = await fetch('/jsreport/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: { content: html, engine: 'none', recipe: 'chrome-pdf', chrome: { format: 'A4', marginTop: '10mm', marginBottom: '10mm', marginLeft: '10mm', marginRight: '10mm' } },
          data: {},
        }),
      });
      if (!pdfRes.ok) throw new Error('PDF generation failed');
      const blob = await pdfRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${windowName}-${currentDocId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
    setDownloading(false);
  };

  if (!shouldRender || !reportId) return null;

  return (
    <>
      <div className={`fixed inset-0 bg-black/30 z-50 ${isClosing ? 'scrim-fade-out' : 'scrim-fade-in'}`} onClick={onClose} />
      <div className={`fixed top-[10%] left-[20%] right-[20%] bottom-[10%] z-50 flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden ${isClosing ? 'modal-exit' : 'modal-enter'}`}>
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/30 bg-slate-50 shrink-0">
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
              onClick={handleDownload}
              disabled={downloading || !currentDocId}
              className="h-8 px-3 flex items-center gap-1.5 rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 bg-white text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__8d2ae7" /> : <Download className="h-3.5 w-3.5" data-testid="Download__8d2ae7" />}
              {downloading ? ui('generating') : ui('download')}
            </button>
            <button
              disabled
              title={ui('comingSoon')}
              className="h-8 px-3 flex items-center gap-1.5 rounded-md bg-blue-600/50 text-white text-xs font-medium cursor-not-allowed"
            >
              <Send className="h-3.5 w-3.5" data-testid="Send__8d2ae7" />
              {ui('sendByEmail')}
            </button>
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 ml-1">
              <X className="h-4 w-4" data-testid="X__8d2ae7" />
            </button>
          </div>
        </div>
        {/* Document area */}
        <div className="flex-1 overflow-hidden bg-slate-100 p-6 flex justify-center">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-[850px] overflow-hidden relative">
            {loading && <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10 gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__8d2ae7" /><span>{ui('generating')}</span></div>}
            {error && <div className="absolute inset-0 flex items-center justify-center bg-white/90 z-10 text-destructive text-sm px-8 text-center">{error}</div>}
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
 */
export async function printDocuments(windowName, documentIds, token) {
  const reportId = `print-${windowName}`;
  if (!reportId || !token || documentIds.length === 0) return;

  // Fetch HTML for each document
  const htmlParts = [];
  for (const docId of documentIds) {
    const res = await fetch(`/api/reports/${reportId}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ format: 'html', params: { documentId: docId } }),
    });
    if (!res.ok) throw new Error(`Failed to render document`);
    htmlParts.push(await res.text());
  }

  // Combine with page breaks
  const combined = htmlParts.join('<div style="page-break-after: always;"></div>');

  // Generate PDF via jsreport
  const pdfRes = await fetch('/jsreport/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template: {
        content: combined,
        engine: 'none',
        recipe: 'chrome-pdf',
        chrome: { format: 'A4', marginTop: '10mm', marginBottom: '10mm', marginLeft: '10mm', marginRight: '10mm' },
      },
      data: {},
    }),
  });

  if (!pdfRes.ok) throw new Error('PDF generation failed');
  const blob = await pdfRes.blob();
  const url = URL.createObjectURL(blob);

  // Open in new window for print dialog
  const printWin = window.open(url, '_blank');
  if (printWin) {
    printWin.onload = () => { printWin.print(); };
  }
}
