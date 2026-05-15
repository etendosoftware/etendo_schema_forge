import React, { useState, useRef, useEffect } from 'react';
import { useUI } from '@/i18n';
import { neoBase } from '@/components/related-documents/helpers.js';
import './fiscal-models.css';

function parseCityLine(cityLine) {
  if (!cityLine) return { postal: '', city: '', province: '' };
  // Format: "28001 - Madrid (Madrid)" — postal optional, region in parens optional
  const m = /^(\S+)\s*-\s*(.+?)(?:\s*\((.+)\))?$/.exec(cityLine.trim());
  if (!m) return { postal: '', city: cityLine.trim(), province: '' };
  return { postal: m[1] ?? '', city: m[2]?.trim() ?? '', province: m[3]?.trim() ?? '' };
}

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

function CfgSection({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 600, fontSize: 12, color: '#374151', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #f3f4f6' }}>{title}</div>
      {children}
    </div>
  );
}

function CfgField({ label, children, style }) {
  return (
    <div style={{ marginBottom: 10, ...style }}>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

const INPUT_ST = { width: '100%', fontSize: 12, padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 4, boxSizing: 'border-box' };

function CfgSection303({ t }) {
  return (
    <CfgSection title={t('fm.config.m303.title')}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151', cursor: 'pointer', marginBottom: 8 }}>
        <input type="checkbox" defaultChecked />
        {t('fm.config.m303.redeme')}
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151', cursor: 'pointer', marginBottom: 12 }}>
        <input type="checkbox" />
        {t('fm.config.m303.recc')}
      </label>
      <CfgField label={t('fm.config.m303.prorata')}>
        <select style={INPUT_ST}>
          <option>{t('fm.config.m303.prorata_general')}</option>
          <option>{t('fm.config.m303.prorata_especial')}</option>
        </select>
      </CfgField>
      <CfgField label={t('fm.config.m303.iban')}>
        <input type="text" placeholder="ES00 0000 0000 0000 0000 0000" style={{ ...INPUT_ST, fontFamily: 'monospace' }} />
      </CfgField>
    </CfgSection>
  );
}

function CfgSection349({ t }) {
  return (
    <CfgSection title={t('fm.config.m349.title')}>
      <div style={{ display: 'flex', gap: 8 }}>
        <CfgField label={t('fm.config.m349.periodicity')} style={{ flex: 1 }}>
          <select style={INPUT_ST}>
            <option>{t('fm.config.m349.periodicity_monthly')}</option>
            <option>{t('fm.config.m349.periodicity_quarterly')}</option>
            <option>{t('fm.config.m349.periodicity_annual')}</option>
          </select>
        </CfgField>
        <CfgField label={t('fm.config.m349.threshold')} style={{ flex: 1 }}>
          <input type="text" defaultValue="50.000" style={{ ...INPUT_ST, fontFamily: 'monospace' }} />
        </CfgField>
      </div>
      <CfgField label={t('fm.config.m349.viespref')}>
        <select style={INPUT_ST}>
          <option>{t('fm.config.m349.viespref_auto')}</option>
          <option>{t('fm.config.m349.viespref_manual')}</option>
        </select>
      </CfgField>
      <CfgField label={t('fm.config.m349.keys')}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['E', 'A', 'T', 'S', 'I'].map(k => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" defaultChecked />
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{k}</span>
            </label>
          ))}
        </div>
      </CfgField>
    </CfgSection>
  );
}

// model: '303' | '349' | undefined — when provided, shows only that model's section;
// undefined shows all sections (global config from the declaration detail page).
export function ConfigDrawer({ model, onClose, token, apiBaseUrl }) {
  const ui = useUI();
  const t = ui;
  const subtitle = model
    ? t(`fm.config.m${model}.title`)
    : t('fm.config.sub');

  const [form, setForm] = useState({ nif: '', name: '', phone: '', address: '', postal: '', city: '', province: '' });

  useEffect(() => {
    if (!token || !apiBaseUrl) return;
    fetch(`${neoBase(apiBaseUrl)}/session`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const org = data?.organization;
        if (!org) return;
        const { postal, city, province } = parseCityLine(org.cityLine);
        setForm(prev => ({
          ...prev,
          nif:     org.taxId    ?? prev.nif,
          name:    org.name     ?? prev.name,
          address: org.address1 ?? prev.address,
          postal, city, province,
        }));
      })
      .catch(() => {});
  }, [token, apiBaseUrl]);

  const set = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }));

  return (
    <div className="fm-catalog-overlay" onClick={onClose}>
      <div className="fm-config-modal" onClick={e => e.stopPropagation()}>
        <div className="fm-config-modal__header">
          <div className="fm-config-modal__titles">
            <div className="fm-config-modal__title">{t('fm.config.title')}</div>
            <div className="fm-config-modal__sub">{subtitle}</div>
          </div>
          <button className="fm-config-modal__close" onClick={onClose} aria-label={t('fm.action.close')}>✕</button>
        </div>
        <div className="fm-config-modal__body">
          <CfgSection title={t('fm.config.declarant.title')}>
            <CfgField label={t('fm.config.declarant.nif')}><input type="text" value={form.nif} onChange={set('nif')} placeholder="A78901234" style={INPUT_ST} /></CfgField>
            <CfgField label={t('fm.config.declarant.name')}><input type="text" value={form.name} onChange={set('name')} style={INPUT_ST} /></CfgField>
            <CfgField label={t('fm.config.declarant.phone')}><input type="tel" value={form.phone} onChange={set('phone')} placeholder="+34 ..." style={INPUT_ST} /></CfgField>
            <CfgField label={t('fm.config.declarant.address')}><input type="text" value={form.address} onChange={set('address')} style={INPUT_ST} /></CfgField>
            <div style={{ display: 'flex', gap: 8 }}>
              <CfgField label={t('fm.config.declarant.postal')} style={{ flex: '0 0 90px' }}><input type="text" value={form.postal} onChange={set('postal')} style={INPUT_ST} /></CfgField>
              <CfgField label={t('fm.config.declarant.city')} style={{ flex: 1 }}><input type="text" value={form.city} onChange={set('city')} style={INPUT_ST} /></CfgField>
              <CfgField label={t('fm.config.declarant.province')} style={{ flex: 1 }}><input type="text" value={form.province} onChange={set('province')} style={INPUT_ST} /></CfgField>
            </div>
          </CfgSection>
          {(!model || model === '303') && <CfgSection303 t={t} />}
          {(!model || model === '349') && <CfgSection349 t={t} />}
        </div>
        <div className="fm-config-modal__footer">
          <button className="fm-btn" onClick={onClose}>{t('fm.action.cancel')}</button>
          <button className="fm-btn fm-btn--primary" onClick={onClose}>{t('fm.action.save')}</button>
        </div>
      </div>
    </div>
  );
}

export function CompareDrawer({ decl, onClose }) {
  const ui = useUI();
  const t = ui;
  const rows = [
    { label: t('fm.compare.row.base'), prev: 48350.00, curr: 56920.00 },
    { label: t('fm.compare.row.iva_dev'), prev: 10153.50, curr: 11953.20 },
    { label: t('fm.compare.row.iva_ded'), prev: 8340.00, curr: 7820.00 },
    { label: t('fm.compare.row.result'), prev: 1813.50, curr: 4133.20 },
  ];
  const fmt = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
  return (
    <div style={{ position: 'fixed', top: 0, right: 0, height: '100%', width: 400, background: '#fff', borderLeft: '1px solid #e5e7eb', boxShadow: '-4px 0 16px rgba(0,0,0,.10)', zIndex: 55, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{t('fm.compare.title')}</span>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{t('fm.compare.sub')}</div>
        </div>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#6b7280' }} onClick={onClose} aria-label={t('fm.action.close')}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8, padding: '6px 0', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e5e7eb' }}>
          <span />
          <span style={{ textAlign: 'right' }}>{t('fm.compare.prev')}</span>
          <span style={{ textAlign: 'right' }}>{t('fm.compare.curr')}</span>
          <span style={{ textAlign: 'right' }}>{t('fm.compare.delta')}</span>
        </div>
        {rows.map((r, i) => {
          const d = r.curr - r.prev;
          const pct = r.prev !== 0 ? ((d / r.prev) * 100).toFixed(1) : '—';
          const up = d >= 0;
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8, padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 12, alignItems: 'center' }}>
              <span style={{ color: '#374151' }}>{r.label}</span>
              <span style={{ textAlign: 'right', color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.prev)}</span>
              <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.curr)}</span>
              <span style={{ textAlign: 'right', color: up ? '#059669' : '#dc2626', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {up ? '↑' : '↓'} {pct}%
              </span>
            </div>
          );
        })}
        <div style={{ marginTop: 16, padding: '12px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12, color: '#1e40af', display: 'flex', gap: 8 }}>
          <span style={{ flexShrink: 0 }}>ℹ</span>
          <span>{t('fm.compare.insight')}</span>
        </div>
      </div>
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
