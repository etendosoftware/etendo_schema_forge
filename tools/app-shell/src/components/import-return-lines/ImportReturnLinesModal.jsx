import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import ImportModalFooter, { ImportModalHeader } from './ImportModalFooter.jsx';

/**
 * Generic modal for importing lines into a return document from source documents.
 * Used by return-material-receipt (from goods-shipment) and return-to-vendor (from goods-receipt).
 *
 * config shape:
 *   sourceDocsUrl(base, bpId)       → string  GET source documents URL
 *   sourceLinesUrl(base, docId)     → string  GET source document lines URL
 *   importActionUrl(base, targetId) → string  POST action URL
 *   titleKey                        → string  i18n key for modal title
 *   searchPlaceholderKey            → string  i18n key for search input
 *   noDocsKey                       → string  i18n key when no source docs exist
 *   noDocsMatchSearchKey            → string  i18n key when search yields nothing
 *   successToastKey                 → string  i18n key for success toast ({count})
 *   dateField                       → string  field name for date display
 *   showAmount                      → boolean show amount column in doc list
 *   qtyStep                         → number  spinner step for qty input (default 1)
 */
export default function ImportReturnLinesModal({ targetId, bpId, base, headers, onClose, onSuccess, config }) {
  const ui = useUI();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(new Set());
  const [docLines, setDocLines] = useState({});
  const [loadingLines, setLoadingLines] = useState(new Set());
  const [selected, setSelected] = useState(new Set());
  const [lineQuantities, setLineQuantities] = useState({});
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');

  const {
    sourceDocsUrl,
    sourceLinesUrl,
    fetchSourceDocs,
    fetchSourceLines,
    importActionUrl,
    filterDoc,
    titleKey,
    searchPlaceholderKey,
    noDocsKey,
    noDocsMatchSearchKey,
    successToastKey,
    dateField = 'movementDate',
    showAmount = false,
    qtyStep = 1,
  } = config;

  useEffect(() => {
    if (!bpId) return;
    let cancelled = false;
    (async () => {
      try {
        let docs;
        if (fetchSourceDocs) {
          docs = await fetchSourceDocs(base, bpId, headers);
        } else {
          const res = await fetch(sourceDocsUrl(base, bpId), { headers });
          if (!res.ok) {
            if (!cancelled) setLoading(false);
            return;
          }
          const raw = (await res.json())?.response?.data || [];
          docs = filterDoc ? raw.filter((d) => filterDoc(d, bpId)) : raw;
        }
        if (!cancelled) setDocs(docs);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [base, bpId, fetchSourceDocs, filterDoc, headers, sourceDocsUrl]);

  const bpName = docs[0]?.['businessPartner$_identifier'] || '';

  const filtered = useMemo(() => {
    if (!search.trim()) return docs;
    const q = search.toLowerCase();
    return docs.filter((doc) => (doc.documentNo || '').toLowerCase().includes(q));
  }, [docs, search]);

  const fetchLines = async (docId) => {
    if (docLines[docId] || loadingLines.has(docId)) return;
    setLoadingLines((prev) => { const n = new Set(prev); n.add(docId); return n; });
    try {
      let lines;
      if (fetchSourceLines) {
        lines = await fetchSourceLines(base, docId, headers);
      } else {
        const res = await fetch(sourceLinesUrl(base, docId), { headers });
        if (!res.ok) { setLoadingLines((prev) => { const n = new Set(prev); n.delete(docId); return n; }); return; }
        lines = (await res.json())?.response?.data || [];
      }
      {
        const enriched = lines
          .map((line) => ({ ...line, _maxQty: Math.max(0, Number(line.movementQuantity) || 0) }))
          .filter((line) => line._maxQty > 0);
        setDocLines((prev) => ({ ...prev, [docId]: enriched }));
        const qtyDefaults = {};
        enriched.forEach((line) => { qtyDefaults[line.id] = line._maxQty; });
        setLineQuantities((prev) => ({ ...prev, ...qtyDefaults }));
        setSelected((prev) => {
          const n = new Set(prev);
          enriched.forEach((line) => n.add(line.id));
          return n;
        });
      }
    } catch {
      // silent
    } finally {
      setLoadingLines((prev) => { const n = new Set(prev); n.delete(docId); return n; });
    }
  };

  const toggleExpand = (docId) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(docId)) { n.delete(docId); } else { n.add(docId); fetchLines(docId); }
      return n;
    });
  };

  const toggleLine = (lineId) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(lineId)) n.delete(lineId); else n.add(lineId);
      return n;
    });
  };

  const toggleDoc = (docId) => {
    const lines = docLines[docId] || [];
    if (lines.length === 0) return;
    const ids = lines.map((l) => l.id);
    const allSel = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const n = new Set(prev);
      if (allSel) ids.forEach((id) => n.delete(id)); else ids.forEach((id) => n.add(id));
      return n;
    });
  };

  const getDocCheckState = (docId) => {
    const lines = docLines[docId] || [];
    if (lines.length === 0) return { checked: false, indeterminate: false };
    const count = lines.filter((l) => selected.has(l.id)).length;
    if (count === 0) return { checked: false, indeterminate: false };
    if (count === lines.length) return { checked: true, indeterminate: false };
    return { checked: false, indeterminate: true };
  };

  const handleImport = async () => {
    if (selected.size === 0 || importing) return;
    setImporting(true);
    try {
      const lines = [];
      for (const doc of docs) {
        for (const line of (docLines[doc.id] || [])) {
          if (!selected.has(line.id)) continue;
          const qty = Math.max(qtyStep, Math.min(line._maxQty, Number(lineQuantities[line.id] ?? line._maxQty)));
          lines.push({ sourceLineId: line.id, returnQuantity: qty });
        }
      }
      if (lines.length === 0) { toast.info(ui('noLinesWereImported')); return; }

      const res = await fetch(importActionUrl(base, targetId), {
        method: 'POST',
        headers,
        body: JSON.stringify({ lines }),
      });

      if (!res.ok) {
        toast.error(ui('couldNotImportSelectedLines'));
        return;
      }

      const body = await res.json();
      const count = body?.response?.data?.importedCount ?? lines.length;
      const toastMsg = (ui(successToastKey) || ui('linesImportedFromShipment')).replace('{count}', String(count));
      toast.success(toastMsg);
      onSuccess();
    } catch (err) {
      toast.error(err.message || ui('failedToImportLines'));
    } finally {
      setImporting(false);
    }
  };

  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');
  const fmtQty = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const selectedCountSuffix = selected.size > 0 ? ` (${selected.size})` : '';
  const importButtonLabel = importing
    ? ui('importing')
    : ui('importSelected').replace('{count}', selectedCountSuffix);

  return createPortal(
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div onClick={(e) => e.stopPropagation()} style={{ width: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 12, backgroundColor: '#fff', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '0.5px solid #E5E7EB' }}>
        <ImportModalHeader
          title={ui(titleKey)}
          bpName={bpName}
          onClose={onClose}
          data-testid="ImportModalHeader__2d7a44" />

        <div style={{ padding: '10px 16px 0' }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={ui(searchPlaceholderKey)}
            style={{ width: '100%', fontSize: 13, padding: '7px 10px', border: '0.5px solid #E5E7EB', borderRadius: 6, outline: 'none', color: '#111827' }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <p style={{ fontSize: 13, color: '#9ca3af', padding: '24px 0', textAlign: 'center' }}>{ui('loading')}</p>
          )}
          {!loading && filtered.length === 0 && (
            <p style={{ fontSize: 13, color: '#9ca3af', padding: '24px 0', textAlign: 'center' }}>
              {docs.length === 0 ? ui(noDocsKey) : ui(noDocsMatchSearchKey)}
            </p>
          )}
          {!loading && filtered.length > 0 && filtered.map((doc) => {
              const isExpanded = expanded.has(doc.id);
              const isLoadingLines = loadingLines.has(doc.id);
              const lines = docLines[doc.id] || [];
              const checkState = getDocCheckState(doc.id);
              const hasAnySelected = checkState.checked || checkState.indeterminate;

              return (
                <div key={doc.id} style={{ borderLeft: (isExpanded || hasAnySelected) ? '3px solid var(--color-border-info, #3b82f6)' : '3px solid transparent' }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '0.5px solid #F3F4F6', cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#F9FAFB'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    onClick={() => toggleExpand(doc.id)}
                  >
                    <span style={{ fontSize: 11, color: '#9ca3af', width: 16, textAlign: 'center', transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>▶</span>
                    <input
                      type="checkbox"
                      checked={checkState.checked}
                      ref={(el) => { if (el) el.indeterminate = checkState.indeterminate; }}
                      onChange={(e) => { e.stopPropagation(); toggleDoc(doc.id); }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ accentColor: '#3b82f6', cursor: 'pointer', margin: '0 8px', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{doc.documentNo || doc.id}</span>
                        <span style={{ fontSize: 12, color: '#6B7280' }}>{fmtDate(doc[dateField])}</span>
                      </div>
                    </div>
                    {showAmount && doc.grandTotalAmount != null && (
                      <span style={{ fontSize: 12, color: '#9ca3af', fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: 8 }}>
                        {fmtQty(doc.grandTotalAmount)}
                      </span>
                    )}
                  </div>

                  {isExpanded && (
                    <div style={{ background: 'var(--color-background-secondary, #F9FAFB)' }}>
                      {isLoadingLines && (
                        <div style={{ padding: '8px 12px 8px 48px', fontSize: 12, color: '#9ca3af' }}>{ui('loadingLines')}</div>
                      )}
                      {!isLoadingLines && lines.length === 0 && (
                        <div style={{ padding: '8px 12px 8px 48px', fontSize: 12, color: '#9ca3af' }}>{ui('noLinesFound')}</div>
                      )}
                      {!isLoadingLines && lines.length > 0 && (
                        <>
                          <div style={{ display: 'flex', padding: '4px 12px 4px 48px', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '0.5px solid #E5E7EB' }}>
                            <span style={{ flex: 1 }}>{ui('product')}</span>
                            <span style={{ width: 90, textAlign: 'right' }}>{ui('qty')}</span>
                            <span style={{ width: 90, textAlign: 'right' }}>{ui('returnQty')}</span>
                          </div>
                          {lines.map((line) => {
                            const lineSelected = selected.has(line.id);
                            const productName = line['product$_identifier'] || line.id;
                            const maxQty = line._maxQty;
                            const currentQty = lineQuantities[line.id] ?? maxQty;
                            return (
                              <div
                                key={line.id}
                                onClick={() => toggleLine(line.id)}
                                style={{ display: 'flex', alignItems: 'center', padding: '6px 12px 6px 48px', borderBottom: '0.5px solid #F3F4F6', cursor: 'pointer', background: lineSelected ? '#eff6ff' : 'transparent' }}
                              >
                                <input
                                  type="checkbox"
                                  checked={lineSelected}
                                  onChange={() => toggleLine(line.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ accentColor: '#3b82f6', cursor: 'pointer', marginRight: 8, flexShrink: 0 }}
                                />
                                <span style={{ fontSize: 13, color: lineSelected ? '#2563eb' : '#111827', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: lineSelected ? 500 : 400 }}>
                                  {productName}
                                </span>
                                <span style={{ width: 90, fontSize: 12, color: '#6B7280', fontVariantNumeric: 'tabular-nums', textAlign: 'right', flexShrink: 0 }}>
                                  {fmtQty(maxQty)}
                                </span>
                                <span style={{ width: 90, flexShrink: 0, textAlign: 'right' }}>
                                  <input
                                    type="number"
                                    min={qtyStep}
                                    max={maxQty}
                                    step={qtyStep}
                                    value={currentQty}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                      const value = Math.max(qtyStep, Math.min(maxQty, Number(e.target.value) || qtyStep));
                                      setLineQuantities((prev) => ({ ...prev, [line.id]: value }));
                                    }}
                                    style={{ width: 72, fontSize: 12, padding: '3px 4px', borderRadius: 4, textAlign: 'center', fontVariantNumeric: 'tabular-nums', outline: 'none', border: '0.5px solid var(--color-border-secondary, #d1d5db)', background: '#fff' }}
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
          })}
        </div>

        <ImportModalFooter
          selectedCount={selected.size}
          importing={importing}
          importButtonLabel={importButtonLabel}
          onClose={onClose}
          onImport={handleImport}
          ui={ui}
          data-testid="ImportModalFooter__2d7a44" />
      </div>
    </div>,
    document.body,
  );
}
