import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import ReturnWizard from './ReturnWizard';
import SendDocumentModal, { SendDocumentButton } from '@/components/contract-ui/SendDocumentModal';

export default function GoodsShipmentActions({ data, recordId, token, apiBaseUrl, api }) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [returnLines, setReturnLines] = useState([]);
  const [showSend, setShowSend] = useState(false);

  const isCompleted = data?.documentStatus === 'CO';
  const ci = data?.completelyInvoiced;
  const isFullyInvoiced = ci === true || ci === 'true' || ci === 'Y';

  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  useEffect(() => {
    if (!wizardOpen || !recordId || !base) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${base}/goods-shipment/goodsShipmentLine?parentId=${recordId}&_startRow=0&_endRow=200`, { headers });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled) setReturnLines(json?.response?.data || []);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [wizardOpen, recordId, base, headers]);

  const handleCreateInvoice = async (linesPayload) => {
    if (creatingInvoice) return;
    setCreatingInvoice(true);
    try {
      const body = linesPayload && linesPayload.length > 0 ? { lines: linesPayload } : {};
      const res = await fetch(
        `${base}/goods-shipment/goodsShipment/${recordId}/action/createDraftInvoice`,
        { method: 'POST', headers, body: JSON.stringify(body) },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.response?.message || err?.message || `Failed (${res.status})`);
      }
      const json = await res.json();
      const invoiceId = json?.response?.data?.id;
      const docNo = json?.response?.data?.documentNo || '';

      if (invoiceId) {
        const currentPath = window.location.pathname;
        const basePath = currentPath.replace(/\/goods-shipment\/.*$/, '');
        const invoiceUrl = `${basePath}/sales-invoice/${invoiceId}`;
        toast.custom((t) => (
          <div style={{ background: '#16a34a', color: '#fff', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 8px 30px rgba(0,0,0,0.18)', minWidth: 380 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>Invoice #{docNo} created as Draft</div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>Review before confirming</div>
            </div>
            <button
              onClick={() => { toast.dismiss(t); window.location.href = invoiceUrl; }}
              style={{ border: '1px solid rgba(255,255,255,0.4)', borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 500, color: '#fff', background: 'rgba(255,255,255,0.15)', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              View Invoice →
            </button>
          </div>
        ), { duration: 10000 });
      } else {
        toast.success('Invoice created as Draft');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to create invoice');
    } finally {
      setCreatingInvoice(false);
      setShowInvoicePreview(false);
    }
  };

  return (
    <>
      {isCompleted && !isFullyInvoiced && (
        <button
          type="button"
          onClick={() => setShowInvoicePreview(true)}
          disabled={creatingInvoice}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors"
          style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--color-border-info, #93c5fd)', background: 'var(--color-background-info, #eff6ff)', color: 'var(--color-text-info, #2563eb)', opacity: creatingInvoice ? 0.6 : 1, cursor: creatingInvoice ? 'not-allowed' : 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-background-info-hover, #dbeafe)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-background-info, #eff6ff)'; }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          Create Invoice
        </button>
      )}

      {isCompleted && (
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          style={{ padding: '4px 12px', borderRadius: '6px', borderWidth: '1px' }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 17H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-5" />
            <path d="M12 15l-3 3 3 3" />
            <path d="M9 18h8" />
          </svg>
          Create Return
        </button>
      )}

      {showInvoicePreview && createPortal(
        <ShipmentInvoicePreview
          shipmentId={recordId}
          shipmentData={data}
          base={base}
          headers={headers}
          loading={creatingInvoice}
          onConfirm={handleCreateInvoice}
          onClose={() => setShowInvoicePreview(false)}
        />,
        document.body,
      )}

      <SendDocumentButton onClick={() => setShowSend(true)} />

      <ReturnWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        shipmentData={data}
        lines={returnLines}
        token={token}
        apiBaseUrl={apiBaseUrl}
        onSuccess={() => { setWizardOpen(false); window.location.reload(); }}
        onError={(msg) => console.error('Return creation failed:', msg)}
      />

      {showSend && createPortal(
        <SendDocumentModal
          documentType="Shipment"
          documentNo={data?.documentNo}
          bpName={data?.['businessPartner$_identifier']}
          bpEmail={data?.['userContact$_identifier']}
          documentId={recordId}
          windowName="goods-shipment"
          token={token}
          onClose={() => setShowSend(false)}
        />,
        document.body,
      )}
    </>
  );
}

function ShipmentInvoicePreview({ shipmentId, shipmentData, base, headers, loading, onConfirm, onClose }) {
  const [lines, setLines] = useState([]);
  const [loadingLines, setLoadingLines] = useState(true);
  const [orderLinePrices, setOrderLinePrices] = useState({});
  const [existingDraft, setExistingDraft] = useState(null);
  const [dismissedWarning, setDismissedWarning] = useState(false);
  const [lineQuantities, setLineQuantities] = useState({});

  const bpName = shipmentData?.['businessPartner$_identifier'] || '';
  const shipmentNo = shipmentData?.documentNo || '';
  const orderId = shipmentData?.salesOrder;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [linesRes, draftRes] = await Promise.all([
          fetch(`${base}/goods-shipment/goodsShipmentLine?parentId=${shipmentId}&_startRow=0&_endRow=200`, { headers }),
          fetch(`${base}/goods-shipment/goodsShipment/${shipmentId}/action/checkDraftInvoice`, { headers }),
        ]);
        if (!cancelled && linesRes.ok) {
          setLines((await linesRes.json())?.response?.data || []);
        }
        if (!cancelled && draftRes.ok) {
          const draftData = (await draftRes.json())?.response?.data;
          if (draftData?.exists) setExistingDraft(draftData);
        }
      } catch { /* silent */ }
      finally { if (!cancelled) setLoadingLines(false); }
    })();
    return () => { cancelled = true; };
  }, [shipmentId, base, headers]);

  useEffect(() => {
    if (!orderId || !base) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${base}/sales-order/lines?parentId=${orderId}&_startRow=0&_endRow=200`, { headers });
        if (res.ok && !cancelled) {
          const json = await res.json();
          const olMap = {};
          (json?.response?.data || []).forEach(ol => { olMap[ol.id] = ol; });
          setOrderLinePrices(olMap);
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [orderId, base, headers]);

  const enrichedLines = useMemo(() =>
    lines.map(l => {
      const ol = orderLinePrices[l.salesOrderLine] || {};
      const unitPrice = Number(ol.unitPrice) || 0;
      const maxQty = Number(l.movementQuantity) || 0;
      const currentQty = lineQuantities[l.id] ?? maxQty;
      return { ...l, unitPrice, maxQty, currentQty, lineTotal: unitPrice * currentQty };
    }),
    [lines, orderLinePrices, lineQuantities],
  );

  useEffect(() => {
    if (lines.length > 0 && Object.keys(lineQuantities).length === 0) {
      const defaults = {};
      lines.forEach(l => { defaults[l.id] = Number(l.movementQuantity) || 0; });
      setLineQuantities(defaults);
    }
  }, [lines]);

  const total = useMemo(() => enrichedLines.reduce((sum, l) => sum + l.lineTotal, 0), [enrichedLines]);

  const fmtNum = (v) => v != null ? Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';

  return (
    <div onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 12, backgroundColor: '#fff', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '0.5px solid #E5E7EB' }}>

        <div style={{ padding: '14px 16px', background: '#F4F5F7', borderBottom: '1px solid #E5E7EB', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>Create Invoice</div>
              <div style={{ fontSize: 13, color: '#6B7280', marginTop: 3 }}>
                Shipment {shipmentNo}{bpName ? ` · ${bpName}` : ''}
              </div>
            </div>
            <button type="button" onClick={onClose} style={{ fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>&times;</button>
          </div>
        </div>

        {existingDraft && !dismissedWarning && (
          <div style={{ padding: '12px 20px', background: '#FAEEDA', borderBottom: '0.5px solid #EF9F27', display: 'flex', gap: 10, flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#854F0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#633806' }}>This shipment already has a Draft invoice</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <button type="button" onClick={() => { onClose(); const bp = window.location.pathname.replace(/\/goods-shipment\/.*$/, ''); window.location.href = `${bp}/sales-invoice/${existingDraft.id}`; }} style={{ fontSize: 12, color: '#185FA5', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>View existing invoice →</button>
                <span style={{ color: '#854F0B', fontSize: 12 }}>·</span>
                <button type="button" onClick={() => setDismissedWarning(true)} style={{ fontSize: 12, color: '#854F0B', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>Create another anyway</button>
              </div>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
          {loadingLines ? (
            <p style={{ fontSize: 13, color: '#9ca3af', padding: '24px 0', textAlign: 'center' }}>Loading shipment lines...</p>
          ) : enrichedLines.length === 0 ? (
            <p style={{ fontSize: 13, color: '#9ca3af', padding: '24px 0', textAlign: 'center' }}>No lines found in this shipment.</p>
          ) : (
            <>
              <div style={{ display: 'flex', padding: '8px 16px', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '0.5px solid #E5E7EB', background: '#F9FAFB' }}>
                <span style={{ flex: 1 }}>Product</span>
                <span style={{ width: 70, textAlign: 'right' }}>Qty</span>
                <span style={{ width: 80, textAlign: 'right' }}>Price</span>
                <span style={{ width: 90, textAlign: 'right' }}>Amount</span>
              </div>
              {enrichedLines.map(line => {
                const productName = line['product$_identifier'] || line.id;
                const qtyEdited = line.currentQty !== line.maxQty;
                return (
                  <div key={line.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderBottom: '0.5px solid #F3F4F6' }}>
                    <span style={{ flex: 1, fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{productName}</span>
                    <span style={{ width: 70, textAlign: 'right' }}>
                      <input
                        type="number"
                        min={1}
                        max={line.maxQty}
                        value={line.currentQty}
                        onChange={e => {
                          const v = Math.max(1, Math.min(line.maxQty, Number(e.target.value) || 1));
                          setLineQuantities(prev => ({ ...prev, [line.id]: v }));
                        }}
                        style={{
                          width: 56, fontSize: 12, padding: '2px 4px', borderRadius: 4, textAlign: 'center',
                          fontVariantNumeric: 'tabular-nums', outline: 'none',
                          border: qtyEdited ? '1px solid #f59e0b' : '0.5px solid #d1d5db',
                          background: qtyEdited ? '#fffbeb' : '#fff',
                        }}
                      />
                    </span>
                    <span style={{ width: 80, fontSize: 12, color: '#6B7280', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                      {fmtNum(line.unitPrice)}
                    </span>
                    <span style={{ width: 90, fontSize: 13, color: '#111827', fontVariantNumeric: 'tabular-nums', textAlign: 'right', fontWeight: 500 }}>
                      {fmtNum(line.lineTotal)}
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F5F5F5', borderTop: '1px solid #E5E5E5', padding: '10px 16px', flexShrink: 0 }}>
          <span style={{ fontSize: 13, color: '#6B7280', fontVariantNumeric: 'tabular-nums' }}>
            {enrichedLines.length > 0 && (
              <>
                {enrichedLines.length} line{enrichedLines.length !== 1 ? 's' : ''}
                {' · '}<span style={{ fontWeight: 500, color: '#378ADD' }}>Total: {fmtNum(total)}</span>
              </>
            )}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: '1px solid #E5E7EB', background: 'transparent', color: '#6B7280', cursor: 'pointer' }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const payload = enrichedLines.map(l => ({
                  shipmentLineId: l.id,
                  quantity: String(l.currentQty),
                }));
                onConfirm(payload);
              }}
              disabled={enrichedLines.length === 0 || loading}
              style={{ fontSize: 13, fontWeight: 500, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#18181b', color: '#fff', cursor: (enrichedLines.length === 0 || loading) ? 'not-allowed' : 'pointer', opacity: (enrichedLines.length === 0 || loading) ? 0.4 : 1 }}
            >
              {loading ? 'Creating...' : 'Create Invoice'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
