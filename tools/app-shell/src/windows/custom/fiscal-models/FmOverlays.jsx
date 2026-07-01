import React, { useState, useRef, useEffect } from 'react';
import { useUI } from '@/i18n';
import { SUPPORTED_YEARS } from './models/303/fm303Layouts';
import { neoBase } from '@/components/related-documents/helpers.js';
import { Star, Play, ArrowUpRight, Info, OctagonAlert, TriangleAlert, X, Check } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import './fiscal-models.css';

function parseCityLine(cityLine) {
  if (!cityLine) return { postal: '', city: '', province: '' };
  // Format: "28001 - Madrid (Madrid)" — postal optional, region in parens optional
  // Parsed with string methods instead of regex to guarantee linear runtime (no backtracking).
  const s = cityLine.trim();
  const dashIdx = s.indexOf(' - ');
  if (dashIdx === -1) return { postal: '', city: s, province: '' };
  const postal = s.slice(0, dashIdx);
  const rest = s.slice(dashIdx + 3).trim();
  const parenOpen = rest.lastIndexOf('(');
  const parenClose = rest.lastIndexOf(')');
  if (parenOpen !== -1 && parenClose > parenOpen) {
    return {
      postal,
      city:     rest.slice(0, parenOpen).trim(),
      province: rest.slice(parenOpen + 1, parenClose).trim(),
    };
  }
  return { postal, city: rest, province: '' };
}

// PresentModal — 3-path submission:
//   1. submitted_ack — upload PDF/XML receipt; status → submitted_ack
//   2. submitted     — submitted without receipt; status → submitted
//   3. submitted_ext — submitted via external agency; status → submitted_ext
export function PresentModal({ decl, onConfirm, onClose }) {
  const ui = useUI();
  const t = ui;
  const [path, setPath] = useState(null);
  const [acuseFile, setAcuseFile] = useState(null);
  const fileRef = useRef(null);

  const canConfirm = path === 'submitted_ext' || path === 'submitted' || (path === 'submitted_ack' && acuseFile);

  function handleConfirm() {
    onConfirm({ status: path, acuseFile: path === 'submitted_ack' ? acuseFile : null });
    onClose();
  }

  const PATHS = [
    { id: 'submitted_ack', icon: <Star size={16} strokeWidth={1.75} data-testid="Star__cda0bb" />, titleKey: 'fm.present.path.acuse',      descKey: 'fm.present.path.acuse_desc' },
    { id: 'submitted',     icon: <Play size={16} strokeWidth={1.75} data-testid="Play__cda0bb" />, titleKey: 'fm.present.path.sin_acuse',  descKey: 'fm.present.path.sin_acuse_desc' },
    { id: 'submitted_ext', icon: <ArrowUpRight size={16} strokeWidth={1.75} data-testid="ArrowUpRight__cda0bb" />, titleKey: 'fm.present.path.otra', descKey: 'fm.present.path.otra_desc' },
  ];

  return (
    <div className="fm-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="fm-config-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="fm-config-modal__header">
          <div className="fm-config-modal__titles">
            <div className="fm-config-modal__title">{t('fm.present.title')}</div>
            <div className="fm-config-modal__sub">{t('fm.present.subtitle') ?? 'Selecciona cómo fue presentada la declaración'}</div>
          </div>
          <button className="fm-config-modal__close" onClick={onClose} aria-label={t('fm.action.close')}>✕</button>
        </div>

        {/* Body */}
        <div className="fm-config-modal__body" style={{ minHeight: 'auto', padding: '16px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PATHS.map(p => (
              <div
                key={p.id}
                onClick={() => setPath(p.id)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                  border: `1px solid ${path === p.id ? '#121217' : '#E8EAEF'}`,
                  background: path === p.id ? '#F5F7F9' : '#fff',
                  transition: 'border-color .12s, background .12s',
                }}
              >
                <span style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: path === p.id ? '#121217' : '#F5F7F9',
                  color: path === p.id ? '#fff' : '#828FA3',
                  transition: 'background .12s, color .12s',
                }}>
                  {p.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#121217', lineHeight: '20px' }}>
                    {t(p.titleKey)}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 400, color: '#828FA3', lineHeight: '18px', marginTop: 2 }}>
                    {t(p.descKey)}
                  </div>
                  {p.id === 'submitted_ack' && path === 'submitted_ack' && (
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        style={{
                          fontSize: 12, padding: '5px 12px',
                          border: '1px solid #D1D4DB', borderRadius: 8,
                          cursor: 'pointer', background: '#fff', color: '#121217',
                        }}
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
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                  border: `2px solid ${path === p.id ? '#121217' : '#D1D4DB'}`,
                  background: path === p.id ? '#121217' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'border-color .12s, background .12s',
                }}>
                  {path === p.id && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', display: 'block' }} />}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="fm-config-modal__footer">
          <button className="fm-btn fm-btn--cancel-pill" onClick={onClose}>
            {t('fm.action.cancel')}
          </button>
          <button
            className={`fm-btn fm-btn--save-pill${canConfirm ? ' fm-btn--save-pill--active' : ''}`}
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
  const [phone,   setPhone]   = React.useState(decl?.phone   ?? '');
  const [contact, setContact] = React.useState(decl?.contact ?? '');
  const inputSt = {
    width: '100%', fontSize: 14, padding: '8px 12px',
    border: '1px solid #D1D4DB', borderRadius: 8, height: 40,
    boxSizing: 'border-box', color: '#121217', outline: 'none', background: '#fff',
  };
  return (
    <div className="fm-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="fm-config-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="fm-config-modal__header">
          <div className="fm-config-modal__titles">
            <div className="fm-config-modal__title">{t('fm.filegen.title')}</div>
            <div className="fm-config-modal__sub">
              {t('fm.filegen.desc')} <strong>{decl?.model} {decl?.year} {decl?.period}</strong>
            </div>
          </div>
          <button className="fm-config-modal__close" onClick={onClose} aria-label={t('fm.action.close')}>✕</button>
        </div>

        {/* Body */}
        <div className="fm-config-modal__body" style={{ minHeight: 'auto', padding: '16px 20px' }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: '#121217', fontWeight: 400, marginBottom: 6 }}>
              {t('fm.filegen.contact_name')}
              {t('fm.filegen.contact_name_hint') && (
                <span style={{ fontSize: 12, color: '#828FA3', marginLeft: 6 }}>{t('fm.filegen.contact_name_hint')}</span>
              )}
            </div>
            <input style={inputSt} value={contact} onChange={e => setContact(e.target.value)} placeholder={t('fm.filegen.contact_name_placeholder')} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: '#121217', fontWeight: 400, marginBottom: 6 }}>{t('fm.filegen.contact_phone')}</div>
            <input style={inputSt} value={phone} onChange={e => setPhone(e.target.value)} placeholder={t('fm.filegen.contact_phone_placeholder')} />
          </div>
        </div>

        {/* Footer */}
        <div className="fm-config-modal__footer">
          <button className="fm-btn fm-btn--cancel-pill" onClick={onClose}>
            {t('fm.action.cancel')}
          </button>
          <button
            className="fm-btn fm-btn--save-pill fm-btn--save-pill--active"
            onClick={() => { onConfirm?.({ phone, contact }); onClose(); }}
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
  const _cy = new Date().getFullYear();
  const [year, setYear] = useState(SUPPORTED_YEARS.includes(_cy) ? _cy : SUPPORTED_YEARS[SUPPORTED_YEARS.length - 1]);
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
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              style={{ marginLeft: 8, fontSize: 12 }}
            >
              {SUPPORTED_YEARS.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
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
            onClick={() => { onConfirm?.({ model, year, period, status: 'draft' }); onClose(); }}
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
          aria-label={t('fm.action.close')}
        >
          <X size={14} data-testid="X__cda0bb" />
        </button>
      </div>
      {incidents.map((inc) => (
        <div
          key={inc.message}
          className={`fm-incident-tray__item fm-incident-tray__item--${inc.blocking ? 'blocking' : 'warning'}`}
        >
          {inc.blocking ? <OctagonAlert size={14} data-testid="OctagonAlert__cda0bb" /> : <TriangleAlert size={14} data-testid="TriangleAlert__cda0bb" />} {inc.message}
        </div>
      ))}
    </div>
  );
}

function CfgSection({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: '#121217', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function CfgField({ label, children, style }) {
  return (
    <div style={{ marginBottom: 12, ...style }}>
      <div style={{ fontSize: 14, color: '#121217', fontWeight: 400, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const INPUT_ST = {
  width: '100%', fontSize: 14, padding: '8px 12px',
  border: '1px solid #D1D4DB', borderRadius: 8, height: 40,
  boxSizing: 'border-box', color: '#121217', outline: 'none',
  background: '#fff',
};

function CfgSection303({ t }) {
  return (
    <CfgSection title={t('fm.config.m303.title')} data-testid="CfgSection__cda0bb">
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151', cursor: 'pointer', marginBottom: 8 }}>
        <input type="checkbox" defaultChecked />
        {t('fm.config.m303.redeme')}
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151', cursor: 'pointer', marginBottom: 12 }}>
        <input type="checkbox" />
        {t('fm.config.m303.recc')}
      </label>
      <CfgField label={t('fm.config.m303.prorata')} data-testid="CfgField__cda0bb">
        <select style={INPUT_ST}>
          <option>{t('fm.config.m303.prorata_general')}</option>
          <option>{t('fm.config.m303.prorata_especial')}</option>
        </select>
      </CfgField>
      <CfgField label={t('fm.config.m303.iban')} data-testid="CfgField__cda0bb">
        <input type="text" placeholder="ES00 0000 0000 0000 0000 0000" style={{ ...INPUT_ST, fontFamily: 'monospace' }} />
      </CfgField>
    </CfgSection>
  );
}

function CfgSection349({ t }) {
  return (
    <CfgSection title={t('fm.config.m349.title')} data-testid="CfgSection__cda0bb">
      <div style={{ display: 'flex', gap: 8 }}>
        <CfgField
          label={t('fm.config.m349.periodicity')}
          style={{ flex: 1 }}
          data-testid="CfgField__cda0bb">
          <select style={INPUT_ST}>
            <option>{t('fm.config.m349.periodicity_monthly')}</option>
            <option>{t('fm.config.m349.periodicity_quarterly')}</option>
            <option>{t('fm.config.m349.periodicity_annual')}</option>
          </select>
        </CfgField>
        <CfgField
          label={t('fm.config.m349.threshold')}
          style={{ flex: 1 }}
          data-testid="CfgField__cda0bb">
          <input type="text" defaultValue="50.000" style={{ ...INPUT_ST, fontFamily: 'monospace' }} />
        </CfgField>
      </div>
      <CfgField label={t('fm.config.m349.viespref')} data-testid="CfgField__cda0bb">
        <select style={INPUT_ST}>
          <option>{t('fm.config.m349.viespref_auto')}</option>
          <option>{t('fm.config.m349.viespref_manual')}</option>
        </select>
      </CfgField>
      <CfgField label={t('fm.config.m349.keys')} data-testid="CfgField__cda0bb">
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

// model: '303' | '349' | undefined — when provided, opens with that model's tab active;
// undefined shows both tabs starting with Declarante.
export function ConfigDrawer({ model, onClose, token, apiBaseUrl }) {
  const ui = useUI();
  const t = ui;

  // Available tabs: always Declarante, then per-model tabs for active models
  const modelTab = model ?? '303';
  const [activeTab, setActiveTab] = useState('declarante');

  const [form, setForm] = useState({ nif: '', name: '', phone: '', address: '', postal: '', city: '', province: '', conceptCondition: 'condición', amountTolerance: '0%' });
  const [redeme, setRedeme] = useState(true);
  const [recc, setRecc] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!token || !apiBaseUrl) return;
    const controller = new AbortController();
    fetch(`${neoBase(apiBaseUrl)}/session`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
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
    return () => controller.abort();
  }, [token, apiBaseUrl]);

  const set = (key) => (e) => { setForm(prev => ({ ...prev, [key]: e.target.value })); setIsDirty(true); };

  const TABS = [
    { id: 'declarante', label: t('fm.config.declarant.title') ?? 'Declarante' },
    { id: 'model',      label: t(`fm.config.m${modelTab}.title`) ?? `Modelo ${modelTab}` },
  ];

  // Tab button style — segmented control (same as fiscal-config TabBar)
  const tabStyle = (id) => ({
    padding: '5px 16px', fontSize: 14,
    fontWeight: activeTab === id ? 500 : 400,
    color: '#121217',
    background: activeTab === id ? '#fff' : 'transparent',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    boxShadow: activeTab === id
      ? '0px 1px 3px rgba(18,18,23,0.1), 0px 1px 2px rgba(18,18,23,0.06)'
      : 'none',
    transition: 'all 0.1s',
    whiteSpace: 'nowrap',
  });

  return (
    <div className="fm-catalog-overlay" onClick={onClose}>
      <div className="fm-config-modal" onClick={e => e.stopPropagation()}>
        <div className="fm-config-modal__header">
          <div className="fm-config-modal__titles">
            <div className="fm-config-modal__title">{t('fm.config.title')}</div>
            <div className="fm-config-modal__sub">{t('fm.config.sub')}</div>
          </div>
          <button className="fm-config-modal__close" onClick={onClose} aria-label={t('fm.action.close')}>✕</button>
        </div>

        {/* Tab navigation */}
        <div style={{ padding: '12px 20px 16px' }}>
        <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: '#F5F7F9' }}>
          {TABS.map(tab => (
            <button key={tab.id} style={{ ...tabStyle(tab.id), flex: 1, textAlign: 'center' }} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>
        </div>

        <div className="fm-config-modal__body">
          {activeTab === 'declarante' && (
            <>
              {/* Row 1: NIF + Razón social */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <CfgField
                  label={t('fm.config.declarant.nif') ?? 'NIF / CIF'}
                  data-testid="CfgField__cda0bb">
                  <input type="text" value={form.nif} onChange={set('nif')} placeholder="A12345678" style={INPUT_ST} />
                </CfgField>
                <CfgField
                  label={t('fm.config.declarant.name') ?? 'Razón social'}
                  data-testid="CfgField__cda0bb">
                  <input type="text" value={form.name} onChange={set('name')} style={INPUT_ST} />
                </CfgField>
              </div>
              {/* Row 2: Teléfono + Dirección */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <CfgField
                  label={t('fm.config.declarant.phone') ?? 'Teléfono'}
                  data-testid="CfgField__cda0bb">
                  <input type="tel" value={form.phone} onChange={set('phone')} placeholder="+34" style={INPUT_ST} />
                </CfgField>
                <CfgField
                  label={t('fm.config.declarant.address') ?? 'Dirección'}
                  data-testid="CfgField__cda0bb">
                  <input type="text" value={form.address} onChange={set('address')} style={INPUT_ST} />
                </CfgField>
              </div>
              {/* Row 3: Condición sobre el concepto + Tolerancia de importe */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <CfgField
                  label={t('fm.config.declarant.concept_condition') ?? 'Condición sobre el concepto'}
                  data-testid="CfgField__cda0bb">
                  <select value={form.conceptCondition} onChange={set('conceptCondition')} style={INPUT_ST}>
                    <option value="condición">condición</option>
                    <option value="ninguna">ninguna</option>
                  </select>
                </CfgField>
                <CfgField
                  label={t('fm.config.declarant.amount_tolerance') ?? 'Tolerancia de importe'}
                  data-testid="CfgField__cda0bb">
                  <select value={form.amountTolerance} onChange={set('amountTolerance')} style={INPUT_ST}>
                    <option value="0%">0%</option>
                    <option value="1%">1%</option>
                    <option value="2%">2%</option>
                    <option value="5%">5%</option>
                  </select>
                </CfgField>
              </div>
              {/* Row 4: CP + Municipio + Provincia */}
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: 12 }}>
                <CfgField
                  label={t('fm.config.declarant.postal') ?? 'CP'}
                  data-testid="CfgField__cda0bb">
                  <input type="text" value={form.postal} onChange={set('postal')} style={INPUT_ST} />
                </CfgField>
                <CfgField
                  label={t('fm.config.declarant.city') ?? 'Municipio'}
                  data-testid="CfgField__cda0bb">
                  <input type="text" value={form.city} onChange={set('city')} style={INPUT_ST} />
                </CfgField>
                <CfgField
                  label={t('fm.config.declarant.province') ?? 'Provincia'}
                  data-testid="CfgField__cda0bb">
                  <input type="text" value={form.province} onChange={set('province')} style={INPUT_ST} />
                </CfgField>
              </div>
            </>
          )}

          {activeTab === 'model' && modelTab === '303' && (
            <>
              {/* Regímenes fiscales */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#121217', marginBottom: 12 }}>
                  {t('fm.config.m303.regimes') ?? 'Regímenes fiscales'}
                </div>
                <div style={{ display: 'flex', gap: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#121217', cursor: 'pointer' }}>
                    <Checkbox
                      checked={redeme}
                      onChange={() => { setRedeme(v => !v); setIsDirty(true); }}
                      data-testid="Checkbox__cda0bb" />
                    {t('fm.config.m303.redeme') ?? 'Inscrito en REDEME'}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#121217', cursor: 'pointer' }}>
                    <Checkbox
                      checked={recc}
                      onChange={() => { setRecc(v => !v); setIsDirty(true); }}
                      data-testid="Checkbox__cda0bb" />
                    {t('fm.config.m303.recc') ?? 'Régimen RECC'}
                  </label>
                </div>
              </div>
              {/* Prorrata + IBAN */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <CfgField
                  label={t('fm.config.m303.prorata') ?? 'Prorrata'}
                  data-testid="CfgField__cda0bb">
                  <select style={INPUT_ST}>
                    <option>{t('fm.config.m303.prorata_general') ?? 'General'}</option>
                    <option>{t('fm.config.m303.prorata_especial') ?? 'Especial'}</option>
                  </select>
                </CfgField>
                <CfgField
                  label={t('fm.config.m303.iban') ?? 'IBAN Domiciliación'}
                  data-testid="CfgField__cda0bb">
                  <input type="text" placeholder="ES00 0000 0000 0000 0000 0000" style={{ ...INPUT_ST, fontFamily: 'monospace' }} />
                </CfgField>
              </div>
            </>
          )}

          {activeTab === 'model' && modelTab === '349' && (
            <CfgSection349 t={t} data-testid="CfgSection349__cda0bb" />
          )}
        </div>

        <div className="fm-config-modal__footer">
          <button className="fm-btn fm-btn--cancel-pill" onClick={onClose}>
            {t('fm.action.cancel') ?? 'Cancelar'}
          </button>
          <button
            className={`fm-btn fm-btn--save-pill${isDirty ? ' fm-btn--save-pill--active' : ''}`}
            onClick={() => { setIsDirty(false); onClose(); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Check size={14} strokeWidth={2} data-testid="Check__cda0bb" />
            {t('fm.action.save') ?? 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// T1/2026 reference — used as prev when current decl is T2/2026
const T1_2026_BOXES = { 7:3248, 27:682.08, 45:3498.39, 46:-2816.31 };

export function CompareDrawer({ decl, prevDecl, onClose }) {
  const ui = useUI();
  const t = ui;
  const fmt = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);

  const boxes    = decl.boxes    ?? {};
  const summary  = decl.summary  ?? {};
  const pb       = prevDecl?.boxes ?? T1_2026_BOXES;
  const prevLabel = prevDecl ? `${prevDecl.period} ${prevDecl.year}` : 'T1 2026';
  const currLabel = `${decl.period} ${decl.year}`;

  const currBase = (boxes[1] ?? 0) + (boxes[4] ?? 0) + (boxes[7] ?? 0);
  const prevBase = (pb[1] ?? 0) + (pb[4] ?? 0) + (pb[7] ?? 0);

  const rows = [
    { label: t('fm.compare.row.base'),     prev: prevBase,         curr: currBase,                              separator: false },
    { label: t('fm.compare.row.iva_dev'),  prev: pb[27] ?? 0,      curr: boxes[27] ?? summary.accrued   ?? 0,  separator: false },
    { label: t('fm.compare.row.iva_ded'),  prev: pb[45] ?? 0,      curr: boxes[45] ?? summary.deductible ?? 0, separator: false },
    { label: t('fm.compare.row.result'),   prev: pb[46] ?? 0,      curr: boxes[46] ?? summary.result    ?? 0,  separator: true  },
    { label: t('fm.compare.row.intracom'), prev: pb[59] ?? 0,      curr: boxes[59] ?? 0,                       separator: false },
    { label: t('fm.compare.row.exports'),  prev: pb[60] ?? 0,      curr: boxes[60] ?? 0,                       separator: false },
  ];

  const resultRow = rows.find(r => r.label === t('fm.compare.row.result'));
  const resultImproved = resultRow && Math.abs(resultRow.curr) > Math.abs(resultRow.prev);
  const devImproved    = (boxes[27] ?? 0) > (pb[27] ?? 0);

  return (
    <div className="fm-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="fm-config-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="fm-config-modal__header">
          <div className="fm-config-modal__titles">
            <div className="fm-config-modal__title">{t('fm.compare.title')}</div>
            <div className="fm-config-modal__sub">{prevLabel} → {currLabel}</div>
          </div>
          <button className="fm-config-modal__close" onClick={onClose} aria-label={t('fm.action.close')}>✕</button>
        </div>

        {/* Body */}
        <div className="fm-config-modal__body" style={{ minHeight: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8, padding: '6px 0', fontSize: 12, fontWeight: 400, color: '#121217', borderBottom: '1px solid #E8EAEF' }}>
            <span />
            <span style={{ textAlign: 'right', minWidth: 100 }}>{prevLabel}</span>
            <span style={{ textAlign: 'right', minWidth: 100 }}>{currLabel}</span>
            <span style={{ textAlign: 'right', minWidth: 72 }}>{t('fm.compare.delta')}</span>
          </div>
          {rows.map((r) => {
            const d      = r.curr - r.prev;
            const up     = d >= 0;
            const pctNum = r.prev !== 0 ? (d / Math.abs(r.prev)) * 100 : null;
            let deltaColor = '#828FA3';
            if (pctNum != null) deltaColor = up ? '#17663A' : '#D50B3E';
            const arrow     = up ? '↑' : '↓';
            const deltaText = pctNum == null ? '—' : `${arrow} ${Math.abs(pctNum).toFixed(1)}%`;
            return (
              <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8, padding: '10px 0', borderBottom: r.separator ? '2px solid #E8EAEF' : '1px solid #F5F7F9', fontSize: 14, alignItems: 'center' }}>
                <span style={{ color: '#121217' }}>{r.label}</span>
                <span style={{ textAlign: 'right', minWidth: 100, color: '#121217', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.prev)}</span>
                <span style={{ textAlign: 'right', minWidth: 100, color: '#121217', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.curr)}</span>
                <span style={{ textAlign: 'right', minWidth: 72, color: deltaColor, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {deltaText}
                </span>
              </div>
            );
          })}
          <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--fm-info-bg)', borderRadius: 12, fontSize: 14, color: 'var(--fm-info-fg)', display: 'flex', gap: 8 }}>
            <Info
              size={14}
              style={{ flexShrink: 0, marginTop: 1, color: 'var(--fm-info-fg)' }}
              data-testid="Info__cda0bb" />
            <span>
              {devImproved
                ? t('fm.compare.insight.dev_improved', { prev: prevLabel })
                : t('fm.compare.insight.dev_fell', { prev: prevLabel })
              }
              {' '}
              {resultImproved
                ? t('fm.compare.insight.result_higher', { curr: currLabel })
                : t('fm.compare.insight.result_lower', { curr: currLabel })
              }
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="fm-config-modal__footer" style={{ justifyContent: 'flex-end' }}>
          <button className="fm-btn fm-btn--save-pill fm-btn--save-pill--active" onClick={onClose}>
            {t('fm.action.close') ?? 'Cerrar'}
          </button>
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
