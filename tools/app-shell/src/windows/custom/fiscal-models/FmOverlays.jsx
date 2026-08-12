import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useUI } from '@/i18n';
import { SUPPORTED_YEARS } from './models/303/fm303Layouts';
import { neoBase } from '@/components/related-documents/helpers.js';
import { Star, Play, Landmark, OctagonAlert, TriangleAlert, X, Check, ChevronDown, Search } from 'lucide-react';
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

// PresentModal — 2 manual paths + 1 opt-in AEAT sentinel path:
//   1. submitted_ack   — upload PDF/XML receipt; status → submitted_ack
//   2. submitted       — submitted without receipt; status → submitted
//   3. aeat_telematic  — opt-in sentinel path (showAeatPath, 303 only):
//      onConfirm reports the literal status 'aeat_telematic', which is
//      never a real declaration status — the caller (FmModel303Page)
//      intercepts it and opens the dedicated AeatSubmitFlow instead of
//      changing the declaration status directly.
// The former "Otra Plataforma" (external-agency) path was removed from
// this modal — its status remains valid and fully-rendered for any
// declaration that already carries it, it just can no longer be newly
// selected here.
export function PresentModal({ decl, onConfirm, onClose, showAeatPath }) {
  const ui = useUI();
  const t = ui;
  const [path, setPath] = useState(null);
  const [acuseFile, setAcuseFile] = useState(null);
  const fileRef = useRef(null);

  const canConfirm = path === 'submitted' || path === 'aeat_telematic' || (path === 'submitted_ack' && acuseFile);

  function handleConfirm() {
    onConfirm({ status: path, acuseFile: path === 'submitted_ack' ? acuseFile : null });
    onClose();
  }

  const PATHS = [
    { id: 'submitted_ack', icon: <Star size={16} strokeWidth={1.75} data-testid="Star__cda0bb" />, titleKey: 'fm.present.path.acuse',      descKey: 'fm.present.path.acuse_desc' },
    { id: 'submitted',     icon: <Play size={16} strokeWidth={1.75} data-testid="Play__cda0bb" />, titleKey: 'fm.present.path.sin_acuse',  descKey: 'fm.present.path.sin_acuse_desc' },
    ...(showAeatPath ? [
      { id: 'aeat_telematic', icon: <Landmark size={16} strokeWidth={1.75} data-testid="Landmark__cda0bb" />, titleKey: 'fm.present.path.aeat', descKey: 'fm.present.path.aeat_desc' },
    ] : []),
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
                  border: `1px solid ${path === p.id ? 'hsl(var(--foreground))' : 'hsl(var(--border-subtle))'}`,
                  background: path === p.id ? 'hsl(var(--muted))' : 'hsl(var(--card))',
                  transition: 'border-color .12s, background .12s',
                }}
              >
                <span style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: path === p.id ? 'hsl(var(--foreground))' : 'hsl(var(--muted))',
                  color: path === p.id ? 'hsl(var(--card))' : 'hsl(var(--text-disabled))',
                  transition: 'background .12s, color .12s',
                }}>
                  {p.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'hsl(var(--foreground))', lineHeight: '20px' }}>
                    {t(p.titleKey)}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 400, color: 'hsl(var(--text-disabled))', lineHeight: '18px', marginTop: 2 }}>
                    {t(p.descKey)}
                  </div>
                  {p.id === 'submitted_ack' && path === 'submitted_ack' && (
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        style={{
                          fontSize: 12, padding: '5px 12px',
                          border: '1px solid hsl(var(--border-control))', borderRadius: 8,
                          cursor: 'pointer', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))',
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
                  border: `2px solid ${path === p.id ? 'hsl(var(--foreground))' : 'hsl(var(--border-control))'}`,
                  background: path === p.id ? 'hsl(var(--foreground))' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'border-color .12s, background .12s',
                }}>
                  {path === p.id && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'hsl(var(--card))', display: 'block' }} />}
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
            {path === 'aeat_telematic' ? (t('fm.action.continue') ?? 'Continue') : t('fm.action.confirm_presentation')}
          </button>
        </div>

      </div>
    </div>
  );
}

// FileGenModal — despite the generic name, this is 349-specific (the 303 file-gen
// flow uses FileGenModal303 below). Mirrors the classic "Parámetros de entrada del
// generador de declaraciones" popup (OBTL_TaxReportLauncher) for Modelo 349: the 8
// `OBTL_Tax_Report_Parameter` rows with type=I (user input), rendered in ascending
// `order` — FileName/Contact (10), Phone (20), Substitutive (30), FormerStatement
// (40), RepresentativeTaxId (80), Navarra (90), Guipuzcoa (100). The type=O rows
// (Año, org name/NIF) are auto-derived by the backend and intentionally never shown
// here. No conditional show/hide — classic's callout never toggles these fields.
export function FileGenModal({ decl, onConfirm, onClose }) {
  const ui = useUI();
  const t = ui;
  const [fileName,            setFileName]            = React.useState('');
  const [phone,                setPhone]               = React.useState(decl?.phone   ?? '');
  const [contact,              setContact]             = React.useState(decl?.contact ?? '');
  const [substitutive,         setSubstitutive]        = React.useState(false);
  const [formerStatement,      setFormerStatement]     = React.useState('');
  const [representativeTaxId,  setRepresentativeTaxId] = React.useState('');
  const [navarra,              setNavarra]             = React.useState(false);
  const [guipuzcoa,            setGuipuzcoa]           = React.useState(false);
  const inputSt = {
    width: '100%', fontSize: 14, padding: '8px 12px',
    border: '1px solid hsl(var(--border-control))', borderRadius: 8, height: 40,
    boxSizing: 'border-box', color: 'hsl(var(--foreground))', outline: 'none', background: 'hsl(var(--card))',
  };
  const checkboxRowSt = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'hsl(var(--foreground))', cursor: 'pointer' };
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
            <div style={{ fontSize: 14, color: 'hsl(var(--foreground))', fontWeight: 400, marginBottom: 6 }}>
              {t('fm.filegen.filename')}
            </div>
            <input
              style={inputSt}
              value={fileName}
              onChange={e => setFileName(e.target.value)}
              placeholder={`349_${decl?.period}_${decl?.year}`}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: 'hsl(var(--foreground))', fontWeight: 400, marginBottom: 6 }}>
              {t('fm.filegen.contact_name')}
              {t('fm.filegen.contact_name_hint') && (
                <span style={{ fontSize: 12, color: 'hsl(var(--text-disabled))', marginLeft: 6 }}>{t('fm.filegen.contact_name_hint')}</span>
              )}
            </div>
            <input style={inputSt} value={contact} onChange={e => setContact(e.target.value)} placeholder={t('fm.filegen.contact_name_placeholder')} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: 'hsl(var(--foreground))', fontWeight: 400, marginBottom: 6 }}>{t('fm.filegen.contact_phone')}</div>
            <input style={inputSt} value={phone} onChange={e => setPhone(e.target.value)} placeholder={t('fm.filegen.contact_phone_placeholder')} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={checkboxRowSt}>
              <Checkbox
                checked={substitutive}
                onChange={() => setSubstitutive(v => !v)}
                data-testid="Checkbox__cda0bb" />
              {t('fm.filegen.substitutive')}
            </label>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: 'hsl(var(--foreground))', fontWeight: 400, marginBottom: 6 }}>
              {t('fm.filegen.former_statement')}
            </div>
            <input style={inputSt} value={formerStatement} onChange={e => setFormerStatement(e.target.value)} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: 'hsl(var(--foreground))', fontWeight: 400, marginBottom: 6 }}>
              {t('fm.filegen.representative_nif')}
            </div>
            <input style={inputSt} value={representativeTaxId} onChange={e => setRepresentativeTaxId(e.target.value)} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={checkboxRowSt}>
              <Checkbox
                checked={navarra}
                onChange={() => setNavarra(v => !v)}
                data-testid="Checkbox__cda0bb" />
              {t('fm.filegen.navarra')}
            </label>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={checkboxRowSt}>
              <Checkbox
                checked={guipuzcoa}
                onChange={() => setGuipuzcoa(v => !v)}
                data-testid="Checkbox__cda0bb" />
              {t('fm.filegen.guipuzcoa')}
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="fm-config-modal__footer">
          <button className="fm-btn fm-btn--cancel-pill" onClick={onClose}>
            {t('fm.action.cancel')}
          </button>
          <button
            className="fm-btn fm-btn--save-pill fm-btn--save-pill--active"
            onClick={() => {
              onConfirm?.({
                fileName: fileName.trim() || undefined,
                phone, contact, substitutive,
                formerStatement: formerStatement.trim() || undefined,
                representativeTaxId: representativeTaxId.trim() || undefined,
                navarra, guipuzcoa,
              });
              onClose();
            }}
          >
            {t('fm.filegen.generate')}
          </button>
        </div>

      </div>
    </div>
  );
}


export function FileGenModal303({ decl, defaultFilename, onConfirm, onClose }) {
  const ui = useUI();
  const t = ui;
  const [filename, setFilename] = React.useState(defaultFilename ?? `303_${decl?.period}_${decl?.year}.txt`);
  const inputSt = {
    width: '100%', fontSize: 14, padding: '8px 12px',
    border: '1px solid hsl(var(--border-control))', borderRadius: 8, height: 40,
    boxSizing: 'border-box', color: 'hsl(var(--foreground))', outline: 'none', background: 'hsl(var(--card))',
  };
  return (
    <div className="fm-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="fm-config-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="fm-config-modal__header">
          <div className="fm-config-modal__titles">
            <div className="fm-config-modal__title">{t('fm.filegen303.title') ?? 'Generar fichero 303'}</div>
            <div className="fm-config-modal__sub">
              {t('fm.filegen.desc') ?? 'Generar el fichero .303 para'} <strong>{decl?.model} {decl?.year} {decl?.period}</strong>
            </div>
          </div>
          <button className="fm-config-modal__close" onClick={onClose} aria-label={t('fm.action.close')}>✕</button>
        </div>
        <div className="fm-config-modal__body" style={{ minHeight: 'auto', padding: '16px 20px' }}>
          <div style={{ fontSize: 14, color: 'hsl(var(--foreground))', fontWeight: 400, marginBottom: 6 }}>
            {t('fm.filegen.filename') ?? 'Nombre del fichero'}
          </div>
          <input
            style={inputSt}
            value={filename}
            onChange={e => setFilename(e.target.value)}
            placeholder={`303_${decl?.period}_${decl?.year}.txt`}
          />
        </div>
        <div className="fm-config-modal__footer">
          <button className="fm-btn fm-btn--cancel-pill" onClick={onClose}>
            {t('fm.action.cancel')}
          </button>
          <button
            className="fm-btn fm-btn--save-pill fm-btn--save-pill--active"
            onClick={() => { onConfirm?.({ filename: filename.trim() || undefined }); onClose(); }}
          >
            {t('fm.filegen.generate') ?? 'Generar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// useCloseOnOutsideClick — shared open/close behavior for NewDeclModal's two
// dropdown panels (Modelo, Año): a ref on the panel itself + a document
// 'mousedown' listener that closes it on an outside click. Returns a ref to
// attach to the panel element.
function useCloseOnOutsideClick(onClose) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  return ref;
}

// ModelSelectMenu — the "Modelo" dropdown panel for NewDeclModal. Each row
// reuses the same catalog i18n keys (`fm.catalog.<id>.name` / `.desc`)
// FmCatalogPage.jsx already relies on, so a future catalog expansion (more
// models) flows through automatically.
function ModelSelectMenu({ model, availableModels, onSelect, onClose, t }) {
  const ref = useCloseOnOutsideClick(onClose);
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const filtered = availableModels.filter(id => {
    if (!q) return true;
    const name = (t(`fm.catalog.${id}.name`) ?? '').toLowerCase();
    return id.includes(q) || name.includes(q);
  });
  return (
    <div className="fm-newdecl-model-panel" ref={ref} role="listbox">
      <div className="fm-newdecl-model-search">
        <Search size={14} strokeWidth={1.75} data-testid="Search__cda0bb" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('fm.new_decl.search_placeholder')}
          autoFocus
        />
      </div>
      <div className="fm-newdecl-model-list">
        {filtered.map(id => {
          const selected = id === model;
          return (
            <div
              key={id}
              role="option"
              aria-selected={selected}
              className={`fm-newdecl-model-option${selected ? ' fm-newdecl-model-option--selected' : ''}`}
              onClick={() => onSelect(id)}
            >
              <span className={`fm-model-badge fm-model-badge--${id}`}>{id}</span>
              <div className="fm-newdecl-model-option__body">
                <div className="fm-newdecl-model-option__name">{t(`fm.catalog.${id}.name`) ?? id}</div>
                <div className="fm-newdecl-model-option__desc">{t(`fm.catalog.${id}.desc`) ?? ''}</div>
              </div>
              {selected && (
                <Check size={16} strokeWidth={2} className="fm-newdecl-model-option__check" data-testid="Check__cda0bb" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// YearSelectMenu — the "Año" dropdown panel for NewDeclModal. Visually and
// mechanically a simplified sibling of ModelSelectMenu above (button trigger +
// outside-click-to-close panel + checkmark on the selected row), but SUPPORTED_YEARS
// is a short flat list of plain year labels, so there's no search input and no
// chip/subtitle here — just the year text and, for the selected one, a checkmark.
function YearSelectMenu({ year, years, onSelect, onClose }) {
  const ref = useCloseOnOutsideClick(onClose);
  return (
    <div className="fm-newdecl-year-panel" ref={ref} role="listbox">
      <div className="fm-newdecl-year-list">
        {years.map(y => {
          const selected = y === year;
          return (
            <div
              key={y}
              role="option"
              aria-selected={selected}
              className={`fm-newdecl-year-option${selected ? ' fm-newdecl-year-option--selected' : ''}`}
              onClick={() => onSelect(y)}
            >
              <span className="fm-newdecl-year-option__label">{y}</span>
              {selected && (
                <Check size={16} strokeWidth={2} className="fm-newdecl-year-option__check" data-testid="Check__cda0bb" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// NewDeclModal — "Nueva declaración". `existingDeclarations` is optional (defaults
// to none, matching every pre-existing caller/test): when provided (FmListPage
// passes its `decls` array), periods that already have a declaration for the
// selected model+year render grayed-out with a dot badge AND are disabled —
// they cannot be selected or submitted. No message/tooltip explains why: this
// is a deliberate simplification (see complementaria/rectificativa note below)
// until the correction flow is designed properly, so no warning banner is
// rendered here. The onConfirm contract (`{ model, year, period, status: 'draft' }`)
// is unchanged from before this restyle.
//
// Why disabled-with-no-message instead of "allow + warn": creating a second
// declaration for the same model+year+period currently 500s server-side (a DB
// unique-constraint violation) and the correct terminology/eligibility for a
// correction ("complementaria" vs "rectificativa", and whether it's even valid)
// depends on rules this modal doesn't model yet. Disabling the period keeps this
// UI path from ever exercising that broken backend flow.
export function NewDeclModal({ onConfirm, onClose, activeModels, existingDeclarations }) {
  const ui = useUI();
  const t = ui;
  const QUARTERLY_PERIODS = ['T1', 'T2', 'T3', 'T4'];
  const MONTHLY_PERIODS   = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  // Only offer models the user activated in the catalog. When no `activeModels`
  // map is provided (e.g. legacy callers), fall back to all known models.
  const availableModels = activeModels
    ? Object.keys(activeModels).filter(id => activeModels[id])
    : ['303', '349'];
  const canCreate = availableModels.length > 0;
  const [model, setModel] = useState(availableModels[0] ?? '303');
  const _cy = new Date().getFullYear();
  const [year, setYear] = useState(SUPPORTED_YEARS.includes(_cy) ? _cy : SUPPORTED_YEARS[SUPPORTED_YEARS.length - 1]);
  const [frequency, setFrequency] = useState('quarterly'); // 'quarterly' | 'monthly' — drives the Período grid below
  const [period, setPeriod] = useState('T1');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [yearMenuOpen, setYearMenuOpen] = useState(false);

  const periods = frequency === 'monthly' ? MONTHLY_PERIODS : QUARTERLY_PERIODS;
  // Most-recent-first for the Año dropdown — SUPPORTED_YEARS itself stays
  // ascending (other consumers, if any, keep relying on that order).
  const yearOptions = useMemo(() => [...SUPPORTED_YEARS].sort((a, b) => b - a), []);

  // Periods that already carry a declaration for the currently selected model+year.
  // These render disabled in the grid below — never explained (see doc comment
  // above): no warning banner, no tooltip.
  const existingPeriods = useMemo(() => {
    const set = new Set();
    (existingDeclarations ?? []).forEach(d => {
      if (String(d.model) === String(model) && Number(d.year) === Number(year) && d.period) {
        set.add(d.period);
      }
    });
    return set;
  }, [existingDeclarations, model, year]);

  // Every period of the current frequency is already taken — nothing left to
  // pick. The CTA goes inert in that case (still no message, per spec).
  const allPeriodsTaken = periods.length > 0 && periods.every(p => existingPeriods.has(p));

  // Keep the selection off a disabled period: on mount, and whenever the set of
  // taken periods changes (model, year, or frequency switch), jump to the first
  // still-available period for the current frequency. If every period is taken
  // there's nothing to jump to — `allPeriodsTaken` above disables the CTA instead.
  useEffect(() => {
    if (!existingPeriods.has(period)) return;
    const firstAvailable = periods.find(p => !existingPeriods.has(p));
    if (firstAvailable) setPeriod(firstAvailable);
    // `periods` is derived purely from `frequency`, already tracked below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingPeriods, frequency, period]);

  function selectFrequency(next) {
    setFrequency(next);
    setPeriod(next === 'monthly' ? MONTHLY_PERIODS[0] : QUARTERLY_PERIODS[0]);
  }

  function handleCreate() {
    onConfirm?.({ model, year, period, status: 'draft' });
    onClose();
  }

  const selectedModelName = t(`fm.catalog.${model}.name`) ?? model;

  return (
    <div className="fm-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="fm-config-modal fm-newdecl-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="fm-config-modal__header">
          <div className="fm-config-modal__titles">
            <div className="fm-config-modal__title">{t('fm.new_decl.title')}</div>
            <div className="fm-config-modal__sub">{t('fm.new_decl.subtitle')}</div>
          </div>
          <button className="fm-config-modal__close" onClick={onClose} aria-label={t('fm.action.close')}>✕</button>
        </div>

        {/* Body */}
        <div className="fm-config-modal__body" style={{ minHeight: 'auto' }}>
          {!canCreate && (
            <div className="fm-banner fm-banner--warning">{t('fm.new_decl.no_active_models')}</div>
          )}

          {/* Modelo */}
          <div className="fm-newdecl-field" style={{ position: 'relative' }}>
            <label className="fm-newdecl-label">{t('fm.new_decl.model')}</label>
            <button
              type="button"
              className="fm-newdecl-model-trigger"
              disabled={!canCreate}
              aria-haspopup="listbox"
              aria-expanded={modelMenuOpen}
              onClick={() => setModelMenuOpen(o => !o)}
            >
              <span className={`fm-model-badge fm-model-badge--${model}`}>{model}</span>
              <span className="fm-newdecl-model-trigger__name">{selectedModelName}</span>
              <ChevronDown size={16} strokeWidth={1.75} className="fm-newdecl-model-trigger__chevron" data-testid="ChevronDown__cda0bb" />
            </button>
            {modelMenuOpen && canCreate && (
              <ModelSelectMenu
                model={model}
                availableModels={availableModels}
                onSelect={(id) => { setModel(id); setPeriod(periods[0]); setModelMenuOpen(false); }}
                onClose={() => setModelMenuOpen(false)}
                t={t}
              />
            )}
          </div>

          {/* Año / Frecuencia */}
          <div className="fm-newdecl-row">
            <div className="fm-newdecl-field" style={{ position: 'relative' }}>
              <label className="fm-newdecl-label">{t('fm.new_decl.year')}</label>
              <button
                type="button"
                className="fm-newdecl-year-trigger"
                aria-haspopup="listbox"
                aria-expanded={yearMenuOpen}
                onClick={() => setYearMenuOpen(o => !o)}
              >
                <span className="fm-newdecl-year-trigger__value">{year}</span>
                <ChevronDown size={16} strokeWidth={1.75} className="fm-newdecl-year-trigger__chevron" data-testid="ChevronDown__cda0bb" />
              </button>
              {yearMenuOpen && (
                <YearSelectMenu
                  year={year}
                  years={yearOptions}
                  onSelect={(y) => { setYear(y); setYearMenuOpen(false); }}
                  onClose={() => setYearMenuOpen(false)}
                />
              )}
            </div>
            <div className="fm-newdecl-field">
              <label className="fm-newdecl-label">{t('fm.new_decl.frequency')}</label>
              <div className="fm-newdecl-segmented" role="group" aria-label={t('fm.new_decl.frequency')}>
                <button
                  type="button"
                  aria-pressed={frequency === 'quarterly'}
                  className={`fm-newdecl-segmented__btn${frequency === 'quarterly' ? ' fm-newdecl-segmented__btn--active' : ''}`}
                  onClick={() => selectFrequency('quarterly')}
                >
                  {t('fm.new_decl.period_quarterly')}
                </button>
                <button
                  type="button"
                  aria-pressed={frequency === 'monthly'}
                  className={`fm-newdecl-segmented__btn${frequency === 'monthly' ? ' fm-newdecl-segmented__btn--active' : ''}`}
                  onClick={() => selectFrequency('monthly')}
                >
                  {t('fm.new_decl.period_monthly')}
                </button>
              </div>
            </div>
          </div>

          {/* Período */}
          <div className="fm-newdecl-field">
            <div className="fm-newdecl-field__label-row">
              <label className="fm-newdecl-label" style={{ marginBottom: 0 }}>{t('fm.new_decl.period')}</label>
              <span className="fm-newdecl-field__label-hint">
                {frequency === 'monthly' ? t('fm.new_decl.period_section_months') : t('fm.new_decl.period_section_quarters')}
              </span>
            </div>
            <div className={`fm-newdecl-period-grid fm-newdecl-period-grid--${frequency}`}>
              {periods.map(p => {
                const isSelected = p === period;
                const isExisting = existingPeriods.has(p);
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={isExisting}
                    className={`fm-newdecl-period-btn${isSelected ? ' fm-newdecl-period-btn--selected' : ''}${isExisting ? ' fm-newdecl-period-btn--existing' : ''}`}
                    onClick={() => setPeriod(p)}
                  >
                    {p}
                    {isExisting && <span className="fm-newdecl-period-btn__dot" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="fm-config-modal__footer">
          <div className="fm-newdecl-preview">
            {t('fm.new_decl.will_create_as')} <strong>{t('fm.new_decl.preview', { model, period, year })}</strong>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="fm-btn fm-btn--cancel-pill" onClick={onClose}>{t('fm.action.cancel')}</button>
            <button
              className={`fm-btn fm-btn--save-pill${canCreate && !allPeriodsTaken ? ' fm-btn--save-pill--active' : ''}`}
              disabled={!canCreate || allPeriodsTaken}
              onClick={handleCreate}
            >
              {t('fm.new_decl.create_cta')}
            </button>
          </div>
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
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'hsl(var(--muted-foreground))' }}
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
      <div style={{ fontWeight: 600, fontSize: 14, color: 'hsl(var(--foreground))', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function CfgField({ label, children, style }) {
  return (
    <div style={{ marginBottom: 12, ...style }}>
      <div style={{ fontSize: 14, color: 'hsl(var(--foreground))', fontWeight: 400, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const INPUT_ST = {
  width: '100%', fontSize: 14, padding: '8px 12px',
  border: '1px solid hsl(var(--border-control))', borderRadius: 8, height: 40,
  boxSizing: 'border-box', color: 'hsl(var(--foreground))', outline: 'none',
  background: 'hsl(var(--card))',
};

function CfgSection303({ t }) {
  return (
    <CfgSection title={t('fm.config.m303.title')} data-testid="CfgSection__cda0bb">
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'hsl(var(--foreground))', cursor: 'pointer', marginBottom: 8 }}>
        <input type="checkbox" defaultChecked />
        {t('fm.config.m303.redeme')}
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'hsl(var(--foreground))', cursor: 'pointer', marginBottom: 12 }}>
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
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid hsl(var(--border-subtle))', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
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

  const [form, setForm] = useState({ nif: '', name: '', phone: '', address: '', postal: '', city: '', province: '' });
  const [redeme, setRedeme] = useState(true);
  const [recc, setRecc] = useState(false);
  const [iban, setIban] = useState('');
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
    color: 'hsl(var(--foreground))',
    background: activeTab === id ? 'hsl(var(--card))' : 'transparent',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    boxShadow: activeTab === id
      ? '0px 1px 3px hsl(var(--foreground) / 0.1), 0px 1px 2px hsl(var(--foreground) / 0.06)'
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
        <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: 'hsl(var(--muted))' }}>
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
              {/* Row 3: CP + Municipio + Provincia */}
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
                <div style={{ fontSize: 14, fontWeight: 600, color: 'hsl(var(--foreground))', marginBottom: 12 }}>
                  {t('fm.config.m303.regimes') ?? 'Regímenes fiscales'}
                </div>
                <div style={{ display: 'flex', gap: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'hsl(var(--foreground))', cursor: 'pointer' }}>
                    <Checkbox
                      checked={redeme}
                      onChange={() => { setRedeme(v => !v); setIsDirty(true); }}
                      data-testid="Checkbox__cda0bb" />
                    {t('fm.config.m303.redeme') ?? 'Inscrito en REDEME'}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'hsl(var(--foreground))', cursor: 'pointer' }}>
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
                  <input
                    type="text"
                    value={iban}
                    onChange={e => { setIban(e.target.value); setIsDirty(true); }}
                    placeholder="ES00 0000 0000 0000 0000 0000"
                    style={{ ...INPUT_ST, fontFamily: 'monospace' }}
                  />
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

export function DrillDownPanel({ title, children, onClose }) {
  const ui = useUI();
  const t = ui;
  return (
    <div style={{ position: 'fixed', top: 0, right: 0, height: '100%', width: 360, background: 'hsl(var(--card))', borderLeft: '1px solid hsl(var(--border-subtle))', boxShadow: '-4px 0 16px hsl(var(--foreground) / .10)', zIndex: 55, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid hsl(var(--border-subtle))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'hsl(var(--foreground))' }}>{title}</span>
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'hsl(var(--muted-foreground))' }}
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
