import React from 'react';
import { Button } from '@/components/ui/button.jsx';

// Shared chrome of the Modelo 303 / 349 detail pages (ETP-5584): the status chip (also used by
// the list's "Estado" column), the sticky page header and its action bar, and the action-bar
// button. Both detail pages render through these so their header, button sizes and button
// order cannot drift apart again.
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

const CHIP_STYLE = {
  display: 'inline-flex', alignItems: 'center',
  padding: '2px 8px', borderRadius: 6,
  fontSize: 12, fontWeight: 400, lineHeight: '16px',
};

const METHOD_STYLE = { fontSize: 11, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' };

/**
 * @param {string} status            raw declaration status (`draft`, `submitted_ack`, …)
 * @param {string} [submissionMethod] optional ETP-4755 method, shown only for submitted statuses
 * @param {Function} t                useUI() translator
 * @param {'below'|'inline'} [methodPlacement='below'] where the submissionMethod sub-label goes:
 *   under the chip (list table cell) or to its right (detail action bar, single line).
 */
export function FmStatusChip({ status, submissionMethod, t, methodPlacement = 'below' }) {
  const label = STATUS_PLAIN_LABEL[status] ?? (t(`fm.status.${statusLabelKey(status)}`) ?? status);
  const isGreen = STATUS_GREEN.has(status);
  const methodLabel = submissionMethod && SUBMISSION_METHOD_STATUSES.has(status)
    ? t(`fm.present.method.${submissionMethod}`)
    : null;
  const inline = methodPlacement === 'inline';
  return (
    <span
      className="fm-status-chip"
      data-status={status}
      style={{
        display: 'inline-flex',
        flexDirection: inline ? 'row' : 'column',
        alignItems: inline ? 'center' : 'flex-start',
        gap: inline ? 6 : 2,
      }}
    >
      <span
        data-testid="FmStatusChip__badge"
        style={{
          ...CHIP_STYLE,
          background: isGreen ? 'var(--status-success-bg)' : 'hsl(var(--muted))',
          color: isGreen ? 'var(--status-success-fg)' : 'hsl(var(--muted-foreground))',
        }}
      >
        {label}
      </span>
      {methodLabel && (
        <span style={inline ? METHOD_STYLE : { ...METHOD_STYLE, paddingLeft: 2 }}>
          {methodLabel}
        </span>
      )}
    </span>
  );
}

// ── Detail header ────────────────────────────────────────────────────────────
// Title block + action bar, kept OUTSIDE the scrolling region of the detail page (see
// `.fm-detail-header` / `.fm-detail-scroll` in fiscal-models.css), so the title and the actions
// stay on screen while the user scrolls the boxes — the generic DetailView keeps its action bar
// fixed the same way. KPIs, tabs and tab content scroll underneath.
export function FmDetailHeader({ children }) {
  return (
    <div className="fm-detail-header" data-testid="FmDetailHeader">
      {children}
    </div>
  );
}

// Action bar — same split as the generic DetailView toolbar: Cancelar + status chip + the
// secondary actions on the left, Guardar next to the primary action on the right.
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
