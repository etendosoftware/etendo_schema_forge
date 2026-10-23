import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useUI, useLocaleSwitch } from '@/i18n';
import {
  LayoutGrid, ArrowUpDown,
  ChevronDown, Calendar, Clock, TriangleAlert, OctagonAlert, Check,
} from 'lucide-react';
import { EmptyState, KpiWidget } from './FmCommon.jsx';
import { FmStatusChip } from './FmDetailChrome.jsx';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { useFavorites } from '@/components/layout/FavoritesContext';
import { useSupportChatSafe } from '@/components/support/SupportChatContext.jsx';
import { CheckboxField } from '@/windows/custom/shared/CheckboxField.jsx';
import { NewDeclModal } from './FmOverlays.jsx';
import FmCatalogPage from './FmCatalogPage.jsx';
import FmRowActions from './FmRowActions.jsx';
import DeleteConfirmDialog from '@/components/contract-ui/DeleteConfirmDialog.jsx';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import {
  formatAmount, countUpcomingDeadlines, isUpcomingDeadline,
  fetchDeclarationIncidents, deleteDeclaration, resolveResultColors,
  persistDeclarationStatus, fetchDeclaration,
} from './fiscalModelsUtils.js';
import { isAnnualPeriod } from './fiscalPeriods.js';
import { getIncidentSeverity, getIncidentIndicator } from './incidentSeverity.js';
import useFiscalAutoCompute from './useFiscalAutoCompute.js';
import { listModels, isKnownModel, getModel, getModelOrDefault, modelTitleKey } from './modelRegistry.js';
import { getListBehavior } from './modelRegistryList.js';

import { useApiFetch } from '@/auth/useApiFetch.js';
import { parseBackendError, isDuplicateConflict } from '@/lib/backendErrors.js';

// Every registered model, in registry order (ETP-5716). A module-level constant of fixed length:
// `useDeclarationsAutoCompute` below calls one `useFiscalAutoCompute` per (bucket × model) in a
// loop over it, which is only legal because the number and order of those calls never changes
// between renders.
const LIST_MODELS = listModels();

// ETP-5438 — a declaration in one of these statuses must never be silently recomputed from
// current invoice data again: once presented, an invoice added or removed afterward must not
// change what "Resultado" shows. Kept as a local literal (not exported from
// fiscalModelsUtils.js) matching this codebase's existing deliberate non-dedup convention for
// status-family lists — see fiscal-models.md "Duplicated, deliberately, in 4 places": several
// fiscal-models tests mock fiscalModelsUtils.js with hand-written objects (no `importOriginal`
// spread), so a new named export there would silently become `undefined` in those suites.
const SUBMITTED_STATUSES = new Set(['submitted', 'submitted_ext', 'submitted_ack']);

// ETP-5438 — only LEGACY submitted declarations (presented before the backend started
// persisting a submission snapshot) still go through this path; a declaration with
// `submittedSnapshot` is served from it directly (see `snapshotMap` below).
// Legacy (no snapshot): passed as `checkModifiedFn` for the legacy submitted-family buckets
// below instead of omitting it
// (the way the pre-existing "other" (ready/skipped) buckets do): omitting it makes
// `useFiscalAutoCompute`'s mount effect skip its own cache-consult branch and unconditionally
// recompute from live invoice data on every mount — which is exactly the ETP-5438 root cause
// (FmListPage never truly unmounts, but its `decls` state — and therefore this bucket's own
// array reference — changes on every declarations refetch, e.g. right after presenting a
// DIFFERENT declaration, re-triggering a fresh live recompute for every already-submitted one).
// Always resolving `false` makes the hook trust its own sessionStorage cache instead: a
// never-before-computed submitted declaration still gets exactly one bootstrap compute (so
// "Resultado" never gets stuck on "—", ETP-4755), and every mount after that first one reuses
// the cached result — network-free, so nothing here can pick up an invoice added/removed after
// submission for the rest of the browser session. The bootstrap relies on the backend keeping
// the `boxes`/`operators` READS open for submitted declarations (only `generate` returns 409 —
// ETP-5438 follow-up): a 409 there made every cold cache (new tab, reload, another browser)
// render "Error de cálculo". The detail pages write their own cold-cache compute into this same
// cache (`setCachedFiscalCompute`), so list and detail stay on one frozen payload. Legacy-only
// trade-off: a cold session recomputes from the invoice data as it is at that moment.
async function neverModifiedFn() {
  return false;
}

// ETP-5438 — true when the declaration carries the snapshot the backend persisted when it was
// presented (see `snapshotMap` below). Legacy submitted declarations have `null` there.
function hasSubmittedSnapshot(decl) {
  return Boolean(decl.submittedSnapshot) && typeof decl.submittedSnapshot === 'object';
}

// Generic filter dropdown — handles year, model and status filters
function FilterDropdown({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const active = value !== 'all';
  const selectedLabel = active ? (options.find(o => o.value === value)?.label ?? value) : label;
  return (
    <div className="fm-filter-select" ref={ref} style={{ position: 'relative' }}>
      <button
        className={`fm-toolbar__pill${active ? ' fm-toolbar__pill--active-dark' : ''}`}
        // ETP-5584 — sized like the app's standard list filter trigger (ListFilterBar.jsx:
        // outline `Button size="sm"`, h-9 / px-3 / 12px / normal weight, muted text when idle)
        // instead of the larger 14px `.fm-toolbar__pill` default.
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 36, padding: '0 12px', fontSize: 12, lineHeight: '16px',
          ...(active ? null : { color: 'hsl(var(--muted-foreground))' }),
        }}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selectedLabel}
        <ChevronDown
          size={12}
          strokeWidth={1.75}
          style={{ opacity: .6 }}
          data-testid="ChevronDown__cb728e" />
      </button>
      {open && (
        <div className="fm-status-select__menu" role="listbox" style={{ minWidth: 200 }}>
          {/* "Todos" row */}
          <button
            className="fm-status-select__item"
            style={{ justifyContent: 'space-between' }}
            role="option" aria-selected={value === 'all'}
            onClick={() => { onChange('all'); setOpen(false); }}
          >
            <span style={{ fontSize: 14, color: 'hsl(var(--foreground))', fontWeight: value === 'all' ? 500 : 400 }}>{label}</span>
            {value === 'all' && <Check
              size={14}
              strokeWidth={2}
              style={{ color: 'hsl(var(--foreground))', flexShrink: 0 }}
              data-testid="Check__cb728e" />}
          </button>
          <div style={{ height: 1, background: 'hsl(var(--border-subtle))', margin: '2px 8px' }} />
          {options.map(opt => {
            let optLabel;
            if (opt.badge) {
              optLabel = <span className={`fm-model-badge fm-model-badge--${opt.value}`}>{opt.badge}</span>;
            } else if (opt.statusStyle) {
              optLabel = <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 12px', borderRadius: 20, fontSize: 13, fontWeight: 400, ...opt.statusStyle }}>{opt.label}</span>;
            } else {
              optLabel = <span style={{ fontSize: 14, color: 'hsl(var(--foreground))' }}>{opt.label}</span>;
            }
            return (
              <button
                key={opt.value}
                className="fm-status-select__item"
                style={{ justifyContent: 'space-between' }}
                role="option" aria-selected={value === opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
              >
                {optLabel}
                {value === opt.value && <Check
                  size={14}
                  strokeWidth={2}
                  style={{ color: 'hsl(var(--foreground))', flexShrink: 0 }}
                  data-testid="Check__cb728e" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}


// Fixed status filter options (consolidated)
const STATUS_FILTER_OPTIONS = [
  { value: 'presentado', label: 'Presentado', statusStyle: { background: 'var(--status-success-bg)', color: 'var(--status-success-fg)' } },
  { value: 'borrador',   label: 'Borrador',   statusStyle: { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' } },
];

const STATUS_FILTER_RAW = {
  presentado: new Set(['ready', 'submitted', 'submitted_ext', 'submitted_ack']),
  borrador:   new Set(['draft']),
};

// ── Sort ("Ordenar" popover) ─────────────────────────────────────────
// Mirrors ListView.jsx's column-based sort (used by the generated/Factura
// windows): a field selector, not a bare asc/desc toggle. Scoped to columns
// already visible in this table with a well-defined raw value to compare.
function periodSortValue(period) {
  if (/^T\d$/.test(period)) return parseInt(period[1], 10) * 3;
  if (/^\d{2}$/.test(period)) return parseInt(period, 10);
  // ETP-5716 — the annual summary closes the exercise: it sorts after December / T4.
  if (isAnnualPeriod(period)) return 13;
  return 0;
}

// The "Periodo" cell: an annual declaration reads "Anual", every other period its code.
function periodLabel(period, t) {
  return isAnnualPeriod(period) ? t('fm.period.annual') : period;
}

// ETP-5716 — `POST /declarations` refused because the exercise already has its single ordinary
// declaration (FiscalDeclCrudHandler#rejectDuplicateOrdinary): `{ error: { code, existingId } }`.
// Returns the existing declaration's id, or `null` for any other failure.
function duplicateOrdinaryId(status, body) {
  if (status !== 409) return null;
  const error = body?.error ?? body?.response?.error ?? body;
  return error?.code === 'DUPLICATE_ORDINARY' ? (error.existingId ?? null) : null;
}

const STATUS_SORT_ORDER = ['pending', 'draft', 'ready', 'submitted', 'submitted_ack', 'submitted_ext', 'skipped'];

const SORT_FIELDS = [
  { key: 'model',  labelKey: 'fm.col.model',  value: d => d.model },
  { key: 'year',   labelKey: 'fm.col.year',   value: d => d.year },
  { key: 'period', labelKey: 'fm.col.period', value: d => periodSortValue(d.period) },
  { key: 'status', labelKey: 'fm.col.status', value: d => STATUS_SORT_ORDER.indexOf(d.status) },
];

// Applies the toolbar "Ordenar" popover's field selector to a declaration list.
// `sortColumn === null` = default order (year+period, descending, most recent
// first) — same fallback the main component's render already relied on before
// this was extracted out of it (SonarQube S3776: keeps FmListPage's own
// cognitive complexity down without changing any ordering behavior).
function sortDeclarations(list, sortColumn, sortDirection) {
  const sorted = [...list];
  if (!sortColumn) {
    sorted.sort((a, b) =>
      (b.year * 100 + periodSortValue(b.period)) - (a.year * 100 + periodSortValue(a.period))
    );
    return sorted;
  }
  const field = SORT_FIELDS.find(f => f.key === sortColumn);
  if (!field) return sorted;
  sorted.sort((a, b) => {
    const av = field.value(a);
    const bv = field.value(b);
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return sortDirection === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

const RESULT_BADGE_STYLE = {
  display: 'inline-flex', alignItems: 'center',
  padding: '2px 8px', borderRadius: 6,
  fontSize: 12, fontWeight: 400, lineHeight: '16px',
  background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))',
};

// Result as plain text — used in the list table
function ResultText({ isComputing, error, result, t }) {
  if (isComputing) return <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>…</span>;
  if (error) return <span style={RESULT_BADGE_STYLE}>{t('fm.status.error') ?? 'Error de cálculo'}</span>;
  if (!result?.kind) return <span style={{ color: 'hsl(var(--muted-foreground))' }}>—</span>;
  if (result.kind === 'N') return <span style={RESULT_BADGE_STYLE}>{t('fm.result.N') ?? 'Sin resultado'}</span>;
  if (result.kind === 'zero') return <span style={RESULT_BADGE_STYLE}>{t('fm.result.zero') ?? 'Resultado cero'}</span>;
  if (result.kind === 'info') {
    return result.amount > 0
      ? <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, color: 'hsl(var(--foreground))' }}>{formatAmount(result.amount)}</span>
      : <span style={RESULT_BADGE_STYLE}>{t('fm.result.info') ?? 'Informativa'}</span>;
  }
  // A model may name its own badge text (`labelKey`, e.g. the 390's informative "Resultado
  // positivo"); otherwise the shared `fm.result.<kind>` key.
  const label = t(result.labelKey ?? `fm.result.${result.kind}`) ?? result.kind;
  // Resultado sign-coloring (ETP-5236 / M303-01): 'I' (a ingresar) green, 'V'/'C'
  // (a devolver / a compensar) blue — same rule as the Modelo 303 detail KPI, via
  // the shared fiscalModelsUtils.js helper so both call sites stay in sync.
  const colors = resolveResultColors(result.kind);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <span style={{ ...RESULT_BADGE_STYLE, background: colors.badgeBg, color: colors.badgeColor }}>{label}</span>
      {result.amount != null && (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, fontWeight: 500, color: colors.valueColor }}>
          {formatAmount(result.amount)}
        </span>
      )}
    </div>
  );
}

// Shared "does this declaration have an incidence" predicate (ETP-4755, KPI-cards-as-filters)
// — reused by both the "Incidencias" KPI count below and the list's KPI filter, so they can't
// drift apart. Mirrors exactly how `IncidentsCell` reads the same field (`decl.incidents?.blocking`
// / `.warning`, defaulting to 0).
function hasIncidents(decl) {
  return getIncidentSeverity(decl.incidents) !== 'none';
}

// KPI cards row — compact horizontal layout.
// `kpiFilter`/`onFilterClick` (ETP-4755, KPI-cards-as-filters): each card is now a toggleable
// filter — clicking one narrows the list to exactly what that card counts, clicking the same
// (already-active) card again clears it. Counts are always computed off `decls` as handed down
// by the parent (model+year filtered, but NOT status- or KPI-filtered) so a card's own number
// never changes because of the filter it itself controls.
function KpiCardsRow({ decls, t, kpiFilter, onFilterClick }) {
  const upcomingCount = useMemo(() => countUpcomingDeadlines(decls), [decls]);
  // 'pending' never occurs in real data (no write path produces it — see fiscalModelsUtils.js
  // STATUSES); this KPI has always effectively counted 'draft' only.
  const pendingCount  = useMemo(() => decls.filter(d => d.status === 'draft').length, [decls]);
  const incidentCount = useMemo(() => decls.filter(hasIncidents).length, [decls]);
  // ETP-5597 — the badge reflects the worst severity across the counted declarations: red
  // "Requiere revisión" if any has a blocking incident, amber "Advertencia" if only warnings.
  // With no incidents at all it renders neutral (muted "Sin incidencias") — red is reserved for
  // blocking incidents only.
  const incidentIndicator = useMemo(
    () => getIncidentIndicator(decls.map(d => d.incidents), t),
    [decls, t],
  );

  return (
    // ETP-5584 — the three cards share the row (`flex: 1 1 0%`) instead of a fixed 360px each, and
    // the row carries its own vertical padding: it no longer sits under the filters toolbar, so a
    // zero top padding glued it to the row above.
    <div data-testid="fm-list-kpi-row" style={{ display: 'flex', gap: 12, padding: '8px 16px 12px', background: 'hsl(var(--card))', flexShrink: 0 }}>
      <div style={{ flex: '1 1 0%', minWidth: 0 }}>
        <KpiWidget
          icon={<Calendar size={20} strokeWidth={1.75} data-testid="Calendar__cb728e" />}
          iconColor="hsl(var(--muted-foreground))"
          label={t('fm.kpi.upcoming') ?? 'Por vencer'}
          badge={t('fm.kpi.upcoming_sub') ?? 'Esta semana'}
          badgeBg="var(--status-warning-bg)"
          badgeColor="var(--status-warning-fg)"
          value={upcomingCount}
          onClick={() => onFilterClick('upcoming')}
          active={kpiFilter === 'upcoming'}
          data-testid="KpiWidget__cb728e" />
      </div>
      <div style={{ flex: '1 1 0%', minWidth: 0 }}>
        <KpiWidget
          icon={<Clock size={20} strokeWidth={1.75} data-testid="Clock__cb728e" />}
          iconColor="hsl(var(--muted-foreground))"
          label={t('fm.kpi.pending') ?? 'Pendientes'}
          badge={t('fm.kpi.pending_sub') ?? 'Sin presentar'}
          badgeBg="hsl(var(--muted))"
          badgeColor="hsl(var(--muted-foreground))"
          value={pendingCount}
          onClick={() => onFilterClick('pending')}
          active={kpiFilter === 'pending'}
          data-testid="KpiWidget__cb728e" />
      </div>
      <div style={{ flex: '1 1 0%', minWidth: 0 }}>
        <KpiWidget
          icon={<TriangleAlert size={20} strokeWidth={1.75} data-testid="TriangleAlert__cb728e" />}
          iconColor="hsl(var(--muted-foreground))"
          label={t('fm.m303.kpi.incidents') ?? 'Incidencias'}
          badge={incidentIndicator?.label ?? t('fm.incidents.none') ?? 'Sin incidencias'}
          badgeBg={incidentIndicator?.badgeBg ?? 'hsl(var(--muted))'}
          badgeColor={incidentIndicator?.badgeColor ?? 'hsl(var(--muted-foreground))'}
          value={incidentCount}
          onClick={() => onFilterClick('incidents')}
          active={kpiFilter === 'incidents'}
          data-testid="KpiWidget__cb728e" />
      </div>
    </div>
  );
}

// `bcpLocale` defaults to 'es-ES' to preserve behavior for callers outside a
// component render (e.g. tests) that don't have access to the active locale.
function normDecl(d, bcpLocale = 'es-ES') {
  return {
    ...d,
    updatedAt: d.updatedAt ? new Date(d.updatedAt).toLocaleDateString(bcpLocale) : '—',
    result: d.result ?? null,
    incidents: d.incidents ?? { blocking: 0, warning: 0 },
  };
}

// ETP-5338 — "Reactivar declaración": eligible only for a filed declaration
// (submitted / submitted_ack) that was NOT a real AEAT telematic submission —
// reactivating one of those would desync this table from what Hacienda already
// has on record. `submitted_ext` is deliberately excluded: it's a legacy status
// that predates `submissionMethod` (PresentModal can no longer produce it, see
// fiscal-models.md) and was not requested by ETP-5338; the backend guard
// (FiscalDeclCrudHandler#handleDeclPut) is the actual enforcement, this is only
// the UI gate.
function canReactivate(decl) {
  return (decl.status === 'submitted' || decl.status === 'submitted_ack')
    && decl.submissionMethod !== 'aeat_telematic';
}

// ── Sub-components ───────────────────────────────────────────────
function ModelBadge({ model }) {
  return <span className={`fm-model-badge fm-model-badge--${model}`}>{model}</span>;
}

// ETP-5338 — "Reactivar declaración" confirmation. Not the app's shared
// DeleteConfirmDialog (that component's copy/testids are hardcoded to the
// delete flow — see its header comment); this is a non-destructive analogue
// built from the same Dialog primitives, same shape.
function ReactivateConfirmDialog({ open, reactivating = false, onConfirm, onClose, t }) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) onClose?.(); }}
      data-testid="Dialog__fm-reactivate">
      <DialogContent className="max-w-sm" data-testid="DialogContent__fm-reactivate">
        <DialogHeader data-testid="DialogHeader__fm-reactivate">
          <DialogTitle data-testid="DialogTitle__fm-reactivate">
            {t('fm.reactivate.confirm_title') ?? 'Reactivar declaración'}
          </DialogTitle>
          <DialogDescription data-testid="DialogDescription__fm-reactivate">
            {t('fm.reactivate.confirm_message')
              ?? 'La declaración volverá a estado borrador y podrá editarse de nuevo. ¿Continuar?'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter data-testid="DialogFooter__fm-reactivate">
          <DialogClose asChild data-testid="DialogClose__fm-reactivate">
            <Button
              variant="outline"
              size="sm"
              disabled={reactivating}
              data-testid="Button__fm-reactivate-cancel">{t('cancel') ?? 'Cancelar'}</Button>
          </DialogClose>
          <Button
            variant="default"
            size="sm"
            disabled={reactivating}
            data-testid="fm-reactivate-confirm"
            onClick={onConfirm}
          >
            {t('fm.action.reactivate') ?? 'Reactivar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IncidentsCell({ blocking, warning, t }) {
  if (!blocking && !warning) return <span style={{ color: 'hsl(var(--foreground))', fontSize: 14 }}>{t('fm.incidents.none') ?? 'Sin incidencias'}</span>;
  return (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
      {blocking > 0 && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500,
          background: 'var(--status-destructive-bg)', color: 'hsl(var(--destructive))',
        }}>
          <OctagonAlert size={12} strokeWidth={1.75} data-testid="OctagonAlert__cb728e" /> {blocking}
        </span>
      )}
      {warning > 0 && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500,
          background: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)',
        }}>
          <TriangleAlert size={12} strokeWidth={1.75} data-testid="TriangleAlert__cb728e" /> {warning}
        </span>
      )}
    </span>
  );
}

const resultBadge = (text) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center',
    padding: '2px 8px', borderRadius: 6,
    fontSize: 12, fontWeight: 400, lineHeight: '16px',
    background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))',
  }}>{text}</span>
);

// ETP-5272 pt.6 — dead code: not rendered anywhere in this file (the table cell
// below renders `ResultText`, not `ResultCell`). Kept as-is rather than deleted —
// `__tests__/FmListPage.test.js` still asserts on this function's source directly
// and that test suite is out of scope for this change (deferred to the
// consolidated tests/docs pass for ETP-5272). If this is ever reactivated, it must
// receive the same manual-override-merge treatment as `ResultText`'s caller below
// (merge `decl.manualData?.manualOverrides` via `applyOverrides`/`recomputeDerivedBoxes`
// and read box 71, not a raw `summary.result`) — it currently does not.
function ResultCell({ isComputing, error, result, t }) {
  if (isComputing) return <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 12 }}>…</span>;
  if (error) {
    return resultBadge(t('fm.status.error') ?? 'Error');
  }
  if (!result?.kind) return <span style={{ color: 'hsl(var(--muted-foreground))' }}>—</span>;
  if (result.kind === 'N') return resultBadge(t('fm.result.N') ?? 'Sin resultado');
  if (result.kind === 'zero') return resultBadge(t('fm.result.zero') ?? 'Resultado cero');
  if (result.kind === 'info') {
    return result.amount > 0
      ? <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, color: 'hsl(var(--foreground))' }}>{formatAmount(result.amount)}</span>
      : resultBadge(t('fm.result.info') ?? 'Informativa');
  }
  const label = t(`fm.result.${result.kind}`) ?? result.kind;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
      {resultBadge(label)}
      {result.amount != null && (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, fontWeight: 500, color: 'hsl(var(--foreground))' }}>
          {formatAmount(result.amount)}
        </span>
      )}
    </div>
  );
}

// Resolves the auto-computed boxes/operators entry for a declaration row —
// draft declarations read from their model's polling map, any other status reads
// from their model's one-time-compute map (see `useDeclarationsAutoCompute` for why
// both are needed). Extracted out of the table row's nested ternary (SonarQube S3358);
// same values, same logic. An unknown model reads the default model's (303) maps, as
// it always did ("anything that is not 349 reads the 303 maps").
function getComputedForDecl(decl, isDraft, maps) {
  const { draftMapById, otherMapById } = maps;
  const modelId = getModelOrDefault(decl.model).id;
  return isDraft ? draftMapById[modelId][decl.id] : otherMapById[modelId][decl.id];
}

// ── "Resultado" auto-compute (one bucket set per registered model) ──────────
// Calls `useFiscalAutoCompute` once per (bucket × model), in this fixed order: every model's
// draft bucket, then every model's "other" bucket, then every model's legacy-submitted bucket
// (for 303 + 349: draft 303, draft 349, other 303, other 349, submitted 303, submitted 349 —
// the same six calls, in the same order, this list made before the registry existed). Each
// model's compute function, draft polling check and result derivation come from its list
// behaviour (`modelRegistryList.js` → `models/<id>/listBehavior<id>.js`).
//
// Buckets, per model:
//   - draft: `status === 'draft'` — their underlying invoices can still change, so they get the
//     full compute-on-mount + poll-for-changes treatment (`checkModifiedFn`, 3 min).
//   - other: non-draft, non-submitted declarations (ETP-4755 "Resultado" fix, narrowed by
//     ETP-5438): `declToJson` (FiscalDeclCrudHandler, backend) never persists a computed result
//     on the declaration record — GET /fiscal303/declarations always comes back with no `result`
//     field, for every status. The draft-only hooks are correct for drafts (live-recompute +
//     poll, since their underlying invoices can still change), but once a declaration leaves
//     draft its boxes are otherwise NEVER computed at all in this list — the "Resultado" column
//     stayed stuck on "—" forever, the same class of bug the "Incidencias" column had before
//     this list fetched real data. Mirrors FmModel303Page.jsx's own already-shipped fix for its
//     KPIs/boxes ("Auto-compute on mount when the list didn't hand us any precomputed data" —
//     same ETP-4755, same `/fiscal303/boxes` and `/fiscal349/operators` endpoints, which
//     recompute from invoice data regardless of declaration status). Computed once, never polled
//     (no `checkModifiedFn`).
//     ETP-5438 — submitted-family declarations (see SUBMITTED_STATUSES above) were carved OUT of
//     this bucket into their own "submitted" bucket below: they still need the one bootstrap
//     compute, but must never be recomputed again after that — see `neverModifiedFn`'s comment
//     for why omitting `checkModifiedFn` (this bucket's own behavior, correct for `ready`) was
//     the actual root cause of "still recalculating even though already presented".
//   - submitted: ETP-5438 — legacy submitted-family declarations (presented BEFORE snapshots
//     existed, so no `submittedSnapshot`; no data-fix for those, product decision): compute once
//     (bootstrap, so "Resultado" is never stuck on "—"), then frozen via `neverModifiedFn` — see
//     its comment above for the full rationale.
//
// ETP-5438 — submitted-family declarations WITH a persisted submission snapshot
// (`decl.submittedSnapshot`, the exact boxes/operators payload the backend froze when the
// declaration was presented): that snapshot IS their computed result. It is fed straight into
// the non-draft computed map below — no compute call, no sessionStorage — so "Resultado" goes
// through the exact same derivation (303 box 71 with manualOverrides included) as a live
// compute, and can never pick up an invoice added/removed after submission.
//
// Returns `draftMapById` / `otherMapById`, keyed by model id. Each model's "other" map is the
// union of its "other" (ready/skipped) and "submitted" one-time-compute maps plus `snapshotMap`
// — `getComputedForDecl` only ever needs "the non-draft compute for this decl.id", it doesn't
// care which hook produced it. `snapshotMap` is keyed by declaration id (unique across models),
// so it is safe to spread into every model's map; it goes last so a persisted snapshot always
// wins.
//
// A model whose registry entry sets `syncDraftComputeToDetail` (349) also pushes its draft map
// to `onComputeUpdate`, so an open detail page picks up fresh operators.
function useDeclarationsAutoCompute(decls, { token, apiBaseUrl, onComputeUpdate }) {
  const bucketsById = useMemo(() => {
    const byId = {};
    for (const m of LIST_MODELS) {
      byId[m.id] = {
        draft: decls.filter(d => d.model === m.id && d.status === 'draft'),
        other: decls.filter(d => d.model === m.id && d.status !== 'draft' && !SUBMITTED_STATUSES.has(d.status)),
        submitted: decls.filter(d => d.model === m.id && SUBMITTED_STATUSES.has(d.status) && !hasSubmittedSnapshot(d)),
      };
    }
    return byId;
  }, [decls]);

  const snapshotMap = useMemo(() => {
    const map = {};
    for (const d of decls) {
      if (SUBMITTED_STATUSES.has(d.status) && hasSubmittedSnapshot(d)) map[d.id] = d.submittedSnapshot;
    }
    return map;
  }, [decls]);

  // The loops below call a hook per registered model. LIST_MODELS is a module-level constant, so
  // the number and order of these calls is identical on every render — the rules of hooks hold.
  const draftMapById = {};
  for (const m of LIST_MODELS) {
    const behavior = getListBehavior(m.id);
    draftMapById[m.id] = useFiscalAutoCompute(bucketsById[m.id].draft, { // NOSONAR -- fixed-length registry loop, stable hook order.
      computeFn:       behavior.computeFn,
      checkModifiedFn: behavior.checkModifiedFn,
      token,
      apiBaseUrl,
      pollIntervalMs:  180_000,
      enabled: Boolean(apiBaseUrl),
    }).computedMap;
  }

  const otherMaps = [];
  for (const m of LIST_MODELS) {
    otherMaps.push(useFiscalAutoCompute(bucketsById[m.id].other, { // NOSONAR -- fixed-length registry loop, stable hook order.
      computeFn: getListBehavior(m.id).computeFn,
      token,
      apiBaseUrl,
      enabled: Boolean(apiBaseUrl),
    }).computedMap);
  }

  const submittedMaps = [];
  for (const m of LIST_MODELS) {
    submittedMaps.push(useFiscalAutoCompute(bucketsById[m.id].submitted, { // NOSONAR -- fixed-length registry loop, stable hook order.
      computeFn:       getListBehavior(m.id).computeFn,
      checkModifiedFn: neverModifiedFn,
      token,
      apiBaseUrl,
      enabled:         Boolean(token && apiBaseUrl),
    }).computedMap);
  }

  const otherMapById = useMemo(
    () => Object.fromEntries(LIST_MODELS.map((m, i) => [m.id, { ...otherMaps[i], ...submittedMaps[i], ...snapshotMap }])),
    // Fixed-length dependency list (one entry per registered model, see LIST_MODELS).
    [...otherMaps, ...submittedMaps, snapshotMap]
  );

  const syncedDraftMaps = LIST_MODELS.filter(m => m.syncDraftComputeToDetail).map(m => draftMapById[m.id]);
  useEffect(() => {
    if (!onComputeUpdate) return;
    for (const map of syncedDraftMaps) {
      if (Object.keys(map).length > 0) onComputeUpdate(map);
    }
    // Fixed-length dependency list (one entry per synced model, see LIST_MODELS).
  }, [...syncedDraftMaps, onComputeUpdate]);

  return { draftMapById, otherMapById };
}

// ── Main component ───────────────────────────────────────────────
/**
 * ETP-5030 — resolves the declaration row's class so exactly ONE background is
 * ever applied, mirroring the chain in `computeRowClassName`
 * (components/contract-ui/InlineLinesPanel.jsx).
 *
 * The row previously only ever reflected `decl.current` — which marks the
 * CURRENT declaration, never the selection — so ticking a checkbox changed
 * nothing on the row. Selection now outranks the current-declaration marker,
 * consistent with the shared components; both classes paint the same td
 * background, so returning both would leave the winner to stylesheet order.
 *
 * `fm-row--selected` is the converged `bg-primary/5` colour defined in
 * fiscal-models.css — see that rule for why this is a CSS class here and not a
 * Tailwind utility on the <tr>.
 */
function fmListRowClassName({ selected, current }) {
  if (selected) return 'fm-row--selected';
  return current ? 'fm-table__row--current' : '';
}

// ETP-5456 — extracted to avoid a nested ternary (javascript:S3358). Mirrors the
// mutually-exclusive rectificativa (303) / sustitutiva (349) precedence documented
// at the `declTypeLabel` call site below.
//
// ETP-5725 — `duplicatePeriodPresented` is a FALLBACK for a never-saved draft only. The 303/349
// detail pages auto-default `identChecks.rectificativa`/`.sustitutiva` to true in LOCAL
// component state the instant they're opened for a period whose latest sibling is already
// presented (see FmModel303Page.jsx/FmModel349Page.jsx's `identChecks` lazy initializers), but
// that state is invisible to this list until the user clicks "Guardar" and `decl.manualData`
// is actually persisted — until then `rectificativa`/`sustitutiva` are both `undefined` here,
// and the grid used to always show "Ordinaria" for that window. Once EITHER flag is persisted
// (even explicitly set to false/'N' by a user override), that persisted value is trusted as
// before and this fallback no longer applies.
//
// ETP-5725 (reopened QA fix, Bug 3) — the fallback above was gated ONLY on the two identification
// keys being `undefined`, which is NOT the same thing as "this row was never saved": a genuinely
// persisted ordinaria declaration that was presented without ever touching the rectificativa/
// sustitutiva checkbox ALSO has both keys `undefined` in its persisted `manualData.identification`
// (the checkbox simply has nothing to write when left at its default). Repro: present the
// ordinaria (A), then later present a sibling as Sustitutiva (B) — A's row re-renders with
// `duplicatePeriodPresented` now true (B is a presented sibling), `neverSaved` true (A never set
// either key), so the OLD check mislabeled an already-presented, correctly-typed declaration as
// "Sustitutiva". The backend never serializes "this row was never saved" as a flag — but the
// frontend already has an equivalent signal: only a `draft` declaration can still be in the
// "never decided yet" state this fallback exists for. Once a row leaves draft (ready, submitted,
// submitted_ack, submitted_ext) its identification is authoritative and persisted, so the
// fallback must not apply, however the identification keys look. Also fixes the companion
// symptom QA reported ("B's type flips to Ordinaria" when A is reactivated): B is itself
// non-draft, so with this gate its label never depended on A's status to begin with.
function resolveDeclTypeLabel(decl, t, duplicatePeriodPresented = false) {
  const ident = decl.manualData?.identification;
  const rectificativaPersisted = ident?.rectificativa;
  const sustitutivaPersisted = ident?.sustitutiva === true || ident?.sustitutiva === 'Y';
  const neverSaved = decl.status === 'draft'
    && rectificativaPersisted === undefined && ident?.sustitutiva === undefined;
  // Per-model fallback type for a never-saved draft on a presented period (modelRegistry.js).
  const fallbackType = neverSaved && duplicatePeriodPresented
    ? getModel(decl.model)?.duplicatePeriodType : null;
  if (rectificativaPersisted || fallbackType === 'rectificative') {
    return t('fm.type.rectificative');
  }
  if (sustitutivaPersisted || fallbackType === 'substitutive') {
    return t('fm.type.substitutive');
  }
  return t('fm.type.ordinary');
}

// Publishes the list's TopBar meta (ETP-5584). Rendered by FmListPage only while it is the
// visible page, so mounting/unmounting it is what hands the TopBar over to and back from the
// 303/349 detail pages — see the "Top-bar page meta" comment inside FmListPage.
function ListPageMeta({ title, breadcrumb, recordCount }) {
  const { toggleFavorite, isFavorite } = useFavorites();
  const { actions: supportActions } = useSupportChatSafe();
  const favActive = isFavorite('fiscal-models');
  useSetPageMeta({
    title,
    breadcrumb,
    recordCount,
    onAddToFavorites: () => toggleFavorite('fiscal-models', title),
    isFavorite: favActive,
    onPageHelp: () => { supportActions.setTab('ayuda'); supportActions.open(); },
  }, [favActive, recordCount]);
  return null;
}

export default function FmListPage({ declarations: propDecls, onSelect, onComputeUpdate, declStatusPatch, declManualDataPatch, declAdded, token, apiBaseUrl, active = true }) {
  const ui = useUI();
  const t  = ui;
  const { locale: appLocale } = useLocaleSwitch();
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');
  const apiFetch = useApiFetch(apiBaseUrl);

  const [decls, setDecls] = useState(propDecls ?? []);

  useEffect(() => {
    if (!apiBaseUrl) return;
    const base = apiBaseUrl.replace(/\/[^/]+$/, '');
    apiFetch(`${base}/fiscal303/declarations`, { baseUrl: '' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setDecls((Array.isArray(data) ? data : (data?.data ?? [])).map(d => normDecl(d, bcpLocale))))
      .catch(() => {});
  }, [token, apiBaseUrl, apiFetch, bcpLocale]);

  // ETP-5338 CRITICAL FIX — this component "stays mounted at all times" (see the render
  // below) so that `useFiscalAutoCompute` keeps polling, which means it is NEVER remounted
  // (and therefore never refetches `decls`) when the user opens a declaration, presents it,
  // and navigates back — via "Volver"/go-back OR the pre-existing "Cancelar", both of which
  // just call `onBack` to flip `FiscalModelsPage`'s view back to `{ type: 'list' }`.
  //
  // The actual status change IS persisted correctly server-side by `FiscalModelsPage`'s
  // `onStatusChange` handler (`persistDeclarationStatus`) — that PUT is not tied to component
  // lifecycle and completes regardless of whether the detail page is still mounted. But
  // nothing ever pushed that new status into THIS component's own `decls` state, which was
  // fetched once on mount and never touched again for anything but computedMap/incidents
  // patches. So the row the user just presented kept showing its stale pre-submission status
  // (typically "Borrador"/draft) the moment they landed back on the list — reported as
  // "presenting a declaration and going back reverts it to draft". It never actually
  // reverted anything: the backend was right, this list's cache was stale.
  //
  // `declStatusPatch` is a one-shot `{ id, patch }` (a fresh object each time, so this effect
  // re-fires on every status change even if `id`/status happen to repeat) pushed down by
  // `FiscalModelsPage` right after a successful `persistDeclarationStatus`, applied the exact
  // same way `handleConfirmReactivate` above already patches `decls` for a change made
  // in-place in this same component.
  useEffect(() => {
    if (!declStatusPatch) return;
    setDecls(ds => ds.map(d => (d.id === declStatusPatch.id ? { ...d, ...declStatusPatch.patch } : d)));
  }, [declStatusPatch]);

  // ETP-5338 Bug A fix — same one-shot patch mechanism as `declStatusPatch` above, but for a
  // successful manualData save (Guardar/Calcular) on the detail page instead of a status change.
  // Root cause this closes: `FmModel303Page` used to autosave `identChecks`/`manualOverrides` via
  // a debounced background PUT, and NOTHING ever pushed that saved value into this component's
  // own cached `decls` — reopening the same declaration from the list (without a full page
  // reload) handed the stale pre-edit `manualData` right back into a freshly-mounted detail page,
  // which re-hydrates its local state from it. Under the redesigned explicit-save-only model
  // (identChecks/manualOverrides are pure local state until Guardar/Calcular), Guardar is now the
  // ONE place a save can succeed, so patching the cache here from that single call site is enough
  // — see `FmModel303Page.jsx`'s `persistEditableFields`.
  useEffect(() => {
    if (!declManualDataPatch) return;
    setDecls(ds => ds.map(d => (d.id === declManualDataPatch.id ? { ...d, ...declManualDataPatch.patch } : d)));
  }, [declManualDataPatch]);

  // ETP-5716 — a declaration created from a detail page ("Crear declaración sustitutiva"): a
  // one-shot `{ decl }` (raw backend shape). It is added to the list and opened, normalized
  // exactly like a declaration created from "Nueva declaración".
  useEffect(() => {
    if (!declAdded?.decl?.id) return;
    const created = normDecl(declAdded.decl, bcpLocale);
    setDecls(ds => (ds.some(d => d.id === created.id) ? ds : [created, ...ds]));
    onSelect?.(created);
  }, [declAdded]);

  // Real per-declaration incidents (ETP-4755 fix): GET /fiscal303/declarations above never
  // carries real blocking/warning counts — `FiscalDeclCrudHandler#declToJson` doesn't serialize
  // incidents at all, only the dedicated `GET /fiscal{model}/incidents?id=` endpoint does (the
  // same one the detail pages already call on mount via `fetchDeclarationIncidents`). Without
  // this, every row's "Incidencias" column stayed frozen at `normDecl()`'s all-zero default
  // regardless of real AEAT errors/warnings persisted for that declaration, and regardless of
  // status (draft or already submitted) — this fetch is not gated on `status === 'draft'` the
  // way `useFiscalAutoCompute`'s box/operator polling is, since incidents are independent of
  // that pipeline. Keyed off the id set (`declIdsKey`), not the full `decls` array, so a status
  // change alone (which changes object identity but not the id set) doesn't re-trigger every
  // row's fetch.
  const declIdsKey = useMemo(() => decls.map(d => d.id).join(','), [decls]);

  useEffect(() => {
    if (!apiBaseUrl || !decls.length) return;
    let cancelled = false;
    Promise.all(decls.map(d =>
      fetchDeclarationIncidents(d.id, { token, apiBaseUrl, model: d.model })
        .then(result => ({ id: d.id, result }))
    )).then(entries => {
      if (cancelled) return;
      setDecls(ds => ds.map(d => {
        const found = entries.find(e => e.id === d.id);
        return found ? { ...d, incidents: found.result } : d;
      }));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [declIdsKey, token, apiBaseUrl]);

  const [activeModels, setActiveModels] = useState({});
  const [catalogLoaded, setCatalogLoaded] = useState(!apiBaseUrl);

  useEffect(() => {
    if (!apiBaseUrl) return;
    const base = apiBaseUrl.replace(/\/[^/]+$/, '');
    apiFetch(`${base}/fiscal-models-catalog`, { baseUrl: '' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setActiveModels(data ?? {}))
      .catch(() => {})
      .finally(() => setCatalogLoaded(true));
  }, [token, apiBaseUrl, apiFetch]);

  // "Resultado" auto-compute, one bucket set per registered model — see
  // `useDeclarationsAutoCompute` above for the draft / other / submitted split.
  const { draftMapById, otherMapById } = useDeclarationsAutoCompute(decls, { token, apiBaseUrl, onComputeUpdate });

  const [modelFilter, setModelFilter]   = useState('all');
  const [yearFilter,  setYearFilter]    = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  // kpiFilter (ETP-4755, KPI-cards-as-filters): which KPI card (if any) is toggled on.
  // Mutually exclusive with itself (clicking a 2nd card replaces the 1st — "one at a time"),
  // but combines as an additional AND-condition with the year/model/status filters above,
  // which keep working independently. `null` = no KPI filter active.
  const [kpiFilter,   setKpiFilter]     = useState(null);
  const handleKpiFilterClick = useCallback((key) => {
    setKpiFilter(f => (f === key ? null : key));
  }, []);
  const [showCatalog,  setShowCatalog]  = useState(false);
  const [showNewDecl,  setShowNewDecl]  = useState(false);
  const [selected,     setSelected]     = useState(new Set());
  // Row hover actions (ETP-5187) — Edit/Delete, draft rows only. `deleteTarget` holds the
  // declaration pending confirmation (or null); `deletingId` tracks the in-flight DELETE call
  // so the confirm dialog can disable its buttons while it's outstanding.
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingId,   setDeletingId]   = useState(null);
  // Row hover "reactivate" action (ETP-5338) — submitted/submitted_ack rows only, excluding
  // aeat_telematic (see canReactivate above). Mirrors the deleteTarget/deletingId pattern.
  const [reactivateTarget, setReactivateTarget] = useState(null);
  const [reactivatingId,   setReactivatingId]   = useState(null);
  // Sort state — field-selector popover (mirrors ListView.jsx's sortColumn/sortDirection
  // pattern used by the generated/Factura windows, not a generic single-toggle button).
  // `null` sortColumn = default order (year+period, most recent first).
  const [sortColumn,    setSortColumn]    = useState(null);
  const [sortDirection, setSortDirection] = useState('desc');
  const [showSortMenu,  setShowSortMenu]  = useState(false);
  const sortBtnRef = useRef(null);
  useEffect(() => {
    if (!showSortMenu) return;
    const handler = (e) => { if (!sortBtnRef.current?.contains(e.target)) setShowSortMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSortMenu]);

  // Opens a declaration by id (ETP-5716 — "Abrir declaración" of a duplicate ordinary): from the
  // list when it is loaded, otherwise re-read from the backend.
  const openDeclarationById = useCallback(async (id) => {
    if (!id) return;
    const known = decls.find(d => d.id === id);
    const decl = known ?? (await fetchDeclaration(id, { token, apiBaseUrl }));
    if (decl) onSelect?.(known ? decl : normDecl(decl, bcpLocale));
  }, [decls, token, apiBaseUrl, onSelect, bcpLocale]);

  const handleNewDecl = useCallback(({ model, year, period, status }) => {
    if (apiBaseUrl) {
      const base = apiBaseUrl.replace(/\/[^/]+$/, '');
      apiFetch(`${base}/fiscal303/declarations`, {
        method: 'POST',
        baseUrl: '',
        body: JSON.stringify({ model, year: parseInt(year, 10), period, status }),
      })
        .then(async r => {
                    if (r.ok) return r.json();
          // ETP-5716 — a single-ordinary model (390) refuses a 2nd ordinary of the exercise
          // with 409 DUPLICATE_ORDINARY + the existing declaration's id: say so and offer it.
          // The body is read once and shared: a Response body cannot be consumed twice.
          const body = r.status === 409 ? await r.json().catch(() => null) : undefined;
          const existingId = duplicateOrdinaryId(r.status, body);
          if (existingId) {
            const toastId = toast.error(
              <span>
                {t('fm.new_decl.duplicate_ordinary', { model, year })}{' '}
                <button
                  type="button"
                  className="fm-link-btn fm-link-btn--bold"
                  onClick={() => { toast.dismiss(toastId); openDeclarationById(existingId); }}
                  data-testid="FmListPage__openExistingDecl"
                >
                  {t('fm.new_decl.open_existing')}
                </button>
              </span>,
            );
            return null;
          }
          // ETP-5782: carry the backend error code along with the status.
          const e = await parseBackendError(body === undefined ? r : {
            json: async () => {
              if (body === null) {
                throw new Error('empty body');
              }
              return body;
            },
          });
          return Promise.reject({ status: r.status, code: e.code });
        })
        .then(created => {
          if (created) setDecls(ds => [normDecl(created?.data ?? created, bcpLocale), ...ds]);
        })
        // The rejection is an object `{status, code}`, not a bare status number.
        .catch(({ status, code } = {}) => {
          // ETP-5272 — this used to silently swallow the backend's error (a 409 when a draft
          // already exists for the period, or any other failure), leaving the user staring at a
          // closed modal with no created row and no explanation. Mirrors the exact toast pattern
          // already used for delete failures (handleConfirmDelete above).
          //
          // ETP-5725 (reopened QA fix) — the generic fallback below used to fire for EVERY
          // failure, including the one case that already has a specific, well-known cause: the
          // pre-existing ETP-5272 one-draft-per-period guard
          // (`FiscalDeclCrudHandler#hasDraftDeclaration`) rejects with a plain 409 and no other
          // code path in this POST returns 409 — so the status code alone (no need to parse the
          // response body's `error.message`, which is backend English text, not localized)
          // unambiguously identifies "a draft already exists for this period". Every other
          // failure (network error, 500, any other status) keeps the original generic toast.
          // (The ETP-5716 409 DUPLICATE_ORDINARY never reaches here: the first `.then` handles it.)
          // ETP-5782: the hand-written guard answers a code-less 409; a classified 409 (duplicate_key
          // included) from elsewhere in the chain must not claim "draft exists" unless it is one.
          if (isDuplicateConflict(status, code)) {
            toast.error(t('fm.list.new_decl_draft_exists')
              ?? 'No se puede crear la declaración. Ya existe una declaración en borrador para el periodo seleccionado.');
            return;
          }
          toast.error(t('fm.list.new_decl_failed') ?? 'No se pudo crear la declaración.');
        });
    }
  }, [token, apiBaseUrl, apiFetch, t, bcpLocale, openDeclarationById]);

  // Row hover "delete" action (ETP-5187) — draft declarations only, gated the same
  // way both here (caller only ever passes a draft decl into setDeleteTarget) and
  // server-side (FiscalDeclCrudHandler#handleDeclDelete rejects anything but draft).
  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    deleteDeclaration(deleteTarget.id, { token, apiBaseUrl })
      .then((result) => {
        if (result.ok) {
          setDecls(ds => ds.filter(d => d.id !== deleteTarget.id));
          setDeleteTarget(null);
        } else {
          toast.error(t('fm.list.delete_failed') ?? 'No se pudo eliminar la declaración.');
        }
      })
      .finally(() => setDeletingId(null));
  }, [deleteTarget, token, apiBaseUrl, t]);

  // Row hover "reactivate" action (ETP-5338) — reverts a submitted/submitted_ack declaration
  // back to draft. Gated the same way both here (caller only ever passes a
  // canReactivate(decl) === true declaration into setReactivateTarget) and server-side
  // (FiscalDeclCrudHandler#handleDeclPut rejects reverting an aeat_telematic declaration to
  // draft, defense in depth). No submissionMethod is sent — persistDeclarationStatus only
  // includes it when explicitly passed, and reactivating doesn't set one.
  const handleConfirmReactivate = useCallback(() => {
    if (!reactivateTarget) return;
    setReactivatingId(reactivateTarget.id);
    persistDeclarationStatus(reactivateTarget.id, 'draft', { token, apiBaseUrl })
      .then((result) => {
        if (result.ok) {
          // The backend cleared the submission snapshot (ETP-5438): a draft computes live again.
          setDecls(ds => ds.map(d => d.id === reactivateTarget.id ? { ...d, status: 'draft', submittedSnapshot: null } : d));
          setReactivateTarget(null);
        } else if (result.reason === 'corrective_sibling_presented') {
          // ETP-5725 (reopened QA fix, UX follow-up) — the precise, commonly-hit case: a
          // rectificativa/sustitutiva sibling is already presented for this period, so
          // reactivating this one would strand it with nothing left to correct (see
          // FiscalDeclCrudHandler#findReactivationBlockReason).
          toast.error(t('fm.list.reactivate_failed_corrective_exists')
            ?? 'No se puede reactivar: ya existe una declaración rectificativa/sustitutiva presentada para este periodo.');
        } else if (result.reason === 'sibling_exists') {
          // Every other blocking-sibling case (a draft sibling, or a presented-but-non-corrective
          // one) — still more informative than the fully generic fallback below, without a
          // dedicated sentence for every remaining combination.
          toast.error(t('fm.list.reactivate_failed_sibling_exists')
            ?? 'No se puede reactivar: ya existe otra declaración para este periodo.');
        } else {
          toast.error(t('fm.list.reactivate_failed') ?? 'No se pudo reactivar la declaración.');
        }
      })
      .finally(() => setReactivatingId(null));
  }, [reactivateTarget, token, apiBaseUrl, t]);

  const yearOptions = useMemo(
    () => Array.from(new Set(decls.map(d => String(d.year)))).sort((a, b) => b - a)
      .map(y => ({ value: y, label: y })),
    [decls]
  );

  const statusOptions = STATUS_FILTER_OPTIONS;

  const modelOptions = LIST_MODELS
    .map(m => ({ value: m.id, label: t(modelTitleKey(m.id)) ?? `Modelo ${m.id}`, badge: m.id }))
    .filter(opt => activeModels[opt.value]);

  const activeDecls = decls.filter(d => activeModels[d.model]);

  const modelYearFiltered = activeDecls.filter(d =>
    (modelFilter === 'all' || d.model === modelFilter) &&
    (yearFilter  === 'all' || String(d.year) === yearFilter)
  );

  const filtered = modelYearFiltered.filter(d =>
    statusFilter === 'all' || (STATUS_FILTER_RAW[statusFilter]?.has(d.status) ?? false)
  );

  // KPI filter (ETP-4755, KPI-cards-as-filters) — an additional AND-condition on top of
  // `filtered` above, not a replacement for it, so it combines with the year/model/status
  // filters. Each branch reuses the exact predicate its KPI card counts with (see
  // `isUpcomingDeadline` in fiscalModelsUtils.js and `hasIncidents` above), so the filtered
  // rows always match the card's own displayed number.
  const kpiFiltered = filtered.filter(d => {
    if (kpiFilter === 'upcoming') return isUpcomingDeadline(d);
    if (kpiFilter === 'pending') return d.status === 'draft';
    if (kpiFilter === 'incidents') return hasIncidents(d);
    return true;
  });

  // ── Sort (toolbar "Ordenar" button → field-selector popover) ────────
  // Same mechanism as ListView.jsx's column sort (used by the generated/Factura
  // windows): pick a field, click again to flip direction, "Limpiar orden" resets
  // to the default. `sortColumn === null` = default order (year+period, descending).
  // See `sortDeclarations` above for the implementation.
  const sortedDecls = sortDeclarations(kpiFiltered, sortColumn, sortDirection);

  const activeCount = Object.values(activeModels).filter(Boolean).length;

  const toggleSelect = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = sortedDecls.length > 0 && sortedDecls.every(d => selected.has(d.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(sortedDecls.map(d => d.id)));

  const handleSortSelect = (key) => {
    if (sortColumn === key) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(key);
      setSortDirection('asc');
    }
    setShowSortMenu(false);
  };
  const handleClearSort = () => {
    setSortColumn(null);
    setSortDirection('desc');
    setShowSortMenu(false);
  };

  // ── Table body (EmptyState variants vs. the real table) ─────────────
  // If/else-if chain instead of a nested ternary (SonarQube S3358) — same four
  // outcomes in the same order of precedence, same JSX per outcome.
  let tableSection;
  if (!catalogLoaded) {
    tableSection = (
      <EmptyState
        message={t('loading') ?? 'Cargando…'}
        data-testid="EmptyState__cb728e" />
    );
  } else if (activeCount === 0) {
    tableSection = (
      <EmptyState
        title={t('fm.list.empty_no_active_models') ?? 'No hay modelos activos. Configúralos desde el Catálogo de modelos.'}
        data-testid="EmptyState__cb728e" />
    );
  } else if (sortedDecls.length === 0) {
    tableSection = <EmptyState data-testid="EmptyState__cb728e" />;
  } else {
    tableSection = (
      <table className="fm-table">
        <thead>
          <tr>
            <th style={{ width: 32 }} onClick={e => e.stopPropagation()}>
              <CheckboxField
                checked={allSelected}
                onToggle={toggleAll}
                onClick={e => e.stopPropagation()}
                data-testid="CheckboxField__cb728e" />
            </th>
            <th>{t('fm.col.model')}</th>
            <th>{t('fm.col.period')}</th>
            <th>{t('fm.col.type')}</th>
            <th style={{ minWidth: 180 }}>{t('fm.col.status')}</th>
            <th style={{ textAlign: 'right' }}>{t('fm.col.result')}</th>
            <th>{t('fm.col.incidents')}</th>
            <th>{t('fm.col.updated_at') ?? 'Última actualización'}</th>
            <th style={{ width: 72 }} aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {sortedDecls.map(decl => {
            // Draft declarations read from their model's polling map; any other status
            // reads from its model's one-time-compute map — see `useDeclarationsAutoCompute`
            // for why both are needed.
            // (see `getComputedForDecl` above for the implementation)
            const isDraft = decl.status === 'draft';
            const computed = getComputedForDecl(decl, isDraft, { draftMapById, otherMapById });
            const hasStoredResult = !!decl.result?.kind;
            const isComputingThis = isKnownModel(decl.model)
              && !computed && !hasStoredResult;
            const computeError = (computed?.error && !hasStoredResult) ? computed.error : null;

            // The row's "Resultado" comes from its model's own derivation (303: box 71 with the
            // row's manualOverrides merged; 349: the abs-summed key totals) — see
            // `models/<id>/listBehavior<id>.js`. An unknown model uses the default model's (303)
            // derivation, as it always did ("anything that is not 349 is derived as 303").
            let displayResult = decl.result;
            if (computed?.summary && !computed.error) {
              displayResult = getListBehavior(getModelOrDefault(decl.model).id).deriveListResult(decl, computed);
            }

            // ETP-5187 — flags this declaration as a 2nd/Nth one for the same
            // (model, year, period): the detail page (FmModel303Page.jsx) uses this
            // to warn + gate on "Autoliquidación rectificativa". Computed off the
            // full `decls` list (not the filtered/sorted view) so it's correct
            // regardless of the active filters.
            const hasDuplicatePeriod = decls.some(d => d.id !== decl.id
              && d.model === decl.model && d.year === decl.year && d.period === decl.period);

            // ETP-5725 — narrower than `hasDuplicatePeriod` above: true only when a SIBLING
            // declaration for this (model, year, period) is already in the submitted family
            // (SUBMITTED_STATUSES). The type selector (349's Sustitutiva segmented control,
            // 303's "Autoliquidación rectificativa" checkbox) uses this to auto-default to the
            // corrected type and lock "Normal" out — unlike `hasDuplicatePeriod`, which also
            // fires for a sibling that is still a draft/ready and merely WARNS at submit time.
            // `decls` has no exposed DECL_SEQ ordinal (see FiscalDeclCrudHandler#findLatestDeclaration
            // on the Go side), so this doesn't single out the highest-seq sibling — but the
            // existing one-draft-per-period guard (ETP-5272) means at most one sibling can be in
            // a non-terminal state at a time, so "any submitted sibling exists" and "the latest
            // sibling is submitted" coincide in practice.
            const duplicatePeriodPresented = decls.some(d => d.id !== decl.id
              && d.model === decl.model && d.year === decl.year && d.period === decl.period
              && SUBMITTED_STATUSES.has(d.status));

            const declTypeLabel = resolveDeclTypeLabel(decl, t, duplicatePeriodPresented);

            return (
              <tr
                key={decl.id}
                className={fmListRowClassName({ selected: selected.has(decl.id), current: decl.current })}
                onClick={() => onSelect?.({ ...decl, _precomputed: computed, _hasDuplicatePeriod: hasDuplicatePeriod, _duplicatePeriodPresented: duplicatePeriodPresented })}
              >
                <td onClick={e => e.stopPropagation()}>
                  <CheckboxField
                    checked={selected.has(decl.id)}
                    onToggle={() => toggleSelect(decl.id)}
                    onClick={e => e.stopPropagation()}
                    data-testid="CheckboxField__cb728e" />
                </td>
                <td>
                  <ModelBadge model={decl.model} data-testid="ModelBadge__cb728e" />
                  <span className="fm-model-year" style={{ marginLeft: 6, fontWeight: 600 }}>{decl.year}</span>
                </td>
                <td><span className="fm-period">{periodLabel(decl.period, t)}</span></td>
                {/* ETP-5338 pt.3 / ETP-5456 — "Tipo" must reflect AEAT's rectificativa (303) and
                    sustitutiva (349) flags, which the user sets on each model's own detail page
                    ("Autoliquidación Rectificativa" / "Sustitutiva" checkboxes), both persisted
                    under the same `manualData.identification` shape
                    (`identChecks.rectificativa` / `identChecks.sustitutiva`). `decl.type`
                    (DECL_TYPE, ord/com) is a genuine but DIFFERENT AEAT concept
                    (ordinaria/complementaria) that no UI flow currently sets to "com" — every
                    declaration is created with DECL_TYPE=O, so deriving "Tipo" from it always
                    showed "Ordinaria". The two flags are mutually exclusive by construction (only
                    303 exposes `rectificativa`, only 349 exposes `sustitutiva`), so checking both
                    is safe without a `decl.model` guard. */}
                <td>{declTypeLabel}</td>
                <td>
                  <FmStatusChip status={decl.status} submissionMethod={decl.submissionMethod} t={t} data-testid="StatusText__cb728e" />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <ResultText
                    isComputing={isComputingThis}
                    error={computeError}
                    result={displayResult}
                    t={t}
                    data-testid="ResultText__cb728e" />
                </td>
                <td>
                  <IncidentsCell
                    blocking={decl.incidents?.blocking ?? 0}
                    warning={decl.incidents?.warning ?? 0}
                    t={t}
                    data-testid="IncidentsCell__cb728e" />
                </td>
                <td><span className="fm-date">{decl.updatedAt ?? '—'}</span></td>
                <td style={{ position: 'relative' }}>
                  {isDraft && (
                    <FmRowActions
                      onEdit={() => onSelect?.({ ...decl, _precomputed: computed, _hasDuplicatePeriod: hasDuplicatePeriod, _duplicatePeriodPresented: duplicatePeriodPresented })}
                      onDelete={() => setDeleteTarget(decl)}
                      deleting={deletingId === decl.id}
                      data-testid="FmRowActions__cb728e" />
                  )}
                  {!isDraft && canReactivate(decl) && (
                    <FmRowActions
                      onReactivate={() => setReactivateTarget(decl)}
                      reactivating={reactivatingId === decl.id}
                      data-testid="FmRowActions__reactivate-cb728e" />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  // ── Top-bar page meta (ETP-5584) ─────────────────────────────────────────
  // Same mechanism every generated list window uses (ListView.jsx): the app TopBar renders the
  // title, the record-count badge, the breadcrumb subtitle and the kebab (favorites + page help).
  // Published by <ListPageMeta> (rendered below) ONLY while `active`. This component stays
  // mounted (hidden) while FiscalModelsPage shows a 303/349 detail page, for auto-compute
  // polling. Publishing an empty meta from here instead would be wrong: useSetPageMeta's cleanup
  // resets the TopBar on every dep change, so a poll that changed `decls.length` while a detail
  // page is open would wipe the detail's title. Unmounting <ListPageMeta> withdraws the list
  // meta exactly once, when the detail opens; remounting it re-publishes on the way back.
  const windowTitle = ui('fm.breadcrumb.section');

  return (
    <div className="fm-page">
      {active && (
        <ListPageMeta
          title={windowTitle}
          breadcrumb={`${ui('finance')} / ${windowTitle}`}
          recordCount={decls.length}
          data-testid="ListPageMeta__cb728e" />
      )}
      {/* ── Content row 1 — page actions, right-aligned (ETP-5584). Mirrors the first content
          row of a generated ListView under the TopBar: outline secondary, then the dark
          primary "New" button right-most (Button classes copied from ListView.jsx). ── */}
      <div
        data-testid="fm-list-actions-row"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
          padding: '12px 16px 4px', background: 'hsl(var(--card))', flexShrink: 0,
        }}
      >
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-muted-foreground font-normal h-9 px-3 rounded-lg bg-card"
          onClick={() => setShowCatalog(true)}
          data-testid="fm-list-catalog-button"
        >
          <LayoutGrid className="h-3.5 w-3.5" data-testid="LayoutGrid__cb728e" />
          {t('fm.catalog.title') ?? 'Catálogo de modelos'}{catalogLoaded ? ` (${activeCount})` : ''}
        </Button>
        {catalogLoaded && activeCount > 0 && (
          <Button
            className="ml-3 rounded-lg shadow-sm gap-1.5 px-4 hover:bg-[hsl(var(--accent-highlight))] hover:text-[hsl(var(--accent-highlight-foreground))] transition-colors"
            onClick={() => setShowNewDecl(true)}
            data-testid="fm-list-new-declaration-button"
          >
            + {t('fm.action.new_declaration') ?? 'Nueva declaración'}
          </Button>
        )}
      </div>
      {/* ── Content row 2 — KPI cards, full width ── */}
      {catalogLoaded && (
        <KpiCardsRow
          decls={modelYearFiltered}
          t={t}
          kpiFilter={kpiFilter}
          onFilterClick={handleKpiFilterClick}
          data-testid="KpiCardsRow__cb728e" />
      )}
      {/* ── Content row 3 — filters + sort, right-aligned (no section heading, ETP-5584) ── */}
      <div className="fm-toolbar">
        <div className="fm-toolbar__space" />

        <FilterDropdown
          label={t('fm.filter.all_years') ?? 'Todos los años'}
          value={yearFilter}
          options={yearOptions}
          onChange={setYearFilter}
          data-testid="FilterDropdown__cb728e" />
        {catalogLoaded && (
          <FilterDropdown
            label={t('fm.filter.all_models') ?? 'Todos los modelos'}
            value={modelFilter}
            options={modelOptions}
            onChange={setModelFilter}
            data-testid="FilterDropdown__cb728e" />
        )}
        <FilterDropdown
          label={t('fm.filter.all_statuses') ?? 'Todos los estados'}
          value={statusFilter}
          options={statusOptions}
          onChange={setStatusFilter}
          data-testid="FilterDropdown__cb728e" />

        {/* "Ordenar" — field-selector popover (same mechanism as ListView.jsx's
            column sort used by the generated/Factura windows), not a bare toggle. */}
        <div className="fm-filter-select" ref={sortBtnRef} style={{ position: 'relative' }}>
          <button
            className="fm-section-header__icon-btn"
            title={t('sortBy')}
            aria-label={t('sortBy')}
            aria-haspopup="listbox"
            aria-expanded={showSortMenu}
            aria-pressed={Boolean(sortColumn)}
            onClick={() => setShowSortMenu(o => !o)}
            style={sortColumn ? { color: 'hsl(var(--foreground))', borderColor: 'var(--fm-border-2)' } : undefined}
          >
            <ArrowUpDown size={16} strokeWidth={1.75} data-testid="ArrowUpDown__cb728e" />
          </button>
          {showSortMenu && (
            // Right-anchored: the sort button is the last item of the toolbar row (ETP-5584).
            <div className="fm-status-select__menu" role="listbox" style={{ minWidth: 200, left: 'auto', right: 0 }}>
              <div style={{ padding: '6px 12px', fontSize: 12, fontWeight: 500, color: 'hsl(var(--muted-foreground))' }}>
                {t('sortBy')}
              </div>
              {SORT_FIELDS.map(field => {
                const isActive = sortColumn === field.key;
                return (
                  <button
                    key={field.key}
                    className="fm-status-select__item"
                    style={{ justifyContent: 'space-between' }}
                    role="option" aria-selected={isActive}
                    onClick={() => handleSortSelect(field.key)}
                  >
                    <span style={{ fontSize: 14, color: 'hsl(var(--foreground))', fontWeight: isActive ? 500 : 400 }}>
                      {t(field.labelKey)}
                    </span>
                    {isActive && (
                      <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                        {sortDirection === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </button>
                );
              })}
              {sortColumn && (
                <>
                  <div style={{ height: 1, background: 'hsl(var(--border-subtle))', margin: '2px 8px' }} />
                  <button
                    className="fm-status-select__item"
                    onClick={handleClearSort}
                  >
                    <span style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))' }}>{t('clearSort')}</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {/* ── Table ──────────────────────────────────────────────── */}
      <div className="fm-table-wrap">
        {tableSection}
      </div>
      {/* ── Overlays ─────────────────────────────────────────────── */}
      {/* Mounted only while a delete is pending confirmation (matches the
          showNewDecl/showCatalog convention below) — Dialog/DialogContent pulls
          in lucide-react's X icon at render time even when `open` is false, so
          keeping this unconditionally mounted needlessly drags that dependency
          into every render of this page. */}
      {deleteTarget && (
        <DeleteConfirmDialog
          open
          count={1}
          deleting={deletingId != null}
          onConfirm={handleConfirmDelete}
          onClose={() => setDeleteTarget(null)}
          data-testid="DeleteConfirmDialog__cb728e" />
      )}
      {reactivateTarget && (
        <ReactivateConfirmDialog
          open
          reactivating={reactivatingId != null}
          onConfirm={handleConfirmReactivate}
          onClose={() => setReactivateTarget(null)}
          t={t}
          data-testid="ReactivateConfirmDialog__cb728e" />
      )}
      {showNewDecl && <NewDeclModal
        onConfirm={handleNewDecl}
        onClose={() => setShowNewDecl(false)}
        activeModels={activeModels}
        existingDeclarations={decls}
        onOpenExisting={(decl) => onSelect?.(decl)}
        data-testid="NewDeclModal__cb728e" />}
      {/* ── Catalog drawer (slides from right) ───────────────────── */}
      {showCatalog && (
        <FmCatalogPage
          activeModels={activeModels}
          onBack={() => setShowCatalog(false)}
          onSave={(newActive) => {
            setActiveModels(newActive);
            setShowCatalog(false);
            if (apiBaseUrl) {
              const base = apiBaseUrl.replace(/\/[^/]+$/, '');
              apiFetch(`${base}/fiscal-models-catalog`, {
                method: 'PUT',
                baseUrl: '',
                body: JSON.stringify(newActive),
              })
                .then(r => { if (!r.ok) throw new Error(r.status); })
                .catch(() => {});
            }
          }}
          token={token}
          apiBaseUrl={apiBaseUrl}
          data-testid="FmCatalogPage__cb728e" />
      )}
    </div>
  );
}
