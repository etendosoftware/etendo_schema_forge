import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';

export default function ImportFromShipmentModal({ invoiceId, bpId, base, headers, onClose, onSuccess }) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [expanded, setExpanded] = useState(new Set());
  const [shipmentLines, setShipmentLines] = useState({});
  const [loadingLines, setLoadingLines] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [lineQuantities, setLineQuantities] = useState({});
  const [alreadyImported, setAlreadyImported] = useState({ shipmentLines: new Set(), orderLines: new Set() });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Fetch shipments and existing invoice lines in parallel
        const [shipRes, invLinesRes] = await Promise.all([
          fetch(`${base}/goods-shipment/goodsShipment?_startRow=0&_endRow=500`, { headers }),
          fetch(`${base}/sales-invoice/lines?parentId=${invoiceId}&_startRow=0&_endRow=200`, { headers }),
        ]);

        // Get IDs of shipment lines and order lines already in this invoice
        const alreadyImportedShipmentLines = new Set();
        const alreadyImportedOrderLines = new Set();
        if (invLinesRes.ok && !cancelled) {
          const invLines = (await invLinesRes.json())?.response?.data || [];
          invLines.forEach(il => {
            if (il.goodsShipmentLine) alreadyImportedShipmentLines.add(il.goodsShipmentLine);
            if (il.salesOrderLine) alreadyImportedOrderLines.add(il.salesOrderLine);
          });
        }

        if (shipRes.ok && !cancelled) {
          const all = (await shipRes.json())?.response?.data || [];
          setShipments(all.filter(s =>
            s.documentStatus === 'CO'
            && s.businessPartner === bpId
            && s.completelyInvoiced !== true
          ));
          setAlreadyImported({ shipmentLines: alreadyImportedShipmentLines, orderLines: alreadyImportedOrderLines });
        }
      } catch { /* silent */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [bpId, base, headers, invoiceId]);

  const bpName = shipments[0]?.['businessPartner$_identifier'] || '';

  const filtered = useMemo(() => {
    if (!search.trim()) return shipments;
    const q = search.toLowerCase();
    return shipments.filter(s => (s.documentNo || '').toLowerCase().includes(q));
  }, [shipments, search]);

  const fetchLines = async (shipmentId) => {
    if (shipmentLines[shipmentId] || loadingLines.has(shipmentId)) return;
    setLoadingLines(prev => { const n = new Set(prev); n.add(shipmentId); return n; });
    try {
      const res = await fetch(`${base}/goods-shipment/goodsShipmentLine?parentId=${shipmentId}&_startRow=0&_endRow=200`, { headers });
      if (res.ok) {
        const json = await res.json();
        const lines = json?.response?.data || [];

        const shipment = shipments.find(s => s.id === shipmentId);
        const orderId = shipment?.salesOrder;
        let orderLineMap = {};
        if (orderId) {
          try {
            const olRes = await fetch(`${base}/sales-order/lines?parentId=${orderId}&_startRow=0&_endRow=200`, { headers });
            if (olRes.ok) {
              const olJson = await olRes.json();
              const orderLines = olJson?.response?.data || [];
              orderLines.forEach(ol => { orderLineMap[ol.id] = ol; });
            }
          } catch { /* silent */ }
        }

        const enrichedLines = lines.map(l => {
          const ol = orderLineMap[l.salesOrderLine] || {};
          const imported = (alreadyImported.shipmentLines || alreadyImported).has?.(l.id) || (alreadyImported.orderLines?.has(l.salesOrderLine));
          return { ...l, _unitPrice: Number(ol.unitPrice ?? ol.priceActual ?? 0), _lineNetAmount: Number(ol.lineNetAmount ?? 0), _alreadyImported: !!imported };
        });

        setShipmentLines(prev => ({ ...prev, [shipmentId]: enrichedLines }));
        const qtyDefaults = {};
        const newSelected = new Set();
        enrichedLines.forEach(l => {
          qtyDefaults[l.id] = Number(l.movementQuantity) || 0;
          if (!l._alreadyImported) newSelected.add(l.id);
        });
        setLineQuantities(prev => ({ ...prev, ...qtyDefaults }));
        setSelected(prev => { const n = new Set(prev); newSelected.forEach(id => n.add(id)); return n; });
      }
    } catch { /* silent */ }
    finally { setLoadingLines(prev => { const n = new Set(prev); n.delete(shipmentId); return n; }); }
  };

  const toggleExpand = (shipmentId) => {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(shipmentId)) { n.delete(shipmentId); } else { n.add(shipmentId); fetchLines(shipmentId); }
      return n;
    });
  };

  const toggleLine = (lineId) => {
    setSelected(prev => { const n = new Set(prev); n.has(lineId) ? n.delete(lineId) : n.add(lineId); return n; });
  };

  const toggleShipment = (shipmentId) => {
    const lines = shipmentLines[shipmentId] || [];
    if (lines.length === 0) return;
    const lineIds = lines.map(l => l.id);
    const allSelected = lineIds.every(id => selected.has(id));
    setSelected(prev => {
      const n = new Set(prev);
      if (allSelected) { lineIds.forEach(id => n.delete(id)); } else { lineIds.forEach(id => n.add(id)); }
      return n;
    });
  };

  const getShipmentCheckState = (shipmentId) => {
    const lines = shipmentLines[shipmentId] || [];
    if (lines.length === 0) return { checked: false, indeterminate: false };
    const count = lines.filter(l => selected.has(l.id)).length;
    if (count === 0) return { checked: false, indeterminate: false };
    if (count === lines.length) return { checked: true, indeterminate: false };
    return { checked: false, indeterminate: true };
  };

  const handleImport = async () => {
    if (selected.size === 0 || importing) return;
    setImporting(true);
    try {
      let lineNo = 10;
      let errors = 0;
      for (const shipment of shipments) {
        const lines = (shipmentLines[shipment.id] || []).filter(l => selected.has(l.id));
        if (lines.length === 0) continue;

        // Fetch order line prices for this shipment
        const orderLineMap = {};
        if (shipment.salesOrder) {
          try {
            const olRes = await fetch(`${base}/sales-order/lines?parentId=${shipment.salesOrder}&_startRow=0&_endRow=200`, { headers });
            if (olRes.ok) {
              ((await olRes.json())?.response?.data || []).forEach(ol => { orderLineMap[ol.id] = ol; });
            }
          } catch { /* silent */ }
        }

        for (const line of lines) {
          const ol = orderLineMap[line.salesOrderLine] || {};
          const qty = lineQuantities[line.id] ?? (Number(line.movementQuantity) || 0);
          const lineBody = {
            parentId: invoiceId,
            product: line.product,
            invoicedQuantity: qty,
            unitPrice: Number(ol.unitPrice) || 0,
            tax: ol.tax || null,
            uOM: line.uOM || ol.uOM || null,
            lineNo,
            goodsShipmentLine: line.id,
            salesOrderLine: line.salesOrderLine || null,
          };
          const res = await fetch(`${base}/sales-invoice/lines`, {
            method: 'POST', headers, body: JSON.stringify(lineBody),
          });
          const resJson = await res.json().catch(() => null);
          if (!res.ok) errors++;
          lineNo += 10;
        }
      }
      if (errors > 0) {
        toast.warning(`Imported with ${errors} error(s) — review the invoice`);
        console.warn('[ImportFromShipment] Completed with errors:', errors);
      } else {
        toast.success(`${lineNo / 10 - 1} lines imported`);
      }
      onSuccess();
    } catch (err) { toast.error(err.message || 'Failed to import'); }
    finally { setImporting(false); }
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
  const fmtNum = (v) => v != null ? Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';

  return (
    <div onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 580, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 12, backgroundColor: '#fff', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '0.5px solid #E5E7EB' }}>

        <div style={{ padding: '14px 16px', borderBottom: '2px solid #E5E7EB' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>Import from Shipment</span>
            <button type="button" onClick={onClose} style={{ fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }}>&times;</button>
          </div>
          {bpName && <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>{bpName}</div>}
        </div>

        <div style={{ padding: '10px 16px 0' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search shipment..."
            style={{ width: '100%', fontSize: 13, padding: '7px 10px', border: '0.5px solid #E5E7EB', borderRadius: 6, outline: 'none', color: '#111827' }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
          {loading ? (
            <p style={{ fontSize: 13, color: '#9ca3af', padding: '24px 0', textAlign: 'center' }}>Loading...</p>
          ) : filtered.length === 0 ? (
            <p style={{ fontSize: 13, color: '#9ca3af', padding: '24px 0', textAlign: 'center' }}>
              {shipments.length === 0 ? 'No pending shipments to invoice for this customer.' : 'No shipments match your search.'}
            </p>
          ) : (
            filtered.map(s => {
              const isExpanded = expanded.has(s.id);
              const isLoadingLns = loadingLines.has(s.id);
              const lines = shipmentLines[s.id] || [];
              const checkState = getShipmentCheckState(s.id);
              const hasAnySelected = checkState.checked || checkState.indeterminate;
              const orderRef = (s['salesOrder$_identifier'] || '').split(' - ')[0] || '';
              const shipmentTotal = lines.length > 0
                ? lines.reduce((sum, l) => sum + (l._lineNetAmount || 0), 0)
                : null;
              return (
                <div key={s.id} style={{ borderLeft: (isExpanded || hasAnySelected) ? '3px solid var(--color-border-info, #3b82f6)' : '3px solid transparent' }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '0.5px solid #F3F4F6', cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#F9FAFB'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    onClick={() => toggleExpand(s.id)}
                  >
                    <span style={{ fontSize: 11, color: '#9ca3af', width: 16, textAlign: 'center', transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>▶</span>
                    <input
                      type="checkbox"
                      checked={checkState.checked}
                      ref={el => { if (el) el.indeterminate = checkState.indeterminate; }}
                      onChange={e => { e.stopPropagation(); toggleShipment(s.id); }}
                      onClick={e => e.stopPropagation()}
                      style={{ accentColor: '#3b82f6', cursor: 'pointer', margin: '0 8px', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{s.documentNo || s.id}</span>
                        <span style={{ fontSize: 12, color: '#6B7280' }}>{fmtDate(s.movementDate)}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: '#9ca3af', fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: 8 }}>
                      {shipmentTotal != null ? fmtNum(shipmentTotal) : (orderRef ? `#${orderRef}` : '')}
                    </span>
                  </div>

                  {isExpanded && (
                    <div style={{ background: 'var(--color-background-secondary, #F9FAFB)' }}>
                      {isLoadingLns ? (
                        <div style={{ padding: '8px 12px 8px 48px', fontSize: 12, color: '#9ca3af' }}>Loading lines...</div>
                      ) : lines.length === 0 ? (
                        <div style={{ padding: '8px 12px 8px 48px', fontSize: 12, color: '#9ca3af' }}>No lines found</div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', padding: '4px 12px 4px 48px', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '0.5px solid #E5E7EB' }}>
                            <span style={{ flex: 1 }}>Product</span>
                            <span style={{ width: 70, textAlign: 'right' }}>Qty</span>
                            <span style={{ width: 80, textAlign: 'right' }}>Price</span>
                            <span style={{ width: 80, textAlign: 'right' }}>Amount</span>
                          </div>
                          {lines.map(line => {
                            const imported = line._alreadyImported;
                            const lineSelected = !imported && selected.has(line.id);
                            const productName = line['product$_identifier'] || line.id;
                            const maxQty = Number(line.movementQuantity) || 0;
                            const currentQty = lineQuantities[line.id] ?? maxQty;
                            const qtyEdited = currentQty !== maxQty;
                            const unitPrice = line._unitPrice || null;
                            const lineTotal = unitPrice != null ? unitPrice * currentQty : null;
                            return (
                              <div
                                key={line.id}
                                onClick={() => !imported && toggleLine(line.id)}
                                style={{
                                  display: 'flex', alignItems: 'center', padding: '6px 12px 6px 48px', borderBottom: '0.5px solid #F3F4F6',
                                  cursor: imported ? 'default' : 'pointer',
                                  background: lineSelected ? '#eff6ff' : 'transparent',
                                  opacity: imported ? 0.4 : 1,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={lineSelected}
                                  disabled={imported}
                                  onChange={() => !imported && toggleLine(line.id)}
                                  onClick={e => e.stopPropagation()}
                                  style={{ accentColor: '#3b82f6', cursor: imported ? 'not-allowed' : 'pointer', marginRight: 8, flexShrink: 0 }}
                                />
                                <span style={{ fontSize: 13, color: imported ? '#9ca3af' : lineSelected ? '#2563eb' : '#111827', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: lineSelected ? 500 : 400 }}>
                                  {productName}{imported && <span style={{ fontSize: 11, marginLeft: 6, color: '#9ca3af' }}>already imported</span>}
                                </span>
                                <span style={{ width: 70, flexShrink: 0, textAlign: 'right' }}>
                                  <input
                                    type="number"
                                    min={1}
                                    max={maxQty}
                                    value={currentQty}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => {
                                      const v = Math.max(1, Math.min(maxQty, Number(e.target.value) || 1));
                                      setLineQuantities(prev => ({ ...prev, [line.id]: v }));
                                    }}
                                    style={{
                                      width: 60, fontSize: 12, padding: '3px 4px', borderRadius: 4, textAlign: 'center', fontVariantNumeric: 'tabular-nums', outline: 'none',
                                      border: qtyEdited ? '1px solid var(--color-border-warning, #f59e0b)' : '0.5px solid var(--color-border-secondary, #d1d5db)',
                                      background: qtyEdited ? 'var(--color-background-warning, #fffbeb)' : '#fff',
                                    }}
                                  />
                                </span>
                                <span style={{ width: 80, fontSize: 12, color: '#6B7280', fontVariantNumeric: 'tabular-nums', textAlign: 'right', flexShrink: 0 }}>
                                  {unitPrice != null ? fmtNum(unitPrice) : '-'}
                                </span>
                                <span style={{ width: 80, fontSize: 12, color: '#6B7280', fontVariantNumeric: 'tabular-nums', textAlign: 'right', flexShrink: 0 }}>
                                  {lineTotal != null ? fmtNum(lineTotal) : '-'}
                                </span>
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8F9FA', borderTop: '1px solid #E5E7EB', padding: '10px 16px' }}>
          <span style={{ fontSize: 12, color: selected.size > 0 ? 'var(--color-text-info, #2563eb)' : '#6B7280', fontWeight: selected.size > 0 ? 500 : 400 }}>
            {selected.size > 0 ? `${selected.size} line${selected.size > 1 ? 's' : ''} selected` : 'Select lines to import'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={{ fontSize: 13, padding: '5px 14px', borderRadius: 6, border: '1px solid #E5E7EB', background: 'transparent', color: '#6B7280', cursor: 'pointer' }}>Cancel</button>
            <button
              type="button" onClick={handleImport} disabled={selected.size === 0 || importing}
              style={{ fontSize: 13, fontWeight: 500, padding: '5px 14px', borderRadius: 6, border: 'none', background: '#18181b', color: '#fff', cursor: (selected.size === 0 || importing) ? 'not-allowed' : 'pointer', opacity: (selected.size === 0 || importing) ? 0.4 : 1 }}
            >
              {importing ? 'Importing...' : `Import selected${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
