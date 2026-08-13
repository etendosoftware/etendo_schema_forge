import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, Layers, Loader2, Pencil, Trash2 } from 'lucide-react';
import { useUI, useLabel } from '@/i18n';
import { useCurrency } from '@/hooks/useCurrency';
import { useAccountingDimensionFields } from '@/hooks/useAccountingDimensionFields';
import { formatCurrency } from '@/lib/formatCurrency';
import SelectorInput from '@/components/contract-ui/SelectorInput';
import { AddLineButton } from '@/components/ui/add-line-button';
import { Checkbox } from '@/components/ui/checkbox';
import LinesSelectionBar from '@/components/contract-ui/LinesSelectionBar';
// ETP-4529 — DimBadge, DimSummary, and DimensionGrid (the "Dimensiones contables"
// badge/summary/expand-grid pattern this file originated) were extracted to the
// shared tools/app-shell/src/components/contract-ui/DimensionsPanel.jsx, so
// InlineLinesPanel's new `dimensionsPanel` column type (and any future custom lines
// table) can reuse the exact same UX instead of re-implementing it. DimensionGrid
// still renders each SelectorInput with resolvedLabel="" so the placeholder text
// stays controlled locally instead of by the selector's own default.
// ETP-4610 — DimSummary (the permanent "Dimensiones contables" grid column) is no
// longer used here: the entry point moved into the row hover-action strip (the
// Layers/"Edit dimensions" button below), mirroring the mechanism InlineLinesPanel
// already uses for the other 5 generated windows (sales-invoice, purchase-invoice,
// goods-shipment, goods-receipt, simple-g-l-journal). See docs/feedback.md and
// docs/ui-customization.md §14b for the generic pattern this now matches.
import { DimensionGrid } from '@/components/contract-ui/DimensionsPanel';

// ── field definitions ────────────────────────────────────────────────
const CORE_FIELDS = [
  { key: 'asset', column: 'A_Asset_ID', type: 'selector', reference: 'Asset', inputMode: 'selector', required: true, readOnlyLogic: (r) => r['posted'] === 'Y' },
  { key: 'amortizationPercentage', column: 'Amortization_Percentage', type: 'number', readOnlyLogic: (r) => r['processed'] === 'Y' },
  { key: 'amortizationAmount', column: 'Amortizationamt', type: 'number', required: true, readOnlyLogic: (r) => r['processed'] === 'Y' },
];

// ETP-4529 — all three are "Por config" (config-gated) per the accounting-dimension
// matrix for Amortización líneas. Candidates only: actual visibility is resolved per
// render by useAccountingDimensionFields (see the `dimensionFields` computation inside
// AmortizationLinesTable below), which calls the same evaluate-display evaluator
// DetailView uses for generated windows, instead of rendering all three unconditionally
// as before. costcenter/eTADASBpartner currently have no raw AD_Field.DisplayLogic at
// all (a separate, already-tracked gap — see amortization.md); the hook fails open for
// them (stays visible) until that AD-level change lands, at which point this starts
// respecting it automatically.
const DIMENSION_FIELD_CANDIDATES = [
  { key: 'project', column: 'C_Project_ID', type: 'selector', reference: 'Project', inputMode: 'selector', readOnlyLogic: (r) => r['posted'] === 'Y' },
  { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector', reference: 'Costcenter', inputMode: 'selector', readOnlyLogic: (r) => r['posted'] === 'Y' },
  { key: 'eTADASBpartner', column: 'EM_Etadas_C_Bpartner_ID', type: 'selector', reference: 'BPartner', inputMode: 'selector', readOnlyLogic: (r) => r['posted'] === 'Y' },
];

// ── main component ──────────────────────────────────────────────────
export default function AmortizationLinesTable({
  recordId: recordIdProp,
  data,
  token,
  apiBaseUrl,
  api,
  editing,
  catalogs,
  onCountChange,
  onRefresh,
  isNew,
  onSave,
}) {
  const ui = useUI();
  const t = useLabel(api?.labelOverrides);
  const orgCurrency = useCurrency() ?? 'USD';
  const navigate = useNavigate();
  const location = useLocation();
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [editingLineId, setEditingLineId] = useState(null);
  const [pendingEdits, setPendingEdits] = useState({});
  const [saving, setSaving] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [addingLine, setAddingLine] = useState(false);
  const [newLine, setNewLine] = useState({});
  const [selectedRows, setSelectedRows] = useState(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectionBarVisible, setSelectionBarVisible] = useState(false);
  const [selectionBarClosing, setSelectionBarClosing] = useState(false);
  const [barRect, setBarRect] = useState(null);
  const addLineWrapperRef = useRef(null);
  const addRowRef = useRef(null);
  const recordId = recordIdProp ?? data?.id;

  // ETP-4529 — config-driven dimension visibility (was: DIMENSION_FIELDS always shown).
  // One evaluate-display call per mount/header-change, shared by every line row —
  // dimension-macro visibility depends on the client's accounting-dimension
  // configuration, not on any individual line's field values.
  const dimensionFields = useAccountingDimensionFields('lines', data, DIMENSION_FIELD_CANDIDATES, { token, apiBaseUrl });

  // ── multi-select (Sales Order / Contacts pattern) ──
  const { allSelected, someSelected } = useMemo(() => {
    const all = lines.length > 0 && selectedRows.size === lines.length;
    return { allSelected: all, someSelected: selectedRows.size > 0 && !all };
  }, [lines.length, selectedRows]);

  const toggleAll = useCallback(() => {
    setSelectedRows(prev => (prev.size === lines.length ? new Set() : new Set(lines.map(l => l.id))));
  }, [lines]);

  const toggleRow = useCallback((id) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Selection bar lifecycle (DetailView pattern: 250ms dismiss animation).
  useEffect(() => {
    if (selectedRows.size > 0) {
      setSelectionBarVisible(true);
      setSelectionBarClosing(false);
      return undefined;
    }
    if (selectionBarVisible) {
      setSelectionBarClosing(true);
      const t = setTimeout(() => {
        setSelectionBarVisible(false);
        setSelectionBarClosing(false);
      }, 250);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [selectedRows.size, selectionBarVisible]);

  // Measure the footer wrapper so the bar floats over the "Add line" area.
  useEffect(() => {
    if (!selectionBarVisible) return undefined;
    const el = addLineWrapperRef.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBarRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(measure); ro.observe(el); }
    const events = ['scroll', 'resize'];
    events.forEach(e => window.addEventListener(e, measure, true));
    return () => {
      ro?.disconnect();
      events.forEach(e => window.removeEventListener(e, measure, true));
    };
  }, [selectionBarVisible]);

  const fetchLines = useCallback(() => {
    if (!recordId || !apiBaseUrl) return;
    setLoading(true);
    fetch(`${apiBaseUrl}/lines?parentId=${recordId}&_startRow=0&_endRow=500&_sortBy=sEQNoAsset+asc`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : { data: [] })
      .then(json => {
        const rows = json?.response?.data ?? json?.data ?? json?.rows ?? [];
        const normalized = Array.isArray(rows) ? rows : [];
        setLines(normalized);
        // Drop any selected ids that no longer exist after the refresh.
        setSelectedRows(prev => {
          if (prev.size === 0) return prev;
          const ids = new Set(normalized.map(l => l.id));
          const next = new Set([...prev].filter(id => ids.has(id)));
          return next.size === prev.size ? prev : next;
        });
        onCountChange?.(normalized.length);
      })
      .catch(() => setLines([]))
      .finally(() => setLoading(false));
  }, [recordId, apiBaseUrl, token]);

  useEffect(() => { fetchLines(); }, [fetchLines]);

  // Mirror DetailView's openAddLine pattern: auto-open inline form after header auto-save navigation.
  useEffect(() => {
    if (!location.state?.openAddLine || isNew) return;
    setAddingLine(true);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state?.openAddLine, isNew, navigate, location.pathname]);

  useEffect(() => {
    if (!recordId) return undefined;
    function onProcess(e) {
      if (String(e?.detail?.recordId) !== String(recordId)) return;
      fetchLines();
    }
    window.addEventListener('neo:processSuccess', onProcess);
    return () => window.removeEventListener('neo:processSuccess', onProcess);
  }, [recordId, fetchLines]);

  function handleChange(lineId, key, value) {
    setPendingEdits(prev => ({ ...prev, [lineId]: { ...(prev[lineId] ?? {}), [key]: value } }));
  }

  // Per-field save on blur (like Sales Order inline editing)
  async function saveField(lineId, line, fieldKey, value) {
    if (String(line[fieldKey] ?? '') === String(value ?? '')) return;
    try {
      const res = await fetch(`${apiBaseUrl}/lines/${lineId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [fieldKey]: value }),
      });
      if (res.ok) { fetchLines(); onRefresh?.(); }
    } catch { /* silencioso */ }
  }

  // Close edit mode when clicking outside the editing row
  useEffect(() => {
    if (!editingLineId) return undefined;
    function handler(e) {
      const row = document.querySelector(`[data-row-id="${editingLineId}"]`);
      if (!row || row.contains(e.target)) return;
      const portals = ['[data-radix-popper-content-wrapper]', '[role="listbox"]'];
      for (const sel of portals) {
        if (e.target.closest?.(sel)) return;
      }
      setTimeout(() => setEditingLineId(null), 0);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editingLineId]);

  async function deleteLine(lineId) {
    setDeleting(lineId);
    try {
      const res = await fetch(`${apiBaseUrl}/lines/${lineId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { fetchLines(); onRefresh?.(); }
    } finally { setDeleting(null); }
  }

  async function bulkDelete() {
    const ids = [...selectedRows];
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      await Promise.all(ids.map(id =>
        fetch(`${apiBaseUrl}/lines/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
      ));
      setSelectedRows(new Set());
      fetchLines();
      onRefresh?.();
    } finally { setBulkDeleting(false); }
  }

  // Inline draft-row submit (Sales Order InlineAddRow pattern).
  // close=true closes the row; close=false resets and keeps it open for rapid entry.
  async function submitNewLine({ close }) {
    if (!newLine.asset) return;
    setSaving('new');
    try {
      const res = await fetch(`${apiBaseUrl}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...newLine, amortization: recordId, currency: data?.currency }),
      });
      if (res.ok) {
        setNewLine({});
        if (close) setAddingLine(false);
        fetchLines();
        onRefresh?.();   // sync parent hook.children → enables process button
      }
    } finally { setSaving(null); }
  }

  function onDraftKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); submitNewLine({ close: false }); }
    else if (e.key === 'Escape') { e.preventDefault(); setAddingLine(false); setNewLine({}); }
  }

  // Save (or cancel) the draft row when clicking outside it.
  useEffect(() => {
    if (!addingLine) return undefined;
    function handler(e) {
      const row = addRowRef.current;
      if (!row || row.contains(e.target)) return;
      const portals = ['[data-radix-popper-content-wrapper]', '[role="listbox"]', '[role="dialog"]'];
      for (const sel of portals) { if (e.target.closest?.(sel)) return; }
      const hasData = newLine.asset || newLine.amortizationPercentage || newLine.amortizationAmount;
      if (hasData) submitNewLine({ close: true });
      else { setAddingLine(false); setNewLine({}); }
    }
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [addingLine, newLine]);

  const processed = data?.processed === 'Y' || data?.processed === true;
  const isReadOnly = !editing || processed;

  return (
    <div className="flex-1 min-w-0" data-testid="inline-lines-panel">
      <table className="w-full">
        {/* header — matches inlineEditable: sticky top-0 z-20 bg-card */}
        <thead className="sticky top-0 z-20 bg-card">
          <tr className="border-b border-border/40">
            <th className="h-10 w-10 p-2 align-middle" />
            <th className="h-10 w-10 px-3 pr-0 align-middle">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={toggleAll}
                disabled={isReadOnly}
                aria-label={ui('selectAll')}
                data-testid="Checkbox__fecdcf" />
            </th>
            {/* Flexible column (no fixed width) — mirrors financial-account's
                data columns so it absorbs the table's surplus width, keeping the
                leading chevron/checkbox cells at their content width (~52px). */}
            <th className="h-10 px-3 text-left align-middle text-xs leading-4 font-semibold text-text-primary tracking-normal">
              {t('A_Asset_ID')}
            </th>
            <th className="h-10 w-36 px-3 text-right align-middle text-xs leading-4 font-semibold text-text-primary tracking-normal">
              {t('Amortization_Percentage')}
            </th>
            <th className="h-10 w-36 px-3 text-right align-middle text-xs leading-4 font-semibold text-text-primary tracking-normal">
              {t('Amortizationamt')}
            </th>
            {/* ETP-4610 — the "Accounting dimensions" column header was removed:
                the summary/entry point moved into the hover-action strip below
                (Layers icon, "Edit dimensions" tooltip), matching InlineLinesPanel's
                generic dimensionsPanel mechanism used by the other 5 windows.
                Widened from w-20 (80px) to w-32 (128px): the strip now holds up to
                3 buttons (was 2) and needs the extra room so it stays inside its
                own column instead of spilling over the Amount column on hover. */}
            <th className="h-10 w-32 px-2" />
          </tr>
        </thead>

        <tbody>
          {loading ? (
            <tr>
              <td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                <Loader2
                  className="h-4 w-4 animate-spin inline mr-1.5"
                  data-testid="Loader2__fecdcf" />
              </td>
            </tr>
          ) : (
            <>
              {lines.map(line => {
                const isExpanded = expandedId === line.id;
                const isEditing = editingLineId === line.id;
                const isSelected = selectedRows.has(line.id);
                const edits = pendingEdits[line.id] ?? {};
                const lineData = { ...line, ...edits };

                return (
                  <React.Fragment key={line.id}>
                    {/* ── data row ── */}
                    <tr
                      data-row-id={line.id}
                      className={`relative transition-colors h-12 group/row border-b border-border/30 cursor-pointer ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'}`}
                      onClick={() => !isEditing && setExpandedId(isExpanded ? null : line.id)}
                    >
                      {/* expand toggle — circular icon button (matches financial-account MovementsTable) */}
                      <td className="w-10 p-2 align-middle">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); if (!isEditing) setExpandedId(isExpanded ? null : line.id); }}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-[hsl(var(--border-control))] bg-card text-[hsl(var(--muted-foreground))] transition-transform hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
                          style={{ transform: isExpanded ? 'rotate(180deg)' : undefined }}
                          aria-label={ui(isExpanded ? 'collapse' : 'expand')}
                          aria-expanded={isExpanded}
                        >
                          <ChevronDown
                            className="h-4 w-4"
                            data-testid="ChevronDown__fecdcf" />
                        </button>
                      </td>

                      {/* select row */}
                      <td className="px-3 pr-0 align-middle" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onChange={() => !isReadOnly && toggleRow(line.id)}
                          disabled={isReadOnly}
                          aria-label={ui('selectRow')}
                          data-testid="Checkbox__fecdcf" />
                      </td>

                      {/* asset */}
                      {isEditing ? (
                        <td className="py-1 px-2 align-middle" onClick={e => e.stopPropagation()}>
                          <SelectorInput
                            entityName="lines"
                            field={CORE_FIELDS[0]}
                            value={lineData.asset ?? ''}
                            displayValue={lineData['asset$_identifier'] ?? ''}
                            onChange={(val, lbl) => {
                              handleChange(line.id, 'asset', val);
                              handleChange(line.id, 'asset$_identifier', lbl ?? '');
                              saveField(line.id, line, 'asset', val);
                            }}
                            catalogs={catalogs}
                            resolvedLabel=""
                            selectorUrl={`${apiBaseUrl}/lines/selectors/A_Asset_ID`}
                            token={token}
                            compact
                            data-testid="SelectorInput__fecdcf" />
                        </td>
                      ) : (
                        <td className="px-3 text-sm font-medium text-foreground align-middle truncate max-w-0">
                          {line['asset$_identifier'] ?? line.asset ?? '—'}
                        </td>
                      )}

                      {/* percentage */}
                      {isEditing ? (
                        <td className="py-1 px-2 align-middle" onClick={e => e.stopPropagation()}>
                          <input
                            type="number"
                            className="h-8 w-full rounded-lg border border-[hsl(var(--border-control))] bg-card px-2 text-sm text-right tabular-nums"
                            defaultValue={line.amortizationPercentage ?? ''}
                            onBlur={e => saveField(line.id, line, 'amortizationPercentage', e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } else if (e.key === 'Escape') { setEditingLineId(null); } }}
                          />
                        </td>
                      ) : (
                        <td className="px-3 text-sm text-right tabular-nums text-muted-foreground align-middle">
                          {line.amortizationPercentage != null ? Number(line.amortizationPercentage).toFixed(2) : '—'}
                        </td>
                      )}

                      {/* amount */}
                      {isEditing ? (
                        <td className="py-1 px-2 align-middle" onClick={e => e.stopPropagation()}>
                          <input
                            type="number"
                            className="h-8 w-full rounded-lg border border-[hsl(var(--border-control))] bg-card px-2 text-sm text-right tabular-nums"
                            defaultValue={line.amortizationAmount ?? ''}
                            onBlur={e => saveField(line.id, line, 'amortizationAmount', e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } else if (e.key === 'Escape') { setEditingLineId(null); } }}
                          />
                        </td>
                      ) : (
                        <td className="px-3 text-sm text-right tabular-nums font-semibold text-foreground align-middle">
                          {line.amortizationAmount != null
                            ? formatCurrency(orgCurrency, line.amortizationAmount)
                            : '—'}
                        </td>
                      )}

                      {/* quick actions — dimensions (when applicable) + pencil + trash on hover.
                          ETP-4610 — the "Add dimensions"/DimSummary column was removed; the
                          entry point into the dimensions expand panel is now this hover action,
                          matching InlineLinesPanel's generic dimensionsPanel mechanism (static
                          Layers icon + "Edit dimensions" tooltip, no adaptive variant). Reading
                          dimensions on a read-only/processed document still works via the
                          always-visible chevron toggle at the start of the row — this hover
                          shortcut, like Pencil/Trash, is only offered while the document (and
                          therefore the row) is editable.
                          Fix: the strip had NO background at all — only the icon glyphs were
                          opaque — so at 3 buttons wide it visually overlapped/bled into the
                          Amount column's text on hover instead of occluding it. Added a solid
                          `bg-card` pill (+ shadow/ring, matching the app's established
                          floating-action-pill look) so the strip reads as a distinct control
                          sitting on top of the row, not a see-through overlay. */}
                      <td className="relative px-2 align-middle" onClick={e => e.stopPropagation()}>
                        {!isReadOnly && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 h-9 px-1.5 rounded-full bg-card shadow-sm ring-1 ring-border/40 opacity-0 group-hover/row:opacity-100 transition-opacity z-10">
                            {dimensionFields.length > 0 && (
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : line.id)}
                                aria-label={ui('editDimensionsTooltip')}
                                title={ui('editDimensionsTooltip')}
                                className="h-8 w-8 p-0 flex items-center justify-center rounded-full text-[hsl(var(--text-disabled))] hover:text-foreground hover:bg-muted/60 transition-colors"
                                data-testid="line-action-add-dimensions"
                              >
                                <Layers className="h-4 w-4" data-testid="Layers__fecdcf" />
                              </button>
                            )}
                            <button
                              onClick={() => setEditingLineId(isEditing ? null : line.id)}
                              aria-label={ui('editLineTooltip')}
                              title={ui('editLineTooltip')}
                              className={`h-8 w-8 p-0 flex items-center justify-center rounded-full transition-colors ${isEditing ? 'text-primary hover:bg-primary/10' : 'text-[hsl(var(--text-disabled))] hover:text-foreground hover:bg-muted/60'}`}
                            >
                              <Pencil className="h-4 w-4" data-testid="Pencil__fecdcf" />
                            </button>
                            <button
                              onClick={() => deleteLine(line.id)}
                              disabled={deleting === line.id}
                              aria-label={ui('deleteRowTooltip')}
                              title={ui('deleteRowTooltip')}
                              className="h-8 w-8 p-0 flex items-center justify-center rounded-full text-[hsl(var(--destructive))] hover:text-destructive-foreground hover:bg-destructive transition-colors disabled:opacity-50"
                            >
                              {deleting === line.id ? <Loader2 className="h-4 w-4 animate-spin" data-testid="Loader2__fecdcf" /> : <Trash2 className="h-4 w-4" data-testid="Trash2__fecdcf" />}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {/* ── dimension expand ── */}
                    {isExpanded && (
                      <tr className="border-b border-border/30">
                        <td colSpan={6} className="bg-card px-10 pb-5 pt-3">
                          {line['organization$_identifier'] && (
                            <div className="mb-4 grid grid-cols-4 gap-4">
                              <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">{ui('organization')} *</label>
                                <div className="h-10 flex items-center px-3 rounded-lg border border-[hsl(var(--border-control))] bg-card text-sm text-foreground">{line['organization$_identifier']}</div>
                              </div>
                            </div>
                          )}
                          <DimensionGrid
                            fields={dimensionFields}
                            data={lineData}
                            onChange={(k, v) => handleChange(line.id, k, v)}
                            onFieldSave={(k, v) => saveField(line.id, line, k, v)}
                            apiBaseUrl={apiBaseUrl}
                            token={token}
                            catalogs={catalogs}
                            readOnly={isReadOnly}
                            isCompleted={processed}
                            labelOverrides={api?.labelOverrides}
                            data-testid="DimensionGrid__fecdcf" />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {/* ── inline add-line draft row (Sales Order InlineAddRow pattern) ── */}
              {addingLine && (
                <tr ref={addRowRef} data-testid="inline-add-row" className="bg-status-info/50 border-t-2 border-primary/20">
                  <td className="w-10 p-2 align-middle" aria-hidden="true" />
                  <td className="px-3 pr-0" aria-hidden="true" />
                  <td className="py-1 px-2 align-middle">
                    <SelectorInput
                      entityName="lines"
                      field={CORE_FIELDS[0]}
                      compact
                      value={newLine.asset ?? ''}
                      displayValue={newLine['asset$_identifier'] ?? ''}
                      resolvedLabel={t('A_Asset_ID')}
                      onChange={(val, lbl) => setNewLine(p => ({ ...p, asset: val, 'asset$_identifier': lbl ?? '' }))}
                      catalogs={catalogs}
                      selectorUrl={`${apiBaseUrl}/lines/selectors/A_Asset_ID`}
                      token={token}
                      data-testid="SelectorInput__fecdcf" />
                  </td>
                  <td className="py-1 px-2 align-middle">
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder={t('Amortization_Percentage')}
                      className="w-full h-8 text-sm rounded-md border border-input bg-card px-2 text-right tabular-nums focus:ring-2 focus:ring-primary focus:outline-none"
                      value={newLine.amortizationPercentage ?? ''}
                      onChange={e => setNewLine(p => ({ ...p, amortizationPercentage: e.target.value }))}
                      onKeyDown={onDraftKeyDown}
                    />
                  </td>
                  <td className="py-1 px-2 align-middle">
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder={t('Amortizationamt')}
                      className="w-full h-8 text-sm rounded-md border border-input bg-card px-2 text-right tabular-nums focus:ring-2 focus:ring-primary focus:outline-none"
                      value={newLine.amortizationAmount ?? ''}
                      onChange={e => setNewLine(p => ({ ...p, amortizationAmount: e.target.value }))}
                      onKeyDown={onDraftKeyDown}
                    />
                  </td>
                  <td className="px-2 text-center text-muted-foreground align-middle">
                    {saving === 'new' ? <Loader2 className="h-4 w-4 animate-spin inline" data-testid="Loader2__fecdcf" /> : '—'}
                  </td>
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
      {/* ── inline-add hint (shown while the draft row is open) ── */}
      {addingLine && (
        <p className="text-xs text-muted-foreground mt-1 text-center">{ui('inlineAddHint')}</p>
      )}
      {/* ── Add line button (always visible; wrapper measured for the selection bar) ── */}
      <div ref={addLineWrapperRef}>
        {!isReadOnly && (
          <div className="px-2 py-2">
            <AddLineButton
              onClick={async () => {
                if (isNew && onSave) { await onSave(); return; }
                setAddingLine(true);
              }}
              disabled={saving === 'new'}
              label={ui('addLine')}
              data-testid="AddLineButton__fecdcf" />
          </div>
        )}
      </div>
      {/* ── Total footer — always computed from visible lines for immediate accuracy ── */}
      {lines.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50 flex justify-end pr-2">
          <span className="text-sm font-semibold text-foreground">
            {ui('totalAmortization')}: {formatCurrency(orgCurrency, lines.reduce((s, l) => s + Number(l.amortizationAmount ?? 0), 0))}
          </span>
        </div>
      )}
      {/* ── shared floating selection bar (same as Sales Order) ── */}
      <LinesSelectionBar
        visible={selectionBarVisible}
        closing={selectionBarClosing}
        barRect={barRect}
        count={selectedRows.size}
        selectedLabel={ui('selected', { count: selectedRows.size })}
        totalLabel={null}
        deleting={bulkDeleting}
        deleteTitle={ui('delete')}
        closeTitle={ui('close')}
        onDelete={bulkDelete}
        onClose={() => setSelectedRows(new Set())}
        data-testid="LinesSelectionBar__fecdcf" />
    </div>
  );
}
