import React from 'react';
import { useUI } from '@/i18n';
import './fiscal-models.css';

// ── KPI Widget — horizontal card (303 & 349) ──────────────────────
// `onClick` + `active` (ETP-4755, KPI-cards-as-filters): opt-in click-to-filter variant.
// Cards used without `onClick` (349/303 detail pages' plain summary KPIs) render exactly as
// before — `active`/hover styling and the button semantics below only kick in when a handler
// is actually passed, so this stays backward-compatible with every existing call site.
export function KpiWidget({ icon, iconColor, label, badge, badgeBg, badgeColor, value, valueColor, onClick, active }) {
  const [hovered, setHovered] = React.useState(false);
  const clickable = typeof onClick === 'function';
  // Extracted out of the style object's inline ternary (SonarQube S3358) — same
  // three states (active / hovered / idle), same resulting colors.
  let cardBackground = 'hsl(var(--card))';
  if (active) {
    cardBackground = 'var(--fm-bg-subtle)';
  } else if (hovered) {
    cardBackground = 'hsl(var(--muted))';
  }
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-pressed={clickable ? Boolean(active) : undefined}
      onKeyDown={clickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); }
      } : undefined}
      style={{
        display: 'flex', flexDirection: 'row', alignItems: 'center',
        padding: '8px 8px 8px 12px', gap: 12, height: 68,
        background: cardBackground,
        border: active ? '1px solid var(--fm-gray-900)' : '1px solid hsl(var(--border-subtle))',
        boxShadow: active
          ? 'inset 0 0 0 1px var(--fm-gray-900), 0px 1px 2px hsl(var(--foreground) / 0.05)'
          : '0px 1px 2px hsl(var(--foreground) / 0.05)',
        borderRadius: 8, flex: 1, minWidth: 0, cursor: clickable ? 'pointer' : 'default',
        transition: 'background .15s, border-color .15s',
      }}>
      <div style={{
        width: 40, height: 40, background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border-control))',
        boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)',
        borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <span style={{ color: iconColor ?? 'hsl(var(--text-disabled))', display: 'inline-flex' }}>{icon}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, minWidth: 0 }}>
        {/* ETP-5584 (P15) — label and badge always stay on ONE line: at 1280px four cards leave
            ~210px for both, and wrapping either one used to push the value out of the 68px card.
            The badge never shrinks; a label that still does not fit is ellipsised (full text in
            its title). */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4, minWidth: 0 }}>
          <span
            title={typeof label === 'string' ? label : undefined}
            style={{
              fontSize: 12, fontWeight: 400, lineHeight: '16px', color: 'hsl(var(--muted-foreground))',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
            }}
          >{label}</span>
          {badge != null && (
            <span style={{
              whiteSpace: 'nowrap', flexShrink: 0,
              padding: '4px 8px', borderRadius: 360,
              fontSize: 12, fontWeight: 400, lineHeight: '16px',
              background: badgeBg ?? 'hsl(var(--muted))',
              color: badgeColor ?? 'hsl(var(--text-disabled))',
            }}>
              {badge}
            </span>
          )}
        </div>
        <span style={{
          fontSize: 24, fontWeight: 500,
          letterSpacing: '-0.01em', color: valueColor ?? 'hsl(var(--foreground))', lineHeight: '36px',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {value}
        </span>
      </div>
    </div>
  );
}

export function ResultPill({ kind, label }) {
  return (
    <span className={`fm-result-pill fm-result-pill--${kind}`}>{label}</span>
  );
}

export function KpiCard({ icon, value, label }) {
  return (
    <div className="fm-kpi-card">
      <span className="fm-kpi-card__icon" aria-hidden="true">{icon}</span>
      <span className="fm-kpi-card__value">{value}</span>
      <span className="fm-kpi-card__label">{label}</span>
    </div>
  );
}

export function SummaryCard({ eyebrow, value, sub, accent, right, delta, valueColor }) {
  return (
    <div className={`fm-sum-card${accent ? ' fm-sum-card--accent' : ''}`}>
      <div className="fm-sum-card__eyebrow">
        <span>{eyebrow}</span>
        {delta && (
          <span className={`fm-sum-card__delta fm-sum-card__delta--${delta.dir}`}>
            {delta.dir === 'up' ? '↑' : '↓'} {delta.text}
          </span>
        )}
      </div>
      <div className="fm-sum-card__value" style={valueColor ? { color: valueColor } : undefined}>
        {value}
        {right}
      </div>
      {sub && <div className="fm-sum-card__sub">{sub}</div>}
    </div>
  );
}

export function Tabs({ tabs, active, onSelect }) {
  return (
    <div className="fm-tabs" role="tablist">
      {tabs.map(t => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === active}
          className={`fm-tabs__tab${t.id === active ? ' fm-tabs__tab--active' : ''}`}
          onClick={() => onSelect(t.id)}
        >
          {t.icon && <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>{t.icon}</span>}
          {t.label}
          {t.badge != null && (
            <span className={['fm-tabs__badge', t.badgeTone && `fm-tabs__badge--${t.badgeTone}`].filter(Boolean).join(' ')}>
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Banner({ type, tone, message, icon, title, sub, actions, onClose }) {
  const ui = useUI();
  if (title !== undefined) {
    const t = tone || type || 'info';
    return (
      <div className={`fm-banner fm-banner--rich fm-banner--${t}`} role="alert">
        {icon && <span className="fm-banner__icon">{icon}</span>}
        <div className="fm-banner__body">
          <div className="fm-banner__title">{title}</div>
          {sub && <div className="fm-banner__sub">{sub}</div>}
        </div>
        {actions && <div className="fm-banner__actions">{actions}</div>}
        {onClose && <button className="fm-banner__close" onClick={onClose} aria-label={ui('fm.action.close')}>×</button>}
      </div>
    );
  }
  return <div className={`fm-banner fm-banner--${type || tone || 'info'}`} role="alert">{message}</div>;
}

export function SectionCard({ title, sub, right, children, flush }) {
  return (
    <div className={`fm-section-card${flush ? ' fm-section-card--flush' : ''}`}>
      {(title || sub || right) && (
        <div className="fm-section-card__header">
          <div>
            {title && <div className="fm-section-card__title">{title}</div>}
            {sub && <div className="fm-section-card__sub">{sub}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

// ETP-5584 (P11) — the ONE empty state of the window (icon + title + text) lives in
// FmDetailChrome.jsx as FmEmptyState, so the 303/349 detail pages can render it without going
// through this module (their tests mock FmCommon.jsx with a fixed export list). Re-exported
// here under its historical name for the list and the shared tab contents.
export { FmEmptyState as EmptyState } from './FmDetailChrome.jsx';

export function SidePanel({ title, sub, onClose, footer, children, wide }) {
  const ui = useUI();
  return (
    <>
      <div className="fm-side-scrim" onClick={onClose} />
      <aside className={`fm-side-panel${wide ? ' fm-side-panel--wide' : ''}`} role="dialog" aria-label={title}>
        <div className="fm-side-panel__head">
          <div>
            <div className="fm-side-panel__title">{title}</div>
            {sub && <div className="fm-side-panel__sub">{sub}</div>}
          </div>
          <button className="fm-side-panel__close" onClick={onClose} aria-label={ui('fm.action.close')}>×</button>
        </div>
        <div className="fm-side-panel__body">{children}</div>
        {footer && <div className="fm-side-panel__foot">{footer}</div>}
      </aside>
    </>
  );
}

// steps: string[] labels; current: index of active step (-1 = omitted/special)
export function Stepper({ steps, current }) {
  return (
    <div className="fm-stepper" role="list">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={label}>
            {i > 0 && <span className="fm-stepper__sep" aria-hidden="true">›</span>}
            <span
              role="listitem"
              className={`fm-stepper__step${active ? ' fm-stepper__step--active' : ''}${done ? ' fm-stepper__step--done' : ''}`}
            >
              {done && <span aria-hidden="true">✓ </span>}
              {label}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Numbered stepper — circles with step index, dark fill for done/active
export function NumberedStepper({ steps, current }) {
  return (
    <div className="fm-stepper-num" role="list">
      {steps.map((label, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <React.Fragment key={label}>
            {i > 0 && <span className="fm-stepper-num__sep" aria-hidden="true">—</span>}
            <span
              role="listitem"
              className={`fm-stepper-num__step${active ? ' fm-stepper-num__step--active' : ''}${done ? ' fm-stepper-num__step--done' : ''}`}
            >
              <span className="fm-stepper-num__circle">{done ? '✓' : i + 1}</span>
              {label}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}
