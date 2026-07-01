import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, X, GripVertical, Pencil, Copy, Trash2, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.jsx';
import { PillToggle } from '@/components/PillToggle';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useNeoResource, getApiBase } from '@/hooks/useNeoResource.js';
import { useUI, useMenuLabel, useLabel } from '@/i18n';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { translateBackendError } from '@/lib/backendErrors.js';
import { resolveIdentifier } from '@/lib/resolveIdentifier.js';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { EntityForm } from './EntityForm.jsx';
import { InfoBanner } from '../InfoBanner.jsx';
import { ListModalCell, cellAlignClass } from './listModalCells.jsx';
import { ListModalToolbarFilter } from './ListModalToolbarFilter.jsx';
import { AdvancedFilterButton } from './AdvancedFilterButton.jsx';
import { applyConditions } from '@/windows/custom/financial-account/advancedFilterApply';

// Resolve an i18n label, falling back to a default key when the configured key is
// absent. Keeps title/submit-label expressions free of nested ternaries (Sonar S3358).
function labelOrFallback(ui, key, fallbackKey) {
  return key ? ui(key) : ui(fallbackKey);
}

// A field whose value persists as a JSON boolean (YESNO checkbox / inline toggle).
function isBooleanField(f) {
  return f.type === 'checkbox' || f.toggle === true || f.tsType === 'boolean';
}

// Coerce an AD YESNO value (boolean / 'Y' / 'true') to a real boolean.
function toBoolean(v) {
  return v === true || v === 'Y' || v === 'true';
}

// Resolve the modal's title / subtitle / submit label for create vs edit. Kept as a
// helper so its ternaries don't inflate ListModalWindow's cognitive complexity.
function resolveModalLabels(editingRow, config, ui) {
  const title = editingRow
    ? labelOrFallback(ui, config?.editTitleKey, 'edit')
    : labelOrFallback(ui, config?.titleKey, 'createRecord');
  const subtitleKey = editingRow
    ? (config?.editSubtitleKey ?? config?.subtitleKey)
    : config?.subtitleKey;
  const submitLabel = editingRow
    ? labelOrFallback(ui, config?.editSubmitLabelKey, 'save')
    : labelOrFallback(ui, config?.submitLabelKey, 'createRecord');
  return { title, subtitle: subtitleKey ? ui(subtitleKey) : null, submitLabel };
}

// Canonicalizes a filter value so boolean Yes/No fields match regardless of the
// representation NEO returns (boolean true/false) vs the option codes ('Y'/'N').
// Non-boolean values (e.g. enum codes) pass through as their string form.
function canonFilterValue(v) {
  if (v === true || v === 'Y' || v === 'true') return 'Y';
  if (v === false || v === 'N' || v === 'false') return 'N';
  return String(v);
}

// Client-side filtering for the list: exact-match toolbar dropdown filters first,
// then a free-text search over the searchable columns. Pure helper so the
// component's useMemo stays trivial (keeps cognitive complexity low).
function filterRows(allRows, { toolbarFilters, filterValues, searchQuery, filters }) {
  let result = allRows;
  for (const f of toolbarFilters) {
    const selected = filterValues[f.key];
    if (selected == null) continue;
    const field = f.field ?? f.key;
    const target = canonFilterValue(selected);
    result = result.filter(row => canonFilterValue(row?.[field]) === target);
  }
  const q = searchQuery.trim().toLowerCase();
  if (q && filters.length > 0) {
    result = result.filter(row =>
      filters.some(key => {
        const v = resolveIdentifier(row, key) ?? row?.[key];
        return v != null && String(v).toLowerCase().includes(q);
      }),
    );
  }
  return result;
}

// Builds the AdvancedFilterBuilder column metadata. The advanced filter offers EVERY
// entity column — the union of grid columns AND modal fields — so columns hidden from
// the grid (e.g. pattern, contact, dimensions) are still filterable. FK/selector columns
// filter on their resolved `$_identifier` (the raw cell holds an opaque id); enums expose
// their labels; numeric cells become number filters; toggles/booleans are skipped (covered
// by the dedicated toolbar Active dropdown).
function buildFilterColumns(columns, fields, ui, tMenu, tLabel) {
  const NUMERIC = ['number', 'amount', 'integer', 'decimal', 'price', 'quantity'];
  // Union by key; grid columns win on duplicates (richer cell metadata / gridLabelKey).
  const byKey = new Map();
  for (const f of (fields ?? [])) if (f && f.key) byKey.set(f.key, f);
  for (const c of (columns ?? [])) if (c && c.key) byKey.set(c.key, c);

  const isFk = (col) => col.type === 'selector' || col.type === 'foreignKey'
    || col.inputMode === 'selector' || col.inputMode === 'search';
  const resolveLabel = (col) => (col.labelKey ? ui(col.labelKey) : null)
    ?? (tLabel ? tLabel(col.column) : null) ?? tMenu(col.label) ?? col.label ?? col.key;

  return [...byKey.values()]
    .map((col) => {
      if (col.cellType === 'toggle' || col.type === 'boolean') return null; // handled by the toolbar Active dropdown
      const label = resolveLabel(col);
      // FK/selector → 'selector' so the builder renders the value-list picker
      // (resolveFilterMode → 'identifier'): it offers the distinct id/identifier
      // pairs from the rows and matches on the FK id, not a typed string.
      if (isFk(col)) {
        return { key: col.key, column: col.column, label, type: 'selector' };
      }
      if (col.enumLabels && (col.type === 'enum' || col.type === 'status')) {
        return { key: col.key, label, type: 'enum', enumLabels: col.enumLabels };
      }
      if (col.cellType === 'percent' || NUMERIC.includes(col.type)) {
        return { key: col.key, label, type: 'number' };
      }
      return { key: col.key, label, type: 'string' };
    })
    .filter(Boolean);
}

/**
 * Generic, contract-driven layout for catalog / master-data windows that present a
 * grid (list) plus a create/edit MODAL, with NO drill-in detail view.
 *
 * It is intentionally backend-agnostic: every behaviour is driven by the props the
 * pipeline emits from `contract.json` (the NEO endpoint via `api`, the grid
 * `columns`, the modal `fields` grouped by `sections`, the searchable `filters`,
 * and the optional toolbar dropdown `filters` declared in `config.toolbarFilters`).
 * Any window can opt in with `decisions.json → window.layoutType: "list-modal"`.
 *
 * The grid is rendered in-house (not via DataTable) so list-modal windows get the
 * Figma row chrome — drag handle, cell-type renderers (priority pill, name+subline,
 * condition chip, type pill, percent, inline toggle), and a hover edit action.
 * Cell rendering is registry-driven (`column.cellType`), so the component stays
 * generic: window specifics live in the contract, never here.
 *
 * CRUD follows the generic NEO Headless W convention:
 *   - list   GET    {apiBaseUrl}/{entity}
 *   - create POST   {apiBaseUrl}/{entity}
 *   - update PUT    {apiBaseUrl}/{entity}/{id}
 *   - patch  PATCH  {apiBaseUrl}/{entity}/{id}   (inline toggle)
 *   - delete DELETE {apiBaseUrl}/{entity}/{id}
 *
 * @param {object}   props
 * @param {string}   props.entity         contract entity name (e.g. "header")
 * @param {string}   props.entityLabel    window/menu label (translated via useMenuLabel)
 * @param {string}   props.windowName
 * @param {string}   [props.breadcrumb]
 * @param {Array}    props.columns        grid column descriptors (carry cellType)
 * @param {Array}    props.fields         EntityForm field descriptors (grouped by section)
 * @param {Array}    props.sections       ordered [{ key, label? }] for modal grouping
 * @param {string[]} props.filters        column keys used by the local search box
 * @param {object}   props.config         { titleKey, editTitleKey, subtitleKey,
 *                                          editSubtitleKey, submitLabelKey,
 *                                          editSubmitLabelKey, bannerKey,
 *                                          searchPlaceholderKey, newLabelKey,
 *                                          autoPriorityField, autoPriorityStep,
 *                                          toolbarFilters, backLabelKey, backTo,
 *                                          footerToggleField, sectionGrid }
 *   - footerToggleField {string}  field name (a boolean field from `fields`) rendered
 *                                  as the footer switch + helper instead of in the body grid.
 *   - sectionGrid       {object}  per-section column count for the body grid, keyed by
 *                                  section key (e.g. `{ general: 3, dimensions: 4 }`).
 *                                  Defaults to 3 columns for every section.
 * @param {object}   props.api            apiPrediction block (carries baseUrl + selectors)
 */
export function ListModalWindow({
  entity,
  entityLabel,
  breadcrumb,
  columns = [],
  fields = [],
  sections = [],
  filters = [],
  config = {},
  api,
  token: tokenProp,
  apiBaseUrl: apiBaseUrlProp,
}) {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const tLabel = useLabel(api?.labelOverrides);
  const auth = useAuth();
  const navigate = useNavigate();
  const token = tokenProp ?? auth?.token;

  const apiBaseUrl = useMemo(
    () => apiBaseUrlProp || (api?.baseUrl ? `${getApiBase()}${api.baseUrl}` : getApiBase()),
    [apiBaseUrlProp, api],
  );

  const label = tMenu(entityLabel) || entityLabel || entity;
  const fullBreadcrumb = breadcrumb
    ? breadcrumb.split(' / ').map(s => tMenu(s.trim())).join(' / ')
    : label;
  useSetPageMeta({ title: label, breadcrumb: fullBreadcrumb });

  // --- List data (generic GET; reload after any mutation) -------------------
  const { data: rows, loading, reload } = useNeoResource({
    path: api?.baseUrl ? `${api.baseUrl}/${entity}` : null,
    mapPayload: (raw) => (Array.isArray(raw) ? raw : (raw?.items ?? raw?.[entity] ?? [])),
    label: `ListModalWindow:${entity}`,
  });
  const allRows = useMemo(() => rows ?? [], [rows]);

  // --- Toolbar dropdown filters (declarative; applied client-side) ----------
  const toolbarFilters = config?.toolbarFilters ?? [];
  const [filterValues, setFilterValues] = useState({}); // { [filterKey]: value|null }
  const setToolbarFilter = useCallback((key, value) => {
    setFilterValues(prev => ({ ...prev, [key]: value }));
  }, []);

  // --- Advanced "by conditions" filter (shared AdvancedFilterBuilder) --------
  const [advancedFilter, setAdvancedFilter] = useState(null);
  const filterColumns = useMemo(
    () => buildFilterColumns(columns, fields, ui, tMenu, tLabel),
    [columns, fields, ui, tMenu, tLabel],
  );

  // --- Local search over the configured filter columns ----------------------
  const [searchQuery, setSearchQuery] = useState('');
  const data = useMemo(
    () => {
      const filtered = applyConditions(
        filterRows(allRows, { toolbarFilters, filterValues, searchQuery, filters }),
        advancedFilter,
      );
      // Order by the auto-priority field ascending when the window declares one
      // (e.g. match rules: the banner states rows are evaluated in ascending
      // priority order, so the list must mirror that — 10, 20, 30…). Rows with a
      // missing/non-numeric priority sink to the end; ties keep their order
      // (Array.prototype.sort is stable).
      const priorityField = config?.autoPriorityField;
      if (!priorityField) return filtered;
      return [...filtered].sort((a, b) => {
        const av = Number(a?.[priorityField]);
        const bv = Number(b?.[priorityField]);
        const aok = Number.isFinite(av);
        const bok = Number.isFinite(bv);
        if (aok && bok) return av - bv;
        if (aok) return -1;
        if (bok) return 1;
        return 0;
      });
    },
    [allRows, searchQuery, filters, toolbarFilters, filterValues, advancedFilter, config],
  );

  // --- Create / edit modal --------------------------------------------------
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null); // null = create
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [savingToggles, setSavingToggles] = useState({});
  const [deletingRow, setDeletingRow] = useState(null); // row pending delete confirmation
  const [deleting, setDeleting] = useState(false);

  const requiredKeys = useMemo(() => fields.filter(f => f.required).map(f => f.key), [fields]);

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  // Read and translate a backend error message from a failed Response.
  const errorMessage = useCallback(async (res) => {
    let raw = `HTTP ${res.status}`;
    try {
      const json = await res.json();
      raw = json?.error?.message || json?.response?.error?.message || raw;
    } catch { /* non-JSON body */ }
    return translateBackendError(raw, ui) || raw;
  }, [ui]);

  // Suggested value for an auto-incrementing field (e.g. Priority = max + step),
  // computed entirely on the frontend from the loaded list — no backend endpoint.
  const computeAutoValue = useCallback(() => {
    const fieldKey = config?.autoPriorityField;
    if (!fieldKey) return {};
    const step = config?.autoPriorityStep ?? 10;
    const max = allRows.reduce((acc, r) => {
      const v = Number(r?.[fieldKey]);
      return Number.isFinite(v) && v > acc ? v : acc;
    }, 0);
    return { [fieldKey]: max + step };
  }, [config, allRows]);

  const seedDefaults = useCallback(() => {
    const seed = {};
    for (const f of fields) {
      if (f.defaultValue === undefined) continue;
      // Boolean fields persist as JSON booleans; the AD default arrives as 'Y'/'N',
      // so coerce it — a literal "Y" string is read as false by the W CRUD boolean
      // mapping, which would silently create an inactive record.
      seed[f.key] = isBooleanField(f) ? toBoolean(f.defaultValue) : f.defaultValue;
    }
    return { ...seed, ...computeAutoValue() };
  }, [fields, computeAutoValue]);

  const openCreate = useCallback(() => {
    setEditingRow(null);
    setFormData(seedDefaults());
    setFormError(null);
    setModalOpen(true);
  }, [seedDefaults]);

  const openEdit = useCallback((row) => {
    setEditingRow(row);
    setFormData({ ...row });
    setFormError(null);
    setModalOpen(true);
  }, []);

  // Clone: open the create modal (no editingRow → POST) pre-filled with the source
  // row's values verbatim, minus its id, so every field — including priority — loads
  // exactly as the cloned rule. FK `$_identifier` values are kept so the selectors
  // render the cloned labels. The user adjusts whatever they need (e.g. priority,
  // which must stay unique within scope) before saving.
  const openClone = useCallback((row) => {
    setEditingRow(null);
    const clone = { ...row };
    delete clone.id;
    setFormData(clone);
    setFormError(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingRow(null);
    setFormData({});
    setFormError(null);
  }, []);

  const handleFieldChange = useCallback((key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    if (formError) setFormError(null);
  }, [formError]);

  const missingRequired = useMemo(
    () => requiredKeys.filter(k => formData[k] == null || formData[k] === ''),
    [requiredKeys, formData],
  );

  const handleSave = useCallback(async () => {
    if (missingRequired.length > 0) {
      setFormError(ui('requiredFieldsMissing'));
      return;
    }
    setSaving(true);
    setFormError(null);
    // Generic NEO W CRUD: POST {entity} creates, PUT {entity}/{id} updates.
    const url = editingRow
      ? `${apiBaseUrl}/${entity}/${encodeURIComponent(editingRow.id)}`
      : `${apiBaseUrl}/${entity}`;
    try {
      const res = await fetch(url, {
        method: editingRow ? 'PUT' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        setFormError(await errorMessage(res));
        return;
      }
      closeModal();
      reload();
    } catch (e) {
      setFormError(e?.message || ui('genericError'));
    } finally {
      setSaving(false);
    }
  }, [missingRequired, editingRow, apiBaseUrl, entity, formData, authHeaders, ui, closeModal, reload, errorMessage]);

  // Inline toggle: PATCH {entity}/{id} with optimistic UI handled by reload.
  const handleToggle = useCallback(async (row, col, nextChecked) => {
    const key = `${row.id}:${col.key}`;
    setSavingToggles(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(`${apiBaseUrl}/${entity}/${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ [col.key]: nextChecked }),
      });
      if (!res.ok) {
        toast.error(await errorMessage(res));
        return;
      }
      reload();
    } catch (e) {
      toast.error(e?.message || ui('genericError'));
    } finally {
      setSavingToggles(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, [apiBaseUrl, entity, authHeaders, errorMessage, reload, ui]);

  // Delete confirmed from the dialog: DELETE {entity}/{id}, then reload.
  const handleDeleteConfirmed = useCallback(async () => {
    if (!deletingRow) return;
    setDeleting(true);
    try {
      const res = await fetch(`${apiBaseUrl}/${entity}/${encodeURIComponent(deletingRow.id)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) {
        toast.error(await errorMessage(res));
        return;
      }
      setDeletingRow(null);
      reload();
    } catch (e) {
      toast.error(e?.message || ui('genericError'));
    } finally {
      setDeleting(false);
    }
  }, [deletingRow, apiBaseUrl, entity, authHeaders, errorMessage, reload, ui]);

  const handleBack = useCallback(() => {
    if (config?.backTo) navigate(config.backTo);
    else navigate(-1);
  }, [config, navigate]);

  // Modal title / subtitle / submit label (Figma). Resolved in a helper so the
  // create-vs-edit ternaries stay out of the component's cognitive complexity.
  const { title, subtitle, submitLabel } = resolveModalLabels(editingRow, config, ui);

  // The optional footer toggle (a boolean field promoted out of the body grid into
  // the footer, beside the submit button — e.g. "Crear transacción automáticamente").
  const footerToggleKey = config?.footerToggleField ?? null;
  const footerToggleField = footerToggleKey
    ? fields.find(f => f.key === footerToggleKey)
    : null;
  // tLabel (declared above) is the field-label resolver honoring per-window
  // labelOverrides (es/en), so the footer toggle label matches the localized form labels.
  const footerToggleLabel = footerToggleField
    ? (tLabel(footerToggleField.column) ?? footerToggleField.label ?? footerToggleField.key)
    : null;
  const isToggleOn = (v) => v === true || v === 'Y' || v === 'true';

  // Per-section column count for the body grid (defaults to 3).
  const sectionGrid = config?.sectionGrid ?? {};
  const colsFor = (key) => sectionGrid[key] ?? 3;

  const showBanner = config?.bannerKey && !bannerDismissed;
  const hasSearch = filters.length > 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar — left: back + dropdown filters; right: search + New */}
      <div className="flex items-center justify-between gap-2 px-2 pt-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBack}
            data-testid="list-modal-back"
            className="inline-flex h-10 items-center rounded-lg border border-[#D1D4DB] bg-white px-3 text-sm font-medium leading-6 text-[#121217] shadow-[0_1px_2px_rgba(18,18,23,0.05)] transition-colors hover:bg-[#F5F7F9]"
          >
            {config?.backLabelKey ? ui(config.backLabelKey) : ui('cancel')}
          </button>
          {toolbarFilters.map(f => (
            <ListModalToolbarFilter
              key={f.key}
              filter={f}
              value={filterValues[f.key] ?? null}
              onChange={(v) => setToolbarFilter(f.key, v)}
              ui={ui}
              data-testid="ListModalToolbarFilter__19eda5" />
          ))}
          <AdvancedFilterButton
            columns={filterColumns}
            rows={allRows}
            entity={entity}
            apiBaseUrl={apiBaseUrl}
            labelOverrides={api?.labelOverrides}
            value={advancedFilter}
            onChange={setAdvancedFilter}
            testId="list-modal-advanced-filter"
            data-testid="AdvancedFilterButton__19eda5" />
        </div>
        <div className="flex items-center gap-2">
          {hasSearch && (
            <div className="relative w-[280px]">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#828FA3]"
                data-testid="Search__19eda5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={config?.searchPlaceholderKey ? ui(config.searchPlaceholderKey) : ui('search')}
                data-testid="list-modal-search"
                className="h-10 w-full rounded-lg border border-[#D1D4DB] bg-white pl-9 pr-3 text-sm leading-6 text-[#121217] shadow-[0_1px_2px_rgba(18,18,23,0.05)] placeholder:text-[#6C6C89] focus:outline-none focus:ring-2 focus:ring-[#121217]/10"
              />
            </div>
          )}
          <button
            type="button"
            onClick={openCreate}
            data-testid="list-modal-new"
            className="group inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#121217] px-3 text-sm font-medium leading-6 text-white transition-colors hover:bg-[#FFD500] hover:text-[#121217]"
          >
            <Plus
              className="h-4 w-4 text-white/90 group-hover:text-[#121217]"
              data-testid="Plus__19eda5" />
            {config?.newLabelKey ? ui(config.newLabelKey) : ui('newRecord')}
          </button>
        </div>
      </div>
      {/* Dismissible banner explaining how the rows are evaluated */}
      {showBanner && (
        <InfoBanner
          tone="info"
          dismissible
          onDismiss={() => setBannerDismissed(true)}
          dismissTestId="list-modal-banner-dismiss"
          className="mx-2"
          data-testid="InfoBanner__19eda5">
          {ui(config.bannerKey)}
        </InfoBanner>
      )}
      {/* Grid */}
      {loading && allRows.length === 0 ? (
        <div className="flex flex-col gap-2 px-2">
          <Skeleton className="h-10 w-full" data-testid="Skeleton__19eda5" />
          <Skeleton className="h-10 w-full" data-testid="Skeleton__19eda5" />
          <Skeleton className="h-10 w-full" data-testid="Skeleton__19eda5" />
        </div>
      ) : (
        <div className="px-2">
          <ListModalGrid
            columns={columns}
            data={data}
            tMenu={tMenu}
            ui={ui}
            onEdit={openEdit}
            onClone={config.allowClone ? openClone : undefined}
            onDelete={(row) => setDeletingRow(row)}
            deletingId={deleting ? deletingRow?.id : null}
            onToggle={handleToggle}
            savingToggles={savingToggles}
            data-testid="ListModalGrid__19eda5" />
        </div>
      )}
      {/* Create / edit modal — Figma "Nueva Regla de matcheo" layout:
          wide container, header (title + subtitle), multi-column body grouped by
          section, and a footer with an optional toggle (left) + pill submit (right). */}
      <Dialog
        open={modalOpen}
        onOpenChange={(o) => (o ? setModalOpen(true) : closeModal())}
        data-testid="Dialog__19eda5">
        <DialogContent
          className="flex max-h-[90vh] w-full max-w-6xl flex-col gap-0 overflow-hidden rounded-lg bg-white p-0"
          data-testid="DialogContent__19eda5">
          {/* Header */}
          <DialogHeader
            className="space-y-1 px-5 py-2 text-left"
            data-testid="DialogHeader__19eda5">
            <DialogTitle
              className="text-xl font-semibold leading-7 tracking-normal text-[#121217]"
              data-testid="DialogTitle__19eda5">
              {title}
            </DialogTitle>
            {subtitle && (
              <p className="text-xs font-normal leading-4 text-[#6C6C89]" data-testid="list-modal-subtitle">
                {subtitle}
              </p>
            )}
          </DialogHeader>

          {/* Body — section grids */}
          <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-2 pt-1">
            {sections.map((sec) => {
              const sectionFields = fields.filter(
                f => (f.section || 'general') === sec.key && f.key !== footerToggleKey,
              );
              if (sectionFields.length === 0) return null;
              const sectionLabel = sec.label ? ui(sec.label) : null;
              return (
                <div key={sec.key} className="flex flex-col gap-3">
                  {sectionLabel && (
                    <h4 className="text-sm font-semibold leading-6 text-[#121217]" data-testid={`list-modal-section-${sec.key}`}>
                      {sectionLabel}
                    </h4>
                  )}
                  <EntityForm
                    entity={entity}
                    fields={sectionFields}
                    data={formData}
                    onChange={handleFieldChange}
                    api={api}
                    token={token}
                    apiBaseUrl={apiBaseUrl}
                    labelOverrides={api?.labelOverrides}
                    cols={colsFor(sec.key)}
                    data-testid="EntityForm__19eda5" />
                </div>
              );
            })}

            {formError && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <X size={16} className="mt-0.5 flex-shrink-0" data-testid="X__19eda5" />
                <span>{formError}</span>
              </div>
            )}
          </div>

          {/* Footer — optional toggle + helper (left), pill submit (right) */}
          <ModalFooter
            toggleField={footerToggleField}
            toggleKey={footerToggleKey}
            toggleLabel={footerToggleLabel}
            toggleChecked={isToggleOn(formData[footerToggleKey])}
            onToggleChange={(next) => handleFieldChange(footerToggleKey, next)}
            onSubmit={handleSave}
            submitDisabled={saving || missingRequired.length > 0}
            submitting={saving}
            submitLabel={submitLabel}
            ui={ui}
            data-testid="ModalFooter__19eda5" />
        </DialogContent>
      </Dialog>
      <DeleteConfirmDialog
        open={!!deletingRow}
        busy={deleting}
        onCancel={() => setDeletingRow(null)}
        onConfirm={handleDeleteConfirmed}
        ui={ui}
        data-testid="DeleteConfirmDialog__19eda5" />
    </div>
  );
}

/**
 * Modal footer: optional toggle + helper (left) and the pill submit button (right).
 * Extracted so its conditionals live here instead of inflating ListModalWindow.
 */
function ModalFooter({ toggleField, toggleKey, toggleLabel, toggleChecked, onToggleChange, onSubmit, submitDisabled, submitting, submitLabel, ui }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-[#E8EAEF] px-5 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {toggleField ? (
          <>
            <div className="flex items-center gap-2">
              <PillToggle
                checked={toggleChecked}
                onCheckedChange={onToggleChange}
                aria-label={toggleLabel}
                data-testid={`list-modal-footer-toggle-${toggleKey}`}
              />
              <span className="text-sm font-medium leading-6 text-[#121217]">{toggleLabel}</span>
            </div>
            {toggleField.help && (
              <p className="text-sm leading-6 text-[#6C6C89]">{ui(toggleField.help) ?? toggleField.help}</p>
            )}
          </>
        ) : (
          <span />
        )}
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitDisabled}
        data-testid="list-modal-submit"
        className="inline-flex h-10 shrink-0 items-center justify-center rounded-full px-3 py-2 text-sm font-medium leading-6 text-white transition-colors disabled:bg-[#D1D4DB] disabled:text-white enabled:bg-[#121217] enabled:hover:bg-[#FFD500] enabled:hover:text-[#121217]"
      >
        {submitting ? ui('saving') : submitLabel}
      </button>
    </div>
  );
}

/** Delete confirmation dialog. Extracted to keep its conditional out of the main component. */
function DeleteConfirmDialog({ open, busy, onCancel, onConfirm, ui }) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o && !busy) onCancel(); }}
      data-testid="Dialog__19eda5">
      <DialogContent
        className="max-w-md gap-0 rounded-lg bg-white p-6"
        data-testid="DialogContent__19eda5">
        <DialogHeader className="space-y-1.5 text-left" data-testid="DialogHeader__19eda5">
          <DialogTitle
            className="text-lg font-semibold leading-6 text-[#121217]"
            data-testid="DialogTitle__19eda5">
            {ui('deleteConfirmTitle')}
          </DialogTitle>
          <p className="text-sm leading-5 text-[#6C6C89]">{ui('deleteConfirmMessage')}</p>
        </DialogHeader>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-10 items-center rounded-lg border border-[#D1D4DB] bg-white px-4 text-sm font-medium leading-6 text-[#121217] transition-colors hover:bg-[#F5F7F9] disabled:opacity-50"
          >
            {ui('cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            data-testid="list-modal-delete-confirm"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#D92D20] px-4 text-sm font-medium leading-6 text-white transition-colors hover:bg-[#B42318] disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" data-testid="Loader2__19eda5" /> : null}
            {ui('delete')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * In-house grid for the list-modal layout. Renders the Figma row chrome (drag
 * handle placeholder for future reorder, registry-driven cells, hover edit
 * action). Fully generic: structure comes from `columns` + each `column.cellType`.
 */
function ListModalGrid({ columns, data, tMenu, ui, onEdit, onClone, onDelete, deletingId, onToggle, savingToggles }) {
  const actionsColClass = onClone ? 'w-28' : 'w-20';
  const isEmpty = !data || data.length === 0;

  return (
    // [&>div]:overflow-visible cancels the base Table's inner overflow-auto so the
    // hovered row's shadow-lg isn't clipped on the last row (matches Cuentas).
    <div className="[&>div]:overflow-visible">
      <Table data-testid="Table__19eda5">
        <TableHeader data-testid="TableHeader__19eda5">
          <TableRow
            className="border-b border-[#E8EAEF] hover:bg-transparent"
            data-testid="TableRow__19eda5">
            {/* Drag-handle column header (44px) */}
            <TableHead className="w-11 p-0" aria-hidden="true" data-testid="TableHead__19eda5" />
            {columns.map((col, idx) => (
              <TableHead
                key={col.key}
                className={cn(
                  'h-10 px-3 text-xs font-semibold leading-4 text-[#121217]',
                  cellAlignClass(col),
                  idx === 0 ? 'pl-0' : '',
                )}
                data-testid="TableHead__19eda5">
                {col.labelKey ? ui(col.labelKey) : (tMenu(col.label) ?? col.label ?? col.key)}
              </TableHead>
            ))}
            {/* Actions column header */}
            <TableHead
              className={cn(actionsColClass, 'p-0')}
              aria-hidden="true"
              data-testid="TableHead__19eda5" />
          </TableRow>
        </TableHeader>
        <TableBody data-testid="TableBody__19eda5">
          {isEmpty ? (
            <TableRow className="hover:bg-transparent" data-testid="TableRow__19eda5">
              <TableCell
                colSpan={columns.length + 2}
                className="py-12 text-center text-[#6C6C89]"
                data-testid="list-modal-empty"
              >
                <p className="text-sm font-medium">{ui('noRecordsYet')}</p>
                <p className="mt-1 text-xs">{ui('createNewRecord')}</p>
              </TableCell>
            </TableRow>
          ) : data.map((row) => (
            <TableRow
              key={row.id}
              data-testid={`list-modal-row-${row.id}`}
              className="group/row relative border-b border-[#E8EAEF] bg-white transition-shadow hover:z-10 hover:bg-white hover:shadow-lg"
            >
              {/* Drag handle — visual only; drag-to-reorder deferred */}
              <TableCell className="w-11 p-0" data-testid="TableCell__19eda5">
                <div className="flex w-11 items-center justify-center opacity-0 transition-opacity group-hover/row:opacity-100">
                  <GripVertical
                    className="h-5 w-5 text-[#828FA3]"
                    aria-hidden="true"
                    data-testid="GripVertical__19eda5" />
                </div>
              </TableCell>
              {columns.map((col, idx) => (
                <TableCell
                  key={col.key}
                  className={cn('px-3 py-3', cellAlignClass(col))}
                  data-testid="TableCell__19eda5">
                  <ListModalCell
                    row={row}
                    col={col}
                    tMenu={tMenu}
                    ui={ui}
                    onToggle={onToggle}
                    savingToggle={savingToggles[`${row.id}:${col.key}`]}
                    data-testid="ListModalCell__19eda5" />
                </TableCell>
              ))}
              {/* Hover row actions */}
              <TableCell className={cn(actionsColClass, 'p-0')} data-testid="TableCell__19eda5">
                <div className={cn('flex items-center justify-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100', actionsColClass)}>
                  <button
                    type="button"
                    onClick={() => onEdit?.(row)}
                    aria-label={ui('edit')}
                    data-testid={`list-modal-edit-${row.id}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#828FA3] transition-colors hover:bg-[#E8EAEF]"
                  >
                    <Pencil className="h-4 w-4" data-testid="Pencil__19eda5" />
                  </button>
                  {onClone && (
                    <button
                      type="button"
                      onClick={() => onClone(row)}
                      aria-label={ui('clone')}
                      data-testid={`list-modal-clone-${row.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#828FA3] transition-colors hover:bg-[#E8EAEF]"
                    >
                      <Copy className="h-4 w-4" data-testid="Copy__19eda5" />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(row)}
                      disabled={deletingId === row.id}
                      aria-label={ui('delete')}
                      data-testid={`list-modal-delete-${row.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#D92D20] transition-colors hover:bg-[#FEE4E2] disabled:opacity-50"
                    >
                      {deletingId === row.id
                        ? <Loader2 className="h-4 w-4 animate-spin" data-testid="Loader2__19eda5" />
                        : <Trash2 className="h-4 w-4" data-testid="Trash2__19eda5" />}
                    </button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default ListModalWindow;
