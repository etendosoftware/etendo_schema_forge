import React, { useState } from 'react';
import { useUI } from '@/i18n';
import { StatusPillMenu } from './FmCommon.jsx';
import { PresentModal, FileGenModal } from './FmOverlays.jsx';
import { formatAmount } from './fiscalModelsUtils.js';
import './fiscal-models.css';

// ── Constants ────────────────────────────────────────────────────
const MESES_ES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const STEPPER_INDEX = {
  pendiente:0, borrador:1, listo:2,
  presentado:3, presentadoOtra:3, presentadoAcuse:3,
  omitido:-1,
};

const STEP_LABELS = ['Pendiente','Borrador','Listo','Presentado'];

const KEYS = [
  { id:'E', label:'Entregas' },
  { id:'A', label:'Adquisiciones' },
  { id:'T', label:'Triangulares' },
  { id:'S', label:'Servicios prestados' },
  { id:'I', label:'Servicios recibidos' },
];

const MOCK_OPERATORS = [
  { id:1, nif:'IT12345678901', name:'Bramini Vino S.r.l.',        key:'A', base:12450.00, vies:'valid',   origin:'4 facturas compra' },
  { id:2, nif:'FR40123456789', name:'Olives de Provence SARL',    key:'A', base:6800.00,  vies:'valid',   origin:'2 facturas compra' },
  { id:3, nif:'DE123456789',   name:'Bayern Technik GmbH',        key:'E', base:17600.00, vies:'valid',   origin:'3 facturas venta' },
  { id:4, nif:'PT501234567',   name:'Lusitana Serviços Lda',      key:'S', base:650.00,   vies:'pending', origin:'1 factura servicio' },
  { id:5, nif:'NL123456789B01',name:'Amsterdam Trading BV',       key:'I', base:1450.00,  vies:'valid',   origin:'2 facturas recibidas' },
  { id:6, nif:'BE0123456789',  name:'Brussels Export SA',         key:'T', base:0.00,     vies:'valid',   origin:'1 triangular' },
  { id:7, nif:'PL1234567890',  name:'Kraków Components sp.z.o.o.',key:'A', base:3200.00,  vies:'valid',   origin:'1 factura compra' },
];

// ── Sub-components ───────────────────────────────────────────────
function KeyBadge({ k }) {
  return <span className={`fm-key fm-key--${k}`}>{k}</span>;
}

function ViesBadge({ status }) {
  const map = { valid: ['✓','valid','Válido'], pending: ['○','pending','Pendiente'], invalid: ['×','invalid','Inválido'] };
  const [icon, cls, label] = map[status] ?? map.pending;
  return <span className={`fm-vies fm-vies--${cls}`}>{icon} {label}</span>;
}

function NumberedStepper({ steps, current }) {
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
              <span className="fm-stepper-num__circle">
                {done ? '✓' : i + 1}
              </span>
              {label}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Banner349({ type, icon, title, sub, actions }) {
  return (
    <div className={`fm-349-banner fm-349-banner--${type}`}>
      <div className="fm-349-banner__icon">{icon}</div>
      <div className="fm-349-banner__body">
        <div className="fm-349-banner__title">{title}</div>
        {sub && <div className="fm-349-banner__sub">{sub}</div>}
      </div>
      {actions && <div className="fm-349-banner__actions">{actions}</div>}
    </div>
  );
}

function TotalsCard({ operators }) {
  const totals = {};
  KEYS.forEach(k => { totals[k.id] = operators.filter(o => o.key === k.id).reduce((s,o) => s + o.base, 0); });
  return (
    <div className="fm-349-totals">
      <div className="fm-349-totals__header">
        <div className="fm-349-totals__title">Totales por clave <span style={{ fontSize: 11, fontWeight: 400, color: '#6b7280' }}>(solo lectura)</span></div>
        <div className="fm-349-totals__sub">Calculados a partir de los operadores. No editables — modifica los operadores para ajustar los totales.</div>
      </div>
      <div className="fm-349-totals__grid">
        {KEYS.map(k => (
          <div key={k.id} className="fm-349-total-cell">
            <div className="fm-349-total-cell__head">
              <KeyBadge k={k.id} />
              <span style={{ fontSize: 10, color: '#9ca3af' }}>🔒</span>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{k.label}</div>
            <div className={`fm-349-total-cell__amount${totals[k.id] === 0 ? ' fm-349-total-cell__amount--zero' : ''}`}>
              {formatAmount(totals[k.id])}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────
export default function FmModel349Page({ decl, onBack, onStatusChange }) {
  const ui = useUI();
  const t = ui;

  const [status,      setStatus]      = useState(decl.status);
  const [activeTab,   setActiveTab]   = useState('operators');
  const [keyFilter,   setKeyFilter]   = useState('all');
  const [showPresent, setShowPresent] = useState(false);
  const [showFilegen, setShowFilegen] = useState(false);
  const [selected,    setSelected]    = useState(new Set());

  const operators = decl.operators ?? MOCK_OPERATORS;
  const stepIdx   = STEPPER_INDEX[status] ?? 0;

  const monthNum = /^\d{2}$/.test(decl.period) ? parseInt(decl.period, 10) : null;
  const periodLabel = monthNum ? `${decl.year} / ${MESES_ES[monthNum]}` : `${decl.year} ${decl.period}`;

  const blocking = decl.incidents?.blocking ?? 2;
  const viesPending = operators.filter(o => o.vies === 'pending').length;
  const totalBase = operators.reduce((s,o) => s + o.base, 0);
  const rectifications = decl.rectifications ?? 1;

  function handleStatusChange(newStatus) {
    setStatus(newStatus);
    onStatusChange?.(decl.id, newStatus);
  }

  const filteredOps = keyFilter === 'all' ? operators : operators.filter(o => o.key === keyFilter);
  const toggleSelect = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = filteredOps.length > 0 && filteredOps.every(o => selected.has(o.id));

  const TABS = [
    { id:'operators',    label:'Operadores',     count: operators.length },
    { id:'rectif',       label:'Rectificaciones',count: rectifications },
    { id:'invoices',     label:'Facturas origen', count: null },
    { id:'incidents',    label:'Incidencias',     count: blocking },
    { id:'files',        label:'Ficheros',        count: 1 },
    { id:'history',      label:'Historial',       count: null },
  ];

  return (
    <div className="fm-page">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="fm-349-header">
        <div className="fm-349-header__back">
          <button className="fm-349-header__back-btn" onClick={onBack}>
            ← Volver a Modelos fiscales
          </button>
        </div>
        <div className="fm-349-header__main">
          <div>
            <div className="fm-349-header__title-row">
              <span className="fm-model-badge fm-model-badge--349">349</span>
              <span className="fm-349-header__title">Modelo 349 · {periodLabel}</span>
              <div style={{ marginLeft: 4 }}>
                <StatusPillMenu status={status} onStatusChange={handleStatusChange} />
              </div>
            </div>
            <div className="fm-349-header__subtitle">
              Declaración recapitulativa op. intracomunitarias · {decl.type === 'ord' ? 'Ordinaria' : 'Complementaria'} · NIF: A78901234 · Periodicidad: Mensual
            </div>
          </div>
          <div className="fm-349-header__actions">
            <button className="fm-349-header__btn">🗘 Recalcular</button>
            <button className="fm-349-header__btn">◎ Validar VIES</button>
            <button className="fm-349-header__btn">◉ Vista previa PDF</button>
            <button className="fm-349-header__btn" onClick={() => setShowFilegen(true)}>↓ Generar .349</button>
            <button className="fm-349-header__btn fm-349-header__btn--primary" onClick={() => setShowPresent(true)}>
              ▶ {t('fm.action.present')}
            </button>
          </div>
        </div>
      </div>

      {/* ── Numbered Stepper ─────────────────────────────────────── */}
      <NumberedStepper steps={STEP_LABELS} current={stepIdx} />

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="fm-page__body">

        {/* Banners */}
        {blocking > 0 && (
          <Banner349
            type="error"
            icon="⚠"
            title={`${blocking} incidencias bloqueantes impiden generar el fichero`}
            sub="Resuelve las incidencias bloqueantes para poder generar el fichero AEAT."
            actions={<button className="fm-349-banner__btn fm-349-banner__btn--outline">→ Resolver</button>}
          />
        )}
        {viesPending > 0 && (
          <Banner349
            type="info"
            icon="🌐"
            title={`${viesPending} NIF-IVA con validación VIES pendiente`}
            sub="Validación VIES asíncrona — informativa, no bloqueante"
            actions={<button className="fm-349-banner__btn fm-349-banner__btn--outline">↻ Validar VIES</button>}
          />
        )}
        {status === 'listo' && (
          <Banner349
            type="success"
            icon="✓"
            title="Fichero 349 generado correctamente"
            sub={`349_A78901234_${decl.year}_${decl.period}.349 · ${operators.length} operadores · totales por clave reconciliables fila a fila`}
            actions={
              <>
                <button className="fm-349-banner__btn fm-349-banner__btn--outline">↓ Descargar</button>
                <button className="fm-349-banner__btn fm-349-banner__btn--primary">▶ Presentar</button>
              </>
            }
          />
        )}

        {/* KPI cards */}
        <div className="fm-349-kpis">
          <div className="fm-349-kpi">
            <div className="fm-349-kpi__label">Operadores</div>
            <div className="fm-349-kpi__value">{operators.length}</div>
            <div className="fm-349-kpi__desc">con operaciones en el periodo</div>
          </div>
          <div className="fm-349-kpi">
            <div className="fm-349-kpi__label">Total operaciones</div>
            <div className="fm-349-kpi__value fm-349-kpi__value--mono">{formatAmount(totalBase)}</div>
            <div className="fm-349-kpi__desc">base imponible declarada</div>
          </div>
          <div className="fm-349-kpi">
            <div className="fm-349-kpi__label">Rectificaciones</div>
            <div className="fm-349-kpi__value">{rectifications}</div>
            <div className="fm-349-kpi__desc">periodos anteriores</div>
          </div>
          <div className="fm-349-kpi">
            <div className="fm-349-kpi__label">Pendientes VIES</div>
            <div className={`fm-349-kpi__value${viesPending > 0 ? ' fm-349-kpi__value--orange' : ''}`}>{viesPending}</div>
            <div className="fm-349-kpi__desc">NIF-IVA por validar</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="fm-tabs-bar">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`fm-tabs-bar__tab${activeTab === tab.id ? ' fm-tabs-bar__tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {tab.count != null && <span className="fm-tabs-bar__count">{tab.count}</span>}
            </button>
          ))}
        </div>

        {activeTab === 'operators' && (
          <div style={{ marginTop: 12 }}>
            {/* Key filter + search row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <div className="fm-key-pills">
                <button className={`fm-key-pill${keyFilter === 'all' ? ' fm-key-pill--active' : ''}`} onClick={() => setKeyFilter('all')}>
                  Todas las claves
                </button>
                {KEYS.map(k => (
                  <button key={k.id} className={`fm-key-pill${keyFilter === k.id ? ' fm-key-pill--active' : ''}`} onClick={() => setKeyFilter(k.id)}>
                    <KeyBadge k={k.id} />{k.label}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, color: '#6b7280', background: '#fff' }}>
                  🔍 <span>Buscar operador o NIF-IVA</span>
                </div>
                <button className="fm-toolbar__btn fm-toolbar__btn--primary" style={{ fontSize: 12, padding: '5px 12px' }}>
                  + Añadir operador
                </button>
              </div>
            </div>

            {/* Totals card */}
            <TotalsCard operators={operators} />

            {/* Operators table */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>{operators.length} operadores</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>
                Fuente de verdad del fichero .349 — cada fila será un registro reconciliable en el fichero generado.
              </div>
            </div>

            <div className="fm-table-wrap" style={{ flex: 'none' }}>
              <table className="fm-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input type="checkbox" className="fm-table__cb" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(filteredOps.map(o => o.id)))} />
                    </th>
                    <th>NIF-IVA</th>
                    <th>Operador</th>
                    <th>Clave</th>
                    <th style={{ textAlign: 'right' }}>Base imponible</th>
                    <th>VIES</th>
                    <th>Origen</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOps.map(op => (
                    <tr key={op.id}>
                      <td onClick={e => e.stopPropagation()}>
                        <input type="checkbox" className="fm-table__cb" checked={selected.has(op.id)} onChange={() => toggleSelect(op.id)} />
                      </td>
                      <td><span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#374151' }}>{op.nif}</span></td>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>{op.name}</td>
                      <td><KeyBadge k={op.key} /><span style={{ marginLeft: 5, fontSize: 11, color: '#6b7280' }}>{KEYS.find(k => k.id === op.key)?.label}</span></td>
                      <td style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{formatAmount(op.base)}</td>
                      <td><ViesBadge status={op.vies} /></td>
                      <td><a className="fm-origin-link">{op.origin}</a></td>
                      <td><button className="fm-table-action">👁 Ver</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab !== 'operators' && (
          <div style={{ padding: '32px 0', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            {TABS.find(t => t.id === activeTab)?.label} — contenido disponible próximamente.
          </div>
        )}
      </div>

      {/* Overlays */}
      {showPresent && (
        <PresentModal decl={decl} onConfirm={({ status: s }) => handleStatusChange(s)} onClose={() => setShowPresent(false)} />
      )}
      {showFilegen && (
        <FileGenModal decl={decl} onConfirm={() => {}} onClose={() => setShowFilegen(false)} />
      )}
    </div>
  );
}
