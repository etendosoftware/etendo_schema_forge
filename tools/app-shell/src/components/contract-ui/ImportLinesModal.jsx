import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { Checkbox } from '@/components/ui/checkbox';

export default function ImportLinesModal({
  invoiceId,
  bpId,
  base,
  headers,
  onClose,
  onSuccess,
  titleKey,
  searchPlaceholderKey,
  emptyMessageKey,
  noSearchResultsKey,
  allImportedMessageKey,
  successMessageKey,
  fetchDocuments,
  fetchLines,
  getDocDisplay,
  buildLineBody,
  afterImport,
  showPriceColumns = true,
  linesEndpoint,
}) {
  if (!linesEndpoint) throw new Error('ImportLinesModal: linesEndpoint prop is required');
  const ui = useUI();
  const [documents, setDocuments] = useState([]);
  const [sharedContext, setSharedContext] = useState({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [expanded, setExpanded] = useState(new Set());
  const [docLines, setDocLines] = useState({});
  const [loadingLines, setLoadingLines] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [lineQuantities, setLineQuantities] = useState({});
  const [eagerLoadingLines, setEagerLoadingLines] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { documents: docs, sharedContext: ctx } = await fetchDocuments({ base, headers, bpId, invoiceId });
        if (!cancelled) {
          setDocuments(docs || []);
          setSharedContext(ctx || {});
        }
      } catch { /* silent */ } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [bpId, base, headers, invoiceId, fetchDocuments]);

  // Eagerly load all lines once documents arrive so fully-imported invoices can be
  // filtered out before the user sees the list (avoids "appears then disappears" flicker).
  useEffect(() => {
    if (loading) return;
    const docs = documents;
    if (docs.length === 0) return;
    let cancelled = false;
    setEagerLoadingLines(true);
    Promise.all(
      docs.map(doc =>
        fetchLines({ base, headers, docId: doc.id, sharedContext })
          .then(lines => ({ docId: doc.id, lines }))
          .catch(() => ({ docId: doc.id, lines: [] })),
      ),
    ).then(results => {
      if (cancelled) return;
      const newDocLines = {};
      const qtyDefaults = {};
      results.forEach(({ docId, lines }) => {
        newDocLines[docId] = lines;
        lines.forEach(l => { qtyDefaults[l.id] = l._maxQty || 0; });
      });
      setDocLines(newDocLines);
      setLineQuantities(prev => ({ ...prev, ...qtyDefaults }));
      setEagerLoadingLines(false);
    });
    return () => { cancelled = true; };
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const bpName = documents[0]?.['businessPartner$_identifier'] || '';

  const filtered = useMemo(() => {
    const visible = documents.filter(d => {
      const lines = docLines[d.id];
      if (!lines || lines.length === 0) return true;
      return lines.some(l => !l._alreadyImported);
    });
    if (!search.trim()) return visible;
    const q = search.toLowerCase();
    return visible.filter(d => (d.documentNo || '').toLowerCase().includes(q));
  }, [documents, docLines, search]);

  const loadLines = async (docId) => {
    if (docLines[docId] || loadingLines.has(docId)) return;
    setLoadingLines(prev => { const n = new Set(prev); n.add(docId); return n; });
    try {
      const enrichedLines = await fetchLines({ base, headers, docId, sharedContext });
      setDocLines(prev => ({ ...prev, [docId]: enrichedLines }));
      const qtyDefaults = {};
      enrichedLines.forEach(l => { qtyDefaults[l.id] = l._maxQty || 0; });
      setLineQuantities(prev => ({ ...prev, ...qtyDefaults }));
    } catch { /* silent */ } finally { setLoadingLines(prev => { const n = new Set(prev); n.delete(docId); return n; }); }
  };

  const toggleExpand = (docId) => {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(docId)) { n.delete(docId); } else { n.add(docId); loadLines(docId); }
      return n;
    });
  };

  const toggleLine = (lineId) => {
    setSelected(prev => { const n = new Set(prev); n.has(lineId) ? n.delete(lineId) : n.add(lineId); return n; });
  };

  const toggleDoc = (docId) => {
    const lines = docLines[docId] || [];
    if (lines.length === 0) {
      setExpanded(prev => { const n = new Set(prev); n.add(docId); return n; });
      loadLines(docId);
      return;
    }
    const lineIds = lines.map(l => l.id);
    const allSelected = lineIds.every(id => selected.has(id));
    setSelected(prev => {
      const n = new Set(prev);
      if (allSelected) { lineIds.forEach(id => n.delete(id)); } else { lineIds.forEach(id => n.add(id)); }
      return n;
    });
  };

  const getDocCheckState = (docId) => {
    const lines = docLines[docId] || [];
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

      const importedDocIds = new Set();
      for (const doc of documents) {
        const lines = (docLines[doc.id] || []).filter(l => selected.has(l.id));
        if (lines.length === 0) continue;

        for (const line of lines) {
          const qty = lineQuantities[line.id] ?? (line._maxQty || 0);
          const lineBody = await buildLineBody({ line, qty, invoiceId, lineNo, sharedContext, base, headers });
          const res = await fetch(`${base}/${linesEndpoint}`, {
            method: 'POST', headers, body: JSON.stringify(lineBody),
          });
          if (!res.ok) errors++;
          else importedDocIds.add(doc.id);
          lineNo += 10;
        }
      }
      if (afterImport) await afterImport({ importedDocIds, sharedContext, base, headers, invoiceId });
      if (errors > 0) {
        toast.warning(`Imported with ${errors} error(s) — review the invoice`);
      } else {
        toast.success(ui(successMessageKey));
      }
      onSuccess();
    } catch (err) { toast.error(err.message || 'Failed to import'); } finally { setImporting(false); }
  };

  const fmtDate = (d) => {
    if (!d) return '-';
    const [year, month, day] = String(d).slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const fmtNum = (v) => v != null ? Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div onClick={e => e.stopPropagation()} style={{ width: 580, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 12, backgroundColor: '#fff', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '0.5px solid #E5E7EB' }}>

        <div style={{ padding: '14px 16px', borderBottom: '2px solid #E5E7EB' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{ui(titleKey)}</span>
            <button type="button" onClick={onClose} style={{ fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }}>&times;</button>
          </div>
          {bpName && <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>{bpName}</div>}
        </div>

        <div style={{ padding: '10px 16px 0' }}>
          <input
            data-testid="import-lines-search"
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={ui(searchPlaceholderKey)}
            style={{ width: '100%', fontSize: 13, padding: '7px 10px', border: '0.5px solid #E5E7EB', borderRadius: 6, outline: 'none', color: '#111827' }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
          {(() => {
            if (loading || eagerLoadingLines) {
              return <p style={{ fontSize: 13, color: '#9ca3af', padding: '24px 0', textAlign: 'center' }}>{ui('loading')}</p>;
            }
            if (filtered.length === 0) {
              let msg;
              if (documents.length === 0) {
                msg = ui(emptyMessageKey);
              } else if (!search.trim() && allImportedMessageKey) {
                msg = ui(allImportedMessageKey);
              } else {
                msg = ui(noSearchResultsKey);
              }
              return (
                <p style={{ fontSize: 13, color: '#9ca3af', padding: '24px 0', textAlign: 'center' }}>{msg}</p>
              );
            }
            return filtered.map(doc => {
              const isExpanded = expanded.has(doc.id);
              const isLoadingLns = loadingLines.has(doc.id);
              const lines = docLines[doc.id] || [];
              const checkState = getDocCheckState(doc.id);
              const hasAnySelected = checkState.checked || checkState.indeterminate;
              const display = getDocDisplay(doc);
              const docTotal = lines.length > 0
                ? lines.reduce((sum, l) => sum + (l._lineNetAmount || 0), 0)
                : null;
              return (
                <div key={doc.id} style={{ borderLeft: (isExpanded || hasAnySelected) ? '3px solid #18181b' : '3px solid transparent' }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '0.5px solid #F3F4F6', cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#F9FAFB'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    onClick={() => toggleExpand(doc.id)}
                  >
                    <span style={{ fontSize: 11, color: '#9ca3af', width: 16, textAlign: 'center', transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>▶</span>
                    <Checkbox
                      checked={checkState.checked}
                      indeterminate={checkState.indeterminate}
                      onClick={e => e.stopPropagation()}
                      onChange={() => toggleDoc(doc.id)}
                      className="mx-2 shrink-0"
                      data-testid="Checkbox__5345ae" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{display.docNo}</span>
                        <span style={{ fontSize: 12, color: '#6B7280' }}>{fmtDate(display.date)}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: '#9ca3af', fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: 8 }}>
                      {display.secondary || (docTotal != null ? fmtNum(docTotal) : '')}
                    </span>
                  </div>
                  {isExpanded && (
                    <div style={{ background: 'var(--color-background-secondary, #F9FAFB)' }}>
                      {(() => {
                        if (isLoadingLns) {
                          return <div style={{ padding: '8px 12px 8px 48px', fontSize: 12, color: '#9ca3af' }}>{ui('loadingLines')}</div>;
                        }
                        if (lines.length === 0) {
                          return <div style={{ padding: '8px 12px 8px 48px', fontSize: 12, color: '#9ca3af' }}>{ui('noLinesFound')}</div>;
                        }
                        return (
                          <>
                            <div style={{ display: 'flex', padding: '4px 12px 4px 48px', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '0.5px solid #E5E7EB' }}>
                              <span style={{ flex: 1 }}>{ui('product')}</span>
                              <span style={{ width: 70, textAlign: 'right' }}>{ui('qty')}</span>
                              {showPriceColumns && <span style={{ width: 80, textAlign: 'right' }}>{ui('price')}</span>}
                              {showPriceColumns && <span style={{ width: 80, textAlign: 'right' }}>{ui('amount')}</span>}
                            </div>
                            {lines.map(line => {
                              const imported = line._alreadyImported;
                              const lineSelected = !imported && selected.has(line.id);
                              const maxQty = line._maxQty || 0;
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
                                    background: lineSelected ? '#F5F7F9' : 'transparent',
                                    opacity: imported ? 0.4 : 1,
                                  }}
                                >
                                  <Checkbox
                                    checked={lineSelected}
                                    disabled={imported}
                                    onClick={e => e.stopPropagation()}
                                    onChange={() => !imported && toggleLine(line.id)}
                                    className="mr-2 shrink-0"
                                    data-testid="Checkbox__5345ae" />
                                  <span style={{ fontSize: 13, color: imported ? '#9ca3af' : '#111827', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: lineSelected ? 500 : 400 }}>
                                    {line._productName}{imported && <span style={{ fontSize: 11, marginLeft: 6, color: '#9ca3af' }}>{line._inDraftShipments?.length ? `${ui('inDraftShipment')}: ${line._inDraftShipments.join(', ')}` : ui('alreadyImported')}</span>}
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
                                  {showPriceColumns && (
                                    <span style={{ width: 80, fontSize: 12, color: '#6B7280', fontVariantNumeric: 'tabular-nums', textAlign: 'right', flexShrink: 0 }}>
                                      {unitPrice ? fmtNum(unitPrice) : '-'}
                                    </span>
                                  )}
                                  {showPriceColumns && (
                                    <span style={{ width: 80, fontSize: 12, color: '#6B7280', fontVariantNumeric: 'tabular-nums', textAlign: 'right', flexShrink: 0 }}>
                                      {lineTotal ? fmtNum(lineTotal) : '-'}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8F9FA', borderTop: '1px solid #E5E7EB', padding: '10px 16px' }}>
          <span style={{ fontSize: 12, color: selected.size > 0 ? '#111827' : '#6B7280', fontWeight: selected.size > 0 ? 500 : 400 }}>
            {selected.size > 0 ? ui('selected', { count: selected.size }) : ui('selectLinesToImport')}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={{ fontSize: 13, padding: '5px 14px', borderRadius: 6, border: '1px solid #E5E7EB', background: 'transparent', color: '#6B7280', cursor: 'pointer' }}>{ui('cancel')}</button>
            <button
              type="button" onClick={handleImport} disabled={selected.size === 0 || importing}
              style={{ fontSize: 13, fontWeight: 500, padding: '5px 14px', borderRadius: 6, border: 'none', background: '#18181b', color: '#fff', cursor: (selected.size === 0 || importing) ? 'not-allowed' : 'pointer', opacity: (selected.size === 0 || importing) ? 0.4 : 1 }}
            >
              {importing ? ui('importing') : ui('importSelected', { count: selected.size > 0 ? ` (${selected.size})` : '' })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
