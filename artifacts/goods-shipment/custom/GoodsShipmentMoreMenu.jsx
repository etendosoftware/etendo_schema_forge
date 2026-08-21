import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { generateShipmentPdf, getShipmentPdfLabels } from '@/windows/custom/goods-shipment/useShipmentPdf';

/**
 * moreMenuContent (kebab) for Goods Shipment (ETP-4702).
 *
 * Renders a single "Download PDF" item inside the SAME shared kebab dropdown
 * that already lists the generic `menuActions` (Post/Unpost). This replaces
 * the private "⋮" popover that used to live in GoodsShipmentActions.jsx
 * (topbarRight) and rendered as a SECOND, independent kebab button next to
 * the generic one — see docs/plans/2026-08-04-etp-4702-duplicate-kebab-menu.md.
 *
 * Instant-action shape (no confirmation dialog), matching the established
 * `moreMenuContent` convention used by internal-consumption's
 * InternalConsumptionActions.jsx (`handleVoid`) and physical-inventory's
 * InventoryMenuContent.jsx (`handleUpdateQuantities`): click fires the action
 * directly, no modal in between.
 *
 * Only shown when the shipment is completed — mirrors the private popover's
 * previous `isCompleted` gate.
 */
export default function GoodsShipmentMoreMenu({ data, recordId, token, apiBaseUrl, onClose }) {
  const ui = useUI();
  const [downloading, setDownloading] = useState(false);
  // `downloading` state only reflects reality after React commits the next
  // render — a genuine same-tick double click (both events handled before
  // any re-render) would read the OLD `downloading` value (false) twice and
  // slip past a state-only guard. `downloadingRef` is mutated synchronously,
  // before the async work starts, so the second call sees it immediately.
  const downloadingRef = useRef(false);

  if (data?.documentStatus !== 'CO') return null;

  const pdfLabels = getShipmentPdfLabels(ui);

  const handleDownload = async () => {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    setDownloading(true);
    try {
      const blob = await generateShipmentPdf(recordId, apiBaseUrl, pdfLabels);
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `alb-${data?.documentNo || recordId}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      // `err` is not guaranteed to be an Error (a rejection can be a string,
      // null, or a plain object) — accessing `.message` on a non-object throws
      // INSIDE this catch, which would skip toast.error entirely and surface
      // as an unhandled rejection instead of user feedback. Guard defensively.
      toast.error((err instanceof Error && err.message) || ui('failedToGeneratePdf'));
    } finally {
      downloadingRef.current = false;
      setDownloading(false);
      onClose?.();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '9px 14px', fontSize: 13, color: 'hsl(var(--foreground))',
          background: 'none', border: 'none', textAlign: 'left',
          cursor: downloading ? 'not-allowed' : 'pointer',
          opacity: downloading ? 0.6 : 1,
        }}
        onMouseEnter={e => { if (!downloading) e.currentTarget.style.background = 'hsl(var(--card))'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
      >
        {downloading ? (
          <svg style={{ width: 14, height: 14, flexShrink: 0, animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
        ) : (
          <svg style={{ width: 14, height: 14, flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
        )}
        {ui('invoicePreviewDownloadPdf')}
      </button>
      <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
    </>
  );
}
