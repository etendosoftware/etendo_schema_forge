import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  CircleCheck, Loader2, Search, SquareCheck, X,
} from 'lucide-react';
import { InfoIcon, WarningIcon } from '@phosphor-icons/react';
import { useUI, useLocaleSwitch } from '@/i18n';
import { Checkbox } from '@/components/ui/checkbox';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { NumberStepperInput } from '@/components/contract-ui/NumberStepperInput.jsx';
import { RowExpandToggle } from '@/components/contract-ui/RowExpandToggle.jsx';
import { formatCurrency, formatPlainDecimal } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { translateQuotaRefusalBody } from '@/lib/backendErrors.js';
import { cn } from '@/lib/utils';

// A draft is valid when it parses to a finite magnitude in (0, maxQty]. Sign is
// intentionally ignored — matches the existing Math.abs behavior for negativeQuantity mode.
// `tooHigh` distinguishes "numeric but over the max" from every other invalid case
// (empty/non-numeric/zero/negative) so callers can pick the right error message.
function classifyQtyDraft(raw, maxQty) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return { valid: false, tooHigh: false };
  const parsed = Number(raw);
  const isNumeric = Number.isFinite(parsed);
  const magnitude = Math.abs(parsed);
  if (isNumeric && magnitude > 0 && magnitude <= maxQty) return { valid: true, tooHigh: false };
  return { valid: false, tooHigh: isNumeric && magnitude > maxQty };
}

// Shows a caller-provided toast ({ message, variant }) and reports whether it did.
function showCustomToast(custom) {
  if (!custom?.message) return false;
  (custom.variant === 'warning' ? toast.warning : toast.success)(custom.message);
  return true;
}

// Figma «Pop Up Añadir desde pedido» (ETP-5828). The dialog has a FIXED size and is centred:
// nothing the user does (expanding a document, selecting lines, a notice appearing) can resize
// or move it, so the row under the pointer stays where it was. The list is the only part that
// grows or shrinks, and it scrolls.
const DIALOG_WIDTH = 800;
const DIALOG_HEIGHT = 648;
// The notice area under the list is always rendered at the Figma's size — a 12 px gap above an
// 80 px alert (16 + 24 title + 24 body + 16) — so a warning replacing the neutral notice never
// changes the height left to the list. One body line fits; a longer one is clamped (full text in
// its `title`), never allowed to grow the box.
const NOTICE_GAP = 12;
const NOTICE_HEIGHT = 80;

// Figma «Alert» colours, literal in the light theme: the closest tokens differ (bg-muted is
// #F1F5F9, the warning border token is #FFDA85, muted-foreground is #6C6C89). The warning bg
// (#FFF9EB) and text (#8A6100) are exactly --status-warning-bg / --status-warning-fg, so those
// stay tokens. The Figma has no dark variant: under `.dark` each part falls back to the dark
// theme's tokens (muted surface, control border, icon/foreground text; the warning tokens already
// switch to their dark values), so the notice stays readable and fits a dark UI.
const NOTICE_TONES = {
  neutral: {
    box: 'border-[#C7CBD3] bg-[#F3F5F9] dark:border-border-control dark:bg-muted',
    icon: 'text-[#C7CBD3] dark:text-icon-secondary',
    title: 'text-foreground', body: 'text-[#6B7280] dark:text-muted-foreground',
  },
  warning: {
    box: 'border-[#FFC233] bg-status-warning dark:border-status-warning-border',
    icon: 'text-[#C28800] dark:text-status-warning-foreground',
    title: 'text-status-warning-foreground', body: 'text-status-warning-foreground',
  },
};

const SHADOW_XS = 'shadow-[var(--sf-shadow-xs)]';
const CONTROL_BORDER = 'border-[hsl(var(--sf-border-input))]';
const ICON_COLOR = 'text-[hsl(var(--sf-icon-outline-secondary))]';

const PILL_BASE = 'inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium leading-6 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2';

/**
 * The notice of an import popup (Figma «Alert», node 2702-6462): a 2 px left bar, a 24 × 24 icon
 * box (or a control such as a switch in its place), a title and ONE body line. `neutral` is the
 * idle «Información de importación» state and the tone of an informative control; `warning` is an
 * orange advice. It fills the 80 px its slot gives it, so swapping one notice for another never
 * moves anything; a title or body too long for one line is truncated with the full text in `title`.
 */
export function ImportNotice({ tone = 'neutral', title, body, control, 'data-testid': dataTestId, role }) {
  const warning = tone === 'warning';
  const colours = NOTICE_TONES[warning ? 'warning' : 'neutral'];
  const Icon = warning ? WarningIcon : InfoIcon;
  return (
    <div
      data-testid={dataTestId}
      data-tone={tone}
      role={role}
      className={cn('box-border flex h-full items-start gap-1 overflow-hidden rounded-r-lg border-l-2 p-4', colours.box)}
    >
      {/* 24 px high like the title line; 24 wide for the icon, as wide as needed for a control
          (the 36 × 20 switch of the global-discount toggle). */}
      <span
        className={cn('flex h-6 shrink-0 items-center justify-center', control ? 'min-w-6' : 'w-6')}
        data-testid="ImportNotice__icon"
      >
        {control || (
          <Icon size={20} color="currentColor" aria-hidden="true" className={colours.icon} data-testid="Icon__b0ad7a" />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col px-2 text-sm leading-6">
        <strong className={cn('truncate font-medium', colours.title)} title={title}>{title}</strong>
        {body && <p className={cn('truncate font-normal', colours.body)} title={body}>{body}</p>}
      </div>
    </div>
  );
}

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
  noCurrencyMatchMessageKey,
  successMessageKey,
  fetchDocuments,
  fetchLines,
  getDocDisplay,
  buildLineBody,
  afterImport,
  showPriceColumns = true,
  negativeQuantity = false,
  linesEndpoint,
  submitImport,
  filterZeroQty = false,
  autoSelectOnExpand = false,
  eagerLoadLines = true,
  showAvailableQtyColumn = false,
  qtyColumnLabelKey = 'qty',
  // Optional, generic extension points. Every one defaults to today's behaviour.
  // `selection` (below) = { selectedDocIds, selectedDocuments, selectedCount, documents,
  // sharedContext, extraState, setExtraState }. `afterImport` additionally receives
  // `documents`, `extraState` and `selectedDocIds`, and whatever it returns is handed to
  // `getSuccessToast` as `afterImportResult`.
  initialExtraState,     // caller-owned state kept by the modal (e.g. a toggle), passed back everywhere
  renderDocAdornment,    // (doc, selection) => node shown in the document row, after the date
  renderSelectionPanel,  // (selection) => node (usually an <ImportNotice>) shown in the fixed notice
                         // area under the list; null shows the neutral «Información de importación».
                         // Without this prop there is no notice area at all.
  importButtonKey = 'importSelected', // i18n key of the import button, `{count}` = " (N)" or ""
  getSuccessToast,       // ({ count, importedDocIds, afterImportResult, partial, ...selection }) => { message, variant? } | null
                         // `partial` = some line imports failed: the modal shows its own warning and
                         // ALSO shows whatever this returns (e.g. a failed follow-up write).
  isDocumentCovered,     // (doc) => boolean: true hides the document as fully imported from its own row,
                         // lines not needed (for eagerLoadLines={false}); all hidden → allImportedMessageKey
  getDocumentTotal,      // (doc) => number | null: the row total while the document's lines are NOT
                         // loaded; once loaded (or null/undefined, or no prop) the sum of its lines
  countLinesInFooter = false, // true: the footer reads «1 línea seleccionada» / «N líneas
                              // seleccionadas»; false keeps the generic «N Seleccionados»
  describeLine,          // (line, { imported }) => string | null: the note under a line's product
                         // (e.g. the draft invoice holding it). On a greyed-out line null/absent
                         // keeps the default («ya importado», or the line's draft shipments); on a
                         // selectable line null shows no note. Up to 2 lines, full text as tooltip.
}) {
  if (!linesEndpoint && !submitImport) {
    throw new Error('ImportLinesModal: linesEndpoint prop is required unless submitImport is provided');
  }
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const apiFetch = useApiFetch(base);
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
  const [qtyDrafts, setQtyDrafts] = useState({});
  const [eagerLoadingLines, setEagerLoadingLines] = useState(false);
  const [excludedByCurrency, setExcludedByCurrency] = useState(false);
  const [extraState, setExtraState] = useState(initialExtraState);
  // Last value the stepper reported per line: a −/+ click reports it through onChange and then
  // calls onStep in the same tick, before the draft state has re-rendered.
  const lastQtyInput = useRef({});
  // Documents ticked while their lines were not loaded: selected as soon as the lines arrive,
  // even when the read was already in flight (opened by the chevron just before the tick).
  const selectOnLoad = useRef(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { documents: docs, sharedContext: ctx, excludedByCurrency: excluded } = await fetchDocuments({ base, headers, bpId, invoiceId });
        if (!cancelled) {
          setDocuments(docs || []);
          setSharedContext(ctx || {});
          setExcludedByCurrency(!!excluded);
        }
      } catch { /* silent */ } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [bpId, base, headers, invoiceId, fetchDocuments]);

  // Eagerly load all lines once documents arrive so fully-imported invoices can be
  // filtered out before the user sees the list (avoids "appears then disappears" flicker).
  useEffect(() => {
    if (loading || !eagerLoadLines) return;
    const docs = documents;
    if (docs.length === 0) return;
    let cancelled = false;
    setEagerLoadingLines(true);
    Promise.all(
      docs.map(doc =>
        fetchLines({ base, headers, docId: doc.id, sharedContext })
          .then(lines => ({ docId: doc.id, lines: filterZeroQty ? lines.filter(l => (l._maxQty || 0) > 0) : lines }))
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
      if (isDocumentCovered?.(d)) return false;
      const lines = docLines[d.id];
      if (!lines || lines.length === 0) return true;
      return lines.some(l => !l._alreadyImported);
    });
    if (!search.trim()) return visible;
    const q = search.toLowerCase();
    return visible.filter(d => (d.documentNo || '').toLowerCase().includes(q));
  }, [documents, docLines, search, isDocumentCovered]);

  // Documents owning at least one selected line, in list order. Recomputed on every selection
  // change so callers can react live (see `renderSelectionPanel`).
  const selection = useMemo(() => {
    const selectedDocuments = documents.filter(d => (docLines[d.id] || []).some(l => selected.has(l.id)));
    return {
      selectedDocIds: new Set(selectedDocuments.map(d => d.id)),
      selectedDocuments,
      selectedCount: selected.size,
      documents,
      sharedContext,
      extraState,
      setExtraState,
    };
  }, [documents, docLines, selected, sharedContext, extraState]);

  // Only a line that can still be imported is ever selected (by its row, its document, the
  // inner master checkbox or the select-all button, `ImportLinesModal__selectAll`).
  const selectableIdsOf = (lines) => (lines || []).filter(l => !l._alreadyImported).map(l => l.id);

  const addToSelection = (ids) => {
    if (ids.length === 0) return;
    setSelected(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; });
  };

  const removeFromSelection = (ids) => {
    setSelected(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
  };

  const loadLines = async (docId, { select = false } = {}) => {
    if (docLines[docId] || loadingLines.has(docId)) return;
    setLoadingLines(prev => { const n = new Set(prev); n.add(docId); return n; });
    try {
      const fetchedLines = await fetchLines({ base, headers, docId, sharedContext });
      const enrichedLines = filterZeroQty ? fetchedLines.filter(l => (l._maxQty || 0) > 0) : fetchedLines;
      setDocLines(prev => ({ ...prev, [docId]: enrichedLines }));
      const qtyDefaults = {};
      enrichedLines.forEach(l => { qtyDefaults[l.id] = l._maxQty || 0; });
      setLineQuantities(prev => ({ ...prev, ...qtyDefaults }));
      const ticked = selectOnLoad.current.delete(docId);
      if (autoSelectOnExpand || select || ticked) addToSelection(selectableIdsOf(enrichedLines));
    } catch {
      // A failed read must not leave the tick pending: a later expand would auto-select.
      selectOnLoad.current.delete(docId);
    } finally { setLoadingLines(prev => { const n = new Set(prev); n.delete(docId); return n; }); }
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

  // ETP-5828 (QA UI-3) — a document whose lines are not loaded yet (eagerLoadLines off) is
  // opened, loaded AND selected by the same click: ticking it only to see it unfold, and having
  // to tick it again, read as a lost click.
  const toggleDoc = (docId) => {
    const lines = docLines[docId] || [];
    if (lines.length === 0) {
      setExpanded(prev => { const n = new Set(prev); n.add(docId); return n; });
      selectOnLoad.current.add(docId);
      loadLines(docId);
      return;
    }
    const lineIds = selectableIdsOf(lines);
    if (lineIds.every(id => selected.has(id))) removeFromSelection(lineIds);
    else addToSelection(lineIds);
  };

  const getDocCheckState = (docId) => {
    const lineIds = selectableIdsOf(docLines[docId]);
    if (lineIds.length === 0) return { checked: false, indeterminate: false };
    const count = lineIds.filter(id => selected.has(id)).length;
    if (count === 0) return { checked: false, indeterminate: false };
    if (count === lineIds.length) return { checked: true, indeterminate: false };
    return { checked: false, indeterminate: true };
  };

  // The select-all button (`ImportLinesModal__selectAll`) acts on the documents the search leaves
  // visible. A document whose lines are not loaded yet (eagerLoadLines off) is loaded and
  // selected in one go.
  const visibleSelectable = filtered.flatMap(d => selectableIdsOf(docLines[d.id]));
  const allVisibleLoaded = filtered.every(d => docLines[d.id]);
  const allVisibleSelected = allVisibleLoaded && visibleSelectable.length > 0
    && visibleSelectable.every(id => selected.has(id));
  const selectAllDisabled = filtered.length === 0 || (allVisibleLoaded && visibleSelectable.length === 0);

  const toggleSelectAll = () => {
    if (allVisibleSelected) { removeFromSelection(visibleSelectable); return; }
    addToSelection(visibleSelectable);
    filtered.filter(d => !docLines[d.id]).forEach(d => loadLines(d.id, { select: true }));
  };

  const collectSelectedLines = () => {
    const lines = [];
    for (const doc of documents) {
      for (const line of (docLines[doc.id] || [])) {
        if (!selected.has(line.id)) continue;
        const qty = lineQuantities[line.id] ?? (line._maxQty || 0);
        lines.push({ line, qty, docId: doc.id });
      }
    }
    return lines;
  };

  // Caller-provided batch submit (e.g. the return-flow's single POST action). It also receives
  // the current `selection` and `extraState`, and may return `afterImportResult`, handed to
  // `getSuccessToast` as in the per-line path (ETP-6002: the order import's global discount).
  const importViaSubmitHandler = async () => {
    const lines = collectSelectedLines();
    const result = await submitImport({
      lines, base, headers, invoiceId, sharedContext, extraState, selection,
    });
    if (!result?.ok) {
      // ETP-5051 — a handler that hands back the refusal `body` gets a plan-quota refusal shown as
      // the translated quota sentence; anything else keeps its own error or the generic one.
      toast.error(translateQuotaRefusalBody(result?.body, ui) || result?.error || ui('failedToImportLines'));
      return;
    }
    const count = result.count ?? lines.length;
    showSuccessToast({
      count, importedDocIds: new Set(lines.map(l => l.docId)), afterImportResult: result.afterImportResult,
    });
    onSuccess();
  };

  const showSuccessToast = ({ count, importedDocIds, afterImportResult }) => {
    if (showCustomToast(getSuccessToast?.({ ...selection, count, importedDocIds, afterImportResult }))) return;
    toast.success(ui(successMessageKey, { count }));
  };

  // One POST per selected line, in document order; line numbers step by 10.
  const postSelectedLines = async () => {
    let lineNo = 10;
    let errors = 0;
    let importedCount = 0;
    const importedDocIds = new Set();
    for (const { line, qty, docId } of collectSelectedLines()) {
      const lineBody = await buildLineBody({ line, qty, invoiceId, lineNo, sharedContext, base, headers });
      // ETP-5424 — a line create in an import loop: a cut-off write that still commits
      // would be re-imported on retry, so it opts out of the default timeout.
      const res = await apiFetch(`/${linesEndpoint}`, {
        method: 'POST', headers, body: JSON.stringify(lineBody), on401: 'ignore', timeout: 0,
      });
      if (!res.ok) errors++;
      else { importedDocIds.add(docId); importedCount++; }
      lineNo += 10;
    }
    return { errors, importedCount, importedDocIds };
  };

  const runAfterImport = (importedDocIds) => (afterImport
    ? afterImport({
      importedDocIds, sharedContext, base, headers, invoiceId,
      documents, extraState, selectedDocIds: selection.selectedDocIds,
    })
    : undefined);

  // Default: one POST per selected line against `linesEndpoint`.
  const importViaPerLinePost = async () => {
    const { errors, importedCount, importedDocIds } = await postSelectedLines();
    const afterImportResult = await runAfterImport(importedDocIds);
    if (errors > 0) {
      toast.warning(ui('importedLinesWithErrors', { count: importedCount, errors }));
      showCustomToast(getSuccessToast?.({ ...selection, count: importedCount, importedDocIds, afterImportResult, partial: true }));
    } else {
      showSuccessToast({ count: importedCount, importedDocIds, afterImportResult });
    }
    onSuccess();
  };

  const handleImport = async () => {
    if (selected.size === 0 || importing) return;
    setImporting(true);
    try {
      if (submitImport) await importViaSubmitHandler();
      else await importViaPerLinePost();
    } catch (err) { toast.error(err.message || 'Failed to import'); } finally { setImporting(false); }
  };

  // Validates a typed (or stepped) quantity and keeps it, or reverts to the last kept one.
  const commitQty = (line, raw) => {
    const maxQty = line._maxQty || 0;
    const check = classifyQtyDraft(raw, maxQty);
    if (check.valid) {
      setLineQuantities(prev => ({ ...prev, [line.id]: Math.abs(Number(raw)) }));
    } else if (check.tooHigh) {
      toast.error(ui('qtyMaxAllowed', { max: maxQty }));
    } else {
      toast.error(ui('qtyMustBePositive'));
    }
    delete lastQtyInput.current[line.id];
    setQtyDrafts(prev => { const n = { ...prev }; delete n[line.id]; return n; });
  };

  const fmtDate = (d) => (d
    ? formatCalendarDate(d, locale || 'es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
    : '-');

  const selectionSize = selected.size;
  const importDisabled = selected.size === 0 || importing;

  // ETP-5828 (QA UI-6) — with `countLinesInFooter` (the order popups) the footer counts the
  // selected LINES in the singular or the plural: «1 línea seleccionada», «2 líneas seleccionadas».
  // Every other popup keeps the generic «N Seleccionados».
  const renderLinesCount = () => {
    const one = selectionSize === 1;
    return (
      <>
        <strong className="font-semibold">
          {ui(one ? 'importLinesSelectedCountOne' : 'importLinesSelectedCountMany', { count: selectionSize })}
        </strong>
        {' '}{ui(one ? 'importLinesSelectedSuffixOne' : 'importLinesSelectedSuffixMany')}
      </>
    );
  };

  const renderFooterHint = () => {
    if (selectionSize === 0) return ui('selectLinesToImport');
    return (
      <>
        <CircleCheck size={20} aria-hidden="true" className={cn('shrink-0', ICON_COLOR)} data-testid="CircleCheck__b0ad7a" />
        <span>{countLinesInFooter ? renderLinesCount() : ui('selected', { count: selectionSize })}</span>
      </>
    );
  };

  const renderListState = (message, { spinner = false, testId } = {}) => (
    <div
      data-testid={testId}
      className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground"
    >
      {spinner
        ? <Loader2 size={20} aria-hidden="true" className={cn('animate-spin', ICON_COLOR)} data-testid="Loader2__b0ad7a" />
        : <Search size={20} aria-hidden="true" className={ICON_COLOR} data-testid="Search__b0ad7a" />}
      <p>{message}</p>
    </div>
  );

  const renderList = () => {
    if (loading || eagerLoadingLines) {
      return renderListState(ui('loading'), { spinner: true, testId: 'ImportLinesModal__loading' });
    }
    if (filtered.length === 0) {
      let msg;
      if (documents.length === 0) {
        msg = (excludedByCurrency && noCurrencyMatchMessageKey) ? ui(noCurrencyMatchMessageKey) : ui(emptyMessageKey);
      } else if (!search.trim() && allImportedMessageKey) {
        msg = ui(allImportedMessageKey);
      } else {
        msg = ui(noSearchResultsKey);
      }
      return renderListState(msg, { testId: 'ImportLinesModal__empty' });
    }
    return filtered.map(renderDocument);
  };

  const renderQtyStepper = (line, { imported, displayQty, maxQty, qtyEdited }) => {
    const draft = qtyDrafts[line.id];
    const draftInvalid = draft !== undefined && !classifyQtyDraft(draft, maxQty).valid;
    // Bounds in DISPLAY space: the stepper shows a negative number when negativeQuantity is on.
    const low = Math.min(1, maxQty);
    const bounds = negativeQuantity ? { min: -maxQty, max: -low } : { min: low, max: maxQty };
    return (
      <span onClick={e => e.stopPropagation()} className="block w-[150px] shrink-0">
        <NumberStepperInput
          id={`ImportLinesModal-qty-${line.id}`}
          value={displayQty}
          min={bounds.min}
          max={bounds.max}
          disabled={imported}
          onChange={raw => {
            lastQtyInput.current[line.id] = raw;
            setQtyDrafts(prev => ({ ...prev, [line.id]: raw }));
          }}
          onCommit={raw => commitQty(line, raw)}
          onStep={() => commitQty(line, lastQtyInput.current[line.id])}
          className={cn(
            CONTROL_BORDER, SHADOW_XS,
            draftInvalid && 'border-destructive bg-destructive/10',
            !draftInvalid && qtyEdited && 'border-[var(--status-warning-border)] bg-status-warning',
          )}
          data-testid="ImportLinesModal__qtyInput" />
      </span>
    );
  };

  // The quantity a line is shown with: the one the user kept, or its available maximum.
  // negativeQuantity is display-only: the stepper's internal state (currentQty) always stays a
  // positive magnitude for validation/clamping — only what's shown to the user (and the amounts
  // derived from it) gets the sign flip. buildLineBody still receives the plain positive qty and
  // is responsible for negating it before persisting (see ImportFromSourceInvoiceModal).
  const lineQtyOf = (line) => {
    const maxQty = line._maxQty || 0;
    const currentQty = lineQuantities[line.id] ?? maxQty;
    return { maxQty, currentQty, displayQty: negativeQuantity ? -currentQty : currentQty };
  };

  // The amount the line's «Importe» cell shows (null = the cell shows «-»). The document row adds
  // up exactly these, so the row always equals the sum of its lines (ETP-5828, QA obs. 3).
  const lineAmountOf = (line) => {
    const unitPrice = line._unitPrice || null;
    return unitPrice != null ? unitPrice * lineQtyOf(line).displayQty : null;
  };

  // The note under the product: ETP-5828 (QA BUG-1) it wraps onto a second line inside the same
  // fixed column (clamped at 2, so the 64 px row never grows) with the full text as a tooltip —
  // a draft invoice number truncated after «borrador FV1…» told the user nothing.
  const defaultImportedNote = (line) => (line._inDraftShipments?.length
    ? `${ui('inDraftShipment')}: ${line._inDraftShipments.join(', ')}`
    : ui('alreadyImported'));

  const renderLineNote = (line, imported) => {
    const note = describeLine?.(line, { imported }) || (imported ? defaultImportedNote(line) : null);
    if (!note) return null;
    return (
      <span
        className="line-clamp-2 break-words text-xs leading-4 text-muted-foreground"
        title={note}
        data-testid={imported ? 'ImportLinesModal__importedNote' : 'ImportLinesModal__lineNote'}
      >
        {note}
      </span>
    );
  };

  const renderLine = (line, docId) => {
    const imported = line._alreadyImported;
    const lineSelected = !imported && selected.has(line.id);
    const { maxQty, currentQty, displayQty } = lineQtyOf(line);
    const qtyEdited = currentQty !== maxQty;
    const unitPrice = line._unitPrice || null;
    const lineTotal = lineAmountOf(line);
    return (
      <div
        key={line.id}
        data-testid="ImportLinesModal__lineRow"
        data-line-id={line.id}
        data-doc-id={docId}
        data-selected={lineSelected ? 'true' : 'false'}
        onClick={() => !imported && toggleLine(line.id)}
        className={cn(
          'flex h-16 items-center border-t border-border-subtle text-sm',
          imported ? 'cursor-default opacity-40' : 'cursor-pointer',
          lineSelected && 'bg-muted',
        )}
      >
        <span className="flex w-8 shrink-0 justify-center pl-2">
          <Checkbox
            checked={lineSelected}
            disabled={imported}
            onClick={e => e.stopPropagation()}
            onChange={() => !imported && toggleLine(line.id)}
            className="shrink-0"
            data-testid="Checkbox__5345ae" />
        </span>
        <span className={cn('min-w-0 px-3', showPriceColumns ? 'w-[176px] shrink-0' : 'flex-1')}>
          <span className="block truncate font-semibold text-foreground">{line._productName}</span>
          {renderLineNote(line, imported)}
        </span>
        {showAvailableQtyColumn && (
          <span className="w-[90px] shrink-0 px-3 text-right tabular-nums text-muted-foreground">
            {formatPlainDecimal(maxQty)}
          </span>
        )}
        <span className="flex w-[174px] shrink-0 px-3">
          {renderQtyStepper(line, { imported, displayQty, maxQty, qtyEdited })}
        </span>
        {showPriceColumns && (
          <span className="min-w-0 flex-1 px-3 text-right tabular-nums tracking-[-0.01em] text-foreground">
            {unitPrice ? formatCurrency(undefined, unitPrice) : '-'}
          </span>
        )}
        {showPriceColumns && (
          <span className="min-w-0 flex-1 px-3 text-right tabular-nums tracking-[-0.01em] text-foreground">
            {lineTotal ? formatCurrency(undefined, lineTotal) : '-'}
          </span>
        )}
      </div>
    );
  };

  const renderLinesTable = (doc, lines, checkState) => {
    if (loadingLines.has(doc.id)) {
      return <div className="py-2 text-sm text-muted-foreground">{ui('loadingLines')}</div>;
    }
    if (lines.length === 0) {
      return <div className="py-2 text-sm text-muted-foreground">{ui('noLinesFound')}</div>;
    }
    const noneSelectable = selectableIdsOf(lines).length === 0;
    return (
      <div className={cn('overflow-hidden rounded-lg border border-border-subtle bg-card', SHADOW_XS)}>
        <div className="flex h-10 items-center text-xs font-semibold leading-4 text-foreground">
          <span className="flex w-8 shrink-0 justify-center pl-2">
            <Checkbox
              checked={checkState.checked}
              indeterminate={checkState.indeterminate}
              disabled={noneSelectable}
              onChange={() => toggleDoc(doc.id)}
              aria-label={ui('selectAll')}
              className="shrink-0"
              data-testid="ImportLinesModal__linesMasterCheckbox" />
          </span>
          <span className={cn('px-3', showPriceColumns ? 'w-[176px] shrink-0' : 'flex-1')}>{ui('product')}</span>
          {showAvailableQtyColumn && <span className="w-[90px] shrink-0 px-3 text-right">{ui('qty')}</span>}
          <span className="w-[174px] shrink-0 px-3">{ui(qtyColumnLabelKey)}</span>
          {showPriceColumns && <span className="flex-1 px-3 text-right">{ui('price')}</span>}
          {showPriceColumns && <span className="flex-1 px-3 text-right">{ui('amount')}</span>}
        </div>
        {lines.map(line => renderLine(line, doc.id))}
      </div>
    );
  };

  function renderDocument(doc) {
    const isExpanded = expanded.has(doc.id);
    const lines = docLines[doc.id] || [];
    const checkState = getDocCheckState(doc.id);
    const hasAnySelected = checkState.checked || checkState.indeterminate;
    const display = getDocDisplay(doc);
    // The plain sum of what the lines show; a line without a unit price (its cell shows «-»)
    // contributes the caller's `_lineNetAmount`, as before.
    const docTotalSign = negativeQuantity ? -1 : 1;
    const linesTotal = lines.length > 0
      ? lines.reduce((sum, l) => sum + (lineAmountOf(l) ?? (l._lineNetAmount || 0) * docTotalSign), 0)
      : null;
    // Loaded lines always win (the total follows quantity edits); the document's own total only
    // stands in while its lines are not loaded yet.
    const docOwnTotal = docLines[doc.id] === undefined ? getDocumentTotal?.(doc) : undefined;
    const docTotal = Number.isFinite(docOwnTotal) ? docOwnTotal : linesTotal;
    return (
      <div key={doc.id} data-testid="ImportLinesModal__document" data-doc-id={doc.id}>
        <div
          data-testid="ImportLinesModal__docRow"
          data-selected={hasAnySelected ? 'true' : 'false'}
          data-expanded={isExpanded ? 'true' : 'false'}
          onClick={() => toggleExpand(doc.id)}
          className={cn(
            'relative flex h-10 cursor-pointer items-center border-b border-border-subtle text-sm text-foreground transition-[background-color,box-shadow]',
            hasAnySelected ? 'bg-muted' : 'hover:z-[1] hover:bg-card hover:shadow-lg',
          )}
        >
          <span className="flex w-10 shrink-0 justify-center px-2">
            {/* Shared round chevron (ETP-5593), sized to the Figma 24 × 24, with shadow-xs. Border
                and icon use the closest tokens to the Figma's #C7CBD3 / #81848F: --sf-border-input
                (#D1D4DB) and --sf-icon-outline-secondary (#828FA3), both with dark values. `!`
                because RowExpandToggle's own h-7/w-7/border/text classes would otherwise win. */}
            <RowExpandToggle
              orientation="horizontal"
              expanded={isExpanded}
              onToggle={() => toggleExpand(doc.id)}
              stopPropagation
              iconTestId="ImportLinesModal__expandIcon"
              className={cn('!h-6 !w-6 !border-[hsl(var(--sf-border-input))] !text-[hsl(var(--sf-icon-outline-secondary))]', SHADOW_XS)}
              data-testid="ImportLinesModal__expand"
            />
          </span>
          <span className="flex w-6 shrink-0 justify-center">
            <Checkbox
              checked={checkState.checked}
              indeterminate={checkState.indeterminate}
              onClick={e => e.stopPropagation()}
              onChange={() => toggleDoc(doc.id)}
              className="shrink-0"
              data-testid="Checkbox__5345ae" />
          </span>
          <span className="w-[124px] shrink-0 truncate px-3 font-semibold">{display.docNo}</span>
          <span className="w-[112px] shrink-0 truncate px-3">{fmtDate(display.date)}</span>
          <span className="flex w-[172px] shrink-0 items-center px-3">{renderDocAdornment?.(doc, selection)}</span>
          <span className="min-w-0 flex-1 truncate pl-3 pr-14 text-right tabular-nums">
            {display.secondary || (docTotal != null ? formatCurrency(undefined, docTotal) : '')}
          </span>
        </div>
        {isExpanded && (
          <div
            data-testid="ImportLinesModal__docLines"
            className={cn('px-11 pb-6 pt-3', hasAnySelected ? 'bg-muted' : 'bg-card')}
          >
            {renderLinesTable(doc, lines, checkState)}
          </div>
        )}
      </div>
    );
  }

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4"
      data-testid="ImportLinesModal__overlay"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ui(titleKey)}
        onClick={e => e.stopPropagation()}
        data-testid="import-lines-modal"
        className="relative flex flex-col gap-2 overflow-hidden rounded-lg bg-card py-2 text-foreground shadow-[var(--sf-shadow-overlay)]"
        style={{
          width: DIALOG_WIDTH, height: DIALOG_HEIGHT,
          maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 32px)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={ui('close')}
          data-testid="ImportLinesModal__close"
          className={cn('absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted', ICON_COLOR)}
        >
          <X size={20} aria-hidden="true" data-testid="X__b0ad7a" />
        </button>

        <div className="flex shrink-0 flex-col gap-0.5 py-3 pl-7 pr-12">
          <span className="font-['Plus_Jakarta_Sans',Inter,sans-serif] text-xl font-semibold leading-7 tracking-[-0.005em] text-foreground">
            {ui(titleKey)}
          </span>
          <span className="min-h-4 truncate text-xs leading-4 text-foreground">{bpName}</span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 px-7 pb-3">
          <div className="flex h-10 shrink-0 items-center gap-3">
            <label className="relative flex h-10 min-w-0 flex-1 items-center">
              <Search
                size={20}
                aria-hidden="true"
                className={cn('pointer-events-none absolute left-2', ICON_COLOR)}
                data-testid="Search__b0ad7a" />
              <input
                data-testid="import-lines-search"
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={ui(searchPlaceholderKey)}
                aria-label={ui(searchPlaceholderKey)}
                className={cn(
                  'h-10 w-full rounded-lg border bg-card py-2 pl-9 pr-2 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-focus-ring',
                  CONTROL_BORDER, SHADOW_XS,
                )}
              />
            </label>
            <button
              type="button"
              onClick={toggleSelectAll}
              disabled={selectAllDisabled || loading || eagerLoadingLines}
              data-testid="ImportLinesModal__selectAll"
              className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium leading-6 text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            >
              <SquareCheck size={20} aria-hidden="true" className={ICON_COLOR} data-testid="SquareCheck__b0ad7a" />
              {ui(allVisibleSelected ? 'deselectAll' : 'selectAll')}
            </button>
          </div>

          <div data-testid="ImportLinesModal__list" className="min-h-0 flex-1 overflow-y-auto rounded-lg">
            {renderList()}
          </div>

          {renderSelectionPanel && (
            <div
              data-testid="ImportLinesModal__selectionPanelSlot"
              className="box-border shrink-0"
              style={{ height: NOTICE_GAP + NOTICE_HEIGHT, paddingTop: NOTICE_GAP }}
            >
              {(!loading && !eagerLoadingLines && renderSelectionPanel(selection)) || (
                <ImportNotice
                  tone="neutral"
                  title={ui('importNoticeTitle')}
                  body={ui('importNoticeBody')}
                  data-testid="ImportLinesModal__neutralNotice" />
              )}
            </div>
          )}
        </div>

        <div className="flex h-16 shrink-0 items-center justify-between gap-3 px-7 py-3">
          <span
            data-testid="ImportLinesModal__selectionHint"
            className="flex min-w-0 items-center gap-1 text-sm leading-5 text-status-neutral-foreground"
          >
            {renderFooterHint()}
          </span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onClose}
              data-testid="ImportLinesModal__cancel"
              className={cn(PILL_BASE, 'border bg-card text-foreground hover:bg-muted', CONTROL_BORDER, SHADOW_XS)}
            >
              {ui('cancel')}
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={importDisabled}
              data-testid="ImportLinesModal__import"
              className={cn(PILL_BASE, 'bg-primary text-primary-foreground enabled:hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/40')}
            >
              {importing ? ui('importing') : ui(importButtonKey, { count: selectionSize > 0 ? ` (${selectionSize})` : '' })}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
