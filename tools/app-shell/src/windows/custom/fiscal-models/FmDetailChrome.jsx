import React from 'react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button.jsx';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { useFavorites } from '@/components/layout/FavoritesContext';
import { useSupportChatSafe } from '@/components/support/SupportChatContext.jsx';
import { StatusTag } from '@/components/ui/status-tag';
import { TONE_STYLES } from '@/components/ui/status-tag-tokens.js';
import { Check } from 'lucide-react';

// Shared chrome of the Modelo 303 / 349 detail pages (ETP-5584): the app top-bar meta (title,
// breadcrumb, model badge, kebab), the status chip (also used by the list's "Estado" column), the
// sticky action bar, and the action-bar button. Both detail pages render through these so their
// header, button sizes and button order cannot drift apart again.
//
// Lives in its own module rather than in FmCommon.jsx on purpose: nearly every fiscal-models
// page test mocks FmCommon.jsx with an explicit export list, and a new FmCommon export would
// have to be added to every one of those mocks for the pages to render at all. Everything here
// is presentational (translations come in as props), so tests render it for real.

// Statuses whose label is not an i18n key (legacy, see "Status lifecycle" in the guide).
const STATUS_PLAIN_LABEL = {
  submitted_ext: 'Presentado en otra plataforma',
};

// statusLabelKey (ETP-4755): the status BADGE text must always read the plain
// "Presentado"/"Submitted" for BOTH `submitted` and `submitted_ack` — `submitted_ack`
// collapses onto `submitted`'s i18n key here. HOW it was submitted (manual ack, no
// receipt, real AEAT telematic ack) is shown exclusively via the `submissionMethod`
// sub-label rendered next to the chip, never inside the badge text itself. `submitted_ext`
// is untouched — a distinct legacy status, not part of this unification.
export function statusLabelKey(status) {
  return status === 'submitted_ack' ? 'submitted' : status;
}

const STATUS_GREEN = new Set(['ready', 'submitted', 'submitted_ext', 'submitted_ack']);

// SUBMISSION_METHOD_STATUSES (ETP-4755) — only these two statuses can carry a
// submissionMethod (the two manual "Presentado" paths persist it themselves via
// handlePresent; a real AEAT telematic success also lands on submitted_ack, set
// server-side). submitted_ext (the removed "otra plataforma" path) never carries one.
const SUBMISSION_METHOD_STATUSES = new Set(['submitted', 'submitted_ack']);

// ── Status chip ──────────────────────────────────────────────────────────────
// Sized exactly like the invoice windows' status chip (ETP-5584), in both places it appears:
//
// - LIST ("Estado" column): the very component the generated lists render — core `StatusTag`
//   (DataTable.cellRenderers.jsx): 12/16 text, 4px 8px padding, pill radius.
// - DETAIL (action bar): the metrics of `DocumentStatusPill`, the chip the generic DetailView
//   renders next to Cancelar — 14/20 text, 4px 8px padding, 8px radius, the tone's 16px icon
//   (Check for success, none for neutral) and a 0 4px label inset. NOT the component itself:
//   it resolves its label with `useLocale()` from `@/i18n`, which ~48 fiscal-models page tests mock
//   with `useUI` only, so rendering it would break every one of them. Colours come from the same
//   shared `TONE_STYLES` tokens both invoice chips use, so only the box metrics are restated
//   here (DETAIL_PILL_STYLE) — keep them in step with DocumentStatusPill's PILL_STYLE.
//
// Fiscal colour semantics map onto the invoice tones: every "presented" status (and `ready`) is
// `success` (green), everything else — draft, pending, skipped — is `neutral` (grey).
export function fiscalStatusTone(status) {
  return STATUS_GREEN.has(status) ? 'success' : 'neutral';
}

const DETAIL_PILL_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 8px',
  borderRadius: '8px',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: '14px',
  lineHeight: '20px',
  fontWeight: 400,
  whiteSpace: 'nowrap',
  letterSpacing: '-0.01em',
};

const DETAIL_ICON_COLOR = { success: 'var(--status-success-fg)' };

const METHOD_STYLE = { fontSize: 11, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' };

function DetailStatusPill({ tone, label }) {
  const palette = TONE_STYLES[tone] ?? TONE_STYLES.neutral;
  return (
    <span
      data-testid="FmStatusChip__badge"
      data-tone={tone}
      style={{ ...DETAIL_PILL_STYLE, background: palette.background, color: palette.color }}
    >
      {tone === 'success' && (
        <Check size={16} color={DETAIL_ICON_COLOR.success} aria-hidden="true" data-testid="FmStatusChip__icon" />
      )}
      <span style={{ padding: '0 4px' }}>{label}</span>
    </span>
  );
}

/**
 * @param {string} status            raw declaration status (`draft`, `submitted_ack`, …)
 * @param {string} [submissionMethod] optional ETP-4755 method, shown only for submitted statuses
 * @param {Function} t                useUI() translator
 * @param {'list'|'detail'} [variant='list'] `list` = the invoice list chip (StatusTag) with the
 *   submissionMethod sub-label under it; `detail` = the invoice detail chip (DocumentStatusPill
 *   metrics) with the sub-label to its right, on one line.
 */
export function FmStatusChip({ status, submissionMethod, t, variant = 'list' }) {
  const label = STATUS_PLAIN_LABEL[status] ?? (t(`fm.status.${statusLabelKey(status)}`) ?? status);
  const tone = fiscalStatusTone(status);
  const methodLabel = submissionMethod && SUBMISSION_METHOD_STATUSES.has(status)
    ? t(`fm.present.method.${submissionMethod}`)
    : null;
  const detail = variant === 'detail';
  return (
    <span
      className="fm-status-chip"
      data-status={status}
      data-variant={variant}
      style={{
        display: 'inline-flex',
        flexDirection: detail ? 'row' : 'column',
        alignItems: detail ? 'center' : 'flex-start',
        gap: detail ? 6 : 2,
      }}
    >
      {detail
        ? <DetailStatusPill tone={tone} label={label} />
        : (
          <span data-testid="FmStatusChip__badge" data-tone={tone} style={{ display: 'inline-flex' }}>
            <StatusTag status={status} label={label} tone={tone} />
          </span>
        )}
      {methodLabel && (
        <span style={detail ? METHOD_STYLE : { ...METHOD_STYLE, paddingLeft: 2 }}>
          {methodLabel}
        </span>
      )}
    </span>
  );
}

// ── Declaration title (P9) ───────────────────────────────────────────────────
// ONE title format for every model: "<model title> - <year>/<period>", e.g. "Modelo 303 -
// 2026/T1", "Modelo 349 - 2026/T4". A monthly period (2-digit "10") shows its month name in the
// app's UI locale — `bcpLocale` must be passed explicitly ("es-ES"/"en-US"), never left to
// Intl's runtime default (an es-language OS would otherwise show "octubre" under en_US, see
// ETP-5338). Quarters ("T1".."T4") and anything else are shown as-is.
export function formatDeclPeriod(decl, bcpLocale) {
  const monthNum = /^\d{2}$/.test(String(decl?.period ?? '')) ? parseInt(decl.period, 10) : null;
  const period = monthNum
    ? new Intl.DateTimeFormat(bcpLocale, { month: 'long' }).format(new Date(2000, monthNum - 1, 1))
    : decl?.period;
  return `${decl?.year}/${period}`;
}

export function buildDeclTitle(modelTitle, decl, bcpLocale) {
  return `${modelTitle} - ${formatDeclPeriod(decl, bcpLocale)}`;
}

// ── Tab counters (P12) ───────────────────────────────────────────────────────
// ONE rule for every detail tab, 303 and 349 alike: a tab that lists records shows how many it
// lists — 0 included — in the shared `.fm-tabs__badge` counter (303's "Facturas" style). The
// counter is hidden only while the number is still unknown (`null`, e.g. invoices not loaded
// yet), never shown as a fake 0. "Casillas" is a form, not a list, so it has no counter.
export function tabCount(count) {
  return count == null ? null : count;
}

// Incidencias: blocking + warning (what the tab lists), toned by the worst severity — same
// danger/warn tones 303 always used.
export function incidentsTabBadge(blocking, warning) {
  const b = Number(blocking) || 0;
  const w = Number(warning) || 0;
  let badgeTone = null;
  if (b > 0) badgeTone = 'danger';
  else if (w > 0) badgeTone = 'warn';
  return { badge: b + w, badgeTone };
}

// ── Empty state (P11) ────────────────────────────────────────────────────────
// The ONE empty state of every fiscal-models surface: an icon, a title and a supporting text,
// centred (`.fm-empty-state` in fiscal-models.css). Every 303/349 tab that can be empty renders
// it — Facturas / Facturas origen, Incidencias, Rectificaciones, Operadores and the operator
// "origin" filters — instead of each tab's own ad-hoc markup. The Justificante tab is the app's
// shared AttachmentsTab, whose empty state is the attachments component's own.
// `message`/`cta` keep the list page's historical call shapes working (FmCommon re-exports this
// as `EmptyState`). The caller's `data-testid` is forwarded to the root element.
export function FmEmptyState({ message, icon, title, sub, cta, 'data-testid': testId }) {
  const ui = useUI();
  if (icon || title) {
    return (
      <div className="fm-empty-state" data-testid={testId}>
        {icon && <div className="fm-empty-state__icon">{icon}</div>}
        <div className="fm-empty-state__title">{title || message || ui('fm.list.empty')}</div>
        {sub && <div className="fm-empty-state__sub">{sub}</div>}
        {cta && <div className="fm-empty-state__cta">{cta}</div>}
      </div>
    );
  }
  return (
    <div className="fm-empty-state" data-testid={testId}>
      <p>{message ?? ui('fm.list.empty')}</p>
    </div>
  );
}

// ── App top bar ──────────────────────────────────────────────────────────────
// The declaration title lives in the app TopBar, at the same place as the list's "Modelos
// Fiscales" title, published through the same `useSetPageMeta` the list uses:
//   title       "Modelo 303 - 2026/T1"
//   breadcrumb  "Finanzas / Modelos Fiscales / Modelo 303 - 2026/T1" (the TopBar subtitle)
//   titleExtra  the model badge ("303"/"349") — TopBar's adornment slot next to the title
//               (precedent: financial-account's sync status); the badge is the same
//               `.fm-model-badge` element the list's model column renders, not a lookalike.
//   kebab       onAddToFavorites / isFavorite / onPageHelp — the exact two items the in-page
//               kebab had (the removed FmCommon MoreOptionsMenu): favourite "fiscal-models" + page help.
// The meta is withdrawn on unmount (useSetPageMeta's cleanup); the list re-publishes its own
// when it becomes active again (FmListPage's `ListPageMeta`).
export function useFmDetailPageMeta({ model, title, breadcrumb, favLabel }) {
  const { toggleFavorite, isFavorite } = useFavorites();
  const { actions: supportActions } = useSupportChatSafe();
  const favActive = isFavorite('fiscal-models');
  useSetPageMeta({
    title,
    breadcrumb,
    titleExtra: (
      <span className={`fm-model-badge fm-model-badge--${model}`} data-testid="FmDetailTopBar__modelBadge">
        {model}
      </span>
    ),
    onAddToFavorites: () => toggleFavorite('fiscal-models', favLabel),
    isFavorite: favActive,
    onPageHelp: () => { supportActions.setTab('ayuda'); supportActions.open(); },
  }, [model, favActive, favLabel]);
}

// ── Detail header ────────────────────────────────────────────────────────────
// The action bar row, kept OUTSIDE the scrolling region of the detail page (see
// `.fm-detail-header` / `.fm-detail-scroll` in fiscal-models.css), so the actions stay on screen
// while the user scrolls the boxes — the generic DetailView keeps its action bar fixed the same
// way. KPIs, tabs and tab content scroll underneath. The title is in the app top bar.
export function FmDetailHeader({ children }) {
  return (
    <div className="fm-detail-header" data-testid="FmDetailHeader">
      {children}
    </div>
  );
}

// Action bar — Cancelar + status chip on the left; every action on the right, ending with
// Guardar and then the primary action (right-most), as in the generic DetailView toolbar.
export function FmDetailActionBar({ left, right }) {
  return (
    <div className="fm-detail-actionbar" data-testid="FmDetailActionBar">
      <div className="fm-detail-actionbar__group" data-testid="FmDetailActionBar__left">{left}</div>
      <div className="fm-detail-actionbar__group" data-testid="FmDetailActionBar__right">{right}</div>
    </div>
  );
}

// Same size and look as the generic DetailView's toolbar buttons (`DetailCancelButton`:
// h-10, px-3, rounded-lg, border-control outline). `primary` renders the filled variant.
const OUTLINE_BTN_CLS = 'h-10 px-3 gap-1.5 rounded-lg bg-card border border-[hsl(var(--border-control))] shadow-[0px_1px_2px_hsl(var(--foreground)/0.05)] text-[hsl(var(--foreground))] text-sm font-medium hover:bg-[hsl(var(--muted))]';
const PRIMARY_BTN_CLS = 'h-10 px-3 gap-1.5 rounded-lg text-sm font-medium';

export function FmDetailButton({ primary = false, className = '', children, ...props }) {
  return (
    <Button
      type="button"
      variant={primary ? 'default' : 'outline'}
      className={`${primary ? PRIMARY_BTN_CLS : OUTLINE_BTN_CLS} ${className}`.trim()}
      data-testid="FmDetailButton"
      {...props}
    >
      {children}
    </Button>
  );
}

export default FmStatusChip;
