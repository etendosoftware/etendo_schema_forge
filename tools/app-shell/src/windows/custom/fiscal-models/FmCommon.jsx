import React, { useState, useRef, useEffect } from 'react';
import { useUI } from '@/i18n';
import { STATUS_COLOR, STATUS_ICON, STATUS_LABEL, STATUS_ORDER } from './fiscalModelsUtils.js';
import './fiscal-models.css';

export function StatusPill({ status }) {
  const color = STATUS_COLOR[status] ?? 'grey';
  return (
    <span className={`fm-status-pill fm-status-pill--${color}`}>
      {STATUS_ICON[status]} {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function StatusMenu({ current, onSelect, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  return (
    <div className="fm-status-menu" ref={ref} role="listbox">
      {STATUS_ORDER.map(s => (
        <button
          key={s}
          role="option"
          aria-selected={s === current}
          className={`fm-status-menu__item${s === current ? ' fm-status-menu__item--active' : ''}`}
          onClick={() => { onSelect(s); onClose(); }}
        >
          <span className={`fm-status-dot fm-status-dot--${STATUS_COLOR[s]}`} />
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

export function StatusPillMenu({ status, onStatusChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fm-status-pill-menu">
      <button className="fm-status-pill-menu__trigger" onClick={() => setOpen(o => !o)} aria-haspopup="listbox">
        <StatusPill status={status} />
        <span className="fm-status-pill-menu__caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <StatusMenu current={status} onSelect={onStatusChange} onClose={() => setOpen(false)} />
      )}
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
          {t.label}
          {t.badge != null && (
            <span className={`fm-tabs__badge${t.badgeTone ? ` fm-tabs__badge--${t.badgeTone}` : ''}`}>
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Banner({ type, tone, message, icon, title, sub, actions, onClose }) {
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
        {onClose && <button className="fm-banner__close" onClick={onClose} aria-label="Close">×</button>}
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

export function EmptyState({ message, icon, title, sub, cta }) {
  const ui = useUI();
  if (icon || title) {
    return (
      <div className="fm-empty-state">
        {icon && <div className="fm-empty-state__icon">{icon}</div>}
        <div className="fm-empty-state__title">{title || message || ui('fm.list.empty')}</div>
        {sub && <div className="fm-empty-state__sub">{sub}</div>}
        {cta && <div className="fm-empty-state__cta">{cta}</div>}
      </div>
    );
  }
  return (
    <div className="fm-empty-state">
      <p>{message ?? ui('fm.list.empty')}</p>
    </div>
  );
}

export function SidePanel({ title, sub, onClose, footer, children, wide }) {
  return (
    <>
      <div className="fm-side-scrim" onClick={onClose} />
      <aside className={`fm-side-panel${wide ? ' fm-side-panel--wide' : ''}`} role="dialog" aria-label={title}>
        <div className="fm-side-panel__head">
          <div>
            <div className="fm-side-panel__title">{title}</div>
            {sub && <div className="fm-side-panel__sub">{sub}</div>}
          </div>
          <button className="fm-side-panel__close" onClick={onClose} aria-label="Close">×</button>
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
