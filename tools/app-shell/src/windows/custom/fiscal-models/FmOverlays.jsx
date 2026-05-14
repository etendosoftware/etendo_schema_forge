import React, { useState, useRef } from 'react';
import { useUI } from '@/i18n';
import './fiscal-models.css';

// PresentModal — 3-path submission:
//   1. presentadoAcuse  — upload PDF/XML receipt; status → presentadoAcuse
//   2. presentado       — submitted without receipt; status → presentado
//   3. presentadoOtra   — submitted via external agency; status → presentadoOtra
export function PresentModal({ decl, onConfirm, onClose }) {
  const ui = useUI();
  const t = ui;
  const [path, setPath] = useState(null);
  const [acuseFile, setAcuseFile] = useState(null);
  const fileRef = useRef(null);

  const canConfirm = path === 'presentadoOtra' || path === 'presentado' || (path === 'presentadoAcuse' && acuseFile);

  function handleConfirm() {
    onConfirm({ status: path, acuseFile: path === 'presentadoAcuse' ? acuseFile : null });
    onClose();
  }

  return (
    <div className="fm-modal-overlay" role="dialog" aria-modal="true">
      <div className="fm-present-modal">
        <div className="fm-present-modal__title">{t('fm.present.title')}</div>
        <div className="fm-present-modal__paths">
          <div
            className={`fm-present-modal__path${path === 'presentadoAcuse' ? ' fm-present-modal__path--selected' : ''}`}
            onClick={() => setPath('presentadoAcuse')}
          >
            <div className="fm-present-modal__path-title">★ {t('fm.present.path.acuse')}</div>
            <div className="fm-present-modal__path-desc">{t('fm.present.path.acuse_desc')}</div>
            {path === 'presentadoAcuse' && (
              <div className="fm-present-modal__upload">
                <button
                  type="button"
                  style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #e5e7eb', borderRadius: 4, cursor: 'pointer', background: '#f9fafb' }}
                  onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
                >
                  {acuseFile ? acuseFile.name : t('fm.present.upload_acuse')}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.xml"
                  style={{ display: 'none' }}
                  onChange={e => setAcuseFile(e.target.files?.[0] ?? null)}
                />
              </div>
            )}
          </div>

          <div
            className={`fm-present-modal__path${path === 'presentado' ? ' fm-present-modal__path--selected' : ''}`}
            onClick={() => setPath('presentado')}
          >
            <div className="fm-present-modal__path-title">▶ {t('fm.present.path.sin_acuse')}</div>
            <div className="fm-present-modal__path-desc">{t('fm.present.path.sin_acuse_desc')}</div>
          </div>

          <div
            className={`fm-present-modal__path${path === 'presentadoOtra' ? ' fm-present-modal__path--selected' : ''}`}
            onClick={() => setPath('presentadoOtra')}
          >
            <div className="fm-present-modal__path-title">↗ {t('fm.present.path.otra')}</div>
            <div className="fm-present-modal__path-desc">{t('fm.present.path.otra_desc')}</div>
          </div>
        </div>

        <div className="fm-present-modal__actions">
          <button className="fm-present-modal__btn" onClick={onClose}>{t('fm.action.cancel')}</button>
          <button
            className="fm-present-modal__btn fm-present-modal__btn--primary"
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            {t('fm.action.confirm_presentation')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FileGenModal({ decl, onConfirm, onClose }) {
  const ui = useUI();
  const t = ui;
  return (
    <div className="fm-modal-overlay" role="dialog" aria-modal="true">
      <div className="fm-present-modal">
        <div className="fm-present-modal__title">{t('fm.filegen.title')}</div>
        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
          {t('fm.filegen.desc')} <strong>{decl?.model} {decl?.year}</strong>
        </p>
        <div className="fm-present-modal__actions">
          <button className="fm-present-modal__btn" onClick={onClose}>{t('fm.action.cancel')}</button>
          <button
            className="fm-present-modal__btn fm-present-modal__btn--primary"
            onClick={() => { onConfirm?.(); onClose(); }}
          >
            {t('fm.filegen.generate')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function NewDeclModal({ onConfirm, onClose }) {
  const ui = useUI();
  const t = ui;
  const [model, setModel] = useState('303');
  const [year, setYear] = useState(new Date().getFullYear());
  const [period, setPeriod] = useState('T1');
  return (
    <div className="fm-modal-overlay" role="dialog" aria-modal="true">
      <div className="fm-present-modal">
        <div className="fm-present-modal__title">{t('fm.new_decl.title')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: '#374151' }}>
            {t('fm.new_decl.model')}
            <select value={model} onChange={e => setModel(e.target.value)} style={{ marginLeft: 8, fontSize: 12 }}>
              <option value="303">303</option>
              <option value="349">349</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: '#374151' }}>
            {t('fm.new_decl.year')}
            <input
              type="number"
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              min={2020}
              max={2099}
              style={{ marginLeft: 8, fontSize: 12, width: 70 }}
            />
          </label>
          <label style={{ fontSize: 12, color: '#374151' }}>
            {t('fm.new_decl.period')}
            <input
              value={period}
              onChange={e => setPeriod(e.target.value)}
              style={{ marginLeft: 8, fontSize: 12, width: 60 }}
            />
          </label>
        </div>
        <div className="fm-present-modal__actions">
          <button className="fm-present-modal__btn" onClick={onClose}>{t('fm.action.cancel')}</button>
          <button
            className="fm-present-modal__btn fm-present-modal__btn--primary"
            onClick={() => { onConfirm?.({ model, year, period, status: 'pendiente' }); onClose(); }}
          >
            {t('fm.action.create')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function IncidentTray({ incidents, onClose }) {
  const ui = useUI();
  const t = ui;
  if (!incidents?.length) return null;
  return (
    <div className="fm-incident-tray" role="complementary" aria-label={t('fm.incidents.title')}>
      <div className="fm-incident-tray__header">
        {t('fm.incidents.title')}
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#6b7280' }}
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      {incidents.map((inc, i) => (
        <div
          key={i}
          className={`fm-incident-tray__item fm-incident-tray__item--${inc.blocking ? 'blocking' : 'warning'}`}
        >
          {inc.blocking ? '🚫' : '⚠️'} {inc.message}
        </div>
      ))}
    </div>
  );
}

export function DrillDownPanel({ title, children, onClose }) {
  const ui = useUI();
  const t = ui;
  return (
    <div style={{ position: 'fixed', top: 0, right: 0, height: '100%', width: 360, background: '#fff', borderLeft: '1px solid #e5e7eb', boxShadow: '-4px 0 16px rgba(0,0,0,.10)', zIndex: 55, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{title}</span>
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#6b7280' }}
          onClick={onClose}
          aria-label={t('fm.action.close')}
        >
          ✕
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {children}
      </div>
    </div>
  );
}
