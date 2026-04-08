import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { X, MoreVertical, Check, Save, List, Search, Sparkles, Plus, Bell, Mic, Printer, Send, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog.jsx';
import { useEntity } from '@/hooks/useEntity';
import { useCatalogs } from '@/hooks/useCatalogs';
import { useDisplayLogic } from '@/hooks/useDisplayLogic';
import { useCallout } from '@/hooks/useCallout';
import { useMenuLabel, useUI, useLocale } from '@/i18n';
import { SummaryBar } from './SummaryBar.jsx';
import { resolveIdentifier } from '@/lib/resolveIdentifier.js';
import { getCatalogOptions } from '@/lib/selectorCatalog.js';
import { formatAmount } from '@/lib/formatAmount.js';
import { getStatusBadgeProps, getStatusDotColor, getStatusPillClass, statusLabel } from '@/lib/statusBadge.js';

/**
 * Evaluate a simple Etendo display-logic expression (@Field@='Value') against record data.
 * Returns true (visible) if the expression cannot be parsed or if the field is missing from data.
 */
function evalDisplayLogicRaw(expr, data) {
  if (!expr) return true;
  const clauses = [...expr.matchAll(/@(\w+)@\s*(!?=)\s*'([^']*)'/g)];
  if (clauses.length === 0) return true;
  return clauses.every(([, fieldRef, op, expected]) => {
    const key = fieldRef[0].toLowerCase() + fieldRef.slice(1);
    if (!(key in (data || {}))) return true; // field absent → default visible
    const rawVal = data[key];
    // Normalize boolean API values to Etendo string equivalents (true→'Y', false→'N')
    const actual = typeof rawVal === 'boolean' ? (rawVal ? 'Y' : 'N') : String(rawVal ?? '');
    return op === '=' ? actual === expected : actual !== expected;
  });
}
import { cn } from '@/lib/utils.js';
import LocaleSwitcher from '@/components/LocaleSwitcher.jsx';
import DocumentPrintDrawer from './DocumentPrintDrawer.jsx';
import { toast } from 'sonner';

/**
 * Collapsible section that hides itself entirely when children render as null.
 */
function CollapsibleSection({ title, children }) {
  const ref = useRef(null);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    // Check if the rendered children produced any DOM nodes
    if (ref.current && ref.current.childElementCount === 0) {
      setEmpty(true);
    } else {
      setEmpty(false);
    }
  });

  if (empty) return <div ref={ref} className="hidden">{children}</div>;

  return (
    <details className="group">
      <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground py-1 select-none list-none flex items-center gap-1">
        <svg className="h-4 w-4 transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        {title}
      </summary>
      <div className="pt-2" ref={ref}>
        {children}
      </div>
    </details>
  );
}

/**
 * Full-page detail view for a single entity record.
 * Two-zone layout: gray top bar + white content card with rounded corner.
 */
export function DetailView({
  entity,
  detailEntity,
  Form,
  DetailTable,
  DetailForm,
  summary = [],
  statusField,
  extraBadges = [],
  processes = [],
  addLineFields = { entry: [], derived: [] },
  catalogs: staticCatalogs,
  api,
  entityLabel,
  detailLabel,
  detailTabIndex,
  titleField = 'documentNo',
  windowName,
  recordId,
  token,
  apiBaseUrl,
  breadcrumb,
  secondaryTabs = [],
  formFooter = null,
  draftMode = null,
  headerContent = null,
  customTabs = [],
  documentPreview,
  notesField,
  extraActions = [],
  menuActions = [],
  hideDeleteWhenComplete = false,
  hidePrint = false,
  CustomLines = null,
  customLinesLabel = 'Invoices',
  sidePanel = null,
  sidePanelStyle = null,
  afterTotals = null,
  bottomSection = null,
  topbarExtra = null,
  topbarRight = null,
  statusFieldLabel = null,
  statusEnumLabels = null,
  salesTheme = false,
  sidebarContent = null,
  othersLabel = null,
  primaryTabs = null,
  lockWhenProcessed = true,
  onAfterSave,
}) {
  const hook = useEntity(entity, detailEntity, { token, apiBaseUrl });
  const LinesEmptyState = bottomSection?.linesEmptyState ?? null;
  const DetailExtraActions = bottomSection?.detailExtraActions ?? null;
  // Static hooks for up to 4 secondary tabs (React rules forbid dynamic hook calls)
  const secondaryHook0 = useEntity(entity, secondaryTabs[0]?.isFormTab ? null : (secondaryTabs[0]?.key ?? null), { token, apiBaseUrl });
  const secondaryHook1 = useEntity(entity, secondaryTabs[1]?.isFormTab ? null : (secondaryTabs[1]?.key ?? null), { token, apiBaseUrl });
  const secondaryHook2 = useEntity(entity, secondaryTabs[2]?.isFormTab ? null : (secondaryTabs[2]?.key ?? null), { token, apiBaseUrl });
  const secondaryHook3 = useEntity(entity, secondaryTabs[3]?.isFormTab ? null : (secondaryTabs[3]?.key ?? null), { token, apiBaseUrl });
  const secondaryHooks = [secondaryHook0, secondaryHook1, secondaryHook2, secondaryHook3];
  const parentRecordId = hook.selected?.id ?? recordId ?? hook.editing?.id ?? null;
  const selectorContextByEntity = useMemo(() => {
    if (!parentRecordId) return {};

    const next = {};
    if (detailEntity) {
      next[detailEntity] = { parentId: parentRecordId };
    }
    for (const tab of secondaryTabs) {
      if (tab?.key) {
        next[tab.key] = { parentId: parentRecordId };
      }
    }
    return next;
  }, [detailEntity, parentRecordId, secondaryTabs]);
  const { catalogs, catalogsLoaded } = useCatalogs(api, token, apiBaseUrl, staticCatalogs, selectorContextByEntity);
  const displayLogic = useDisplayLogic(entity, hook.editing, { token, apiBaseUrl });
  const { calloutResult, calloutLoading, executeCallout } = useCallout(entity, { token, apiBaseUrl });
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const embedded = searchParams.get('embedded') === '1';
  const tMenu = useMenuLabel();
  const ui = useUI();
  const dictionary = useLocale();
  const [addingLine, setAddingLine] = useState(false);
  const [addingSecondaryLine, setAddingSecondaryLine] = useState({});
  const [activeTab, setActiveTab] = useState(0);

  // Document-level read-only: when processed===true, the entire record (including lines) is read-only.
  const _headerData = hook.selected ?? hook.editing;
  const isDocumentReadOnly = lockWhenProcessed && (_headerData?.processed === true || _headerData?.processed === 'Y');
  const isProcessed = _headerData?.processed === true || _headerData?.processed === 'Y';
  const [showPrint, setShowPrint] = useState(false);
  // showNotes state removed — notes panel is always visible in side-by-side layout
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef(null);

  useEffect(() => {
    if (!showMoreMenu) return;
    const handleClick = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMoreMenu]);
  const [directFetched, setDirectFetched] = useState(false);
  const [selectedLine, setSelectedLine] = useState(null);
  const [lineEdits, setLineEdits] = useState(null);
  const [lineEditColumns, setLineEditColumns] = useState({});
  const [savingLine, setSavingLine] = useState(false);
  const [isClosingLine, setIsClosingLine] = useState(false);
  const [editingChild, setEditingChild] = useState(null);
  const [savingChild, setSavingChild] = useState(false);

  const closeLine = useCallback(() => {
    setIsClosingLine(true);
    setTimeout(() => {
      setSelectedLine(null);
      setLineEdits(null);
      setLineEditColumns({});
      setIsClosingLine(false);
    }, 250);
  }, []);

  const [selectedSecondaryLine, setSelectedSecondaryLine] = useState(null);
  const [secondaryLineEdits, setSecondaryLineEdits] = useState(null);
  const [secondaryLineEditColumns, setSecondaryLineEditColumns] = useState({});
  const [savingSecondaryLine, setSavingSecondaryLine] = useState(false);
  const [isClosingSecondaryLine, setIsClosingSecondaryLine] = useState(false);

  const extractErrorMessage = useCallback(async (res) => {
    try {
      const data = await res.json();
      const err = data?.response?.error;
      if (err?.message) return err.message;
      if (typeof err === 'string') return err;
      if (data?.message) return data.message;
    } catch {
      // Ignore non-JSON error bodies.
    }
    return `Error ${res.status}`;
  }, []);

  const closeSecondaryLine = useCallback(() => {
    setIsClosingSecondaryLine(true);
    setTimeout(() => {
      setSelectedSecondaryLine(null);
      setSecondaryLineEdits(null);
      setSecondaryLineEditColumns({});
      setIsClosingSecondaryLine(false);
    }, 250);
  }, []);

  // Track fields whose values were set by a callout response to avoid re-triggering
  const calloutAppliedRef = useRef(new Set());

  const isNew = recordId === 'new';
  const currentItem = useMemo(() => {
    if (isNew) return null;
    return hook.items.find(item => String(item.id) === String(recordId)) || null;
  }, [hook.items, recordId, isNew]);

  useEffect(() => {
    if (isNew && !hook.editing) {
      hook.handleNew();
    }
  }, [isNew, hook.editing, hook.handleNew]);

  // Resolve $_identifier for default FK values and auto-select first option for
  // mandatory combo selectors (inputMode: "selector") that have no value.
  // This matches classic Etendo behavior: TableDir combos pre-select the first record
  // when the field is mandatory, while search fields don't (they require user input).
  useEffect(() => {
    if (!isNew || !hook.editing || !catalogsLoaded || !api?.selectors) return;
    for (const sel of api.selectors) {
      const val = hook.editing[sel.field];
      const options = getCatalogOptions(catalogs, sel.entity, sel);
      if (!Array.isArray(options) || options.length === 0) continue;

      if (val) {
        // Has a value — resolve its identifier if missing
        if (!hook.editing[sel.field + '$_identifier']) {
          const match = options.find(o => o.id === val);
          if (match) {
            hook.handleChange(sel.field + '$_identifier', match.label || match.name || match._identifier);
          }
        }
      } else if (sel.inputMode === 'selector') {
        // Combo/dropdown with no value — auto-select first option (Etendo TableDir behavior).
        // Only for editable fields; search/dependent fields require explicit user selection.
        const first = options[0];
        if (first) {
          hook.handleChange(sel.field, first.id);
          hook.handleChange(sel.field + '$_identifier', first.label || first.name || first._identifier);
        }
      }
    }
  }, [isNew, hook.editing, catalogsLoaded, catalogs, api]);

  useEffect(() => {
    if (isNew) return;
    if (currentItem && (!hook.selected || String(hook.selected.id) !== String(recordId))) {
      hook.handleSelect(currentItem);
      setDirectFetched(false);
    } else if (!currentItem && !hook.loading && recordId && !directFetched) {
      setDirectFetched(true);
      hook.fetchById(recordId);
    }
  }, [currentItem, recordId, hook.selected, hook.handleSelect]);

  // Reset selected line when the parent record changes
  useEffect(() => {
    setSelectedLine(null);
  }, [hook.selected?.id]);

  // Sync all secondary hooks with the selected parent record
  useEffect(() => {
    if (!hook.selected?.id) return;
    secondaryHooks.forEach((sh, i) => {
      if (secondaryTabs[i]) sh.handleSelect(hook.selected);
    });
  }, [hook.selected?.id]);

  // Apply callout results to the form when they arrive
  useEffect(() => {
    if (!calloutResult) return;
    const { updates, combos } = calloutResult;
    const appliedFields = new Set();

    if (updates) {
      for (const [key, entry] of Object.entries(updates)) {
        // Skip empty callout values if the field already has a non-empty value
        // (e.g., callout clears warehouse but defaults already set it)
        const currentVal = data[key];
        if ((entry.value === '' || entry.value == null) && currentVal && currentVal !== '') {
          continue;
        }
        appliedFields.add(key);
        hook.handleChange(key, entry.value);
        if (entry._identifier) {
          hook.handleChange(key + '$_identifier', entry._identifier);
        } else if (entry.value && api?.selectors) {
          // Callout returned an ID without _identifier — resolve from loaded catalogs
          const sel = api.selectors.find(s => s.field === key);
          if (sel) {
            const options = getCatalogOptions(catalogs, sel.entity, sel);
            const match = Array.isArray(options) && options.find(o => o.id === entry.value);
            if (match) {
              hook.handleChange(key + '$_identifier', match.label || match.name || match._identifier);
            }
          }
        }
      }
    }
    if (combos) {
      for (const [key, combo] of Object.entries(combos)) {
        let selectedVal = combo.selected;
        let selectedLabel = combo._identifier;
        // Auto-select first entry if no explicit selection (e.g., BP address combo)
        if (selectedVal == null && Array.isArray(combo.entries) && combo.entries.length > 0) {
          selectedVal = combo.entries[0].id;
          selectedLabel = combo.entries[0].identifier || combo.entries[0]._identifier;
        }
        if (selectedVal != null) {
          appliedFields.add(key);
          hook.handleChange(key, selectedVal);
          if (selectedLabel) {
            hook.handleChange(key + '$_identifier', selectedLabel);
          }
        }
      }
    }

    // Mark these fields so the next onChange doesn't re-trigger callout
    calloutAppliedRef.current = appliedFields;
  }, [calloutResult]);

  // Wrapped onChange that triggers callout for user-initiated FK changes
  const handleChangeWithCallout = useCallback((field, value) => {
    hook.handleChange(field, value);

    // Skip companion/auxiliary fields — they don't have callouts
    if (field.includes('$_identifier') || /^[a-zA-Z]+_[A-Z]{2,4}$/.test(field)) return;

    // If this field was just set by a callout response, don't re-trigger
    if (calloutAppliedRef.current.has(field)) {
      calloutAppliedRef.current.delete(field);
      return;
    }

    // Only trigger callout for meaningful value changes (not empty/typing artifacts).
    // Skip partial search text — only trigger when value looks like an Etendo ID
    // (32-char hex UUID or legacy numeric ID), not user-typed search strings.
    if (!value || value === '') return;
    if (!/^[0-9A-Fa-f]{32}$/.test(value) && !/^\d+$/.test(value)) return;

    // Trigger callout — the backend returns empty if no callout is registered
    executeCallout(field, value, hook.editing);
  }, [hook.handleChange, hook.editing, executeCallout]);

  // Execute callout for child entity (line-level) fields and apply results via callback.
  // Merges parent header data into formState so callouts have full context (e.g., priceList).
  const handleLineFieldChange = useCallback(async (field, value, rowValues, applyUpdates) => {
    if (!field || !value || value === '' || !token || !apiBaseUrl || !detailEntity) return;
    if (field.includes('$_identifier') || /^[a-zA-Z]+_[A-Z]{2,4}$/.test(field)) return;
    try {
      // Build formState: line row values + parent header fields for context
      const headerData = hook.editing || hook.selected || {};
      const formState = { ...rowValues };
      // Include header fields that callouts typically need (priceList, businessPartner, org, etc.)
      for (const [k, v] of Object.entries(headerData)) {
        if (!(k in formState) && v != null && v !== '') {
          formState[k] = v;
        }
      }
      // Extract auxiliary values (e.g., product_PSTD, product_UOM from selector _aux)
      const auxiliaryValues = {};
      for (const [k, v] of Object.entries(formState)) {
        if (/^[a-zA-Z]+_[A-Z]{2,4}$/.test(k) && v != null && v !== '') {
          auxiliaryValues[k] = String(v);
        }
      }
      const payload = {
        field,
        value,
        formState,
        ...(Object.keys(auxiliaryValues).length > 0 ? { auxiliaryValues } : {}),
      };
      const res = await fetch(`${apiBaseUrl}/${detailEntity}/callout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return;
      const calloutData = await res.json();
      const result = {};
      if (calloutData.updates) {
        for (const [k, entry] of Object.entries(calloutData.updates)) {
          result[k] = entry.value;
          if (entry._identifier) result[k + '$_identifier'] = entry._identifier;
        }
      }
      if (calloutData.combos) {
        for (const [k, combo] of Object.entries(calloutData.combos)) {
          if (combo.selected != null) {
            result[k] = combo.selected;
            if (combo._identifier) result[k + '$_identifier'] = combo._identifier;
          }
        }
      }
      // Resolve missing $_identifier from loaded catalogs for FK fields returned by callout
      // (e.g., callout sets uOM='100' but server omits the display name)
      if (api?.selectors) {
        for (const key of Object.keys(result)) {
          if (key.includes('$_identifier')) continue;
          if (result[key + '$_identifier']) continue;
          const selConfig = api.selectors.find(s => s.field === key && s.entity === detailEntity);
          if (!selConfig) continue;
          const opts = getCatalogOptions(catalogs, detailEntity, selConfig);
          const match = opts.find(o => o.id === result[key]);
          if (match) result[key + '$_identifier'] = match.label || match.name || match._identifier || '';
        }
      }
      // Last resort: check snapshot for a display hint passed by the selector item.
      // Pattern: field='product', result key='uOM' → look for rowValues['product_uOM'] = "Unit"
      for (const key of Object.keys(result)) {
        if (key.includes('$_identifier')) continue;
        if (result[key + '$_identifier']) continue;
        const hint = rowValues[field + '_' + key];
        if (hint && typeof hint === 'string') result[key + '$_identifier'] = hint;
      }
      if (Object.keys(result).length > 0) applyUpdates?.(result);
    } catch {
      // Callout is best-effort
    }
  }, [token, apiBaseUrl, detailEntity, hook.editing, hook.selected, catalogs, api]);

  const data = hook.editing || currentItem || {};
  const title = isNew
    ? ui('newRecord')
    : `${resolveIdentifier(data, titleField) || data._identifier || data.id || ''}`;

  const allEntryFields = addLineFields.entry ?? [];
  const hiddenEntryDefaults = addLineFields.hidden ?? [];
  const editableChildFields = allEntryFields.filter(f => f.type === 'number' || f.type === 'amount');

  // Build tabs: child entity lines + secondary tabs + "Others" tab for non-principal header fields
  const tabs = [];
  secondaryTabs.forEach((st, i) => {
    const childCount = !st.isFormTab ? (secondaryHooks[i]?.children?.length ?? null) : null;
    tabs.push({ key: st.key, label: st.label, count: childCount });
  });
  if (DetailTable) {
    const linesTab = { key: 'lines', label: detailLabel || detailEntity || 'Lines', count: hook.children?.length || 0 };
    if (typeof detailTabIndex === 'number' && detailTabIndex >= 0 && detailTabIndex <= tabs.length) {
      tabs.splice(detailTabIndex, 0, linesTab);
    } else {
      tabs.unshift(linesTab);
    }
  } else if (CustomLines) {
    tabs.unshift({ key: 'customLines', label: customLinesLabel });
  }
  // "Others" tab is added dynamically via othersRef after first render
  // When primaryTabs is in use, skip auto-adding Others (handled by a primary tab)
  const [showOthers, setShowOthers] = useState(primaryTabs ? false : null);
  const [activePrimaryTab, setActivePrimaryTab] = useState(primaryTabs?.[0]?.key ?? 'general');
  const [notesFocused, setNotesFocused] = useState(false);
  const othersRef = useRef(null);

  useEffect(() => {
    if (showOthers === null && othersRef.current) {
      // Check if the hidden probe rendered any DOM content
      setShowOthers(othersRef.current.childElementCount > 0);
    }
  });

  if (showOthers === true) {
    tabs.push({ key: 'others', label: othersLabel || ui('others') });
  }

  if (hook.loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        {ui('loading')}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" data-testid="detail-view">
      {/* Top bar area (gray background, inherited from parent) */}
      {!embedded && <div className="px-6 pt-3 pb-3">
        {/* Row: Title + Global search + action icons */}
        <div className="flex items-center gap-4">
          {/* Left: title + breadcrumb */}
          <div className="shrink-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{title}</h1>
            </div>
            {breadcrumb && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {breadcrumb.split(' / ').map(s => tMenu(s.trim())).join(' / ')}{title ? ` / ${title}` : ''}
              </p>
            )}
          </div>

          {/* Center: global search */}
          <div className="flex-1 flex justify-center">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={ui('searchPlaceholder')}
                readOnly
                tabIndex={-1}
                className="w-full h-9 rounded-lg border border-border/50 bg-white/60 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-colors cursor-default"
              />
              <Mic className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
            </div>
          </div>

          {/* Right: action icons */}
          <div className="flex items-center gap-1 shrink-0">
            <button className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <Sparkles className="h-4 w-4" />
            </button>
            <button className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <Plus className="h-4 w-4" />
            </button>
            <button className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="h-4 w-4" />
            </button>
            <LocaleSwitcher />
          </div>
        </div>
      </div>}

      {/* White content card with rounded top-left corner */}
      <div className="flex-1 flex flex-col bg-white rounded-tl-2xl overflow-hidden min-h-0">
        {/* Action bar: Cancel + status | actions + save */}
        {embedded ? (
          statusField && data[statusField] ? (
            <div className="flex items-center gap-3 px-6 py-3 border-b border-border/30">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[13px] font-medium ${getStatusPillClass(data[statusField])}`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${getStatusDotColor(data[statusField])}`} />
                {statusFieldLabel || 'Document Status'}
                <span style={{ opacity: 0.4 }}>&middot;</span>
                <span className="font-semibold">{statusEnumLabels?.[data[statusField]] || statusLabel(data[statusField])}</span>
              </span>
            </div>
          ) : null
        ) : (
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              data-testid="action-cancel"
              onClick={() => navigate(`/${windowName}`)}
            >
              <X className="h-3.5 w-3.5" />
              {ui('cancel')}
            </Button>
            {statusField && data[statusField] != null && (() => {
              const _s = data[statusField];
              return (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[13px] font-medium ${getStatusPillClass(_s)}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${getStatusDotColor(_s)}`} />
                  {statusFieldLabel || 'Document Status'}
                  <span style={{ opacity: 0.4 }}>&middot;</span>
                  <span className="font-semibold">{statusEnumLabels?.[_s] || statusLabel(_s, dictionary)}</span>
                </span>
              );
            })()}
            {extraBadges.map(b => {
              const when = b.when !== undefined ? b.when : true;
              const show = when ? !!data[b.key] : !data[b.key];
              if (!show) return null;
              if (b.hideWhenStatus?.includes(data[statusField])) return null;
              const cls = b.style === 'warning'
                ? 'ml-1 border-amber-300 bg-amber-50 text-amber-700'
                : 'ml-1 bg-blue-600 hover:bg-blue-700 border-transparent text-white';
              const variant = b.style === 'warning' ? 'outline' : 'default';
              return (
                <Badge key={`${b.key}-${when}`} variant={variant} className={cls}>
                  {b.label}
                </Badge>
              );
            })}
            {topbarExtra && (() => {
              const TopbarExtraComponent = topbarExtra;
              return <TopbarExtraComponent data={data} recordId={data?.id || recordId} token={token} apiBaseUrl={apiBaseUrl} api={api} onProcess={hook.handleProcess} />;
            })()}
          </div>

          <div className="flex items-center gap-2">
            {/* Topbar right slot (e.g. payment status badge) */}
            {topbarRight && (() => {
              const TopbarRightComponent = topbarRight;
              return <TopbarRightComponent data={data} recordId={data?.id || recordId} token={token} apiBaseUrl={apiBaseUrl} api={api} onProcess={hook.handleProcess} />;
            })()}
            {/* Send / Print document — uses DocumentPrintDrawer */}
            {documentPreview && !isNew && recordId && (
              <button
                onClick={() => setShowPrint(true)}
                className="h-9 w-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
                title={ui('sendPreview')}
                data-testid="action-document-preview"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
            {/* Print document — shown when documentPreview is not provided */}
            {!documentPreview && !hidePrint && !isNew && recordId && (
              <button
                onClick={() => setShowPrint(true)}
                className="h-9 w-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
                title={ui('print')}
              >
                <Printer className="h-4 w-4" />
              </button>
            )}
            {/* Delete record — hidden when hideDeleteWhenComplete and status matches */}
            {!isNew && recordId && !(hideDeleteWhenComplete && statusField && data?.[statusField] && data[statusField] !== 'DR' && data[statusField] !== 'RPAP') && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="h-9 w-9 flex items-center justify-center rounded-lg border border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                title={ui('delete')}
                data-testid="action-delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            {/* More actions */}
            <div className="relative" ref={moreMenuRef}>
              <button
                onClick={() => setShowMoreMenu(v => !v)}
                className="h-9 w-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {showMoreMenu && (() => {
                const resolvedActions = typeof menuActions === 'function'
                  ? menuActions({ data, status: data?.[statusField] })
                  : menuActions;
                const visibleActions = resolvedActions.filter(a => a.visible !== false);
                if (visibleActions.length === 0) return null;
                return (
                  <div
                    className="absolute right-0 top-full mt-1 z-50 bg-white py-1 min-w-[160px]"
                    style={{ border: '0.5px solid hsl(var(--border))', borderRadius: '8px' }}
                  >
                    {visibleActions.map((action, i) => (
                      <button
                        key={action.key || i}
                        type="button"
                        onClick={() => {
                          setShowMoreMenu(false);
                          if (action.columnName) {
                            hook.handleProcess?.({ columnName: action.columnName, name: action.key });
                          } else if (action.onClick) {
                            action.onClick();
                          }
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[13px] transition-colors ${
                          action.destructive
                            ? 'text-red-600 hover:bg-red-50'
                            : 'text-foreground hover:bg-secondary'
                        }`}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
            {/* Extra action buttons from page */}
            {(typeof extraActions === 'function' ? extraActions({ data, children: hook.children }) : extraActions).map((action, i) => (
              action.visible !== false && (
                <Button
                  key={action.key || i}
                  variant="outline"
                  size="sm"
                  className={action.className || ''}
                  onClick={action.onClick}
                >
                  {action.label}
                </Button>
              )
            ))}
            {/* Process buttons — only shown for existing records, evaluated locally or by server visibility */}
            {!isNew && processes
              .filter(p => p.displayLogicRaw
                ? evalDisplayLogicRaw(p.displayLogicRaw, data)
                : displayLogic?.visibility?.[p.name] !== false)
              .filter(p => !p.requiresLines || hook.children.length > 0)
              .map(p => {
                const isPrimary = p.style === 'positive';
                const btnClass = salesTheme
                  ? (p.style === 'destructive'
                    ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                    : isPrimary
                      ? 'bg-amber-400 text-black hover:bg-amber-500 border-transparent font-medium'
                      : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100')
                  : (p.style === 'destructive'
                    ? 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20'
                    : isPrimary
                      ? ''
                      : '');
                return (
                  <Button
                    key={p.name}
                    variant={isPrimary ? 'default' : 'outline'}
                    size="sm"
                    className={btnClass}
                    onClick={() => hook.handleProcess?.(p)}
                  >
                    {p.label}
                  </Button>
                );
              })}

            {draftMode?.enabled ? (
              <>
                <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground" data-testid="action-save-draft" onClick={async () => {
                  const saved = await hook.handleSave(data);
                  if (saved?.id && isNew) navigate(`/${windowName}/${saved.id}`, { replace: true });
                }}>
                  <Save className="h-3.5 w-3.5" />
                  {ui('saveDraft')}
                </Button>
                <Button size="sm" className="gap-1.5" data-testid="action-save" onClick={async () => {
                  const saved = await hook.handleSaveAndProcess(draftMode);
                  if (saved) {
                    if (onAfterSave) {
                      navigate(`/${windowName}`, { replace: true, state: { savedRecord: saved } });
                    } else if (saved.id && isNew) {
                      navigate(`/${windowName}/${saved.id}`, { replace: true });
                    }
                  }
                }}>
                  <Check className="h-3.5 w-3.5" />
                  {ui('save')} &amp; {draftMode.label || ui('process')}
                </Button>
              </>
            ) : (
              <Button size="sm" className="gap-1.5" data-testid="action-save" disabled={isDocumentReadOnly} onClick={async () => {
                const saved = await hook.handleSave(data);
                if (saved) {
                  if (onAfterSave) {
                    navigate(`/${windowName}`, { replace: true, state: { savedRecord: saved } });
                  } else if (saved.id && isNew) {
                    navigate(`/${windowName}/${saved.id}`, { replace: true });
                  }
                }
              }}>
                <Check className="h-3.5 w-3.5" />
                {ui('save')}
              </Button>
            )}
          </div>
        </div>
        )}

        {/* Primary tab bar (General / Additional Info / etc.) */}
        {primaryTabs && (
          <div className="flex border-b border-border/50 px-6 shrink-0">
            {primaryTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActivePrimaryTab(tab.key)}
                className={[
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative',
                  activePrimaryTab === tab.key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {tab.label}
                {activePrimaryTab === tab.key && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-foreground rounded-full" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Scrollable content + optional sidebarContent (full-height independent column) */}
        <div className="flex-1 flex overflow-hidden">
        {/* Non-general primary tab: show Panel fullscreen */}
        {primaryTabs && activePrimaryTab !== 'general' ? (() => {
          const activeTab = primaryTabs.find(t => t.key === activePrimaryTab);
          return activeTab?.Panel ? (
            <div className="flex-1 overflow-auto px-6 pb-6 min-w-0">
              <activeTab.Panel data={data} token={token} apiBaseUrl={apiBaseUrl} catalogs={catalogs} api={api} editing={hook.editing} onChange={handleChangeWithCallout} />
            </div>
          ) : null;
        })() : null}
        <div className={`flex-1 overflow-auto px-6 pb-6 min-w-0${primaryTabs && activePrimaryTab !== 'general' ? ' hidden' : ''}`}>
          {typeof headerContent === 'function' ? headerContent(data) : headerContent}
          <div className={`${sidePanel ? 'flex items-start gap-0' : ''}`}>
          <div className={`${sidePanel ? 'flex-1 min-w-0' : 'max-w-full'} space-y-6`}>
            {/* Principal header fields (horizontal row) */}
            {/* Visibility logic is intentionally not applied here: principal fields must always
                be visible (shown as readOnly when needed). Only readOnly state is propagated. */}
            <div style={{ padding: '24px 0 8px' }} className={embedded ? 'pointer-events-none' : ''}>
              <Form
                entity={entity}
                data={data}
                onChange={handleChangeWithCallout}
                catalogs={catalogs}
                layout="horizontal"
                section="principal"
                displayLogic={{ readOnly: displayLogic?.readOnly ?? {}, visibility: {} }}
                api={api}
                token={token}
                apiBaseUrl={apiBaseUrl}
              />
            </div>

            {/* Collapsible secondary header fields (hidden if no collapsed fields) */}
            <div className={`${sidePanel ? 'mt-2' : 'mt-6'}`}>
            <CollapsibleSection title={ui('moreDetails')}>
              <div className={embedded ? 'pointer-events-none' : ''}>
                <Form
                  entity={entity}
                  data={data}
                  onChange={handleChangeWithCallout}
                  catalogs={catalogs}
                  layout="horizontal"
                  section="collapsed"
                  excludeFields={notesField ? [notesField] : []}
                  displayLogic={displayLogic}
                  api={api}
                  token={token}
                  apiBaseUrl={apiBaseUrl}
                />
              </div>
            </CollapsibleSection>
            </div>

            {/* Form footer: inline content below form, above tabs (e.g. BillingPreferencesForm) */}
            {formFooter && (
              <div className={`pt-2${embedded ? ' pointer-events-none' : ''}`}>
                {React.createElement(formFooter, { data, onChange: handleChangeWithCallout, catalogs, api, token, apiBaseUrl })}
              </div>
            )}

            {/* Tabs: child entities + Others */}
            {tabs.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between border-b border-border/50">
                  <div className="flex items-center gap-0">
                    {tabs.map((tab, idx) => (
                      <button
                        key={tab.key}
                        onClick={() => { setActiveTab(idx); setSelectedLine(null); setSelectedSecondaryLine(null); }}
                        className={[
                          'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative',
                          activeTab === idx
                            ? 'text-foreground'
                            : 'text-muted-foreground hover:text-foreground',
                        ].join(' ')}
                      >
                        <List className="h-4 w-4" />
                        {tab.label}
                        {tab.count != null && (
                          <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 text-xs rounded-full bg-muted text-muted-foreground">
                            {tab.count}
                          </span>
                        )}
                        {activeTab === idx && (
                          <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-foreground rounded-full" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tab content: Lines */}
                {tabs[activeTab]?.key === 'lines' && DetailTable && (
                  hook.children.length === 0 && !addingLine && LinesEmptyState && hook.editing && !isDocumentReadOnly ? (
                    <LinesEmptyState
                      data={data}
                      onAddLine={() => { setAddingLine(true); setEditingChild(null); }}
                      recordId={data?.id || recordId}
                      token={token}
                      apiBaseUrl={apiBaseUrl}
                      onRefresh={() => hook.fetchChildren?.(data?.id || recordId)}
                    />
                  ) : (
                  <div className={`pt-3 flex items-start gap-4${embedded ? ' pointer-events-none' : ''}`}>
                    {/* Table + add button */}
                    <div className="flex-1 min-w-0">
                      <DetailTable
                        data={hook.children}
                        entity={detailEntity}
                        token={token}
                        apiBaseUrl={apiBaseUrl}
                        onRowClick={DetailForm ? (row) => setSelectedLine(row) : undefined}
                        selectedRowId={selectedLine?.id}
                        showFooterTotals={!summary.some(f => f.type === 'amount')}
                        addRow={{
                          active: addingLine,
                          fields: allEntryFields,
                          onAdd: async (lineData) => {
                            // Send all values: entry fields + callout-derived values (tax, prices, uOM, etc.).
                            // handleAddChild filters out internal keys (_identifier, _aux, CURSOR_FIELD, etc.)
                            // Also include hidden entry defaults (e.g., fields with predefined values).
                            for (const hiddenField of hiddenEntryDefaults) {
                              if (!(hiddenField.key in lineData)) {
                                lineData[hiddenField.key] = hiddenField.value;
                              }
                            }
                            return hook.handleAddChild?.(lineData);
                          },
                          onCancel: () => setAddingLine(false),
                          catalogs,
                          onFieldChange: handleLineFieldChange,
                        }}
                      />

                      {/* Inline edit form for selected child row (when no DetailForm) */}
                      {!DetailForm && editingChild && editableChildFields.length > 0 && (
                        <div className="mt-3 p-4 border rounded-lg bg-muted/20">
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-3">
                            {editableChildFields.map(f => (
                              <div key={f.key} className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-muted-foreground">{f.label || f.key}</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editingChild[f.key] ?? ''}
                                  onChange={e => setEditingChild(prev => ({ ...prev, [f.key]: e.target.value }))}
                                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                                />
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <button
                              disabled={savingChild}
                              onClick={async () => {
                                setSavingChild(true);
                                try {
                                  const childUrl = api?.crud?.[detailEntity]?.detailUrl?.replace('{id}', editingChild.id)
                                    || `${apiBaseUrl}/${detailEntity}/${editingChild.id}`;
                                  const fieldValues = {};
                                  for (const f of editableChildFields) {
                                    fieldValues[f.column] = editingChild[f.key];
                                  }
                                  const res = await fetch(childUrl, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                    body: JSON.stringify({ fieldValues }),
                                  });
                                  if (res.ok) {
                                    hook.handleUpdateChild(editingChild.id, editableChildFields.reduce((acc, f) => ({ ...acc, [f.key]: editingChild[f.key] }), {}));
                                    setEditingChild(null);
                                  }
                                } finally { setSavingChild(false); }
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                              {savingChild ? ui('loading') : ui('save')}
                            </button>
                            <button
                              onClick={() => setEditingChild(null)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border hover:bg-accent"
                            >
                              {ui('cancel')}
                            </button>
                            <button
                              disabled={savingChild}
                              onClick={async () => {
                                if (!window.confirm(ui('deleteConfirmMessage'))) return;
                                setSavingChild(true);
                                try {
                                  const childUrl = api?.crud?.[detailEntity]?.detailUrl?.replace('{id}', editingChild.id)
                                    || `${apiBaseUrl}/${detailEntity}/${editingChild.id}`;
                                  const res = await fetch(childUrl, {
                                    method: 'DELETE',
                                    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                  });
                                  if (res.ok) { hook.handleDeleteChild(editingChild.id); setEditingChild(null); }
                                } finally { setSavingChild(false); }
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border border-destructive text-destructive hover:bg-destructive/10 disabled:opacity-50 ml-auto"
                            >
                              {ui('delete')}
                            </button>
                          </div>
                        </div>
                      )}

                      {hook.editing && !isDocumentReadOnly && ((!isNew && allEntryFields.length > 0) || DetailExtraActions) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '0.5px solid var(--color-border-tertiary, #e5e7eb)', padding: '10px 16px' }}>
                          {allEntryFields.length > 0 && !isNew && (
                            <button
                              onClick={() => { setAddingLine(!addingLine); setEditingChild(null); }}
                              style={{ all: 'unset', fontSize: 13, fontWeight: 500, color: 'var(--color-text-info, #2563eb)', cursor: 'pointer' }}
                            >
                              + Add {detailLabel || 'Lines'}
                            </button>
                          )}
                          {DetailExtraActions && (
                            <DetailExtraActions data={data} recordId={data?.id || recordId} token={token} apiBaseUrl={apiBaseUrl} onRefresh={() => hook.fetchChildren?.(data?.id || recordId)} />
                          )}
                        </div>
                      )}
                      {allEntryFields.length > 0 && isNew && (
                        <p className="text-xs text-muted-foreground mt-3">Save the header first to add lines.</p>
                      )}
                    </div>

                    {/* Right sidebar: line detail form */}
                    {DetailForm && (selectedLine || isClosingLine) && (
                      <div className={`w-[48rem] shrink-0 border-l border-border pl-4 self-stretch overflow-hidden ${isClosingLine ? 'sidebar-slide-out' : 'sidebar-slide-in'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-foreground">{detailLabel || 'Line'} Detail</span>
                          <button
                            onClick={closeLine}
                            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <DetailForm
                          data={lineEdits ?? selectedLine}
                          readOnly={!hook.editing || isProcessed}
                          onChange={(key, val, column) => {
                            setLineEdits(prev => ({ ...(prev ?? selectedLine), [key]: val }));
                            if (column) setLineEditColumns(prev => ({ ...prev, [key]: column }));
                          }}
                          entity={detailEntity}
                          catalogs={catalogs}
                          token={token}
                          apiBaseUrl={apiBaseUrl}
                          selectorContext={selectorContextByEntity[detailEntity]}
                        />
                        {hook.editing && (lineEdits || selectedLine?.id) && (
                          <div className="flex gap-2 mt-4">
                            {lineEdits && !isDocumentReadOnly && (
                              <>
                                <button
                                  disabled={savingLine}
                                  onClick={async () => {
                                    setSavingLine(true);
                                    try {
                                      const childUrl = api?.crud?.[detailEntity]?.detailUrl?.replace('{id}', selectedLine.id)
                                        || `${apiBaseUrl}/${detailEntity}/${selectedLine.id}`;
                                      const fieldValues = {};
                                      for (const [k, v] of Object.entries(lineEdits)) {
                                        if (k.endsWith('$_identifier')) continue;
                                        const colName = lineEditColumns[k] || k;
                                        // Convert numeric strings to numbers for BigDecimal compatibility.
                                        // Only strip when the value is already in standard format (no commas).
                                        // Comma removal is skipped to avoid locale corruption (e.g. Spanish "10,50" = 10.5).
                                        if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) {
                                          fieldValues[colName] = parseFloat(v);
                                        } else {
                                          fieldValues[colName] = v;
                                        }
                                      }
                                      const res = await fetch(childUrl, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                        body: JSON.stringify(fieldValues),
                                      });
                                      if (res.ok) {
                                        hook.handleUpdateChild(selectedLine.id, lineEdits);
                                        setSelectedLine(prev => ({ ...prev, ...lineEdits }));
                                        setLineEdits(null);
                                        setLineEditColumns({});
                                        toast.success('Record saved');
                                      } else {
                                        toast.error(await extractErrorMessage(res));
                                      }
                                    } catch (err) {
                                      toast.error(err.message || 'Network error');
                                    } finally { setSavingLine(false); }
                                  }}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                >
                                  {savingLine ? ui('loading') : ui('save')}
                                </button>
                                <button
                                  onClick={() => setLineEdits(null)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border hover:bg-accent"
                                >
                                  {ui('discard')}
                                </button>
                              </>
                            )}
                            {(api?.crud?.[detailEntity]?.delete ?? true) && selectedLine?.id && !isDocumentReadOnly && (
                              <button
                                disabled={savingLine}
                                onClick={async () => {
                                  if (!window.confirm(ui('deleteConfirmMessage'))) return;
                                  setSavingLine(true);
                                  try {
                                    const childUrl = api?.crud?.[detailEntity]?.detailUrl?.replace('{id}', selectedLine.id)
                                      || `${apiBaseUrl}/${detailEntity}/${selectedLine.id}`;
                                    const res = await fetch(childUrl, {
                                      method: 'DELETE',
                                      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                    });
                                    if (res.ok) {
                                      hook.handleDeleteChild(selectedLine.id);
                                      toast.success('Record deleted');
                                      closeLine();
                                    } else {
                                      toast.error(await extractErrorMessage(res));
                                    }
                                  } catch (err) {
                                    toast.error(err.message || 'Network error');
                                  } finally { setSavingLine(false); }
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border border-destructive text-destructive hover:bg-destructive/10 disabled:opacity-50 ml-auto"
                              >
                                <Trash2 className="h-4 w-4" />
                                {ui('delete')}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  )
                )}

                {/* Tab content: CustomLines (replaces standard lines table) */}
                {tabs[activeTab]?.key === 'customLines' && CustomLines && (
                  <div className={`pt-3${embedded ? ' pointer-events-none' : ''}`}>
                    <CustomLines
                      recordId={data?.id || recordId}
                      data={data}
                      status={data?.[statusField]}
                      token={token}
                      apiBaseUrl={apiBaseUrl}
                      api={api}
                      editing={hook.editing}
                      onRefresh={() => hook.fetchChildren?.(data?.id || recordId)}
                    />
                  </div>
                )}

                {/* Tab content: secondary child entity tabs (or form-only tabs) */}
                {secondaryTabs.map((st, stIdx) => tabs[activeTab]?.key === st.key && (
                  <div key={st.key} className={`pt-3 flex flex-col gap-3${embedded ? ' pointer-events-none' : ''}`}>
                    {st.isFormTab ? (
                      <div className="flex-1 min-w-0">
                        <st.Form
                          data={data ?? {}}
                          readOnly={!hook.editing}
                          onChange={(key, val, column) => {
                            setSecondaryLineEdits(prev => ({ ...(prev ?? {}), [key]: val }));
                            if (column) setSecondaryLineEditColumns(prev => ({ ...prev, [key]: column }));
                          }}
                          entity={st.key}
                          catalogs={catalogs}
                          token={token}
                          apiBaseUrl={apiBaseUrl}
                          selectorContext={selectorContextByEntity[st.key]}
                        />
                      </div>
                    ) : st.Panel ? (
                      <div className="flex-1 min-w-0">
                        <st.Panel
                          parentId={data?.id}
                          token={token}
                          apiBaseUrl={apiBaseUrl}
                        />
                      </div>
                    ) : (
                    <>
                    <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <st.Table
                        data={secondaryHooks[stIdx]?.children ?? []}
                        entity={st.key}
                        selectorContext={selectorContextByEntity[st.key]}
                        onRowClick={st.Form ? (row) => { setSelectedSecondaryLine({ ...row, _tabKey: st.key }); setSecondaryLineEdits(null); } : undefined}
                        selectedRowId={selectedSecondaryLine?._tabKey === st.key ? selectedSecondaryLine?.id : undefined}
                        addRow={st.addLineFields?.entry?.length > 0 ? {
                          active: addingSecondaryLine[st.key] ?? false,
                          fields: st.addLineFields.entry,
                          onAdd: async (lineData) => {
                            const entryKeys = new Set(st.addLineFields.entry.map(f => f.key));
                            const filtered = {};
                            for (const [k, v] of Object.entries(lineData)) {
                              if (entryKeys.has(k)) filtered[k] = v;
                            }
                            const result = await secondaryHooks[stIdx]?.handleAddChild?.(filtered);
                            if (result) setAddingSecondaryLine(prev => ({ ...prev, [st.key]: false }));
                            return result;
                          },
                          onCancel: () => setAddingSecondaryLine(prev => ({ ...prev, [st.key]: false })),
                          catalogs,
                        } : undefined}
                      />
                    </div>
                    {st.Form && !st.Panel && (selectedSecondaryLine?._tabKey === st.key || isClosingSecondaryLine) && (
                      <div className={`w-[48rem] shrink-0 border-l border-border pl-4 self-stretch overflow-hidden ${isClosingSecondaryLine ? 'sidebar-slide-out' : 'sidebar-slide-in'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-foreground">{st.label} Detail</span>
                          <button
                            onClick={closeSecondaryLine}
                            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <st.Form
                          data={secondaryLineEdits ?? selectedSecondaryLine}
                          readOnly={!hook.editing}
                          onChange={(key, val, column) => {
                            setSecondaryLineEdits(prev => ({ ...(prev ?? selectedSecondaryLine), [key]: val }));
                            if (column) setSecondaryLineEditColumns(prev => ({ ...prev, [key]: column }));
                          }}
                          entity={st.key}
                          catalogs={catalogs}
                          token={token}
                          apiBaseUrl={apiBaseUrl}
                          selectorContext={selectorContextByEntity[st.key]}
                        />
                        {hook.editing && (secondaryLineEdits || selectedSecondaryLine?.id) && (
                          <div className="flex gap-2 mt-4">
                            {secondaryLineEdits && (
                              <>
                                <button
                                  disabled={savingSecondaryLine}
                                  onClick={async () => {
                                    setSavingSecondaryLine(true);
                                    try {
                                      const secUrl = `${apiBaseUrl}/${st.key}/${selectedSecondaryLine.id}`;
                                      const fieldValues = {};
                                      for (const [k, v] of Object.entries(secondaryLineEdits)) {
                                        if (k.endsWith('$_identifier')) continue;
                                        const colName = secondaryLineEditColumns[k] || k;
                                        // Convert numeric strings to numbers for BigDecimal compatibility.
                                        // Only strip when the value is already in standard format (no commas).
                                        // Comma removal is skipped to avoid locale corruption (e.g. Spanish "10,50" = 10.5).
                                        if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) {
                                          fieldValues[colName] = parseFloat(v);
                                        } else {
                                          fieldValues[colName] = v;
                                        }
                                      }
                                      const res = await fetch(secUrl, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                        body: JSON.stringify(fieldValues),
                                      });
                                      if (res.ok) {
                                        setSelectedSecondaryLine(prev => ({ ...prev, ...secondaryLineEdits }));
                                        setSecondaryLineEdits(null);
                                        setSecondaryLineEditColumns({});
                                        toast.success('Record saved');
                                      } else {
                                        toast.error(await extractErrorMessage(res));
                                      }
                                    } catch (err) {
                                      toast.error(err.message || 'Network error');
                                    } finally { setSavingSecondaryLine(false); }
                                  }}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                >
                                  {savingSecondaryLine ? ui('loading') : ui('save')}
                                </button>
                                <button
                                  onClick={() => setSecondaryLineEdits(null)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border hover:bg-accent"
                                >
                                  {ui('discard')}
                                </button>
                              </>
                            )}
                            {(api?.crud?.[st.key]?.delete ?? true) && selectedSecondaryLine?.id && (
                              <button
                                disabled={savingSecondaryLine}
                                onClick={async () => {
                                  if (!window.confirm(ui('deleteConfirmMessage'))) return;
                                  setSavingSecondaryLine(true);
                                  try {
                                    const secUrl = `${apiBaseUrl}/${st.key}/${selectedSecondaryLine.id}`;
                                    const res = await fetch(secUrl, {
                                      method: 'DELETE',
                                      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                    });
                                    if (res.ok) {
                                      secondaryHooks[stIdx]?.handleDeleteChild(selectedSecondaryLine.id);
                                      toast.success('Record deleted');
                                      closeSecondaryLine();
                                    } else {
                                      toast.error(await extractErrorMessage(res));
                                    }
                                  } catch (err) {
                                    toast.error(err.message || 'Network error');
                                  } finally { setSavingSecondaryLine(false); }
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border border-destructive text-destructive hover:bg-destructive/10 disabled:opacity-50 ml-auto"
                              >
                                <Trash2 className="h-4 w-4" />
                                {ui('delete')}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    </div>
                    {st.addLineFields?.entry?.length > 0 && hook.editing && (
                      <button
                        onClick={() => { setAddingSecondaryLine(prev => ({ ...prev, [st.key]: !prev[st.key] })); setSelectedSecondaryLine(null); }}
                        className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        + Add {st.label}
                      </button>
                    )}
                    </>
                    )}
                    </div>
                ))}

                {/* Tab content: Others (secondary header fields) */}
                {tabs[activeTab]?.key === 'others' && (
                  <div className={`pt-5${embedded ? ' pointer-events-none' : ''}`}>
                    <Form
                      entity={entity}
                      data={data}
                      onChange={handleChangeWithCallout}
                      catalogs={catalogs}
                      layout="horizontal"
                      section="other"
                      displayLogic={displayLogic}
                      api={api}
                      token={token}
                      apiBaseUrl={apiBaseUrl}
                    />
                  </div>
                )}

              </div>
            )}

            {/* Hidden probe: detect if Others form has content (outside tabs block so it fires even when tabs is empty) */}
            {showOthers === null && (
              <div ref={othersRef} className="hidden">
                <Form
                  entity={entity}
                  data={data}
                  onChange={() => {}}
                  catalogs={catalogs}
                  section="other"
                />
              </div>
            )}

            {/* Simple entity (no child): full form only */}
            {!DetailTable && (
              <>
                {summary.length > 0 && (
                  <div className="mt-1">
                    <SummaryBar fields={summary} data={data} />
                  </div>
                )}
              </>
            )}

            {/* Bottom section: custom (two-column) or default (totals + footer) */}
            {bottomSection ? (() => {
              const BottomComponent = bottomSection;
              return (
                <BottomComponent
                  recordId={data?.id || recordId}
                  data={data}
                  token={token}
                  apiBaseUrl={apiBaseUrl}
                  api={api}
                  summary={summary}
                  notesField={notesField}
                  onFieldChange={handleChangeWithCallout}
                  notesFocused={notesFocused}
                  setNotesFocused={setNotesFocused}
                />
              );
            })() : (
              <>
                {/* Totals block: Subtotal / Tax / Total */}
                {(() => {
                  const subtotalField = summary.find(f => f.type === 'amount' && (f.key.toLowerCase().includes('summed') || f.key.toLowerCase().includes('totallines') || f.key.toLowerCase().includes('lineamount')));
                  const totalField = summary.find(f => f.type === 'amount' && (f.key.toLowerCase().includes('grand') || (f.key.toLowerCase().includes('total') && !f.key.toLowerCase().includes('line'))));
                  if (!subtotalField && !totalField) return null;
                  const subtotal = subtotalField ? data[subtotalField.key] : null;
                  const total = totalField ? data[totalField.key] : null;
                  const taxes = (subtotal != null && total != null) ? total - subtotal : null;
                  const currency = data['currency$_identifier'];
                  return (
                    <div className="mt-1 flex justify-end">
                      <div className="w-64 text-sm" style={{ borderTopWidth: '0.5px' }}>
                        {subtotal != null && (
                          <div className="flex justify-between py-1.5 px-2">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span className="tabular-nums">{formatAmount(subtotal, currency)}</span>
                          </div>
                        )}
                        {taxes != null && taxes !== 0 && (
                          <div className="flex justify-between py-1.5 px-2">
                            <span className="text-muted-foreground">Tax</span>
                            <span className="tabular-nums">{formatAmount(taxes, currency)}</span>
                          </div>
                        )}
                        {total != null && (
                          <div className="flex justify-between py-1.5 px-2 border-t border-border/40 font-semibold" style={{ borderTopWidth: '0.5px' }}>
                            <span>Total</span>
                            <span className="tabular-nums">{formatAmount(total, currency)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* After-totals slot (e.g. payment footer) */}
                {afterTotals && (() => {
                  const AfterTotalsComponent = afterTotals;
                  return <AfterTotalsComponent recordId={data?.id || recordId} data={data} token={token} apiBaseUrl={apiBaseUrl} api={api} />;
                })()}

                {/* Footer: Related Docs + Notes */}
                {(customTabs.length > 0 || !!notesField) && (
                  <div className="mt-1 bg-muted/20 border-t border-border/40" style={{ borderTopWidth: '0.5px' }}>
                    {customTabs.length > 0 && (
                      <div className={`flex items-start gap-3 px-4 py-2.5 border-b border-border/30${embedded ? ' pointer-events-none' : ''}`} style={{ borderBottomWidth: '0.5px' }}>
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pt-0.5 shrink-0 w-20">Docs</span>
                        <div className="flex-1">
                          {customTabs.map(ct => {
                            const TabComponent = ct.Component;
                            return (
                              <TabComponent
                                key={ct.key}
                                recordId={data?.id || recordId}
                                data={data}
                                token={token}
                                apiBaseUrl={apiBaseUrl}
                                api={api}
                                layout="chips"
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {notesField && (
                      <div className={`flex items-start gap-3 px-4 py-2.5${embedded ? ' pointer-events-none' : ''}`}>
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pt-1.5 shrink-0 w-20">Notes</span>
                        <div className={`flex-1 flex flex-col border border-border/40 rounded bg-white transition-all py-1.5`} style={{ borderWidth: '0.5px' }}>
                          {notesFocused ? (
                            <textarea
                              value={data[notesField] || ''}
                              onChange={(e) => handleChangeWithCallout(notesField, e.target.value)}
                              onBlur={() => setNotesFocused(false)}
                              placeholder="Description"
                              rows={3}
                              autoFocus
                              className="w-full text-sm bg-transparent px-2 py-0.5 resize-none focus:outline-none placeholder:text-muted-foreground/40"
                            />
                          ) : (
                            <div
                              tabIndex={0}
                              role="textbox"
                              onClick={() => setNotesFocused(true)}
                              onFocus={() => setNotesFocused(true)}
                              className="w-full text-sm px-2 py-0.5 cursor-text min-h-[1.5rem] whitespace-pre-wrap break-words text-foreground/80"
                            >
                              {data[notesField] || <span className="text-muted-foreground/40">Description</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          {sidePanel && (
            <div
              className="w-[280px] shrink-0 border-l border-border/50 self-stretch bg-muted/20 px-4"
              style={{ borderLeftWidth: '1px', ...sidePanelStyle }}
            >
              {typeof sidePanel === 'function'
                ? React.createElement(sidePanel, { recordId: data?.id || recordId, data, token, apiBaseUrl, api })
                : sidePanel}
            </div>
          )}
          </div>
        </div>
        {sidebarContent && (
          <div className="w-96 shrink-0 border-l border-gray-100 overflow-y-auto p-5 bg-gray-50/40">
            {typeof sidebarContent === 'function' ? sidebarContent(data) : sidebarContent}
          </div>
        )}
        </div>
      </div>
      <DocumentPrintDrawer
        open={showPrint}
        onClose={() => setShowPrint(false)}
        windowName={windowName}
        documentIds={recordId ? [recordId] : []}
        token={token}
      />
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{ui('deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {ui('deleteConfirmMessage')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">{ui('cancel')}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              data-testid="action-delete-confirm"
              onClick={async () => {
                setShowDeleteConfirm(false);
                await hook.handleDelete();
                navigate(`/${windowName}`);
              }}
            >
              {ui('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
