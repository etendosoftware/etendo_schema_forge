import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useUI } from '@/i18n';
import {
  LayoutGrid, ArrowUpDown,
  ChevronDown, Calendar, Clock, TriangleAlert, OctagonAlert, Check,
} from 'lucide-react';
import { EmptyState, KpiWidget, MoreOptionsMenu } from './FmCommon.jsx';
import { Checkbox } from '@/components/ui/checkbox';
import { NewDeclModal } from './FmOverlays.jsx';
import FmCatalogPage from './FmCatalogPage.jsx';
import { formatAmount, countUpcomingDeadlines, isUpcomingDeadline, checkModified303, checkModified349, compute349Operators, fetchDeclarationIncidents } from './fiscalModelsUtils.js';
import useFiscalAutoCompute from './useFiscalAutoCompute.js';

import { useApiFetch } from '@/auth/useApiFetch.js';
import { apiFetch } from '@/auth/api.js';
// Real-mode only: throws on fetch failure instead of falling back to mock data.
// Module-level helper (not the component/hook), so it uses the ambient `apiFetch`
// bound to the session, taking the explicit `token` it already receives as an
// override rather than a React hook it has no component body to call from.
async function computeBoxes303Real(decl, { token, apiBaseUrl } = {}) {
  if (!token || !apiBaseUrl) throw new Error('missing credentials');
  const base = apiBaseUrl.replace(/\/[^/]+$/, '');
  const params = new URLSearchParams({ year: decl.year, period: decl.period });
  const res = await apiFetch(`${base}/fiscal303/boxes?${params}`, { baseUrl: '', token });
  if (!res.ok) throw new Error(`boxes fetch failed: ${res.status}`);
  return await res.json();
}

async function computeOperators349Real(decl, { token, apiBaseUrl } = {}) {
  return compute349Operators(decl, { token, apiBaseUrl });
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
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
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

const STATUS_PLAIN_LABEL = {
  submitted_ext: 'Presentado en otra plataforma',
};

// statusLabelKey (ETP-4755): the status BADGE text must always read the plain
// "Presentado"/"Submitted" for BOTH `submitted` and `submitted_ack` — `submitted_ack`
// collapses onto `submitted`'s i18n key here. HOW it was submitted (manual ack, no
// receipt, real AEAT telematic ack) is shown exclusively via the `submissionMethod`
// sub-label rendered underneath, never inside the badge text itself. `submitted_ext`
// is untouched — a distinct legacy status, not part of this unification.
function statusLabelKey(status) {
  return status === 'submitted_ack' ? 'submitted' : status;
}

const STATUS_GREEN = new Set(['ready', 'submitted', 'submitted_ext', 'submitted_ack']);

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
  return 0;
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

// SUBMISSION_METHOD_STATUSES (ETP-4755) — only these two statuses can carry a
// submissionMethod (the two manual "Presentado" paths persist it themselves via
// handlePresent; a real AEAT telematic success also lands on submitted_ack, set
// server-side). submitted_ext (the removed "otra plataforma" path) never carries one.
const SUBMISSION_METHOD_STATUSES = new Set(['submitted', 'submitted_ack']);

// submissionMethod (ETP-4755, optional) — shown as a compact sub-label under the status
// badge, only for the statuses that can actually carry one, and only when present (a
// declaration that predates this feature simply shows the bare status badge, unchanged).
function StatusText({ status, submissionMethod, t }) {
  const label = STATUS_PLAIN_LABEL[status] ?? (t(`fm.status.${statusLabelKey(status)}`) ?? status);
  const isGreen = STATUS_GREEN.has(status);
  const methodLabel = submissionMethod && SUBMISSION_METHOD_STATUSES.has(status)
    ? t(`fm.present.method.${submissionMethod}`)
    : null;
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '2px 8px', borderRadius: 6,
        fontSize: 12, fontWeight: 400, lineHeight: '16px',
        background: isGreen ? 'var(--status-success-bg)' : 'hsl(var(--muted))',
        color: isGreen ? 'var(--status-success-fg)' : 'hsl(var(--muted-foreground))',
      }}>
        {label}
      </span>
      {methodLabel && (
        <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', paddingLeft: 2 }}>
          {methodLabel}
        </span>
      )}
    </span>
  );
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
  if (result.kind === 'info') {
    return result.amount > 0
      ? <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, color: 'hsl(var(--foreground))' }}>{formatAmount(result.amount)}</span>
      : <span style={RESULT_BADGE_STYLE}>{t('fm.result.info') ?? 'Informativa'}</span>;
  }
  const label = t(`fm.result.${result.kind}`) ?? result.kind;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <span style={RESULT_BADGE_STYLE}>{label}</span>
      {result.amount != null && (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 14, fontWeight: 500, color: 'hsl(var(--foreground))' }}>
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
  return (decl.incidents?.blocking ?? 0) > 0 || (decl.incidents?.warning ?? 0) > 0;
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

  return (
    <div style={{ display: 'flex', gap: 12, padding: '0 16px 8px', background: 'hsl(var(--card))', flexShrink: 0 }}>
      <div style={{ width: 360, flexShrink: 0 }}>
        <KpiWidget
          icon={<Calendar size={20} strokeWidth={1.75} data-testid="Calendar__cb728e" />}
          iconColor="hsl(var(--muted-foreground))"
          label="Por vencer"
          badge="Esta semana"
          badgeBg="var(--status-warning-bg)"
          badgeColor="var(--status-warning-fg)"
          value={upcomingCount}
          onClick={() => onFilterClick('upcoming')}
          active={kpiFilter === 'upcoming'}
          data-testid="KpiWidget__cb728e" />
      </div>
      <div style={{ width: 360, flexShrink: 0 }}>
        <KpiWidget
          icon={<Clock size={20} strokeWidth={1.75} data-testid="Clock__cb728e" />}
          iconColor="hsl(var(--muted-foreground))"
          label={t('fm.kpi.pending') ?? 'Pendientes'}
          badge="Sin presentar"
          badgeBg="hsl(var(--muted))"
          badgeColor="hsl(var(--muted-foreground))"
          value={pendingCount}
          onClick={() => onFilterClick('pending')}
          active={kpiFilter === 'pending'}
          data-testid="KpiWidget__cb728e" />
      </div>
      <div style={{ width: 360, flexShrink: 0 }}>
        <KpiWidget
          icon={<TriangleAlert size={20} strokeWidth={1.75} data-testid="TriangleAlert__cb728e" />}
          iconColor="hsl(var(--muted-foreground))"
          label="Incidencias"
          badge="Requiere revisión"
          badgeBg="var(--status-destructive-bg)"
          badgeColor="hsl(var(--destructive))"
          value={incidentCount}
          onClick={() => onFilterClick('incidents')}
          active={kpiFilter === 'incidents'}
          data-testid="KpiWidget__cb728e" />
      </div>
    </div>
  );
}

function normDecl(d) {
  return {
    ...d,
    updatedAt: d.updatedAt ? new Date(d.updatedAt).toLocaleDateString('es-ES') : '—',
    result: d.result ?? null,
    incidents: d.incidents ?? { blocking: 0, warning: 0 },
  };
}

// ── Sub-components ───────────────────────────────────────────────
function ModelBadge({ model }) {
  return <span className={`fm-model-badge fm-model-badge--${model}`}>{model}</span>;
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

function ResultCell({ isComputing, error, result, t }) {
  if (isComputing) return <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 12 }}>…</span>;
  if (error) {
    return resultBadge(t('fm.status.error') ?? 'Error');
  }
  if (!result?.kind) return <span style={{ color: 'hsl(var(--muted-foreground))' }}>—</span>;
  if (result.kind === 'N') return resultBadge(t('fm.result.N') ?? 'Sin resultado');
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

function getResultKind(r) {
  if (r > 0) return 'I';
  if (r < 0) return 'C';
  return 'N';
}

// Resolves the auto-computed boxes/operators entry for a declaration row —
// draft declarations read from the polling maps (computedMap/computedMap349),
// any other status reads from the one-time-compute maps (see the
// otherDecls303/otherDecls349 comment in the main component for why both are
// needed). Extracted out of the table row's nested ternary (SonarQube S3358);
// same values, same logic.
function getComputedForDecl(decl, isDraft, maps) {
  const { computedMap, computedMapOther303, computedMap349, computedMapOther349 } = maps;
  if (decl.model === '349') {
    return isDraft ? computedMap349[decl.id] : computedMapOther349[decl.id];
  }
  return isDraft ? computedMap[decl.id] : computedMapOther303[decl.id];
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

export default function FmListPage({ declarations: propDecls, onSelect, onComputeUpdate, token, apiBaseUrl }) {
  const ui = useUI();
  const t  = ui;
  const apiFetch = useApiFetch(apiBaseUrl);

  const [decls, setDecls] = useState(propDecls ?? []);

  useEffect(() => {
    if (!token || !apiBaseUrl) return;
    const base = apiBaseUrl.replace(/\/[^/]+$/, '');
    apiFetch(`${base}/fiscal303/declarations`, { baseUrl: '' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setDecls((Array.isArray(data) ? data : (data?.data ?? [])).map(normDecl)))
      .catch(() => {});
  }, [token, apiBaseUrl, apiFetch]);

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
    if (!token || !apiBaseUrl || !decls.length) return;
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
  const [catalogLoaded, setCatalogLoaded] = useState(!token || !apiBaseUrl);

  useEffect(() => {
    if (!token || !apiBaseUrl) return;
    const base = apiBaseUrl.replace(/\/[^/]+$/, '');
    apiFetch(`${base}/fiscal-models-catalog`, { baseUrl: '' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setActiveModels(data ?? {}))
      .catch(() => {})
      .finally(() => setCatalogLoaded(true));
  }, [token, apiBaseUrl, apiFetch]);

  const draftDecls303 = useMemo(
    () => decls.filter(d => d.model === '303' && d.status === 'draft'),
    [decls]
  );

  const draftDecls349 = useMemo(
    () => decls.filter(d => d.model === '349' && d.status === 'draft'),
    [decls]
  );

  // Non-draft declarations (ETP-4755 "Resultado" fix): `declToJson`
  // (FiscalDeclCrudHandler, backend) never persists a computed result on the
  // declaration record — GET /fiscal303/declarations always comes back with no
  // `result` field, for every status. The draft-only hooks above are correct for
  // drafts (live-recompute + poll, since their underlying invoices can still
  // change), but once a declaration leaves draft its boxes are otherwise NEVER
  // computed at all in this list — the "Resultado" column stayed stuck on "—"
  // forever, the same class of bug the "Incidencias" column had before this list
  // fetched real data. Mirrors FmModel303Page.jsx's own already-shipped fix for
  // its KPIs/boxes ("Auto-compute on mount when the list didn't hand us any
  // precomputed data" — same ETP-4755, same `/fiscal303/boxes` and
  // `/fiscal349/operators` endpoints, which recompute from invoice data
  // regardless of declaration status): compute ONCE per declaration, with no
  // `checkModifiedFn` so `useFiscalAutoCompute`'s polling effect never engages
  // (it no-ops without one) — a submitted/ready/skipped declaration's boxes are
  // not expected to keep changing, unlike a draft's.
  const otherDecls303 = useMemo(
    () => decls.filter(d => d.model === '303' && d.status !== 'draft'),
    [decls]
  );

  const otherDecls349 = useMemo(
    () => decls.filter(d => d.model === '349' && d.status !== 'draft'),
    [decls]
  );

  const { computedMap } = useFiscalAutoCompute(draftDecls303, {
    computeFn:       computeBoxes303Real,
    checkModifiedFn: checkModified303,
    token,
    apiBaseUrl,
    pollIntervalMs:  180_000,
    enabled:         Boolean(token && apiBaseUrl),
  });

  const { computedMap: computedMap349 } = useFiscalAutoCompute(draftDecls349, {
    computeFn:       computeOperators349Real,
    checkModifiedFn: checkModified349,
    token,
    apiBaseUrl,
    pollIntervalMs:  180_000,
    enabled:         Boolean(token && apiBaseUrl),
  });

  const { computedMap: computedMapOther303 } = useFiscalAutoCompute(otherDecls303, {
    computeFn: computeBoxes303Real,
    token,
    apiBaseUrl,
    enabled:   Boolean(token && apiBaseUrl),
  });

  const { computedMap: computedMapOther349 } = useFiscalAutoCompute(otherDecls349, {
    computeFn: computeOperators349Real,
    token,
    apiBaseUrl,
    enabled:   Boolean(token && apiBaseUrl),
  });

  useEffect(() => {
    if (onComputeUpdate && Object.keys(computedMap349).length > 0) {
      onComputeUpdate(computedMap349);
    }
  }, [computedMap349, onComputeUpdate]);

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

  const handleNewDecl = useCallback(({ model, year, period, status }) => {
    if (token && apiBaseUrl) {
      const base = apiBaseUrl.replace(/\/[^/]+$/, '');
      apiFetch(`${base}/fiscal303/declarations`, {
        method: 'POST',
        baseUrl: '',
        body: JSON.stringify({ model, year: parseInt(year, 10), period, status }),
      })
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(created => setDecls(ds => [normDecl(created?.data ?? created), ...ds]))
        .catch(() => {});
    }
  }, [token, apiBaseUrl, apiFetch]);

  const yearOptions = useMemo(
    () => Array.from(new Set(decls.map(d => String(d.year)))).sort((a, b) => b - a)
      .map(y => ({ value: y, label: y })),
    [decls]
  );

  const statusOptions = STATUS_FILTER_OPTIONS;

  const modelOptions = [
    { value: '303', label: 'Modelo 303', badge: '303' },
    { value: '349', label: 'Modelo 349', badge: '349' },
  ].filter(opt => activeModels[opt.value]);

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
              <Checkbox
                checked={allSelected}
                onChange={toggleAll}
                onClick={e => e.stopPropagation()}
                data-testid="Checkbox__cb728e" />
            </th>
            <th>{t('fm.col.model')}</th>
            <th>{t('fm.col.period')}</th>
            <th>{t('fm.col.type')}</th>
            <th style={{ minWidth: 180 }}>{t('fm.col.status')}</th>
            <th style={{ textAlign: 'right' }}>{t('fm.col.result')}</th>
            <th>{t('fm.col.incidents')}</th>
            <th>{t('fm.col.updated_at') ?? 'Última actualización'}</th>
          </tr>
        </thead>
        <tbody>
          {sortedDecls.map(decl => {
            // Draft declarations read from the polling maps (computedMap/computedMap349);
            // any other status reads from the one-time-compute maps above — see the
            // otherDecls303/otherDecls349 comment for why both are needed.
            // (see `getComputedForDecl` above for the implementation)
            const isDraft = decl.status === 'draft';
            const computed = getComputedForDecl(decl, isDraft, {
              computedMap, computedMapOther303, computedMap349, computedMapOther349,
            });
            const hasStoredResult = !!decl.result?.kind;
            const isComputingThis = ['303', '349'].includes(decl.model)
              && !computed && !hasStoredResult;
            const computeError = (computed?.error && !hasStoredResult) ? computed.error : null;

            let displayResult = decl.result;
            if (computed?.summary && !computed.error) {
              if (decl.model === '349') {
                const total = ['totalE','totalS','totalA','totalI']
                  .reduce((s, k) => s + (parseFloat(computed.summary[k]) || 0), 0);
                displayResult = { kind: 'info', amount: total };
              } else {
                const r = computed.summary.result;
                const kind = getResultKind(r);
                displayResult = { kind, amount: Math.abs(r) };
              }
            }

            return (
              <tr
                key={decl.id}
                className={fmListRowClassName({ selected: selected.has(decl.id), current: decl.current })}
                onClick={() => onSelect?.({ ...decl, _precomputed: computed })}
              >
                <td onClick={e => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(decl.id)}
                    onChange={() => toggleSelect(decl.id)}
                    onClick={e => e.stopPropagation()}
                    data-testid="Checkbox__cb728e" />
                </td>
                <td>
                  <ModelBadge model={decl.model} data-testid="ModelBadge__cb728e" />
                  <span className="fm-model-year" style={{ marginLeft: 6, fontWeight: 600 }}>{decl.year}</span>
                </td>
                <td><span className="fm-period">{decl.period}</span></td>
                <td>{decl.type === 'ord' ? t('fm.type.ordinary') : t('fm.type.complementary')}</td>
                <td>
                  <StatusText status={decl.status} submissionMethod={decl.submissionMethod} t={t} data-testid="StatusText__cb728e" />
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
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <div className="fm-page">
      {/* ── Title bar ────────────────────────────────────────────── */}
      <div style={{ padding: '10px 20px', background: 'hsl(var(--card))', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 600, color: 'hsl(var(--foreground))' }}>
            {t('fm.list.title') ?? 'Declaraciones'}
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '4px 8px', borderRadius: 8,
            background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border-control))',
            fontSize: 12, color: 'hsl(var(--muted-foreground))', fontWeight: 400, lineHeight: '16px',
          }}>{decls.length}</span>
          <MoreOptionsMenu
            favKey="fiscal-models"
            favLabel={t('fm.list.title') ?? 'Declaraciones'}
            data-testid="MoreOptionsMenu__cb728e" />
        </div>
        <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
          Tesorería / {t('fm.list.title') ?? 'Declaraciones'}
        </div>
      </div>
      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div className="fm-toolbar">
        <FilterDropdown
          label="Todos los años"
          value={yearFilter}
          options={yearOptions}
          onChange={setYearFilter}
          data-testid="FilterDropdown__cb728e" />
        {catalogLoaded && (
          <FilterDropdown
            label="Todos los modelos"
            value={modelFilter}
            options={modelOptions}
            onChange={setModelFilter}
            data-testid="FilterDropdown__cb728e" />
        )}
        <FilterDropdown
          label="Todos los estados"
          value={statusFilter}
          options={statusOptions}
          onChange={setStatusFilter}
          data-testid="FilterDropdown__cb728e" />

        <div className="fm-toolbar__space" />

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
            <div className="fm-status-select__menu" role="listbox" style={{ minWidth: 200 }}>
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

        <button
          className="fm-toolbar__btn"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '9px 12px', fontSize: 14, fontWeight: 500 }}
          onClick={() => setShowCatalog(true)}
        >
          <LayoutGrid size={14} strokeWidth={1.75} data-testid="LayoutGrid__cb728e" />
          {t('fm.catalog.title') ?? 'Catálogo de modelos'}{catalogLoaded ? ` (${activeCount})` : ''}
        </button>

        {catalogLoaded && activeCount > 0 && (
          <button
            className="fm-toolbar__btn fm-toolbar__btn--primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '9px 12px', fontSize: 14, fontWeight: 500 }}
            onClick={() => setShowNewDecl(true)}
          >
            + Nueva declaración
          </button>
        )}
      </div>
      {/* ── KPI cards row ─────────────────────────────────────── */}
      {catalogLoaded && (
        <KpiCardsRow
          decls={modelYearFiltered}
          t={t}
          kpiFilter={kpiFilter}
          onFilterClick={handleKpiFilterClick}
          data-testid="KpiCardsRow__cb728e" />
      )}
      {/* ── Table ──────────────────────────────────────────────── */}
      <div className="fm-table-wrap">
        {tableSection}
      </div>
      {/* ── Overlays ─────────────────────────────────────────────── */}
      {showNewDecl && <NewDeclModal
        onConfirm={handleNewDecl}
        onClose={() => setShowNewDecl(false)}
        activeModels={activeModels}
        existingDeclarations={decls}
        data-testid="NewDeclModal__cb728e" />}
      {/* ── Catalog drawer (slides from right) ───────────────────── */}
      {showCatalog && (
        <FmCatalogPage
          activeModels={activeModels}
          onBack={() => setShowCatalog(false)}
          onSave={(newActive) => {
            setActiveModels(newActive);
            setShowCatalog(false);
            if (token && apiBaseUrl) {
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
