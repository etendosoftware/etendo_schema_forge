import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { FilePlus } from 'lucide-react';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { useApiFetch } from '@/auth/useApiFetch.js';

export default function BulkInvoiceFromShipment({ selectedRows, clearSelection, token, apiBaseUrl }) {
  // ETP-4576 - the credential belongs to apiFetch, not to the component.
  // Empty base ON PURPOSE: every URL below is already absolute, and several address a
  // DIFFERENT spec than this window's. resolveApiUrl only skips the prefix when the path
  // starts with that same base, so a configured base turns a cross-spec call into
  // /sws/neo/<this>/sws/neo/<other>/... and a 404.
  const apiFetch = useApiFetch('');
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

  // ETP-4028: shipments now carry their own currency — a single invoice cannot mix
  // lines from documents in different currencies, so block the batch the same way
  // an inconsistent business partner already blocks it.
  const currencyCheck = useMemo(() => {
    if (invoiceableRows.length === 0) return { same: false };
    const firstCurrency = invoiceableRows[0].etgoCurrency;
    const allSame = invoiceableRows.every(r => r.etgoCurrency === firstCurrency);
    return { same: allSame };
  }, [invoiceableRows]);

  const invoiceableCount = invoiceableRows.length;
  const allInvoiced = invoiceableCount === 0;
  const canCreate = invoiceableCount > 0 && bpCheck.same && currencyCheck.same;

  if (selectedRows.length < 1) return null;

  const tooltip = allInvoiced
    ? ui('allShipmentsAlreadyInvoiced')
    : !bpCheck.same
      ? ui('selectShipmentsSameCustomer')
      : !currencyCheck.same
        ? ui('selectShipmentsSameCurrency')
        : undefined;

  return (
    <>
      {/* ETP-4972 — the surrounding `borderLeft` wrapper was this component's
          own hand-rolled divider, predating SelectionToolbar's automatic
          per-segment divider; kept, it doubled up into two lines. The button
          itself was styled for the old light selection bar (`hsl(var(--card))`
          background) — on the new dark pill that rendered as a solid white
          box. Restyled to the ghost pattern shared with Print/Clone/kebab
          (transparent, hover highlight), but KEEPS its text label — Ale
          (design) confirmed icon-only is fine for universally-recognized
          actions (print, clone, delete) but this one needs the label since a
          generic document icon alone doesn't say "create an invoice from the
          selected shipments". No "(count)" suffix — the pill's own counter
          segment already shows the selection count. Figma "Crear factura"
          button (Button 6, verified in Dev Mode): icon file-plus → lucide
          FilePlus, padding 7px/12px, gap 4px, Hug(149px)×38px. */}
      <button
        type="button"
        disabled={!canCreate}
        onClick={() => setShowModal(true)}
        title={tooltip}
        className="inline-flex items-center gap-1 rounded-md px-3 py-[7px] text-sm font-medium transition-colors hover:bg-[hsl(var(--floating-toolbar-fg)/0.1)]"
        style={{
          color: canCreate ? 'hsl(var(--floating-toolbar-fg))' : 'hsl(var(--floating-toolbar-muted))',
          cursor: canCreate ? 'pointer' : 'not-allowed',
          opacity: canCreate ? 1 : 0.5,
        }}
      >
        <FilePlus className="h-3.5 w-3.5" data-testid="FilePlus__bulkInvoice" />
        {ui('createInvoiceBtn')}
      </button>

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
  // ETP-4576 - the credential belongs to apiFetch, not to the component.
  const apiFetch = useApiFetch('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Fetch shipment lines and draft-aware pending qty in parallel
        const [lineResults, pendingResults] = await Promise.all([
          Promise.all(
            shipments.map(async (s) => {
              const res = await apiFetch(`${base}/goods-shipment/goodsShipmentLine?parentId=${s.id}&_startRow=0&_endRow=200`);
              if (!res.ok) return { id: s.id, lines: [] };
              return { id: s.id, lines: (await res.json())?.response?.data || [] };
            }),
          ),
          Promise.all(
            shipments.map(async (s) => {
              try {
                const res = await apiFetch(`${base}/goods-shipment/goodsShipment/${s.id}/action/pendingInvoiceLines`);
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
            const res = await apiFetch(`${base}/sales-order/lines?parentId=${orderId}&_startRow=0&_endRow=200`);
            if (res.ok) {
              ((await res.json())?.response?.data || []).forEach(ol => { priceMap[ol.id] = ol; });
            }
          } catch { /* silent */ }
        }));
        if (!cancelled) setOrderLinePrices(priceMap);

        try {
          const draftRes = await apiFetch(
            `${base}/goods-shipment/goodsShipment/${shipments[0].id}/action/checkDraftInvoice`,
            { method: 'POST', body: JSON.stringify({ shipmentIds: shipments.map(s => s.id) }) },
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
  }, [shipments, base, apiFetch]);

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
  // No currency field is available on these rows (bulk cross-shipment selection) —
  // format the number in Spanish grouping without a symbol, same as formatCurrency's
  // own fallback for an unrecognized/missing currency code.
  const fmtNum = (v) => formatCurrency(undefined, Number(v || 0));

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
      const res = await apiFetch(
        `${base}/goods-shipment/goodsShipment/${shipments[0].id}/action/createDraftInvoice`,
        { method: 'POST', body: JSON.stringify({ shipmentIds: shipments.map(s => s.id), lines: linesPayload }) },
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
          <div style={{ background: 'var(--status-success-bg)', color: 'hsl(var(--card))', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 8px 30px hsl(var(--foreground) / 0.18)', minWidth: 380 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'hsl(var(--foreground) / 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--card))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{`${ui('invoiceRef')}${docNo} ${ui('createdAsDraft')}`}</div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{ui('reviewBeforeConfirming')}</div>
            </div>
            <button
              onClick={() => { toast.dismiss(t); window.location.href = invoiceUrl; }}
              style={{ border: '1px solid hsl(var(--foreground) / 0.4)', borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 500, color: 'hsl(var(--foreground))', background: 'hsl(var(--foreground) / 0.15)', cursor: 'pointer', whiteSpace: 'nowrap' }}
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
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30">
      <div onClick={e => e.stopPropagation()} style={{ width: 600, minWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 12, backgroundColor: 'hsl(var(--card))', boxShadow: '0 8px 30px hsl(var(--foreground) / 0.12)', border: '0.5px solid hsl(var(--card))' }}>

        {/* Header — fixed */}
        <div style={{ padding: '14px 16px', background: 'hsl(var(--card))', borderBottom: '1px solid hsl(var(--card))', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{ui('createInvoiceBtn')}</div>
              <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginTop: 3 }}>
                {shipments.length} {ui('shipment')}{shipments.length !== 1 ? 's' : ''} · {bpName}
              </div>
            </div>
            <button type="button" onClick={onClose} style={{ fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}>&times;</button>
          </div>
        </div>

        {existingDraft && !dismissedWarning && (
          <div style={{ padding: '12px 20px', background: 'var(--status-warning-bg)', borderBottom: '0.5px solid var(--status-warning-bg)', display: 'flex', gap: 10, flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--status-warning-bg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--status-warning-fg)' }}>{ui('draftInvoiceExistsForShipments')}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <button type="button" onClick={() => navToInvoice(existingDraft.id)} style={{ fontSize: 12, color: 'var(--status-info-fg)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>{ui('viewExistingInvoice')}</button>
                <span style={{ color: 'var(--status-warning-bg)', fontSize: 12 }}>·</span>
                <button type="button" onClick={() => setDismissedWarning(true)} style={{ fontSize: 12, color: 'var(--status-warning-fg)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>{ui('createAnotherAnyway')}</button>
              </div>
            </div>
          </div>
        )}

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', maxHeight: 380, padding: 0 }}>
          {loadingLines ? (
            <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', padding: '24px 0', textAlign: 'center' }}>{ui('loadingShipmentLines')}</p>
          ) : shipmentSummaries.every(s => s.enrichedLines.length === 0) ? (
            <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', padding: '24px 0', textAlign: 'center' }}>{ui('noLinesInSelectedShipments')}</p>
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
                      padding: '9px 16px', background: 'hsl(var(--card))', borderBottom: '0.5px solid hsl(var(--card))',
                      borderLeft: isExpanded ? '3px solid var(--status-info-bg)' : '3px solid transparent',
                      cursor: 'pointer', userSelect: 'none',
                    }}
                  >
                    <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', width: 14, textAlign: 'center', transition: 'transform 0.2s ease', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>▶</span>
                    <input
                      type="checkbox"
                      checked={allLinesSel}
                      ref={el => { if (el) el.indeterminate = someLinesSel; }}
                      onChange={(e) => { e.stopPropagation(); toggleShipmentLines(shipment.id); }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ accentColor: 'var(--status-info-border)', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--status-info-fg)' }}>{ui('shipmentRef')}{shipment.documentNo}</span>
                    <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>· {fmtDate(shipment.movementDate)} · {shipment.enrichedLines.length} {ui('line')}{shipment.enrichedLines.length !== 1 ? 's' : ''}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--status-info-fg)', fontVariantNumeric: 'tabular-nums', fontWeight: 500, flexShrink: 0 }}>
                      {fmtNum(shipment.total)}
                    </span>
                  </div>

                  {/* Lines */}
                  {isExpanded && (
                    <>
                      <div style={{ display: 'flex', padding: '4px 16px 4px 54px', fontSize: 11, fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '0.5px solid hsl(var(--foreground))' }}>
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
                              display: 'flex', alignItems: 'center', padding: '5px 16px 5px 38px', borderBottom: '0.5px solid hsl(var(--card))', cursor: 'pointer',
                              background: line.isSelected ? 'hsl(var(--card))' : 'transparent',
                              opacity: line.isSelected ? 1 : 0.5,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={line.isSelected}
                              onChange={() => toggleLine(line.id)}
                              onClick={e => e.stopPropagation()}
                              style={{ accentColor: 'var(--status-info-border)', cursor: 'pointer', marginRight: 8, flexShrink: 0 }}
                            />
                            <span style={{ flex: 1, fontSize: 13, color: line.isSelected ? 'var(--status-info-border)' : 'hsl(var(--foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: line.isSelected ? 500 : 400 }}>
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
                                  border: qtyEdited ? '1px solid var(--status-warning-border)' : '0.5px solid hsl(var(--card))',
                                  background: qtyEdited ? 'hsl(var(--card))' : 'hsl(var(--card))',
                                }}
                              />
                            </span>
                            <span style={{ width: 70, fontSize: 12, color: 'hsl(var(--muted-foreground))', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                              {fmtNum(line.unitPrice)}
                            </span>
                            <span style={{ width: 80, fontSize: 13, color: 'hsl(var(--foreground))', fontVariantNumeric: 'tabular-nums', textAlign: 'right', fontWeight: 500 }}>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'hsl(var(--card))', borderTop: '1px solid hsl(var(--card))', padding: '10px 16px', flexShrink: 0 }}>
          <span style={{ fontSize: 13, color: 'hsl(var(--muted))', fontVariantNumeric: 'tabular-nums' }}>
            {totalSelectedLines > 0 ? (
              <>
                {totalSelectedLines} {ui('line')}{totalSelectedLines !== 1 ? 's' : ''} {ui('from')} {shipments.length} {ui('shipment')}{shipments.length !== 1 ? 's' : ''}
                {' · '}<span style={{ fontWeight: 500, color: 'var(--status-info-border)' }}>{ui('total')}: {fmtNum(grandTotal)}</span>
              </>
            ) : ui('selectLinesToInvoice')}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, border: '1px solid hsl(var(--card))', background: 'transparent', color: 'hsl(var(--muted))', cursor: 'pointer' }}>{ui('cancel')}</button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={totalSelectedLines === 0 || creating}
              style={{ fontSize: 13, fontWeight: 500, padding: '6px 14px', borderRadius: 6, border: 'none', background: 'hsl(var(--foreground))', color: 'hsl(var(--card))', cursor: (totalSelectedLines === 0 || creating) ? 'not-allowed' : 'pointer', opacity: (totalSelectedLines === 0 || creating) ? 0.4 : 1 }}
            >{creating ? ui('creating') : ui('createInvoiceBtn')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
