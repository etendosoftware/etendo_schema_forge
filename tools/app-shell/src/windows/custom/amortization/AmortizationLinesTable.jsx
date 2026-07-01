import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, Plus, Loader2, Pencil, Trash2 } from 'lucide-react';
import { useUI, useLabel } from '@/i18n';
import { useCurrency } from '@/hooks/useCurrency';
import { formatCurrency } from '@/lib/formatCurrency';
import SelectorInput from '@/components/contract-ui/SelectorInput';
import { AddLineButton } from '@/components/ui/add-line-button';
import { Checkbox } from '@/components/ui/checkbox';
import LinesSelectionBar from '@/components/contract-ui/LinesSelectionBar';

// ── field definitions ────────────────────────────────────────────────
const CORE_FIELDS = [
  { key: 'asset', column: 'A_Asset_ID', type: 'selector', reference: 'Asset', inputMode: 'selector', required: true, readOnlyLogic: (r) => r['posted'] === 'Y' },
  { key: 'amortizationPercentage', column: 'Amortization_Percentage', type: 'number', readOnlyLogic: (r) => r['processed'] === 'Y' },
  { key: 'amortizationAmount', column: 'Amortizationamt', type: 'number', required: true, readOnlyLogic: (r) => r['processed'] === 'Y' },
];

const DIMENSION_FIELDS = [
  { key: 'project', column: 'C_Project_ID', type: 'selector', reference: 'Project', inputMode: 'selector', readOnlyLogic: (r) => r['posted'] === 'Y', hidden: true },
  { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector', reference: 'Costcenter', inputMode: 'selector', readOnlyLogic: (r) => r['posted'] === 'Y' },
  { key: 'eTADASBpartner', column: 'EM_Etadas_C_Bpartner_ID', type: 'selector', reference: 'BPartner', inputMode: 'selector', readOnlyLogic: (r) => r['posted'] === 'Y' },
  { key: 'stDimension', column: 'User1_ID', type: 'selector', reference: 'User1', inputMode: 'selector', readOnlyLogic: (r) => r['posted'] === 'Y' },
  { key: 'ndDimension', column: 'User2_ID', type: 'selector', reference: 'User2', inputMode: 'selector', readOnlyLogic: (r) => r['posted'] === 'Y' },
  { key: 'eTADASSalesRegion', column: 'EM_Etadas_Salesregion_ID', type: 'selector', reference: 'SalesRegion', inputMode: 'selector', readOnlyLogic: (r) => r['posted'] === 'Y' },
  { key: 'eTADASActivity', column: 'EM_Etadas_C_Activity_ID', type: 'selector', reference: 'Activity', inputMode: 'selector', readOnlyLogic: (r) => r['posted'] === 'Y' },
  { key: 'eTADASSalesCampaign', column: 'EM_Etadas_Campaign_ID', type: 'selector', reference: 'Campaign', inputMode: 'selector', readOnlyLogic: (r) => r['posted'] === 'Y' },
];

const VISIBLE_DIMENSION_FIELDS = DIMENSION_FIELDS.filter(f => !f.hidden);

// ── DimensionGrid ────────────────────────────────────────────────────
// Renders DIMENSION_FIELDS directly via SelectorInput so we can control
// the placeholder (empty resolvedLabel → "Seleccionar..." / "Select...").
function DimensionGrid({ fields, data, onChange, onFieldSave, apiBaseUrl, token, catalogs, readOnly, isCompleted, labelOverrides }) {
  const t = useLabel(labelOverrides);
  return (
    <div
      className={`[&_button[role=combobox]]:!bg-white [&_button[role=combobox]:hover]:!bg-[#F5F7F9] [&_input]:!bg-white${isCompleted ? '' : ' [&_input:disabled]:!opacity-100'}`}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}
    >
      {fields.filter(f => !f.hidden).map(f => {
        const label = t(f.column) ?? f.label ?? f.key;
        const value = data?.[f.key] ?? '';
        const displayValue = data?.[`${f.key}$_identifier`] ?? '';
        const selectorUrl = apiBaseUrl ? `${apiBaseUrl}/lines/selectors/${f.column}` : null;
        return (
          <div key={f.key} className="space-y-1.5">
            <label className="text-sm text-foreground font-medium block">{label}</label>
            {readOnly ? (
              <input
                className="flex h-10 w-full rounded-lg border border-[#D1D4DB] bg-white p-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                value={displayValue || value || ''}
                disabled
                readOnly
              />
            ) : (
              <SelectorInput
                entityName="lines"
                field={f}
                value={value}
                displayValue={displayValue}
                onChange={(val, lbl) => {
                  onChange(f.key, val);
                  onChange(`${f.key}$_identifier`, lbl ?? '');
                  onFieldSave?.(f.key, val);
                }}
                catalogs={catalogs}
                resolvedLabel=""
                selectorUrl={selectorUrl}
                token={token}
                data-testid="SelectorInput__fecdcf" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function getIdentifier(line, key) {
  return line[`${key}$_identifier`] ?? (typeof line[key] === 'string' ? line[key] : null) ?? null;
}

// Badge with "Label: Value" format, matching the UX spec
// (bg #F5F7F9, radius 8px, padding 4px 8px, label #3F3F50, Inter 14px/20px).
function DimBadge({ label, value }) {
  return (
    <span className="inline-flex items-center px-2 py-1 rounded-lg bg-[#F5F7F9] text-sm leading-5 whitespace-nowrap max-w-full">
      <span className="text-[#3F3F50]">{label}:</span>
      <span className="ml-1 font-medium text-[#121217] truncate">{value}</span>
    </span>
  );
}

function DimSummary({ line, onClick, labelOverrides }) {
  const ui = useUI();
  const t = useLabel(labelOverrides);
  const org = line['organization$_identifier'];
  const filled = VISIBLE_DIMENSION_FIELDS
    .map(f => ({ column: f.column, value: getIdentifier(line, f.key) }))
    .filter(d => d.value);

  // Organization always leads the badge list (per design), followed by filled dimensions.
  const badges = [];
  if (org) badges.push({ label: ui('organization'), value: org });
  filled.forEach(d => badges.push({ label: t(d.column), value: d.value }));

  if (badges.length === 0) {
    return (
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-dashed border-[#D1D4DB] text-xs font-medium text-muted-foreground hover:text-foreground hover:border-[#828FA3] transition-colors"
      >
        <Plus className="h-3 w-3" data-testid="Plus__fecdcf" />
        {ui('amortizationDimensionsEmpty')}
      </button>
    );
  }

  const MAX_BADGES = 2;
  const shown = badges.slice(0, MAX_BADGES);
  const extra = badges.length - shown.length;

  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer max-w-full">
      {shown.map(b => <DimBadge
        key={b.label}
        label={b.label}
        value={b.value}
        data-testid="DimBadge__fecdcf" />)}
      {extra > 0 && (
        <span className="px-2 py-1 rounded-lg bg-[#F5F7F9] text-sm leading-5 font-medium text-[#3F3F50]">+{extra}</span>
      )}
    </button>
  );
}

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
        {/* header — matches inlineEditable: sticky top-0 z-20 bg-white */}
        <thead className="sticky top-0 z-20 bg-white">
          <tr className="border-b border-border/40">
            <th className="h-10 w-10 px-2 align-middle" />
            <th className="h-10 w-10 px-2 align-middle">
              <div className="flex items-center justify-center">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={toggleAll}
                  disabled={isReadOnly}
                  aria-label={ui('selectAll')}
                  data-testid="Checkbox__fecdcf" />
              </div>
            </th>
            <th className="h-10 w-64 px-3 text-left align-middle text-xs leading-4 font-semibold text-text-primary tracking-normal">
              {t('A_Asset_ID')}
            </th>
            <th className="h-10 w-36 px-3 text-right align-middle text-xs leading-4 font-semibold text-text-primary tracking-normal">
              {t('Amortization_Percentage')}
            </th>
            <th className="h-10 w-36 px-3 text-right align-middle text-xs leading-4 font-semibold text-text-primary tracking-normal">
              {t('Amortizationamt')}
            </th>
            <th className="h-10 w-96 px-3 text-left align-middle text-xs leading-4 font-semibold text-text-primary tracking-normal">
              {ui('amortizationDimensionsTitle')}
            </th>
            <th className="h-10 w-20 px-2" />
          </tr>
        </thead>

        <tbody>
          {loading ? (
            <tr>
              <td colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
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
                      {/* expand toggle — circular icon button */}
                      <td className="px-2 text-center align-middle">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); if (!isEditing) setExpandedId(isExpanded ? null : line.id); }}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#D1D4DB] bg-white shadow-[0px_1px_2px_rgba(18,18,23,0.05)] transition-colors hover:bg-[#F5F7F9]"
                          aria-label={ui(isExpanded ? 'collapse' : 'expand')}
                          aria-expanded={isExpanded}
                        >
                          <ChevronDown
                            className={`h-5 w-5 text-[#828FA3] transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
                            data-testid="ChevronDown__fecdcf" />
                        </button>
                      </td>

                      {/* select row */}
                      <td className="px-2 align-middle" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center">
                          <Checkbox
                            checked={isSelected}
                            onChange={() => !isReadOnly && toggleRow(line.id)}
                            disabled={isReadOnly}
                            aria-label={ui('selectRow')}
                            data-testid="Checkbox__fecdcf" />
                        </div>
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
                            className="h-8 w-full rounded-lg border border-[#D1D4DB] bg-white px-2 text-sm text-right tabular-nums"
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
                            className="h-8 w-full rounded-lg border border-[#D1D4DB] bg-white px-2 text-sm text-right tabular-nums"
                            defaultValue={line.amortizationAmount ?? ''}
                            onBlur={e => saveField(line.id, line, 'amortizationAmount', e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } else if (e.key === 'Escape') { setEditingLineId(null); } }}
                          />
                        </td>
                      ) : (
                        <td className="px-3 text-sm text-right tabular-nums font-semibold text-foreground align-middle">
                          {line.amortizationAmount != null
                            ? `${Number(line.amortizationAmount).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${line['currency$_identifier'] ?? ''}`
                            : '—'}
                        </td>
                      )}

                      {/* dimension summary */}
                      <td className="px-3 align-middle" onClick={e => e.stopPropagation()}>
                        <DimSummary
                          line={line}
                          onClick={() => setExpandedId(isExpanded ? null : line.id)}
                          labelOverrides={api?.labelOverrides}
                          data-testid="DimSummary__fecdcf" />
                      </td>

                      {/* quick actions — always pencil + trash on hover */}
                      <td className="relative px-2 align-middle" onClick={e => e.stopPropagation()}>
                        {!isReadOnly && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity z-10">
                            <button
                              onClick={() => setEditingLineId(isEditing ? null : line.id)}
                              className={`h-8 w-8 p-0 flex items-center justify-center rounded-full transition-colors ${isEditing ? 'text-primary hover:bg-primary/10' : 'text-[#828FA3] hover:text-foreground hover:bg-muted/60'}`}
                            >
                              <Pencil className="h-4 w-4" data-testid="Pencil__fecdcf" />
                            </button>
                            <button
                              onClick={() => deleteLine(line.id)}
                              disabled={deleting === line.id}
                              className="h-8 w-8 p-0 flex items-center justify-center rounded-full text-[#D50B3E] hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
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
                        <td colSpan={7} className="bg-white px-10 pb-5 pt-3">
                          {line['organization$_identifier'] && (
                            <div className="mb-4 grid grid-cols-4 gap-4">
                              <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">{ui('organization')} *</label>
                                <div className="h-10 flex items-center px-3 rounded-lg border border-[#D1D4DB] bg-white text-sm text-foreground">{line['organization$_identifier']}</div>
                              </div>
                            </div>
                          )}
                          <DimensionGrid
                            fields={DIMENSION_FIELDS}
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
                <tr ref={addRowRef} data-testid="inline-add-row" className="bg-blue-50/50 border-t-2 border-primary/20">
                  <td className="px-2" aria-hidden="true" />
                  <td className="px-2" aria-hidden="true" />
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
                      className="w-full h-8 text-sm rounded-md border border-input bg-white px-2 text-right tabular-nums focus:ring-2 focus:ring-primary focus:outline-none"
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
                      className="w-full h-8 text-sm rounded-md border border-input bg-white px-2 text-right tabular-nums focus:ring-2 focus:ring-primary focus:outline-none"
                      value={newLine.amortizationAmount ?? ''}
                      onChange={e => setNewLine(p => ({ ...p, amortizationAmount: e.target.value }))}
                      onKeyDown={onDraftKeyDown}
                    />
                  </td>
                  <td className="px-3 text-sm text-muted-foreground align-middle">—</td>
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
