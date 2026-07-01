import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useUI } from '@/i18n';

export default function BulkInvoiceFromShipment({ selectedRows, clearSelection, token, apiBaseUrl }) {
  const ui = useUI();
  const [showModal, setShowModal] = useState(false);

  const invoiceableRows = useMemo(
    () => selectedRows.filter(r => r.documentStatus === 'CO' && r.completelyInvoiced !== true),
    [selectedRows],
  );

  const bpCheck = useMemo(() => {
    if (invoiceableRows.length === 0) return { same: false, name: '' };
    const firstBp = invoiceableRows[0].businessPartner;
    const allSame = invoiceableRows.every(r => r.businessPartner === firstBp);
    const name = invoiceableRows[0]['businessPartner$_identifier'] || '';
    return { same: allSame, name };
  }, [invoiceableRows]);

  const invoiceableCount = invoiceableRows.length;
  const allInvoiced = invoiceableCount === 0;
  const canCreate = invoiceableCount > 0 && bpCheck.same;

  if (selectedRows.length < 1) return null;

  const tooltip = allInvoiced
    ? ui('allShipmentsAlreadyInvoiced')
    : !bpCheck.same
      ? ui('selectShipmentsSameCustomer')
      : undefined;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderLeft: '1px solid #e5e7eb', paddingLeft: 8, marginLeft: 4 }}>
        <button
          type="button"
          disabled={!canCreate}
          onClick={() => setShowModal(true)}
          title={tooltip}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors"
          style={{
            padding: '4px 12px', borderRadius: 6,
            border: canCreate ? '1px solid #93c5fd' : '1px solid #e5e7eb',
            background: canCreate ? '#eff6ff' : 'transparent',
            color: canCreate ? '#2563eb' : '#9ca3af',
            cursor: canCreate ? 'pointer' : 'not-allowed',
            opacity: canCreate ? 1 : 0.5,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          {ui('createInvoiceBtn')} ({invoiceableCount})
        </button>
      </div>

      {showModal && createPortal(
        <BulkInvoiceModal
          shipments={invoiceableRows}
          bpName={bpCheck.name}
          token={token}
          apiBaseUrl={apiBaseUrl}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); clearSelection(); }}
        />,
        document.body,
      )}
    </>
  );
}

function BulkInvoiceModal({ shipments, bpName, token, apiBaseUrl, onClose, onSuccess }) {
  const ui = useUI();
  const [linesByShipment, setLinesByShipment] = useState({});
  const [orderLinePrices, setOrderLinePrices] = useState({});
  const [loadingLines, setLoadingLines] = useState(true);
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    const init = {};
    shipments.forEach(s => { init[s.id] = true; });
    return init;
  });
  const [selectedLines, setSelectedLines] = useState(new Set());
  const [lineQuantities, setLineQuantities] = useState({});
  const [pendingByLine, setPendingByLine] = useState({});
  const [existingDraft, setExistingDraft] = useState(null);
  const [dismissedWarning, setDismissedWarning] = useState(false);

  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const hdrs = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Fetch shipment lines and draft-aware pending qty in parallel
        const [lineResults, pendingResults] = await Promise.all([
          Promise.all(
            shipments.map(async (s) => {
              const res = await fetch(`${base}/goods-shipment/goodsShipmentLine?parentId=${s.id}&_startRow=0&_endRow=200`, { headers: hdrs });
              if (!res.ok) return { id: s.id, lines: [] };
              return { id: s.id, lines: (await res.json())?.response?.data || [] };
            }),
          ),
          Promise.all(
            shipments.map(async (s) => {
              try {
                const res = await fetch(`${base}/goods-shipment/goodsShipment/${s.id}/action/pendingInvoiceLines`, { headers: hdrs });
                if (!res.ok) return {};
                const data = (await res.json())?.response?.data || [];
                const map = {};
                data.forEach(item => { map[item.lineId] = Number(item.pendingQty) || 0; });
                return map;
              } catch { return {}; }
            }),
          ),
        ]);
        if (cancelled) return;

        // Merge pending qty maps (one per shipment)
        const pending = Object.assign({}, ...pendingResults);
        setPendingByLine(pending);

        const linesMap = {};
        const allLineIds = new Set();
        const qtyDefaults = {};
        lineResults.forEach(r => {
          linesMap[r.id] = r.lines;
          r.lines.forEach(l => {
            // Use server-side draft-aware pending qty; fall back to raw movementQty - invoicedQty
            const fallback = Math.max(0, (Number(l.movementQuantity) || 0) - (Number(l.invoicedQuantity) || 0));
            const pendingQty = pending[l.id] !== undefined ? pending[l.id] : fallback;
            if (pendingQty > 0) allLineIds.add(l.id);
            qtyDefaults[l.id] = pendingQty;
          });
        });
        setLinesByShipment(linesMap);
        setSelectedLines(allLineIds);
        setLineQuantities(qtyDefaults);

        const orderIds = [...new Set(shipments.map(s => s.salesOrder).filter(Boolean))];
        const priceMap = {};
        await Promise.all(orderIds.map(async (orderId) => {
          try {
            const res = await fetch(`${base}/sales-order/lines?parentId=${orderId}&_startRow=0&_endRow=200`, { headers: hdrs });
            if (res.ok) {
              ((await res.json())?.response?.data || []).forEach(ol => { priceMap[ol.id] = ol; });
            }
          } catch { /* silent */ }
        }));
        if (!cancelled) setOrderLinePrices(priceMap);

        try {
          const draftRes = await fetch(
            `${base}/goods-shipment/goodsShipment/${shipments[0].id}/action/checkDraftInvoice`,
            { method: 'POST', headers: hdrs, body: JSON.stringify({ shipmentIds: shipments.map(s => s.id) }) },
          );
          if (draftRes.ok && !cancelled) {
            const draftData = (await draftRes.json())?.response?.data;
            if (draftData?.exists) setExistingDraft(draftData);
          }
        } catch { /* silent */ }
      } catch { /* silent */ }
      finally { if (!cancelled) setLoadingLines(false); }
    })();
    return () => { cancelled = true; };
  }, [shipments, base, hdrs]);

  const shipmentSummaries = useMemo(() =>
    shipments.map(s => {
      const lines = (linesByShipment[s.id] || []).map(l => {
        const ol = orderLinePrices[l.salesOrderLine] || {};
        const unitPrice = Number(ol.unitPrice) || 0;
        // Use server-side draft-aware pending qty; fall back to raw computation
        const fallback = Math.max(0, (Number(l.movementQuantity) || 0) - (Number(l.invoicedQuantity) || 0));
        const maxQty = pendingByLine[l.id] !== undefined ? Number(pendingByLine[l.id]) : fallback;
        const currentQty = lineQuantities[l.id] ?? maxQty;
        const isSel = selectedLines.has(l.id);
        return { ...l, unitPrice, maxQty, currentQty, lineTotal: isSel ? unitPrice * currentQty : 0, productName: l['product$_identifier'] || l.id, isSelected: isSel };
      }).filter(l => l.maxQty > 0);  // hide fully-invoiced / fully-drafted lines
      const total = lines.reduce((sum, l) => sum + l.lineTotal, 0);
      const selectedCount = lines.filter(l => l.isSelected).length;
      return { ...s, enrichedLines: lines, total, selectedCount };
    }),
    [shipments, linesByShipment, orderLinePrices, selectedLines, lineQuantities, pendingByLine],
  );

  const totalSelectedLines = shipmentSummaries.reduce((sum, s) => sum + s.selectedCount, 0);
  const grandTotal = shipmentSummaries.reduce((sum, s) => sum + s.total, 0);

  const toggleCollapse = useCallback((id) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] })), []);
  const toggleLine = (lineId) => setSelectedLines(prev => { const n = new Set(prev); n.has(lineId) ? n.delete(lineId) : n.add(lineId); return n; });
  const toggleShipmentLines = (shipmentId) => {
    const lines = linesByShipment[shipmentId] || [];
    const lineIds = lines.map(l => l.id);
    const allSel = lineIds.every(id => selectedLines.has(id));
    setSelectedLines(prev => {
      const n = new Set(prev);
      if (allSel) { lineIds.forEach(id => n.delete(id)); } else { lineIds.forEach(id => n.add(id)); }
      return n;
    });
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const fmtNum = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleCreate = async () => {
    if (creating || totalSelectedLines === 0) return;
    setCreating(true);
    try {
      const linesPayload = [];
      shipmentSummaries.forEach(s => {
        s.enrichedLines.forEach(l => {
          if (l.isSelected) linesPayload.push({ shipmentLineId: l.id, quantity: String(l.currentQty) });
        });
      });
      const res = await fetch(
        `${base}/goods-shipment/goodsShipment/${shipments[0].id}/action/createDraftInvoice`,
        { method: 'POST', headers: hdrs, body: JSON.stringify({ shipmentIds: shipments.map(s => s.id), lines: linesPayload }) },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.response?.message || err?.message || `Failed (${res.status})`);
      }
      const json = await res.json();
      const invoiceId = json?.response?.data?.id;
      const docNo = json?.response?.data?.documentNo || '';
      if (invoiceId) {
        const bp = window.location.pathname.replace(/\/goods-shipment\/.*$/, '').replace(/\/goods-shipment\/?$/, '');
        const invoiceUrl = `${bp}/sales-invoice/${invoiceId}`;
        toast.custom((t) => (
          <div style={{ background: '#16a34a', color: '#fff', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 8px 30px rgba(0,0,0,0.18)', minWidth: 380 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{`${ui('invoiceRef')}${docNo} ${ui('createdAsDraft')}`}</div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{ui('reviewBeforeConfirming')}</div>
            </div>
            <button
              onClick={() => { toast.dismiss(t); window.location.href = invoiceUrl; }}
              style={{ border: '1px solid rgba(255,255,255,0.4)', borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 500, color: '#fff', background: 'rgba(255,255,255,0.15)', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >{ui('viewInvoice')}</button>
          </div>
        ), { duration: 10000 });
      } else {
        toast.success(ui('invoiceCreatedAsDraftToast'));
      }
      onSuccess();
    } catch (err) {
      toast.error(err.message || ui('failedToCreateInvoice'));
    } finally {
      setCreating(false);
    }
  };

  const navToInvoice = (id) => {
    onClose();
    const bp = window.location.pathname.replace(/\/goods-shipment\/.*$/, '').replace(/\/goods-shipment\/?$/, '');
    window.location.href = `${bp}/sales-invoice/${id}`;
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div onClick={e => e.stopPropagation()} style={{ width: 600, minWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 12, backgroundColor: '#fff', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '0.5px solid #E5E7EB' }}>

        {/* Header — fixed */}
        <div style={{ padding: '14px 16px', background: '#F4F5F7', borderBottom: '1px solid #E5E7EB', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>{ui('createInvoiceBtn')}</div>
              <div style={{ fontSize: 13, color: '#6B7280', marginTop: 3 }}>
                {shipments.length} {ui('shipment')}{shipments.length !== 1 ? 's' : ''} · {bpName}
              </div>
            </div>
            <button type="button" onClick={onClose} style={{ fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>&times;</button>
          </div>
        </div>

        {existingDraft && !dismissedWarning && (
          <div style={{ padding: '12px 20px', background: '#FAEEDA', borderBottom: '0.5px solid #EF9F27', display: 'flex', gap: 10, flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#854F0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#633806' }}>{ui('draftInvoiceExistsForShipments')}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <button type="button" onClick={() => navToInvoice(existingDraft.id)} style={{ fontSize: 12, color: '#185FA5', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>{ui('viewExistingInvoice')}</button>
                <span style={{ color: '#854F0B', fontSize: 12 }}>·</span>
                <button type="button" onClick={() => setDismissedWarning(true)} style={{ fontSize: 12, color: '#854F0B', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>{ui('createAnotherAnyway')}</button>
              </div>
            </div>
          </div>
        )}

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', maxHeight: 380, padding: 0 }}>
          {loadingLines ? (
            <p style={{ fontSize: 13, color: '#9ca3af', padding: '24px 0', textAlign: 'center' }}>{ui('loadingShipmentLines')}</p>
          ) : shipmentSummaries.every(s => s.enrichedLines.length === 0) ? (
            <p style={{ fontSize: 13, color: '#9ca3af', padding: '24px 0', textAlign: 'center' }}>{ui('noLinesInSelectedShipments')}</p>
          ) : (
            shipmentSummaries.map((shipment) => {
              const isExpanded = !collapsed[shipment.id];
              const allLinesSel = shipment.enrichedLines.every(l => l.isSelected);
              const someLinesSel = shipment.enrichedLines.some(l => l.isSelected) && !allLinesSel;
              return (
                <div key={shipment.id}>
                  {/* Shipment header */}
                  <div
                    onClick={() => toggleCollapse(shipment.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '9px 16px', background: '#F4F5F7', borderBottom: '0.5px solid #E5E7EB',
                      borderLeft: isExpanded ? '3px solid #378ADD' : '3px solid transparent',
                      cursor: 'pointer', userSelect: 'none',
                    }}
                  >
                    <span style={{ fontSize: 11, color: '#9ca3af', width: 14, textAlign: 'center', transition: 'transform 0.2s ease', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>▶</span>
                    <input
                      type="checkbox"
                      checked={allLinesSel}
                      ref={el => { if (el) el.indeterminate = someLinesSel; }}
                      onChange={(e) => { e.stopPropagation(); toggleShipmentLines(shipment.id); }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ accentColor: '#3b82f6', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{ui('shipmentRef')}{shipment.documentNo}</span>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>· {fmtDate(shipment.movementDate)} · {shipment.enrichedLines.length} {ui('line')}{shipment.enrichedLines.length !== 1 ? 's' : ''}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 13, color: '#374151', fontVariantNumeric: 'tabular-nums', fontWeight: 500, flexShrink: 0 }}>
                      {fmtNum(shipment.total)}
                    </span>
                  </div>

                  {/* Lines */}
                  {isExpanded && (
                    <>
                      <div style={{ display: 'flex', padding: '4px 16px 4px 54px', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '0.5px solid #E5E7EB' }}>
                        <span style={{ flex: 1 }}>{ui('product')}</span>
                        <span style={{ width: 70, textAlign: 'right' }}>{ui('qty')}</span>
                        <span style={{ width: 70, textAlign: 'right' }}>{ui('price')}</span>
                        <span style={{ width: 80, textAlign: 'right' }}>{ui('amount')}</span>
                      </div>
                      {shipment.enrichedLines.map(line => {
                        const qtyEdited = line.currentQty !== line.maxQty;
                        return (
                          <div
                            key={line.id}
                            onClick={() => toggleLine(line.id)}
                            style={{
                              display: 'flex', alignItems: 'center', padding: '5px 16px 5px 38px', borderBottom: '0.5px solid #F3F4F6', cursor: 'pointer',
                              background: line.isSelected ? '#eff6ff' : 'transparent',
                              opacity: line.isSelected ? 1 : 0.5,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={line.isSelected}
                              onChange={() => toggleLine(line.id)}
                              onClick={e => e.stopPropagation()}
                              style={{ accentColor: '#3b82f6', cursor: 'pointer', marginRight: 8, flexShrink: 0 }}
                            />
                            <span style={{ flex: 1, fontSize: 13, color: line.isSelected ? '#2563eb' : '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: line.isSelected ? 500 : 400 }}>
                              {line.productName}
                            </span>
                            <span style={{ width: 70, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
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
                            <span style={{ width: 70, fontSize: 12, color: '#6B7280', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                              {fmtNum(line.unitPrice)}
                            </span>
                            <span style={{ width: 80, fontSize: 13, color: '#111827', fontVariantNumeric: 'tabular-nums', textAlign: 'right', fontWeight: 500 }}>
                              {line.isSelected ? fmtNum(line.lineTotal) : '-'}
                            </span>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer — fixed */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F4F5F7', borderTop: '1px solid #E5E7EB', padding: '10px 16px', flexShrink: 0 }}>
          <span style={{ fontSize: 13, color: '#6B7280', fontVariantNumeric: 'tabular-nums' }}>
            {totalSelectedLines > 0 ? (
              <>
                {totalSelectedLines} {ui('line')}{totalSelectedLines !== 1 ? 's' : ''} {ui('from')} {shipments.length} {ui('shipment')}{shipments.length !== 1 ? 's' : ''}
                {' · '}<span style={{ fontWeight: 500, color: '#2563eb' }}>{ui('total')}: {fmtNum(grandTotal)}</span>
              </>
            ) : ui('selectLinesToInvoice')}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: '1px solid #E5E7EB', background: 'transparent', color: '#6B7280', cursor: 'pointer' }}>{ui('cancel')}</button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={totalSelectedLines === 0 || creating}
              style={{ fontSize: 13, fontWeight: 500, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#18181b', color: '#fff', cursor: (totalSelectedLines === 0 || creating) ? 'not-allowed' : 'pointer', opacity: (totalSelectedLines === 0 || creating) ? 0.4 : 1 }}
            >{creating ? ui('creating') : ui('createInvoiceBtn')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
