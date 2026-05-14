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

export function KpiCard({ icon, value, label }) {
  return (
    <div className="fm-kpi-card">
      <span className="fm-kpi-card__icon" aria-hidden="true">{icon}</span>
      <span className="fm-kpi-card__value">{value}</span>
      <span className="fm-kpi-card__label">{label}</span>
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
        </button>
      ))}
    </div>
  );
}

export function Banner({ type, message }) {
  return <div className={`fm-banner fm-banner--${type}`} role="alert">{message}</div>;
}

export function SectionCard({ title, children }) {
  return (
    <div className="fm-section-card">
      {title && <div className="fm-section-card__title">{title}</div>}
      {children}
    </div>
  );
}

export function EmptyState({ message }) {
  const ui = useUI();
  return (
    <div className="fm-empty-state">
      <p>{message ?? ui('fm.list.empty')}</p>
    </div>
  );
}
