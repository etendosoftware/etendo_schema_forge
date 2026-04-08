import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

export default function ImportFromPurchaseOrderModal({ receiptId, bpId, base, headers, onClose, onSuccess }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [expanded, setExpanded] = useState(new Set());
  const [orderLines, setOrderLines] = useState({});
  const [loadingLines, setLoadingLines] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [lineQuantities, setLineQuantities] = useState({});
  const [importedByOrderLine, setImportedByOrderLine] = useState({});
  const [nextLineNo, setNextLineNo] = useState(10);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [ordersRes, receiptLinesRes] = await Promise.all([
          fetch(`${base}/purchase-order/header?_startRow=0&_endRow=500`, { headers }),
          fetch(`${base}/goods-receipt/goodsReceiptLine?parentId=${receiptId}&_startRow=0&_endRow=300`, { headers }),
        ]);

        const importedQtyMap = {};
        let maxLineNo = 0;
        if (receiptLinesRes.ok && !cancelled) {
          const existingLines = (await receiptLinesRes.json())?.response?.data || [];
          existingLines.forEach((line) => {
            const lineNo = Number(line.lineNo || line.line || 0) || 0;
            if (lineNo > maxLineNo) maxLineNo = lineNo;
            if (line.salesOrderLine) {
              importedQtyMap[line.salesOrderLine] = (importedQtyMap[line.salesOrderLine] || 0) + (Number(line.movementQuantity) || 0);
            }
          });
        }

        if (ordersRes.ok && !cancelled) {
          const allOrders = (await ordersRes.json())?.response?.data || [];
          setOrders(allOrders.filter((order) => order.documentStatus === 'CO' && order.businessPartner === bpId));
          setImportedByOrderLine(importedQtyMap);
          setNextLineNo(Math.max(10, maxLineNo + 10));
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [base, bpId, headers, receiptId]);

  const bpName = orders[0]?.['businessPartner$_identifier'] || '';

  const filtered = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.toLowerCase();
    return orders.filter((order) => (order.documentNo || '').toLowerCase().includes(q));
  }, [orders, search]);

  const fetchLines = async (orderId) => {
    if (orderLines[orderId] || loadingLines.has(orderId)) return;

    setLoadingLines((prev) => {
      const next = new Set(prev);
      next.add(orderId);
      return next;
    });

    try {
      const res = await fetch(`${base}/purchase-order/lines?parentId=${orderId}&_startRow=0&_endRow=300`, { headers });
      if (res.ok) {
        const lines = (await res.json())?.response?.data || [];
        const enriched = lines.map((line) => {
          const orderedQty = Number(line.orderedQuantity) || 0;
          const deliveredQty = Number(line.deliveredQuantity) || 0;
          const undeliveredQty = Math.max(orderedQty - deliveredQty, 0);
          const alreadyInReceipt = Number(importedByOrderLine[line.id]) || 0;
          const availableQty = Math.max(undeliveredQty - alreadyInReceipt, 0);
          return {
            ...line,
            _undeliveredQty: undeliveredQty,
            _alreadyInReceipt: alreadyInReceipt,
            _availableQty: availableQty,
            _selectable: availableQty > 0,
          };
        });

        setOrderLines((prev) => ({ ...prev, [orderId]: enriched }));

        const qtyDefaults = {};
        const selectableIds = [];
        enriched.forEach((line) => {
          qtyDefaults[line.id] = line._availableQty;
          if (line._selectable) selectableIds.push(line.id);
        });

        setLineQuantities((prev) => ({ ...prev, ...qtyDefaults }));
        setSelected((prev) => {
          const next = new Set(prev);
          selectableIds.forEach((id) => next.add(id));
          return next;
        });
      }
    } catch {
      // silent
    } finally {
      setLoadingLines((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const toggleExpand = (orderId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
        fetchLines(orderId);
      }
      return next;
    });
  };

  const toggleLine = (lineId, selectable) => {
    if (!selectable) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  const toggleOrder = (orderId) => {
    const lines = (orderLines[orderId] || []).filter((line) => line._selectable);
    if (lines.length === 0) return;

    const lineIds = lines.map((line) => line.id);
    const allSelected = lineIds.every((id) => selected.has(id));

    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) lineIds.forEach((id) => next.delete(id));
      else lineIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const getOrderCheckState = (orderId) => {
    const lines = (orderLines[orderId] || []).filter((line) => line._selectable);
    if (lines.length === 0) return { checked: false, indeterminate: false };

    const count = lines.filter((line) => selected.has(line.id)).length;
    if (count === 0) return { checked: false, indeterminate: false };
    if (count === lines.length) return { checked: true, indeterminate: false };
    return { checked: false, indeterminate: true };
  };

  const handleImport = async () => {
    if (selected.size === 0 || importing) return;
    setImporting(true);

    try {
      let lineNo = nextLineNo;
      let importedCount = 0;
      let errors = 0;

      for (const order of orders) {
        const lines = (orderLines[order.id] || []).filter((line) => selected.has(line.id));
        if (lines.length === 0) continue;

        for (const line of lines) {
          const qty = Number(lineQuantities[line.id] ?? line._availableQty);
          const safeQty = Math.max(0, Math.min(line._availableQty, qty));
          if (safeQty <= 0) continue;

          const body = {
            parentId: receiptId,
            product: line.product,
            movementQuantity: safeQty,
            uOM: line.uOM || null,
            salesOrderLine: line.id,
            description: line.description || null,
            lineNo,
          };

          const res = await fetch(`${base}/goods-receipt/goodsReceiptLine`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          });

          if (!res.ok) errors += 1;
          else importedCount += 1;

          lineNo += 10;
        }
      }

      if (importedCount > 0) {
        if (errors > 0) toast.warning(`Imported ${importedCount} line(s) with ${errors} error(s)`);
        else toast.success(`${importedCount} line(s) imported from purchase order`);
        onSuccess();
        return;
      }

      if (errors > 0) toast.error('Could not import selected lines');
      else toast.info('No lines were imported');
    } catch (err) {
      toast.error(err.message || 'Failed to import lines');
    } finally {
      setImporting(false);
    }
  };

  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');
  const fmtNum = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 620, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 12, backgroundColor: '#fff', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '0.5px solid #E5E7EB' }}>
        <div style={{ padding: '14px 16px', borderBottom: '2px solid #E5E7EB' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>Import from Purchase Order</span>
            <button type="button" onClick={onClose} style={{ fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }}>&times;</button>
          </div>
          {bpName && <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>{bpName}</div>}
        </div>

        <div style={{ padding: '10px 16px 0' }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search purchase order..."
            style={{ width: '100%', fontSize: 13, padding: '7px 10px', border: '0.5px solid #E5E7EB', borderRadius: 6, outline: 'none', color: '#111827' }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
          {loading ? (
            <p style={{ fontSize: 13, color: '#9ca3af', padding: '24px 0', textAlign: 'center' }}>Loading...</p>
          ) : filtered.length === 0 ? (
            <p style={{ fontSize: 13, color: '#9ca3af', padding: '24px 0', textAlign: 'center' }}>
              {orders.length === 0 ? 'No completed purchase orders with pending quantities for this vendor.' : 'No orders match your search.'}
            </p>
          ) : (
            filtered.map((order) => {
              const isExpanded = expanded.has(order.id);
              const isLoadingLines = loadingLines.has(order.id);
              const lines = orderLines[order.id] || [];
              const checkState = getOrderCheckState(order.id);
              const hasAnySelected = checkState.checked || checkState.indeterminate;
              const orderTotal = Number(order.grandTotalAmount) || null;

              return (
                <div key={order.id} style={{ borderLeft: (isExpanded || hasAnySelected) ? '3px solid var(--color-border-info, #3b82f6)' : '3px solid transparent' }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '0.5px solid #F3F4F6', cursor: 'pointer' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#F9FAFB';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                    onClick={() => toggleExpand(order.id)}
                  >
                    <span style={{ fontSize: 11, color: '#9ca3af', width: 16, textAlign: 'center', transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>▶</span>
                    <input
                      type="checkbox"
                      checked={checkState.checked}
                      ref={(el) => {
                        if (el) el.indeterminate = checkState.indeterminate;
                      }}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleOrder(order.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ accentColor: '#3b82f6', cursor: 'pointer', margin: '0 8px', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{order.documentNo || order.id}</span>
                        <span style={{ fontSize: 12, color: '#6B7280' }}>{fmtDate(order.orderDate)}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: '#9ca3af', fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: 8 }}>
                      {orderTotal != null ? fmtNum(orderTotal) : ''}
                    </span>
                  </div>

                  {isExpanded && (
                    <div style={{ background: 'var(--color-background-secondary, #F9FAFB)' }}>
                      {isLoadingLines ? (
                        <div style={{ padding: '8px 12px 8px 48px', fontSize: 12, color: '#9ca3af' }}>Loading lines...</div>
                      ) : lines.length === 0 ? (
                        <div style={{ padding: '8px 12px 8px 48px', fontSize: 12, color: '#9ca3af' }}>No lines found</div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', padding: '4px 12px 4px 48px', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '0.5px solid #E5E7EB' }}>
                            <span style={{ flex: 1 }}>Product</span>
                            <span style={{ width: 90, textAlign: 'right' }}>Pending</span>
                            <span style={{ width: 90, textAlign: 'right' }}>Import Qty</span>
                          </div>
                          {lines.map((line) => {
                            const selectable = line._selectable;
                            const lineSelected = selectable && selected.has(line.id);
                            const productName = line['product$_identifier'] || line.id;
                            const maxQty = Number(line._availableQty) || 0;
                            const currentQty = lineQuantities[line.id] ?? maxQty;

                            return (
                              <div
                                key={line.id}
                                onClick={() => toggleLine(line.id, selectable)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  padding: '6px 12px 6px 48px',
                                  borderBottom: '0.5px solid #F3F4F6',
                                  cursor: selectable ? 'pointer' : 'default',
                                  background: lineSelected ? '#eff6ff' : 'transparent',
                                  opacity: selectable ? 1 : 0.45,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={lineSelected}
                                  disabled={!selectable}
                                  onChange={() => toggleLine(line.id, selectable)}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ accentColor: '#3b82f6', cursor: selectable ? 'pointer' : 'not-allowed', marginRight: 8, flexShrink: 0 }}
                                />
                                <span style={{ fontSize: 13, color: selectable ? (lineSelected ? '#2563eb' : '#111827') : '#9ca3af', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: lineSelected ? 500 : 400 }}>
                                  {productName}
                                  {!selectable && <span style={{ fontSize: 11, marginLeft: 6, color: '#9ca3af' }}>already fully received</span>}
                                </span>
                                <span style={{ width: 90, fontSize: 12, color: '#6B7280', fontVariantNumeric: 'tabular-nums', textAlign: 'right', flexShrink: 0 }}>
                                  {fmtNum(line._availableQty)}
                                </span>
                                <span style={{ width: 90, flexShrink: 0, textAlign: 'right' }}>
                                  <input
                                    type="number"
                                    min={1}
                                    max={maxQty}
                                    disabled={!selectable}
                                    value={currentQty}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                      const value = Math.max(1, Math.min(maxQty, Number(e.target.value) || 1));
                                      setLineQuantities((prev) => ({ ...prev, [line.id]: value }));
                                    }}
                                    style={{
                                      width: 72,
                                      fontSize: 12,
                                      padding: '3px 4px',
                                      borderRadius: 4,
                                      textAlign: 'center',
                                      fontVariantNumeric: 'tabular-nums',
                                      outline: 'none',
                                      border: '0.5px solid var(--color-border-secondary, #d1d5db)',
                                      background: selectable ? '#fff' : '#f3f4f6',
                                    }}
                                  />
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
              type="button"
              onClick={handleImport}
              disabled={selected.size === 0 || importing}
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
