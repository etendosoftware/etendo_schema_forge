import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { AddLineButton } from '@/components/ui/add-line-button.jsx';
import { X, MoreVertical, Check, Save, List, Printer, Send, Trash2, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog.jsx';
import { useEntity } from '@/hooks/useEntity';
import { useCatalogs } from '@/hooks/useCatalogs';
import { useDisplayLogic } from '@/hooks/useDisplayLogic';
import { useCallout } from '@/hooks/useCallout';
import { useLineGrossAmount, ORDER_LINE_CONFIG } from '@/hooks/useLineGrossAmount';
import { useDocumentAction } from '@/hooks/useDocumentAction';
import { useMenuLabel, useUI } from '@/i18n';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { useFavorites } from '@/components/layout/FavoritesContext';
import { SummaryBar } from './SummaryBar.jsx';
import DocumentTotalsPanel from './DocumentTotalsPanel.jsx';
import { resolveIdentifier } from '@/lib/resolveIdentifier.js';
import {
  buildCalloutFormState, extractAuxValues, normalizeCalloutQty,
  normalizeCalloutResponse, applyQtyZeroGuard, roundAmounts,
  resolveSnapshotIdentifiers,
} from '@/lib/lineFieldChange.js';
import { getCatalogOptions } from '@/lib/selectorCatalog.js';
import { formatAmount } from '@/lib/formatAmount.js';
import DocumentStatusPill from './DocumentStatusPill.jsx';

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
import DocumentPrintDrawer from './DocumentPrintDrawer.jsx';
import { toast } from 'sonner';

/**
 * Collapsible section that hides itself entirely when children render as null.
 */
function CollapsibleSection({ title, children }) {
  const ref = useRef(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    // Check for actual form fields — wrapper divs always render even when
    // EntityForm returns null, so we must look for real input elements.
    if (ref.current) {
      const hasFields = ref.current.querySelector(
        'input, select, textarea, [role="combobox"], [role="spinbutton"]'
      ) !== null;
      setEmpty(!hasFields);
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
  customMenuContent = null,
  hideDeleteWhenComplete = false,
  hidePrint = false,
  hideSaveStatuses = [],
  hideMoreMenu = false,
  hideMoreDetails = false,
  noHeaderBorder = false,
  toolbarBorderBottom = false,
  tabsBarRightDivider = null,
  tabsBarRight = null,
  hideTopBar = false,
  CustomLines = null,
  customLinesLabel = 'Invoices',
  sidePanel = null,
  sidePanelStyle = null,
  afterTotals = null,
  bottomSection = null,
  linesEmptyState = null,
  topbarExtra = null,
  topbarRight = null,
  statusFieldLabel = null,
  statusEnumLabels = null,
  salesTheme = false,
  sidebarContent = null,
  othersLabel = null,
  primaryTabs = null,
  contentBg = 'bg-white',
  lineConfig = ORDER_LINE_CONFIG,
  lockWhenProcessed = true,
  addLineGuard = null,
  showDetailFooterTotals = undefined,
  onAfterSave,
  onAfterCreate,
  additionalDirtyState = false,
  labelOverrides,
  enableSecondaryRowDelete = false,
  sidebarClassName = 'w-96 shrink-0 overflow-y-auto pt-0 pl-0 pr-4 pb-5',
  autoSaveOnBlur = false,
  refetchAfterSave = false,
}) {
  // DetailView never needs the parent list: on `/new` there is no record to match, and on
  // `/:id` the currentItem shortcut only helps when we arrived from ListView (items already
  // in memory from the other hook instance). On a direct URL hit `items` is empty anyway and
  // the effect falls through to fetchById. Skipping the list fetch unconditionally drops one
  // wasted GET per direct-URL navigation.
  const hook = useEntity(entity, detailEntity, { token, apiBaseUrl, skipListFetch: true, refetchAfterSave });
  const LinesEmptyState = linesEmptyState ?? bottomSection?.linesEmptyState ?? null;
  const DetailExtraActions = bottomSection?.detailExtraActions ?? null;
  // Static hooks for up to 4 secondary tabs (React rules forbid dynamic hook calls).
  // Secondary hooks only consume child-level state (children, handleAddChild, handleDeleteChild,
  // handleSelect) — never the parent list. skipListFetch avoids refetching the parent entity
  // list once per hook (which would otherwise cause N+1 identical GETs on mount).
  const secondaryHook0 = useEntity(entity, (secondaryTabs[0]?.isFormTab || secondaryTabs[0]?.Panel) ? null : (secondaryTabs[0]?.key ?? null), { token, apiBaseUrl, skipListFetch: true });
  const secondaryHook1 = useEntity(entity, (secondaryTabs[1]?.isFormTab || secondaryTabs[1]?.Panel) ? null : (secondaryTabs[1]?.key ?? null), { token, apiBaseUrl, skipListFetch: true });
  const secondaryHook2 = useEntity(entity, (secondaryTabs[2]?.isFormTab || secondaryTabs[2]?.Panel) ? null : (secondaryTabs[2]?.key ?? null), { token, apiBaseUrl, skipListFetch: true });
  const secondaryHook3 = useEntity(entity, (secondaryTabs[3]?.isFormTab || secondaryTabs[3]?.Panel) ? null : (secondaryTabs[3]?.key ?? null), { token, apiBaseUrl, skipListFetch: true });
  const secondaryHooks = [secondaryHook0, secondaryHook1, secondaryHook2, secondaryHook3];
  const parentRecordId = hook.selected?.id ?? recordId ?? hook.editing?.id ?? null;

  const handleFieldBlur = useCallback(() => {
    if (!hook.editing || !hook.selected) return;
    const hasChanges = Object.entries(hook.editing).some(
      ([key, value]) => key !== 'id' && value !== hook.selected[key]
    );
    if (hasChanges) hook.handleSave();
  }, [hook]);
  // Depend on the single scalar the memo reads from editing/selected, not the whole objects.
  // Keeps original semantics: prefer editing when present (even if priceList is null), else selected.
  const priceListId = (hook.editing || hook.selected)?.priceList ?? null;
  // Stringify secondary-tab keys so the memo is immune to the `secondaryTabs = []` default
  // recreating a new array reference on every render.
  const secondaryTabKeysStr = secondaryTabs.map(t => t?.key ?? '').join('|');

  const selectorContextByEntity = useMemo(() => {
    // Derive isSOTrx from window category so NEO's validation filter resolves
    // @isSOTrx@ in M_PriceList.issopricelist = @isSOTrx@, showing only sales or
    // purchase price lists depending on the document type.
    const category = api?.window?.category;
    const isSOTrx = category === 'sales' ? 'Y' : category === 'purchases' ? 'N' : null;

    // Derive isCustomer/isVendor from window category so the BusinessPartner selector
    // shows only customers (sales) or vendors (purchases).
    const isCustomer = category === 'sales' ? 'Y' : null;
    const isVendor = category === 'purchases' ? 'Y' : null;

    const next = {};
    // Primary entity (header): inject isSOTrx, isCustomer, isVendor
    if (entity) {
      next[entity] = {
        ...(isSOTrx ? { isSOTrx } : {}),
        ...(isCustomer ? { isCustomer } : {}),
        ...(isVendor ? { isVendor } : {}),
      };
    }
    if (!parentRecordId) return next;
    if (detailEntity) {
      // DateInvoiced is required by the C_Tax validationRule:
      // VALIDFROM <= COALESCE(@DateInvoiced@, @DateOrdered@)
      // Without it, COALESCE(null,null)=null → VALIDFROM<=null is always FALSE → no taxes returned.
      // Etendo Classic's PL/pgSQL to_date() expects DD-MM-YYYY, so the ISO date from the
      // header (YYYY-MM-DD) must be reformatted before being sent as a context param.
      const headerSnapshot = hook.selected ?? hook.editing;
      const invoiceDate = headerSnapshot?.invoiceDate ?? headerSnapshot?.orderDate ?? null;
      const isoMatch = typeof invoiceDate === 'string' ? invoiceDate.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
      const dateInvoicedParam = isoMatch ? `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}` : invoiceDate;
      next[detailEntity] = {
        parentId: parentRecordId,
        ...(isSOTrx ? { isSOTrx, IsSOTrx: isSOTrx } : {}),
        ...(priceListId ? { priceList: priceListId } : {}),
        ...(dateInvoicedParam ? { DateInvoiced: dateInvoicedParam } : {}),
      };
    }
    for (const key of secondaryTabKeysStr.split('|').filter(Boolean)) {
      next[key] = { parentId: parentRecordId };
    }
    return next;
  }, [entity, detailEntity, parentRecordId, secondaryTabKeysStr, priceListId, api, hook.selected, hook.editing]);
  const { catalogs, catalogsLoaded } = useCatalogs(api, token, apiBaseUrl, staticCatalogs);
  const displayLogic = useDisplayLogic(entity, hook.editing, { token, apiBaseUrl });
  const { calloutResult, calloutLoading, executeCallout } = useCallout(entity, { token, apiBaseUrl });
  const docAction = useDocumentAction({ apiBaseUrl, entity, token });
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const embedded = searchParams.get('embedded') === '1';
  const tMenu = useMenuLabel();
  const ui = useUI();
  const [addingLine, setAddingLine] = useState(false);
  // Live snapshot of the in-progress add-row values — updated on every keystroke
  // so DocumentTotalsPanel can compute real-time totals before the line is saved.
  const [pendingLineValues, setPendingLineValues] = useState(null);
  const [addingSecondaryLine, setAddingSecondaryLine] = useState({});
  const [forceOpenImport, setForceOpenImport] = useState(false);
  // Imperative handles to in-progress inline add rows so we can commit them
  // before header save (mirrors clicking the green check on an editing line).
  const primaryAddRowRef = useRef(null);
  const secondaryAddRowRefs = useRef({});
  const getSecondaryAddRowRef = useCallback((key) => {
    if (!secondaryAddRowRefs.current[key]) {
      secondaryAddRowRefs.current[key] = { current: null };
    }
    return secondaryAddRowRefs.current[key];
  }, []);
  const flushPendingLines = useCallback(async () => {
    if (addingLine && primaryAddRowRef.current?.flush) {
      const ok = await primaryAddRowRef.current.flush({ closeAfterSave: true });
      if (ok === false) return false;
    }
    for (const [tabKey, active] of Object.entries(addingSecondaryLine)) {
      if (!active) continue;
      const handle = secondaryAddRowRefs.current[tabKey]?.current;
      if (handle?.flush) {
        const ok = await handle.flush({ closeAfterSave: true });
        if (ok === false) return false;
      }
    }
    return true;
  }, [addingLine, addingSecondaryLine]);
  const [customModalState, setCustomModalState] = useState({ key: null, rowId: null });
  const [activeTab, setActiveTab] = useState(0);

  // Document-level read-only: when processed===true, the entire record (including lines) is read-only.
  const _headerData = hook.selected ?? hook.editing;
  const isProcessed = _headerData?.processed === true || _headerData?.processed === 'Y';
  // When draftMode declares an explicit completedStatuses array, only those documentStatus
  // values hide the Save/Confirm pair. This lets windows like sales-quotation keep the
  // pair visible during intermediate processed states (UE) while still hiding it in
  // terminal states (CA, ETGO_CI, CL, VO).
  const isDraftModeCompleted = Boolean(
    draftMode?.enabled && (
      Array.isArray(draftMode.completedStatuses)
        ? draftMode.completedStatuses.includes(_headerData?.documentStatus)
        : (isProcessed || _headerData?.documentStatus === 'CO')
    )
  );
  const isDocumentReadOnly = lockWhenProcessed && isProcessed;
  const [showPrint, setShowPrint] = useState(false);
  // showNotes state removed — notes panel is always visible in side-by-side layout
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Promise-based confirm for line/child deletions; replaces native window.confirm
  // so the dialog matches the styled "Eliminar registro" modal used elsewhere.
  const [pendingDeleteConfirm, setPendingDeleteConfirm] = useState(null);
  const confirmDelete = useCallback(
    () => new Promise((resolve) => setPendingDeleteConfirm({ resolve })),
    [],
  );
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef(null);
  const handledOpenAddLineRef = useRef(false);
  const handledOpenSecondaryLineRef = useRef(false);

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
  const [selectedChildRows, setSelectedChildRows] = useState([]);
  const [deletingChildren, setDeletingChildren] = useState(false);
  const [lineEdits, setLineEdits] = useState(null);
  const [lineEditColumns, setLineEditColumns] = useState({});

  // Save button is enabled only when there are pending changes. Four sources:
  // 1. Header fields diverged from last saved state (hook.isDirtyHeader)
  // 2. Primary inline add-row is open and partially filled
  // 3. A secondary tab add-row is open
  // 4. A line sidebar edit has unsaved field changes
  // additionalDirtyState lets custom windows inject extra dirty sources via prop.
  const isDirty =
    hook.isDirtyHeader
    || addingLine
    || Object.values(addingSecondaryLine).some(Boolean)
    || (lineEdits != null && Object.keys(lineEdits).length > 0)
    || (additionalDirtyState === true);
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
  const [secondaryDeleteConfirm, setSecondaryDeleteConfirm] = useState(null);

  const extractErrorMessage = useCallback(async (res) => {
    try {
      const data = await res.json();
      // NEO Headless top-level format: { error: { message, status } }
      if (data?.error?.message) return data.error.message;
      // Etendo JsonDataService format: { response: { error: { message } | string } }
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
  // Track fields the user has manually changed in this record session — protected
  // from being overwritten by callouts triggered from other fields.
  const userTouchedRef = useRef(new Set());
  // Reset both refs when the record context changes (new record / different existing record)
  useEffect(() => {
    userTouchedRef.current = new Set();
    calloutAppliedRef.current = new Set();
  }, [recordId]);
  // Guard: fire default callouts only once per new-record session
  const defaultCalloutsTriggeredRef = useRef(false);
  // Cache for tax rates fetched from the selector (keyed by tax ID).
  // Avoids repeated API calls when the same tax appears on multiple lines.
  const taxRateCacheRef = useRef({});
  const { computeLineGrossAmount, resolveTaxFactor, prepareLineForPost } = useLineGrossAmount(taxRateCacheRef, hook.children, lineConfig);
  // Batching refs for the sidebar onChange: product selector fires multiple synchronous
  // onChange calls (product, product$_identifier, unitPrice/grossUnitPrice). Without
  // batching each fires its own callout with a stale/incomplete snapshot. We accumulate
  // all synchronous calls and fire one handleLineFieldChange with the full snapshot.
  const sidebarCalloutBatchRef = useRef(null);
  const sidebarCalloutTimerRef = useRef(null);

  // When a sidebar line is selected, seed taxRateCacheRef from its saved values so that
  // subsequent priceField / qtyField changes can resolve taxFactor via source 2 (cache)
  // without needing a network round-trip.
  useEffect(() => {
    if (!selectedLine) return;
    const taxId = selectedLine.tax;
    if (!taxId || taxRateCacheRef.current[taxId] != null) return;
    let rate = null;
    const gross = parseFloat(String(selectedLine[lineConfig.grossField] ?? selectedLine.grossAmount ?? selectedLine.lineGrossAmount ?? '')) || 0;
    if (gross > 0) {
      const disc  = lineConfig.discountField ? (parseFloat(String(selectedLine[lineConfig.discountField] ?? '')) || 0) : 0;
      const net   = parseFloat(String(selectedLine.lineNetAmount ?? '')) || 0;
      if (net > 0) {
        // Etendo stores LINENETAMT = qty × listPrice (before discount).
        // Adjust by discount to get the actual taxable base before deriving the tax rate.
        const taxableNet = disc > 0 ? net * (1 - disc / 100) : net;
        rate = (gross / taxableNet - 1) * 100;
      } else {
        const qty   = parseFloat(String(selectedLine[lineConfig.qtyField]   ?? '')) || 0;
        const price = parseFloat(String(selectedLine[lineConfig.priceField] ?? selectedLine.unitPrice ?? '')) || 0;
        const lineNet = qty * price * (1 - disc / 100);
        if (lineNet > 0) rate = (gross / lineNet - 1) * 100;
      }
    }
    if (rate != null && rate >= 0) {
      taxRateCacheRef.current[taxId] = rate;
    }
  }, [selectedLine, lineConfig]);

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

  // Auto-open add-line form after header auto-save navigation (openAddLine flag in route state).
  useEffect(() => {
    if (!location.state?.openAddLine || isNew || !hook.editing) {
      handledOpenAddLineRef.current = false;
      return;
    }
    if (handledOpenAddLineRef.current) return;
    handledOpenAddLineRef.current = true;
    setAddingLine(true);
    setEditingChild(null);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state?.openAddLine, isNew, hook.editing, navigate, location.pathname]);

  // Auto-open import modal after header auto-save navigation (openImportModal flag in route state).
  const handledOpenImportRef = useRef(false);
  useEffect(() => {
    if (!location.state?.openImportModal || isNew || !hook.editing) {
      handledOpenImportRef.current = false;
      return;
    }
    if (handledOpenImportRef.current) return;
    handledOpenImportRef.current = true;
    setForceOpenImport(true);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state?.openImportModal, isNew, hook.editing, navigate, location.pathname]);

  // Save header first (if new), then open add-line form.
  const handleAddLineClick = useCallback(async () => {
    if (isNew) {
      const saved = await hook.handleSave();
      if (!saved?.id) return;
      hook.primeSaved?.(saved);
      navigate(`/${windowName}/${saved.id}`, {
        replace: true,
        state: { openAddLine: true, justSaved: saved },
      });
      return;
    }
    setAddingLine(prev => !prev);
    setEditingChild(null);
  }, [isNew, hook, navigate, windowName]);

  // Save header first (if new → navigate with flag; if existing → save in place), then open import modal.
  const handleImportClick = useCallback(async () => {
    if (isNew) {
      const saved = await hook.handleSave();
      if (!saved?.id) return false;
      hook.primeSaved?.(saved);
      navigate(`/${windowName}/${saved.id}`, {
        replace: true,
        state: { openImportModal: true, justSaved: saved },
      });
      return false;
    }
    await hook.handleSave();
    return true;
  }, [isNew, hook, navigate, windowName]);

  const handleSecondaryAddLineToggle = useCallback(async (tabKey) => {
    const targetTab = secondaryTabs.find(st => st.key === tabKey);
    if (!targetTab) return;
    if (isNew && targetTab.requireSavedRecord) {
      const saved = await hook.handleSave();
      if (!saved?.id) return;
      hook.primeSaved?.(saved);
      navigate(`/${windowName}/${saved.id}`, {
        replace: true,
        state: { openSecondaryTab: tabKey, openAddSecondaryLine: true, justSaved: saved },
      });
      return;
    }
    setAddingSecondaryLine(prev => ({ ...prev, [tabKey]: !prev[tabKey] }));
    setSelectedSecondaryLine(null);
  }, [secondaryTabs, isNew, hook, navigate, windowName]);

  const handleCustomModalAddClick = useCallback(async (tabKey) => {
    const targetTab = secondaryTabs.find(st => st.key === tabKey);
    if (!targetTab) return;
    if (isNew && targetTab.requireSavedRecord) {
      const saved = await hook.handleSave();
      if (!saved?.id) return;
      hook.primeSaved?.(saved);
      navigate(`/${windowName}/${saved.id}`, {
        replace: true,
        state: { openSecondaryTab: tabKey, openAddSecondaryLine: true, justSaved: saved },
      });
      return;
    }
    setCustomModalState({ key: tabKey, rowId: null });
  }, [secondaryTabs, isNew, hook, navigate, windowName]);

  // Resolve $_identifier for default FK values.
  // NOTE: Mandatory defaults are now handled by the backend (NeoDefaultsService).
  // The frontend only ensures that if a value exists (from a default or callout),
  // we resolve its $_identifier from the catalogs so it displays correctly.
  useEffect(() => {
    if (!isNew || !hook.editing || !catalogsLoaded || !api?.selectors) return;
    for (const sel of api.selectors) {
      const val = hook.editing[sel.field];
      if (!val) continue;
      // Value is set but no identifier — resolve it from loaded catalog
      if (hook.editing[sel.field + '$_identifier']) continue;
      const options = getCatalogOptions(catalogs, sel.entity, sel);
      if (!Array.isArray(options) || options.length === 0) continue;
      const match = options.find(o => o.id === val);
      if (match) {
        hook.handleChange(sel.field + '$_identifier', match.label || match.name || match._identifier);
      }
    }
  }, [isNew, hook.editing, catalogsLoaded, catalogs, api]);

  // After defaults load for a new record, fire callouts for non-dependent selector fields
  // so the callout chain runs (e.g. businessPartner → priceList, paymentTerms).
  // This mirrors what classic Etendo does when opening a blank document.
  useEffect(() => {
    if (!isNew) { defaultCalloutsTriggeredRef.current = false; return; }
    if (defaultCalloutsTriggeredRef.current) return;
    if (!hook.editing || !api?.selectors) return;
    // Wait until defaults have actually arrived (editing is non-empty)
    const hasDefaults = Object.values(hook.editing).some(v => v != null && v !== '');
    if (!hasDefaults) return;

    defaultCalloutsTriggeredRef.current = true;

    // Trigger callouts for primary (non-dependent) selector fields that have default values.
    // 'dependent' selectors (e.g. partnerAddress) are derived by other callouts — skip them.
    const triggers = (api.selectors || [])
      .filter(s => s.entity === entity && s.inputMode !== 'dependent' && hook.editing[s.field]);

    // Stagger calls by (i * executeCallout.debounceMs + buffer) so each result settles
    // before the next callout fires. The backend is idempotent: returns {} for fields
    // with no registered callout, so it is safe to call for every selector field.
    const STAGGER_MS = 400; // > useCallout debounce (300ms)
    const editingSnapshot = { ...hook.editing };
    triggers.forEach(({ field }, i) => {
      setTimeout(() => {
        const value = editingSnapshot[field];
        if (value) executeCallout(field, value, editingSnapshot);
      }, i * STAGGER_MS);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, hook.editing, api, entity]);

  useEffect(() => {
    setDirectFetched(false);
  }, [recordId]);

  useEffect(() => {
    if (isNew || !recordId) return;
    // Skip the post-save fetchById round-trip: when the save handlers navigate
    // /new → /:id they stash the saved record in location.state.justSaved and
    // prime the hook via primeSaved() so selected/editing already match recordId.
    // See docs/plans/sales-order-save-performance.md (Etapa 1.2).
    const justSaved = location.state?.justSaved;
    if (
      justSaved?.id
      && String(justSaved.id) === String(recordId)
      && String(hook.selected?.id) === String(justSaved.id)
    ) {
      setDirectFetched(true);
      // One-shot: clear the marker so a manual reload of /:id still fetches.
      navigate(location.pathname, {
        replace: true,
        state: { ...location.state, justSaved: undefined },
      });
      return;
    }
    if (currentItem && (!hook.selected || String(hook.selected.id) !== String(recordId))) {
      hook.handleSelect(currentItem);
      setDirectFetched(false);
      return;
    }
    if (!currentItem && !hook.loading && !directFetched) {
      setDirectFetched(true);
      hook.fetchById(recordId);
    }
    // `navigate` and `location` are stable refs from react-router v6 and are
    // intentionally omitted from the dep list to avoid re-running on every
    // navigation tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem, directFetched, hook.fetchById, hook.handleSelect, hook.loading, hook.selected, isNew, recordId]);

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
    const { updates, combos, triggerField } = calloutResult;
    const appliedFields = new Set();

    if (updates) {
      for (const [key, entry] of Object.entries(updates)) {
        // Skip empty callout values if the field already has a non-empty value
        // (e.g., callout clears warehouse but defaults already set it)
        const currentVal = data[key];
        const userHasValue = currentVal !== '' && currentVal != null;
        if ((entry.value === '' || entry.value == null) && userHasValue) {
          continue;
        }
        // Protect user-touched fields from being overwritten by collateral updates
        // coming from a callout triggered by a different field. The trigger field
        // itself always wins (it was just changed by the user).
        if (key !== triggerField && userTouchedRef.current.has(key) && userHasValue) {
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
          // Protect user-touched fields from collateral combo updates
          const currentVal = data[key];
          const userHasValue = currentVal !== '' && currentVal != null;
          if (key !== triggerField && userTouchedRef.current.has(key) && userHasValue) {
            continue;
          }
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

    // Mark this field as user-touched so subsequent collateral callout updates
    // from other triggers cannot overwrite the user's choice.
    userTouchedRef.current.add(field);

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
    if (!field || (value == null || value === '') || !token || !apiBaseUrl || !detailEntity) return;
    if (field.includes('$_identifier') || /^[a-zA-Z]+_[A-Z]{2,4}$/.test(field)) return;

    // These fields are computed client-side — no callout needed.
    // Derived from lineConfig so order, invoice, and future window types all share the same guard.
    const clientSideFieldList = [lineConfig.qtyField, lineConfig.priceField, lineConfig.discountField].filter(Boolean);
    const CLIENT_SIDE_FIELDS = new Set(clientSideFieldList);
    if (CLIENT_SIDE_FIELDS.has(field)) {
      const result = {};
      computeLineGrossAmount(field, value, result, rowValues);
      applyUpdates?.(result, new Set());
      return;
    }

    try {
      const headerData         = hook.editing || hook.selected || {};
      const formState          = buildCalloutFormState(rowValues, headerData);
      const auxiliaryValues    = extractAuxValues(formState);
      const formStateForCallout = normalizeCalloutQty(formState);
      const payload = {
        field,
        value,
        formState: formStateForCallout,
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
      const result = normalizeCalloutResponse(calloutData, rowValues);

      // Classic callouts (SL_Order_Product, SL_Invoice_Product) return the catalog price
      // as standardPrice (PriceStd) and zero out listPrice (PriceList column).
      // Use standardPrice as the list price when the callout zeroed listPrice.
      // The selector enrichment in NeoSelectorService ensures standardPrice always comes
      // from the document's price list for both order and invoice configs.
      if (field === 'product' && result.standardPrice != null && (result.listPrice == null || Number(result.listPrice) === 0)) {
        result.listPrice = result.standardPrice;
      }

      // Reset discount to 0 on product change so each product starts with no discount applied.
      if (field === 'product' && lineConfig.discountField) {
        result[lineConfig.discountField] = 0;
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
      resolveSnapshotIdentifiers(result, field, rowValues);

      // Tax-included price lists: SL_Order_Product sets grossUnitPrice (price with tax) but
      // omits netUnitPrice (net price). Derive it from the tax factor so the backend receives
      // a valid netUnitPrice instead of null/0 at save time.
      if (result.grossUnitPrice != null && result.netUnitPrice == null) {
        const taxId = result.tax;
        let taxFactor = null;
        const calloutRate = parseFloat(String(result.taxRate ?? ''));
        if (!isNaN(calloutRate) && calloutRate > 0) taxFactor = 1 + calloutRate / 100;
        if (taxFactor === null && taxId && taxRateCacheRef.current[taxId] != null) {
          taxFactor = 1 + taxRateCacheRef.current[taxId] / 100;
        }
        if (taxFactor === null && taxId) {
          const ref = (hook.children || []).find(l =>
            l.tax === taxId &&
            parseFloat(String(l.grossAmount ?? '')) > 0 &&
            parseFloat(String(l.lineNetAmount ?? '')) > 0
          );
          if (ref) taxFactor = parseFloat(String(ref.grossAmount)) / parseFloat(String(ref.lineNetAmount));
        }
        const gross = Number(result.grossUnitPrice);
        result.netUnitPrice = taxFactor != null && taxFactor > 1
          ? parseFloat((gross / taxFactor).toFixed(6))
          : gross;
      }
      applyQtyZeroGuard(result, rowValues);
      // Fallback: when callout returns no lineNetAmount (e.g. SL_Invoice_Amt throws
      // PriceAdjustment exception for products without standard cost), compute qty × price.
      // Uses lineConfig fields so orders, invoices, and future window types all benefit.
      if (result.lineNetAmount == null && (field === lineConfig.qtyField || field === lineConfig.priceField || field === 'product')) {
        const qty   = field === lineConfig.qtyField   ? (parseFloat(value) || 0)
                    : (parseFloat(String(rowValues[lineConfig.qtyField] ?? '')) || 0);
        const price = field === lineConfig.priceField ? (parseFloat(value) || 0)
                    : (parseFloat(String(result[lineConfig.priceField] ?? rowValues[lineConfig.priceField] ?? '')) || 0);
        if (qty > 0 && price > 0) result.lineNetAmount = String(qty * price);
      }
      computeLineGrossAmount(field, value, result, rowValues);

      // Resolve tax$_identifier from existing lines if callout didn't include it.
      if (!result['tax$_identifier']) {
        const effectiveTaxId = result.tax ?? rowValues.tax;
        if (effectiveTaxId) {
          const ref = (hook.children || []).find(l => l.tax === effectiveTaxId && l['tax$_identifier']);
          if (ref) result['tax$_identifier'] = ref['tax$_identifier'];
        }
      }
      // forceCalloutFields: explicit opt-in list declared per field in decisions.json.
      // Only those fields bypass the touched-guard when this field triggers a callout.
      // No other window or field is affected unless it declares forceCalloutFields.
      const triggerFieldDef = (addLineFields?.entry ?? []).find(f => f.key === field);
      const forceFields = new Set(triggerFieldDef?.forceCalloutFields ?? []);
      if (field === 'product' && lineConfig.discountField) forceFields.add(lineConfig.discountField);
      roundAmounts(result);
      applyUpdates?.(result, forceFields);


    } catch {
      // Callout is best-effort
    }
  }, [token, apiBaseUrl, detailEntity, hook.editing, hook.selected, catalogs, api, addLineFields, computeLineGrossAmount, resolveTaxFactor]);

  const data = hook.editing || currentItem || {};

  // Send total-discount percentage to the backend. No full reload — visual totals are
  // already computed locally from inputPct in DocumentTotalsPanel, so reloading would
  // discard any in-progress unsaved inline-add row without any visual benefit.
  const handleTotalDiscountChange = useCallback(async (pct) => {
    const currentId = data?.id || recordId;
    if (!currentId || isNew) return;
    try {
      await fetch(`${apiBaseUrl}/${entity}/${currentId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ etgoTotalDiscount: pct }),
      });
    } catch {
      // Best-effort: silent failure to avoid breaking the UI
    }
  }, [data?.id, recordId, isNew, apiBaseUrl, entity, token]);

  // Guard that controls whether "+ Add Lines" is shown.
  // When addLineGuard is provided, it receives the current record data and must return true to allow.
  const canAddLines = addLineGuard ? addLineGuard(data) : true;
  const windowTitle = breadcrumb
    ? tMenu(breadcrumb.split(' / ').at(-1).trim()) || breadcrumb.split(' / ').at(-1).trim()
    : tMenu(windowName) || windowName || '';
  const { toggleFavorite, isFavorite } = useFavorites();
  const favKey = windowName || windowTitle;
  const favActive = isFavorite(favKey);

  const title = isNew
    ? ui('newRecord')
    : `${resolveIdentifier(data, titleField) || data._identifier || data.id || ''}`;
  const fullBreadcrumb = breadcrumb
    ? `${breadcrumb.split(' / ').map(s => tMenu(s.trim())).join(' / ')}${title ? ` / ${title}` : ''}`
    : windowTitle;

  useSetPageMeta({
    title: title || windowTitle,
    breadcrumb: fullBreadcrumb,
    onAddToFavorites: favKey ? () => toggleFavorite(favKey, entityLabel || breadcrumb?.split(' / ').at(-1).trim() || windowName) : undefined,
    isFavorite: favActive,
  }, [favActive, title]);

  const allEntryFields = addLineFields.entry ?? [];
  const hiddenEntryDefaults = addLineFields.hidden ?? [];
  const editableChildFields = allEntryFields.filter(f => f.type === 'number' || f.type === 'amount');

  const [panelCounts, setPanelCounts] = useState({});
  useEffect(() => { setPanelCounts({}); }, [parentRecordId]);

  // Build tabs: child entity lines + secondary tabs + "Others" tab for non-principal header fields
  const tabs = [];
  secondaryTabs.forEach((st, i) => {
    const childCount = st.Panel ? (panelCounts[st.key] ?? null) : (!st.isFormTab ? (secondaryHooks[i]?.children?.length ?? null) : null);
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

  useEffect(() => {
    const targetTabKey = location.state?.openSecondaryTab;
    if (!targetTabKey || isNew || !hook.editing) {
      handledOpenSecondaryLineRef.current = false;
      return;
    }
    if (handledOpenSecondaryLineRef.current) return;
    handledOpenSecondaryLineRef.current = true;
    const nextTabIndex = tabs.findIndex(tab => tab.key === targetTabKey);
    if (nextTabIndex >= 0) {
      setActiveTab(nextTabIndex);
    }
    if (location.state?.openAddSecondaryLine) {
      const targetSecondaryTab = secondaryTabs.find(st => st.key === targetTabKey);
      if (targetSecondaryTab?.customAddModal) {
        setCustomModalState({ key: targetTabKey, rowId: null });
      } else {
        setAddingSecondaryLine(prev => ({ ...prev, [targetTabKey]: true }));
        setSelectedSecondaryLine(null);
      }
    }
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state?.openSecondaryTab, location.state?.openAddSecondaryLine, isNew, hook.editing, navigate, location.pathname, tabs, secondaryTabs]);

  // Only black out the whole window when we actually don't have the record yet.
  // A list refresh (hook.loading for the side list) or any unrelated background
  // fetch must not wipe out a form the user was interacting with.
  const hasRecordForRoute = isNew
    || (hook.selected?.id && String(hook.selected.id) === String(recordId));
  if (hook.loading && !hasRecordForRoute) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        {ui('loading')}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="detail-view">
      {/* Content card with rounded top-left corner */}
      <div className={`flex-1 flex flex-col ${contentBg} rounded-tl-2xl overflow-hidden min-h-0`}>
        {/* Action bar: Cancel + status | actions + save */}
        {embedded ? (
          statusField && data[statusField] ? (
            <div className="flex items-center gap-3 px-6 py-3 border-b border-border/30">
              <DocumentStatusPill
                status={data[statusField]}
                enumLabels={statusEnumLabels}
              />
            </div>
          ) : null
        ) : (
        <div className={`flex items-center justify-between px-6 py-3${toolbarBorderBottom ? ' border-b border-[#E8EAEF]' : ''}`}>
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
            {statusField && data[statusField] != null && (
              <DocumentStatusPill
                status={data[statusField]}
                enumLabels={statusEnumLabels}
              />
            )}
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
                  className="flex items-center justify-center p-[7px] rounded-md bg-white border border-[#D1D4DB] shadow-[0px_1px_2px_0px_#1212170D] text-muted-foreground hover:bg-[#F1F5F9] hover:text-foreground transition-colors"
                  title={ui('sendPreview')}
                  data-testid="action-document-preview"
                >
                  <Send className="h-[15px] w-[15px]" />
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
              {!(typeof hideMoreMenu === 'function' ? hideMoreMenu({ data }) : hideMoreMenu) && <div className="relative" ref={moreMenuRef}>
                <button
                  onClick={() => setShowMoreMenu(v => !v)}
                  className="flex items-center justify-center p-[7px] rounded-md bg-white border border-[#D1D4DB] shadow-[0px_1px_2px_0px_#1212170D] text-muted-foreground hover:bg-[#F1F5F9] hover:text-foreground transition-colors"
                >
                  <MoreVertical className="h-[15px] w-[15px]" />
                </button>
                {showMoreMenu && (() => {
                  const resolvedActions = typeof menuActions === 'function'
                    ? menuActions({ data, status: data?.[statusField] })
                    : menuActions;
                  const visibleActions = resolvedActions.filter(a => a.visible !== false);
                  if (visibleActions.length === 0 && !customMenuContent) return null;
                  return (
                    <div
                      className="absolute right-0 top-full mt-1 z-50 bg-white py-2 min-w-[148px]"
                      style={{
                        borderRadius: '8px',
                        boxShadow:
                          '0px 0px 0px 1px rgba(18,18,23,0.1), 0px 24px 48px rgba(18,18,23,0.03), 0px 10px 18px rgba(18,18,23,0.03), 0px 5px 8px rgba(18,18,23,0.04), 0px 2px 4px rgba(18,18,23,0.04)',
                      }}
                    >
                      {visibleActions.map((action, i) => {
                        const ActionIcon = action.icon;
                        return (
                        <button
                          key={action.key || i}
                          type="button"
                          disabled={docAction.loading}
                          onClick={async () => {
                            setShowMoreMenu(false);
                            if (action.documentAction) {
                              const currentId = data?.id || recordId;
                              try {
                                await docAction.execute(currentId, action.documentAction);
                                const msg = (action.successKey ? ui(action.successKey) : action.successMessage) || ui('actionCompleted');
                                toast.success(msg);
                                hook.fetchById?.(currentId);
                              } catch (err) {
                                toast.error(err.message);
                              }
                              return;
                            }
                            if (action.columnName) {
                              hook.handleProcess?.({ columnName: action.columnName, name: action.key });
                            } else if (action.onClick) {
                              action.onClick();
                            }
                          }}
                          className={`w-full text-left px-2 py-1 text-sm leading-6 transition-colors flex items-center gap-2 ${action.destructive
                              ? 'text-red-600 hover:bg-red-50'
                              : 'text-foreground hover:bg-secondary'
                            } ${docAction.loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                          style={{ fontFamily: 'Inter, sans-serif', fontWeight: 400 }}
                        >
                          {ActionIcon && (
                            <ActionIcon
                              className="h-4 w-4 flex-shrink-0 ml-1"
                              style={{ color: action.destructive ? undefined : '#828FA3' }}
                            />
                          )}
                          <span className={ActionIcon ? 'pl-1' : ''}>
                            {action.labelKey ? ui(action.labelKey) : action.label}
                          </span>
                        </button>
                        );
                      })}
                      {customMenuContent && (() => {
                        const CustomMenuContent = customMenuContent;
                        return <CustomMenuContent
                          data={data}
                          recordId={data?.id || recordId}
                          token={token}
                          apiBaseUrl={apiBaseUrl}
                          onClose={() => setShowMoreMenu(false)}
                          onRefresh={() => hook.fetchById?.(data?.id || recordId)}
                        />;
                      })()}
                    </div>
                  );
                })()}
              </div>}
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
                      {tMenu(p.label)}
                    </Button>
                  );
                })}

              {!hideSaveStatuses.includes(_headerData?.documentStatus) && !isDraftModeCompleted && (() => {
                if (draftMode?.enabled) {
                  return (
                    <>
                      <Button variant="outline" size="sm" className="gap-1.5 bg-white border-[#D1D4DB] text-[#121217]" data-testid="action-save-draft" disabled={hook.isSaving || !isDirty} onClick={async () => {
                        if (!(await flushPendingLines())) return;
                        const saved = await hook.handleSave(data);
                        if (saved?.id && isNew) {
                          hook.primeSaved?.(saved);
                          navigate(`/${windowName}/${saved.id}`, { replace: true, state: { justSaved: saved } });
                        }
                      }}>
                        {hook.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" color="#64748B" />}
                        {ui('save')}
                      </Button>
                      <Button size="sm" className="gap-1.5" data-testid="action-save" disabled={hook.isSaving} onClick={async () => {
                        if (!(await flushPendingLines())) return;
                        if (typeof draftMode.onConfirm === 'function') { draftMode.onConfirm(); return; }
                        const saved = await hook.handleSaveAndProcess(draftMode);
                        if (saved) {
                          if (isNew && onAfterCreate) await onAfterCreate(saved, { token, apiBaseUrl });
                          if (onAfterSave) {
                            navigate(`/${windowName}`, { replace: true, state: { savedRecord: saved, justSaved: saved } });
                          } else if (saved.id && isNew) {
                            hook.primeSaved?.(saved);
                            navigate(`/${windowName}/${saved.id}`, { replace: true, state: { justSaved: saved } });
                          }
                        }
                      }}>
                        {hook.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        {ui(draftMode.label) || draftMode.label || ui('process')}
                      </Button>
                    </>
                  );
                }
                if (isNew) {
                  return (
                    <>
                      <Button size="sm" className="gap-1.5" data-testid="action-save" disabled={isDocumentReadOnly || hook.isSaving} onClick={async () => {
                        if (!(await flushPendingLines())) return;
                        const saved = await hook.handleSave(data);
                        if (saved?.id && isNew) {
                          hook.primeSaved?.(saved);
                          navigate(`/${windowName}/${saved.id}`, { replace: true, state: { justSaved: saved } });
                        }
                      }}>
                        {hook.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        {ui('save')}
                      </Button>
                      {!isProcessed && hook.children.length > 0 && (
                        <Button size="sm" className="gap-1.5" data-testid="action-save" disabled={hook.isSaving} onClick={async () => {
                          if (!(await flushPendingLines())) return;
                          const saved = await hook.handleSaveAndProcess(draftMode);
                          if (saved) {
                            if (isNew && onAfterCreate) await onAfterCreate(saved, { token, apiBaseUrl });
                            if (onAfterSave) {
                              navigate(`/${windowName}`, { replace: true, state: { savedRecord: saved, justSaved: saved } });
                            } else if (saved.id && isNew) {
                              hook.primeSaved?.(saved);
                              navigate(`/${windowName}/${saved.id}`, { replace: true, state: { justSaved: saved } });
                            }
                          }
                        }}>
                          {hook.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          {ui(draftMode.label) || tMenu(draftMode.label) || ui('process')}
                        </Button>
                      )}
                    </>
                  );
                }
                return (
                  <Button size="sm" className="gap-1.5" data-testid="action-save" disabled={isDocumentReadOnly || hook.isSaving || !isDirty} onClick={async () => {
                    if (!(await flushPendingLines())) return;
                    const saved = await hook.handleSave(data);
                    if (saved) {
                      if (isNew && onAfterCreate) await onAfterCreate(saved, { token, apiBaseUrl });
                      if (onAfterSave) {
                        navigate(`/${windowName}`, { replace: true, state: { savedRecord: saved, justSaved: saved } });
                      } else if (saved.id && isNew) {
                        hook.primeSaved?.(saved);
                        navigate(`/${windowName}/${saved.id}`, { replace: true, state: { justSaved: saved } });
                      }
                    }
                  }}>
                    {hook.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {ui('save')}
                  </Button>
                );
              })()}
          </div>
        </div>
        )}


        {/* Scrollable content + optional sidebarContent (full-height independent column) */}
        <div className="flex-1 flex overflow-hidden">
        {/* Content column: tab bar (shrink-0) + scrollable form area */}
        <div className="flex-1 flex flex-col min-w-0">
        {/* Primary tab bar (General / Additional Info / etc.) */}
        {primaryTabs && (
          <div
            className={`flex items-center gap-1 px-6 py-2 shrink-0${tabsBarRightDivider ? ' relative' : ''}`}
            style={tabsBarRight && tabsBarRightDivider ? { paddingRight: `calc(${tabsBarRightDivider} + 24px)` } : undefined}
          >
            {tabsBarRightDivider && (
              <div className="absolute top-0 bottom-0 w-px bg-[#E8EAEF] pointer-events-none" style={{ left: `calc(100% - ${tabsBarRightDivider})` }} />
            )}
            {primaryTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActivePrimaryTab(tab.key)}
                className={[
                  'relative px-4 py-1.5 text-sm font-medium rounded-lg transition-colors border',
                  activePrimaryTab === tab.key
                    ? 'bg-white border-gray-200 shadow-sm text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {tMenu(tab.label)}
              </button>
            ))}
            {tabsBarRight && (() => {
              const TabsBarRightComponent = tabsBarRight;
              return (
                <div className="ml-auto flex-shrink-0">
                  <TabsBarRightComponent data={data} recordId={data?.id || recordId} token={token} apiBaseUrl={apiBaseUrl} api={api} />
                </div>
              );
            })()}
          </div>
        )}
        {/* Non-general primary tab: show Panel fullscreen */}
        {primaryTabs && activePrimaryTab !== 'general' ? (() => {
          const activeTab = primaryTabs.find(t => t.key === activePrimaryTab);
          return activeTab?.Panel ? (
            <div className={`flex-1 overflow-auto pb-6 min-w-0 ${sidePanel || sidebarContent ? 'pl-6 pr-2' : 'px-6'}`}>
              <activeTab.Panel entity={entity} data={data} token={token} apiBaseUrl={apiBaseUrl} catalogs={catalogs} api={api} editing={hook.editing} onChange={handleChangeWithCallout} />
            </div>
          ) : null;
        })() : null}
        <div className={`flex-1 overflow-auto pb-6 min-w-0 ${sidePanel || sidebarContent ? 'pl-6 pr-2' : 'px-6'}${primaryTabs && activePrimaryTab !== 'general' ? ' hidden' : ''}`}>
          {typeof headerContent === 'function' ? headerContent(data) : headerContent}
          <div className={`${sidePanel ? 'flex items-start gap-0' : ''}`}>
          <div className={`${sidePanel ? 'flex-1 min-w-0' : 'max-w-full'} space-y-2`}>
            {/* Principal + collapsed fields wrapped in a card */}
            <div className={`${noHeaderBorder ? '' : ' rounded-2xl border border-gray-200/70 bg-white shadow-sm'}${embedded ? ' pointer-events-none' : ''}`}>
              <div className="p-6">
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
                  selectorContext={selectorContextByEntity[entity]}
                  labelOverrides={labelOverrides}
                  registerFields={hook.registerFields}
                  fieldErrors={hook.fieldErrors}
                  onFieldBlur={autoSaveOnBlur ? handleFieldBlur : undefined}
                />
              </div>

              {/* Collapsible secondary header fields (hidden if no collapsed fields or sidebarContent) */}
              {!hideMoreDetails && !sidebarContent && (
                <CollapsibleSection title={ui('moreDetails')}>
                  <div className={`px-6 pb-6${embedded ? ' pointer-events-none' : ''}`}>
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
                      selectorContext={selectorContextByEntity[entity]}
                      labelOverrides={labelOverrides}
                      fieldErrors={hook.fieldErrors}
                      onFieldBlur={autoSaveOnBlur ? handleFieldBlur : undefined}
                    />
                  </div>
                </CollapsibleSection>
              )}
            </div>

            {/* Form footer: inline content below form, above tabs (e.g. BillingPreferencesForm) */}
            {formFooter && (
              <div className={embedded ? 'pointer-events-none' : ''}>
                {React.createElement(formFooter, { data, entity, onChange: handleChangeWithCallout, catalogs, api, token, apiBaseUrl })}
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
                        {tMenu(tab.label)}
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
                  hook.childrenLoading ? (
                    <div className="flex items-center justify-center py-10 text-muted-foreground">
                      <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    </div>
                  ) : hook.children.length === 0 && !addingLine && LinesEmptyState && hook.editing && !isDocumentReadOnly ? (
                    <LinesEmptyState
                      data={data}
                      onAddLine={handleAddLineClick}
                      canAddLine={canAddLines}
                      recordId={data?.id || recordId}
                      token={token}
                      apiBaseUrl={apiBaseUrl}
                      onRefresh={() => hook.fetchChildren?.(data?.id || recordId)}
                      onSave={handleImportClick}
                      forceOpen={forceOpenImport}
                      onForceOpenHandled={() => setForceOpenImport(false)}
                    />
                  ) : (
                  <div className={`pt-3 flex items-start gap-4${embedded ? ' pointer-events-none' : ''}`}>
                    {/* Table + add button */}
                    <div className="flex-1 min-w-0">
                      {/* Bulk delete bar */}
                      {(api?.crud?.[detailEntity]?.delete ?? true) && !isDocumentReadOnly && selectedChildRows.length > 0 && (
                        <div className="flex items-center justify-between px-3 py-2 mb-2 rounded-lg bg-muted/60 border border-border/40">
                          <span className="text-sm font-medium text-foreground">
                            {ui('selected', { count: selectedChildRows.length })}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              disabled={deletingChildren}
                              onClick={async () => {
                                if (!(await confirmDelete())) return;
                                setDeletingChildren(true);
                                try {
                                  const results = await Promise.allSettled(
                                    selectedChildRows.map(row => {
                                      const childUrl = api?.crud?.[detailEntity]?.detailUrl?.replace('{id}', row.id)
                                        || `${apiBaseUrl}/${detailEntity}/${row.id}`;
                                      return fetch(childUrl, {
                                        method: 'DELETE',
                                        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                      }).then(res => ({ res, row }));
                                    })
                                  );
                                  let deleted = 0;
                                  for (const result of results) {
                                    if (result.status === 'fulfilled' && result.value.res.ok) {
                                      hook.handleDeleteChild(result.value.row.id);
                                      if (selectedLine?.id === result.value.row.id) setSelectedLine(null);
                                      deleted++;
                                    }
                                  }
                                  setSelectedChildRows([]);
                                  if (deleted > 0) toast.success(ui('recordsDeleted', { count: deleted }));
                                  const failed = results.length - deleted;
                                  if (failed > 0) toast.error(ui('recordsCouldNotBeDeleted', { count: failed }));
                                } catch (err) {
                                  toast.error(err.message || ui('networkError'));
                                } finally {
                                  setDeletingChildren(false);
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-destructive text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {deletingChildren ? ui('loading') : ui('delete')}
                            </button>
                          </div>
                        </div>
                      )}
                      <DetailTable
                        data={hook.children}
                        entity={detailEntity}
                        token={token}
                        apiBaseUrl={apiBaseUrl}
                        onRowClick={DetailForm ? (row) => { const line = { ...row }; roundAmounts(line); setSelectedLine(line); } : undefined}
                        selectedRowId={selectedLine?.id}
                        onSelectionChange={setSelectedChildRows}
                        showFooterTotals={showDetailFooterTotals ?? !summary.some(f => f.type === 'amount')}
                        selectorContext={selectorContextByEntity[detailEntity]}
                        hiddenColumns={[]}
                        onDeleteRow={(api?.crud?.[detailEntity]?.delete ?? true) && !isDocumentReadOnly ? async (row) => {
                          if (!(await confirmDelete())) return;
                          try {
                            const childUrl = api?.crud?.[detailEntity]?.detailUrl?.replace('{id}', row.id)
                              || `${apiBaseUrl}/${detailEntity}/${row.id}`;
                            const res = await fetch(childUrl, {
                              method: 'DELETE',
                              headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                            });
                            if (res.ok) {
                              hook.handleDeleteChild(row.id);
                              if (selectedLine?.id === row.id) setSelectedLine(null);
                              toast.success(ui('recordDeleted'));
                            } else {
                              toast.error(await extractErrorMessage(res));
                            }
                          } catch (err) {
                            toast.error(err.message || ui('networkError'));
                          }
                        } : undefined}
                        addRow={{
                          ref: primaryAddRowRef,
                          active: addingLine,
                          fields: allEntryFields,
                          onAdd: async (lineData) => {
                            // Send all values: entry fields + callout-derived values (tax, prices, uOM, etc.).
                            // handleAddChild filters out internal keys (_identifier, _aux, CURSOR_FIELD, etc.)
                            // Also include hidden entry defaults (e.g., fields with predefined values).
                            for (const hiddenField of hiddenEntryDefaults) {
                              if (!(hiddenField.key in lineData)) {
                                lineData[hiddenField.key] = hiddenField.fromParent
                                  ? _headerData?.[hiddenField.fromParent]
                                  : hiddenField.value;
                              }
                            }
                            // Derive unitPrice = listPrice × (1-discount/100) before POST.
                            // For invoice config (priceField='unitPrice') this is a no-op.
                            prepareLineForPost(lineData);
                            setPendingLineValues(null);
                            return hook.handleAddChild?.(lineData);
                          },
                          onCancel: () => { setAddingLine(false); setPendingLineValues(null); },
                          catalogs,
                          onFieldChange: handleLineFieldChange,
                          onValuesChange: setPendingLineValues,
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
                                if (!(await confirmDelete())) return;
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

                      {hook.editing && !isDocumentReadOnly && (allEntryFields.length > 0 || DetailExtraActions) && canAddLines && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '0.5px solid var(--color-border-tertiary, #e5e7eb)', padding: '10px 16px' }}>
                          {allEntryFields.length > 0 && (
                            <AddLineButton
                              onClick={handleAddLineClick}
                              label={ui('addLine')}
                            />
                          )}
                          {DetailExtraActions && (
                            <DetailExtraActions data={data} recordId={data?.id || recordId} token={token} apiBaseUrl={apiBaseUrl} onRefresh={() => hook.fetchChildren?.(data?.id || recordId)} onSave={handleImportClick} forceOpen={forceOpenImport} onForceOpenHandled={() => setForceOpenImport(false)} />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right sidebar: line detail form */}
                    {DetailForm && (selectedLine || isClosingLine) && (
                      <div className={`w-[48rem] shrink-0 border-l border-border pl-4 self-stretch overflow-hidden ${isClosingLine ? 'sidebar-slide-out' : 'sidebar-slide-in'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-foreground">{ui('entityDetail', { label: tMenu(detailLabel || 'Line') })}</span>
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
                            // Batch all synchronous onChange calls from a single product
                            // selection (product, product$_identifier, unitPrice/grossUnitPrice)
                            // into ONE handleLineFieldChange with a complete snapshot.
                            // This mirrors how DataTable builds its snapshot before the callout.
                            if (!sidebarCalloutBatchRef.current) {
                              sidebarCalloutBatchRef.current = {
                                base: lineEdits ?? selectedLine ?? {},
                                changes: {},
                                primaryField: key,
                                primaryVal: val,
                              };
                            }
                            sidebarCalloutBatchRef.current.changes[key] = val;
                            clearTimeout(sidebarCalloutTimerRef.current);
                            sidebarCalloutTimerRef.current = setTimeout(() => {
                              const batch = sidebarCalloutBatchRef.current;
                              sidebarCalloutBatchRef.current = null;
                              if (!batch) return;
                              const rowSnapshot = { ...batch.base, ...batch.changes };
                              handleLineFieldChange(
                                batch.primaryField, batch.primaryVal,
                                rowSnapshot,
                                (updates) => setLineEdits(prev => ({ ...(prev ?? selectedLine), ...updates })),
                              );
                            }, 0);
                          }}
                                entity={detailEntity}
                                catalogs={catalogs}
                                token={token}
                                apiBaseUrl={apiBaseUrl}
                                selectorContext={selectorContextByEntity[detailEntity]}
                                labelOverrides={labelOverrides}
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
                                      // Derive unitPrice = listPrice × (1-discount/100) before PATCH.
                                      // Merge with selectedLine so listPrice/discount are always available.
                                      const patchData = { ...(selectedLine ?? {}), ...lineEdits };
                                      prepareLineForPost(patchData);
                                      const patchEdits = { ...lineEdits };
                                      if (patchData.unitPrice !== undefined) patchEdits.unitPrice = patchData.unitPrice;
                                      const fieldValues = {};
                                      for (const [k, v] of Object.entries(patchEdits)) {
                                        if (k.endsWith('$_identifier')) continue;
                                        // NEO Headless PATCH expects camelCase API keys, not DB column names.
                                        // Always use k (the API key) as the field name.
                                        // Convert numeric strings to numbers for BigDecimal compatibility.
                                        // Only strip when the value is already in standard format (no commas).
                                        // Comma removal is skipped to avoid locale corruption (e.g. Spanish "10,50" = 10.5).
                                        if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) {
                                          fieldValues[k] = parseFloat(v);
                                        } else {
                                          fieldValues[k] = v;
                                        }
                                      }
                                      const res = await fetch(childUrl, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                        body: JSON.stringify(fieldValues),
                                      });
                                      if (res.ok) {
                                        setLineEdits(null);
                                        setLineEditColumns({});
                                        toast.success('Record saved');
                                        // Always refresh from persisted record — backend may recompute
                                        // derived fields (lineNetAmount, discounts) on save.
                                        try {
                                          const freshRes = await fetch(childUrl, {
                                            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                          });
                                          if (freshRes.ok) {
                                            const freshJson = await freshRes.json();
                                            const freshLine = freshJson?.response?.data?.[0] ?? freshJson;
                                            if (freshLine?.id) {
                                              hook.handleUpdateChild(selectedLine.id, freshLine);
                                              setSelectedLine(prev => ({ ...prev, ...freshLine }));
                                            }
                                          } else {
                                            hook.handleUpdateChild(selectedLine.id, fieldValues);
                                            setSelectedLine(prev => ({ ...prev, ...fieldValues }));
                                          }
                                        } catch (_) {
                                          hook.handleUpdateChild(selectedLine.id, fieldValues);
                                          setSelectedLine(prev => ({ ...prev, ...fieldValues }));
                                        }
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
                                  if (!(await confirmDelete())) return;
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
                          labelOverrides={labelOverrides}
                        />
                      </div>
                    ) : st.Panel ? (
                      <div className="flex-1 min-w-0">
                        <st.Panel
                          parentId={data?.id}
                          token={token}
                          apiBaseUrl={apiBaseUrl}
                          onCount={(n) => setPanelCounts(prev => ({ ...prev, [st.key]: n }))}
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
                        onRowClick={st.customAddModal
                          ? (row) => setCustomModalState({ key: st.key, rowId: row.id })
                          : st.Form
                            ? (row) => { setSelectedSecondaryLine({ ...row, _tabKey: st.key }); setSecondaryLineEdits(null); }
                            : undefined}
                        selectedRowId={selectedSecondaryLine?._tabKey === st.key ? selectedSecondaryLine?.id : undefined}
                        onDeleteRow={enableSecondaryRowDelete && (api?.crud?.[st.key]?.delete ?? true) ? (row) => {
                          setSecondaryDeleteConfirm({
                            tabKey: st.key,
                            tabIndex: stIdx,
                            id: row.id,
                          });
                        } : undefined}
                        addRow={st.addLineFields?.entry?.length > 0 ? {
                          ref: getSecondaryAddRowRef(st.key),
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
                          <span className="text-sm font-medium text-foreground">{ui('entityDetail', { label: tMenu(st.label) })}</span>
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
                          excludeFields={st.key === 'contact' ? ['active'] : []}
                          labelOverrides={labelOverrides}
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
                                        // NEO Headless PATCH expects camelCase API keys, not DB column names.
                                        // Always use k (the API key) as the field name.
                                        // Convert numeric strings to numbers for BigDecimal compatibility.
                                        // Only strip when the value is already in standard format (no commas).
                                        // Comma removal is skipped to avoid locale corruption (e.g. Spanish "10,50" = 10.5).
                                        if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) {
                                          fieldValues[k] = parseFloat(v);
                                        } else {
                                          fieldValues[k] = v;
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
                                onClick={() => setSecondaryDeleteConfirm({
                                  tabKey: st.key,
                                  tabIndex: stIdx,
                                  id: selectedSecondaryLine.id,
                                })}
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
                    {(st.addLineFields?.entry?.length > 0 || st.customAddModal) && hook.editing && (
                      <AddLineButton
                        onClick={() => {
                          if (st.customAddModal) {
                            void handleCustomModalAddClick(st.key);
                          } else {
                            void handleSecondaryAddLineToggle(st.key);
                          }
                        }}
                        label={ui('addEntity', { label: tMenu(st.label) })}
                      />
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
                      selectorContext={selectorContextByEntity[entity]}
                      labelOverrides={labelOverrides}
                      fieldErrors={hook.fieldErrors}
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
                  lines={hook.children}
                  pendingLine={pendingLineValues}
                  editingLine={lineEdits && selectedLine ? { ...selectedLine, ...lineEdits } : selectedLine}
                  lineConfig={lineConfig}
                  totalDiscountPct={Number(data?.etgoTotalDiscount ?? 0)}
                  onTotalDiscountChange={handleTotalDiscountChange}
                />
              );
            })() : (
              <>
                {/* Totals block: DocumentTotalsPanel with optional discount expansion */}
                {(() => {
                  const subtotalField = summary.find(f => f.type === 'amount' && (f.key.toLowerCase().includes('summed') || f.key.toLowerCase().includes('totallines') || f.key.toLowerCase().includes('lineamount')));
                  const totalField = summary.find(f => f.type === 'amount' && (f.key.toLowerCase().includes('grand') || (f.key.toLowerCase().includes('total') && !f.key.toLowerCase().includes('line'))));
                  if (!subtotalField && !totalField) return null;
                  const currency = data['currency$_identifier'];
                  return (
                    <DocumentTotalsPanel
                      lines={hook.children}
                      pendingLine={pendingLineValues}
                      editingLine={lineEdits && selectedLine ? { ...selectedLine, ...lineEdits } : selectedLine}
                      lineConfig={lineConfig}
                      formatAmount={formatAmount}
                      currency={currency}
                      readOnly={isDocumentReadOnly}
                      totalDiscountPct={Number(data?.etgoTotalDiscount ?? 0)}
                      onTotalDiscountChange={handleTotalDiscountChange}
                    />
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
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pt-0.5 shrink-0 w-24">{ui('docs')}</span>
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
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pt-1.5 shrink-0 w-24">{ui('notes')}</span>
                        <div className={`flex-1 flex flex-col border border-border/40 rounded bg-white transition-all py-1.5`} style={{ borderWidth: '0.5px' }}>
                          {notesFocused ? (
                            <textarea
                              value={data[notesField] || ''}
                              onChange={(e) => handleChangeWithCallout(notesField, e.target.value)}
                              onBlur={() => setNotesFocused(false)}
                              placeholder={ui('description')}
                              rows={3}
                              autoFocus
                              className="w-full text-xs bg-transparent px-2 py-0.5 resize-none focus:outline-none placeholder:text-muted-foreground/40"
                            />
                          ) : (
                            <div
                              tabIndex={0}
                              role="textbox"
                              onClick={() => setNotesFocused(true)}
                              onFocus={() => setNotesFocused(true)}
                              className="w-full text-xs px-2 py-0.5 cursor-text min-h-[1.5rem] whitespace-pre-wrap break-words text-foreground/80"
                            >
                              {data[notesField] || <span className="text-muted-foreground/40">{ui('description')}</span>}
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
              className="w-[280px] shrink-0 self-stretch pl-0 pr-3"
              style={sidePanelStyle}
            >
              {typeof sidePanel === 'function'
                ? React.createElement(sidePanel, { recordId: data?.id || recordId, data, token, apiBaseUrl, api })
                : sidePanel}
            </div>
          )}
          </div>
        </div>
        </div>{/* end content column wrapper */}
        {sidebarContent && (
          <div className={sidebarClassName}>
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
      <Dialog open={Boolean(secondaryDeleteConfirm)} onOpenChange={(open) => { if (!open) setSecondaryDeleteConfirm(null); }}>
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
              onClick={async () => {
                if (!secondaryDeleteConfirm) return;
                setSavingSecondaryLine(true);
                try {
                  const secUrl = `${apiBaseUrl}/${secondaryDeleteConfirm.tabKey}/${secondaryDeleteConfirm.id}`;
                  const res = await fetch(secUrl, {
                    method: 'DELETE',
                    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                  });
                  if (res.ok) {
                    secondaryHooks[secondaryDeleteConfirm.tabIndex]?.handleDeleteChild(secondaryDeleteConfirm.id);
                    toast.success('Record deleted');
                    setSecondaryDeleteConfirm(null);
                    closeSecondaryLine();
                  } else {
                    toast.error(await extractErrorMessage(res));
                  }
                } catch (err) {
                  toast.error(err.message || 'Network error');
                } finally {
                  setSavingSecondaryLine(false);
                }
              }}
            >
              {ui('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(pendingDeleteConfirm)}
        onOpenChange={(open) => {
          if (!open && pendingDeleteConfirm) {
            pendingDeleteConfirm.resolve(false);
            setPendingDeleteConfirm(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{ui('deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>{ui('deleteConfirmMessage')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                pendingDeleteConfirm?.resolve(false);
                setPendingDeleteConfirm(null);
              }}
            >
              {ui('cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                pendingDeleteConfirm?.resolve(true);
                setPendingDeleteConfirm(null);
              }}
            >
              {ui('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {secondaryTabs.map((st, idx) => {
        if (!st.customAddModal) return null;
        const CustomModal = st.customAddModal;
        return (
          <CustomModal
            key={st.key}
            open={customModalState.key === st.key}
            onClose={() => setCustomModalState({ key: null, rowId: null })}
            onSaved={() => {
              secondaryHooks[idx]?.handleSelect(hook.selected ?? hook.editing);
              setCustomModalState({ key: null, rowId: null });
            }}
            rowId={customModalState.key === st.key ? customModalState.rowId : null}
            bpId={parentRecordId}
            apiBase={apiBaseUrl}
            token={token}
            selectorContext={selectorContextByEntity[st.key] ?? {}}
          />
        );
      })}
    </div>
  );
}
