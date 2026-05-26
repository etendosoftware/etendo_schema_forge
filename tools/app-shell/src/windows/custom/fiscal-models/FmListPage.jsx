import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useUI } from '@/i18n';
import { LayoutGrid, Settings2, ListFilter, ArrowUpDown } from 'lucide-react';
import { StatusPillMenu, ResultPill, EmptyState } from './FmCommon.jsx';
import { ConfigDrawer, NewDeclModal } from './FmOverlays.jsx';
import FmCatalogPage from './FmCatalogPage.jsx';
import { formatAmount, STATUS_COLOR, computeUpcomingDeadlines, computeBoxes303, checkModified303 } from './fiscalModelsUtils.js';
import useFiscalAutoCompute from './useFiscalAutoCompute.js';

function StatusSelect({ value, options, onChange }) {
  const t = useUI();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const label = value === 'all'
    ? `${t('fm.filter.all')} · ${t('fm.col.status')}`
    : t(`fm.status.${value}`) ?? value;
  const active = value !== 'all';
  return (
    <div className="fm-status-select" ref={ref}>
      <button
        className={`fm-toolbar__pill fm-status-select__trigger${active ? ' fm-toolbar__pill--active-dark' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
      >
        {active && <span className={`fm-status-dot fm-status-dot--${STATUS_COLOR[value]}`} />}
        {label}
        <span className="fm-status-select__caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="fm-status-select__menu" role="listbox">
          <button
            className={`fm-status-select__item${value === 'all' ? ' fm-status-select__item--active' : ''}`}
            role="option" aria-selected={value === 'all'}
            onClick={() => { onChange('all'); setOpen(false); }}
          >
            {t('fm.filter.all')} · {t('fm.col.status')}
          </button>
          {options.map(s => (
            <button
              key={s}
              className={`fm-status-select__item${value === s ? ' fm-status-select__item--active' : ''}`}
              role="option" aria-selected={value === s}
              onClick={() => { onChange(s); setOpen(false); }}
            >
              <span className={`fm-status-dot fm-status-dot--${STATUS_COLOR[s]}`} />
              {t(`fm.status.${s}`) ?? s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const MOCK_DECLARATIONS = [
  { id:'349-2025-12', model:'349', year:2025, period:'12', type:'ord', status:'presentadoAcuse',  result:{kind:'informativa',amount:0}, incidents:{blocking:0,warning:0}, file:'2025_12.349',  updatedAt:'19/01/2026' },
  { id:'349-2025-11', model:'349', year:2025, period:'11', type:'ord', status:'presentadoAcuse',  result:{kind:'informativa',amount:0}, incidents:{blocking:0,warning:0}, file:'2025_11.349',  updatedAt:'18/12/2025' },
  { id:'349-2025-10', model:'349', year:2025, period:'10', type:'ord', status:'presentadoOtra',   result:{kind:'informativa',amount:0}, incidents:{blocking:0,warning:0}, file:null, fileExternal:true, updatedAt:'15/11/2025' },
  { id:'349-2025-09', model:'349', year:2025, period:'09', type:'ord', status:'omitido',          result:{kind:'informativa',amount:0}, incidents:{blocking:0,warning:0}, file:null,           updatedAt:'12/10/2025' },
  { id:'349-2025-08', model:'349', year:2025, period:'08', type:'ord', status:'presentadoAcuse',  result:{kind:'informativa',amount:0}, incidents:{blocking:0,warning:0}, file:'2025_08.349',  updatedAt:'18/09/2025' },
  { id:'349-2025-07', model:'349', year:2025, period:'07', type:'ord', status:'presentado',       result:{kind:'informativa',amount:0}, incidents:{blocking:0,warning:1}, file:'2025_07.349',  updatedAt:'18/08/2025' },
  { id:'349-2025-06', model:'349', year:2025, period:'06', type:'ord', status:'presentadoAcuse',  result:{kind:'informativa',amount:0}, incidents:{blocking:0,warning:0}, file:'2025_06.349',  updatedAt:'19/07/2025' },
  { id:'349-2025-05', model:'349', year:2025, period:'05', type:'ord', status:'presentadoAcuse',  result:{kind:'informativa',amount:0}, incidents:{blocking:0,warning:0}, file:'2025_05.349',  updatedAt:'18/06/2025' },
  { id:'349-2025-04', model:'349', year:2025, period:'04', type:'ord', status:'omitido',          result:{kind:'informativa',amount:0}, incidents:{blocking:0,warning:0}, file:null,           updatedAt:'10/05/2025' },
  { id:'349-2025-03', model:'349', year:2025, period:'03', type:'ord', status:'presentadoAcuse',  result:{kind:'informativa',amount:0}, incidents:{blocking:0,warning:0}, file:'2025_03.349',  updatedAt:'19/04/2025' },
  { id:'303-2026-T2', model:'303', year:2026, period:'T2', type:'ord', status:'borrador',
    result:{kind:'compensar',amount:35479.08}, incidents:{blocking:0,warning:1,items:[
      { severity:'warn', origin:'Casilla 4', message:'El tipo aplicado (7%) difiere del tipo registrado para el período anterior (10%)', suggestion:'Verifica si se trata de una operación a tipo reducido correcta' },
    ]},
    file:null,
    boxes:{ 1:44, 3:1.76, 4:201, 6:14.07, 7:6162.60, 9:1294.15, 27:1309.98, 28:175186, 29:36789.06, 45:36789.06, 46:-35479.08, 59:23, 60:36 },
    summary:{ accrued:1309.98, deductible:36789.06, result:-35479.08 },
    sources: [
      { date:'12/04/2026', ref:'10000015', type:'Venta',  party:'Laura Morat',          regime:'IVA Normal (21%)',  base:4060.00,    vat:852.60,  total:4912.60,   boxes:'07, 09' },
      { date:'16/04/2026', ref:'10000014', type:'Venta',  party:'Juan Perez',            regime:'IVA Normal (21%)',  base:1120.00,    vat:235.20,  total:1355.20,   boxes:'07, 09' },
      { date:'17/04/2026', ref:'10000016', type:'Venta',  party:'Juan Perez',            regime:'Entregas IVA 21%', base:23.00,      vat:4.83,    total:27.83,     boxes:'07, 09' },
      { date:'07/05/2026', ref:'10000018', type:'Venta',  party:'Tercero España',        regime:'IVA Normal (21%)',  base:44.00,      vat:9.24,    total:53.24,     boxes:'07, 09' },
      { date:'07/05/2026', ref:'10000019', type:'Venta',  party:'Tercero España',        regime:'IVA Normal (21%)',  base:44.00,      vat:9.24,    total:53.24,     boxes:'07, 09' },
      { date:'07/05/2026', ref:'10000020', type:'Venta',  party:'Tercero España',        regime:'IVA Normal (21%)',  base:44.00,      vat:9.24,    total:53.24,     boxes:'07, 09' },
      { date:'07/05/2026', ref:'10000021', type:'Venta',  party:'Tercero España',        regime:'IVA Normal (21%)',  base:44.00,      vat:9.24,    total:53.24,     boxes:'07, 09' },
      { date:'07/05/2026', ref:'10000022', type:'Venta',  party:'Tercero España',        regime:'IVA Normal (21%)',  base:201.00,     vat:42.21,   total:243.21,    boxes:'07, 09' },
      { date:'07/05/2026', ref:'10000023', type:'Venta',  party:'Tercero España',        regime:'IVA Normal (21%)',  base:23.00,      vat:4.83,    total:27.83,     boxes:'07, 09' },
      { date:'08/05/2026', ref:'10000024', type:'Venta',  party:'Tercero España',        regime:'IVA Normal (21%)',  base:44.00,      vat:9.24,    total:53.24,     boxes:'07, 09' },
      { date:'08/05/2026', ref:'10000025', type:'Venta',  party:'Tercero España',        regime:'IVA Normal (21%)',  base:44.00,      vat:9.24,    total:53.24,     boxes:'07, 09' },
      { date:'08/05/2026', ref:'10000026', type:'Venta',  party:'Tercero España',        regime:'IVA Normal (21%)',  base:44.00,      vat:9.24,    total:53.24,     boxes:'07, 09' },
      { date:'08/05/2026', ref:'10000027', type:'Venta',  party:'Tercero España',        regime:'IVA Normal (21%)',  base:44.00,      vat:9.24,    total:53.24,     boxes:'07, 09' },
      { date:'08/05/2026', ref:'10000028', type:'Venta',  party:'Tercero España',        regime:'IVA Normal (21%)',  base:44.00,      vat:9.24,    total:53.24,     boxes:'07, 09' },
      { date:'11/05/2026', ref:'10000029', type:'Venta',  party:'Tercero España',        regime:'IVA Normal (21%)',  base:44.00,      vat:9.24,    total:53.24,     boxes:'07, 09' },
      { date:'11/05/2026', ref:'10000030', type:'Venta',  party:'Tercero España',        regime:'IVA Normal (21%)',  base:144.00,     vat:30.24,   total:174.24,    boxes:'07, 09' },
      { date:'11/05/2026', ref:'10000031', type:'Venta',  party:'Tercero España',        regime:'IVA Normal (21%)',  base:44.00,      vat:9.24,    total:53.24,     boxes:'07, 09' },
      { date:'11/05/2026', ref:'10000032', type:'Venta',  party:'Tercero España',        regime:'IVA Normal (21%)',  base:40.00,      vat:8.40,    total:48.40,     boxes:'07, 09' },
      { date:'11/05/2026', ref:'10000034', type:'Venta',  party:'Tercero España',        regime:'IVA Normal (21%)',  base:23.60,      vat:4.96,    total:28.56,     boxes:'07, 09' },
      { date:'13/05/2026', ref:'10000035', type:'Venta',  party:'Tercero España',        regime:'IVA Normal (21%)',  base:44.00,      vat:9.24,    total:53.24,     boxes:'07, 09' },
      { date:'18/05/2026', ref:'10000036', type:'Venta',  party:'Tercero España',        regime:'Entregas IVA 4%',  base:44.00,      vat:1.76,    total:45.76,     boxes:'01, 03' },
      { date:'18/05/2026', ref:'10000037', type:'Venta',  party:'Tercero España',        regime:'Entregas IVA 7%',  base:201.00,     vat:14.07,   total:215.07,    boxes:'04, 06' },
      { date:'16/04/2026', ref:'10000003', type:'Compra', party:'Blanquiceleste S.A.',   regime:'IVA Normal (21%)',  base:171600.00,  vat:36036.00,total:207636.00, boxes:'28, 29' },
      { date:'16/04/2026', ref:'10000004', type:'Compra', party:'Proveedor Mayorista',   regime:'IVA Normal (21%)',  base:660.00,     vat:138.60,  total:798.60,    boxes:'28, 29' },
      { date:'16/04/2026', ref:'10000007', type:'Compra', party:'Proveedor Mayorista',   regime:'IVA Normal (21%)',  base:2750.00,    vat:577.50,  total:3327.50,   boxes:'28, 29' },
      { date:'05/05/2026', ref:'10000008', type:'Compra', party:'Blanquiceleste S.A.',   regime:'IVA Normal (21%)',  base:33.00,      vat:6.93,    total:39.93,     boxes:'28, 29' },
      { date:'05/05/2026', ref:'10000009', type:'Compra', party:'Blanquiceleste S.A.',   regime:'IVA Normal (21%)',  base:33.00,      vat:6.93,    total:39.93,     boxes:'28, 29' },
      { date:'08/05/2026', ref:'10000016', type:'Compra', party:'Tercero España',        regime:'IVA Normal (21%)',  base:33.00,      vat:6.93,    total:39.93,     boxes:'28, 29' },
      { date:'08/05/2026', ref:'10000017', type:'Compra', party:'Tercero España',        regime:'IVA Normal (21%)',  base:33.00,      vat:6.93,    total:39.93,     boxes:'28, 29' },
      { date:'08/05/2026', ref:'10000018', type:'Compra', party:'Tercero España',        regime:'IVA Normal (21%)',  base:11.00,      vat:2.31,    total:13.31,     boxes:'28, 29' },
      { date:'11/05/2026', ref:'10000019', type:'Compra', party:'Tercero España',        regime:'IVA Normal (21%)',  base:33.00,      vat:6.93,    total:39.93,     boxes:'28, 29' },
      { date:'19/05/2026', ref:'10000038', type:'Venta',  party:'Italia',                regime:'Entrega intracom. (%N→0%)', base:23.00, vat:0,       total:23.00,     boxes:'59' },
      { date:'19/05/2026', ref:'10000039', type:'Venta',  party:'Juan Perez',            regime:'Exportación (%N→0%)',       base:36.00, vat:0,       total:36.00,     boxes:'60' },
    ],
    updatedAt:'19/05/2026' },
  { id:'349-2026-T1', model:'349', year:2026, period:'T1', type:'ord', status:'borrador',    result:{kind:'informativa',amount:0}, incidents:{blocking:0,warning:0}, file:null, updatedAt:'—' },
  { id:'303-2026-T1', model:'303', year:2026, period:'T1', type:'ord', status:'presentadoAcuse',         result:{kind:'compensar',amount:2816.31}, incidents:{blocking:2,warning:3,items:[
    { severity:'block', origin:'Casilla 28', message:'El total de cuota devengada no coincide con la suma de las cuotas parciales', suggestion:'Revisa las cuotas de los tipos 21%, 10% y 4%' },
    { severity:'block', origin:'Casilla 69', message:'El resultado de la liquidación está pendiente de confirmar', suggestion:'Verifica que el resultado neto sea correcto antes de generar el fichero' },
    { severity:'warn',  origin:'Casilla 48', message:'No se han detectado facturas de compra para este período', suggestion:'Comprueba si hay facturas de compra no registradas' },
    { severity:'warn',  origin:'Casilla 64', message:'El total deducible es inferior al período anterior en más de un 30%', suggestion:'Verifica si es coherente con la actividad del trimestre' },
    { severity:'warn',  origin:'NIF declarante', message:'El NIF del declarante no está verificado en la AEAT', suggestion:'Confirma el NIF en la configuración del declarante' },
  ]}, file:null, boxes:{ 7:3248, 9:682.08, 27:682.08, 28:16659, 29:3498.39, 45:3498.39, 46:-2816.31 }, summary:{ accrued:682.08, deductible:3498.39, result:-2816.31 }, updatedAt:'14/05/2026', current:true },
  { id:'303-2025-T4', model:'303', year:2025, period:'T4', type:'ord', status:'presentadoAcuse',  result:{kind:'compensar',amount:2100}, incidents:{blocking:0,warning:0}, file:'2025_T4.303', updatedAt:'28/01/2026' },
];

const DEFAULT_ACTIVE = { '303': true, '349': true };

function normDecl(d) {
  return {
    ...d,
    updatedAt: d.updatedAt ? new Date(d.updatedAt).toLocaleDateString('es-ES') : '—',
    result: d.result ?? null,
    incidents: d.incidents ?? { blocking: 0, warning: 0 },
  };
}

// ── Upcoming deadlines helpers ───────────────────────────────────
const MONTH_NAMES_ES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const MONTH_LABELS_ES = ['', 'Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function formatDeadlineHeader(date) {
  return `${date.getDate()} ${MONTH_NAMES_ES[date.getMonth()]}`;
}

function formatPeriodLabel(period) {
  if (/^T\d$/.test(period)) return `T${period[1]}`;
  if (/^\d{2}$/.test(period)) return MONTH_LABELS_ES[parseInt(period, 10)] ?? period;
  return period;
}

function UpcomingDeadlines({ decls, onSelect, t }) {
  const items = computeUpcomingDeadlines(decls);
  const groups = [];
  const seen = {};
  for (const item of items) {
    const key = item.deadline.toISOString().slice(0, 10);
    if (!seen[key]) { seen[key] = []; groups.push({ key, date: item.deadline, items: seen[key] }); }
    seen[key].push(item);
  }
  return (
    <div className="fm-upcoming">
      <div className="fm-upcoming__header">{t('fm.upcoming.title')}</div>
      {groups.length === 0
        ? <div className="fm-upcoming__empty">{t('fm.upcoming.empty')}</div>
        : groups.map(g => (
          <div key={g.key} className="fm-upcoming__group">
            <div className="fm-upcoming__date-label">{formatDeadlineHeader(g.date)}</div>
            {g.items.map(({ decl }) => (
              <div key={decl.id} className="fm-upcoming__row" onClick={() => onSelect?.(decl)}>
                <div className={`fm-upcoming__badge fm-upcoming__badge--${decl.model}`}>
                  <span className="fm-upcoming__badge-label">Modelo</span>
                  <span className="fm-upcoming__badge-num">{decl.model}</span>
                </div>
                <div className="fm-upcoming__info">
                  <div className="fm-upcoming__model-label">{t(`fm.catalog.${decl.model}.name`) ?? `Modelo ${decl.model}`}</div>
                  <div className="fm-upcoming__meta">
                    <span className="fm-upcoming__period">{formatPeriodLabel(decl.period)}</span>
                    <span className={`fm-upcoming__status fm-upcoming__status--${STATUS_COLOR[decl.status]}`}>
                      {t(`fm.status.${decl.status}`) ?? decl.status}
                    </span>
                  </div>
                </div>
                <span className="fm-upcoming__arrow">›</span>
              </div>
            ))}
          </div>
        ))
      }
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────
function ModelBadge({ model }) {
  return <span className={`fm-model-badge fm-model-badge--${model}`}>{model}</span>;
}

function FileCell({ file, fileExternal }) {
  if (!file && !fileExternal) return <span className="fm-file fm-file--none">—</span>;
  if (fileExternal) return <span className="fm-file fm-file--external">↗ Externa</span>;
  return <span className="fm-file">▣ {file}</span>;
}

function IncidentsCell({ blocking, warning, t }) {
  if (!blocking && !warning) return <span className="fm-incidents-ok">{t('fm.incidents.none')}</span>;
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      {blocking > 0 && <span className="fm-incidents-warn"><span className="fm-incidents-warn__dot">!</span>{blocking}</span>}
      {warning  > 0 && <span className="fm-incidents-warn" style={{ color: '#d97706' }}><span className="fm-incidents-warn__dot" style={{ background: '#fef3c7', borderColor: '#fcd34d', color: '#d97706' }}>!</span>{warning}</span>}
    </span>
  );
}

// ── Main component ───────────────────────────────────────────────
export default function FmListPage({ declarations: propDecls, onSelect, onStatusChange, token, apiBaseUrl }) {
  const ui = useUI();
  const t  = ui;

  const [dataMode, setDataMode]          = useState(() => {
    try { return sessionStorage.getItem('fm-data-mode') ?? 'demo'; } catch { return 'demo'; }
  });
  const [demoDecls, setDemoDecls]        = useState(propDecls ?? MOCK_DECLARATIONS);
  const [realDecls, setRealDecls]        = useState([]);
  const decls = dataMode === 'demo' ? demoDecls : realDecls;

  useEffect(() => {
    try { sessionStorage.setItem('fm-data-mode', dataMode); } catch {}
  }, [dataMode]);

  useEffect(() => {
    if (dataMode !== 'real' || !token || !apiBaseUrl) return;
    const base = apiBaseUrl.replace(/\/[^/]+$/, '');
    fetch(`${base}/fiscal303/declarations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setRealDecls((data.data ?? []).map(normDecl)))
      .catch(() => {});
  }, [dataMode, token, apiBaseUrl]);

  const draftDecls303 = useMemo(
    () => realDecls.filter(d => d.model === '303' && d.status === 'borrador'),
    [realDecls]
  );

  const { computedMap } = useFiscalAutoCompute(draftDecls303, {
    computeFn:       computeBoxes303,
    checkModifiedFn: checkModified303,
    token,
    apiBaseUrl,
    enabled:         dataMode === 'real',
    pollIntervalMs:  180_000,
  });

  const [modelFilter, setModelFilter]   = useState('all');
  const [yearFilter,  setYearFilter]    = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeModels, setActiveModels] = useState(DEFAULT_ACTIVE);
  const [showCatalog,  setShowCatalog]  = useState(false);
  const [showConfig,   setShowConfig]   = useState(false);
  const [showNewDecl,  setShowNewDecl]  = useState(false);
  const [selected,     setSelected]     = useState(new Set());

  const handleStatusChange = useCallback((id, newStatus) => {
    (dataMode === 'demo' ? setDemoDecls : setRealDecls)(ds =>
      ds.map(d => d.id === id
        ? { ...d, status: newStatus, updatedAt: new Date().toLocaleDateString('es-ES') }
        : d)
    );
    onStatusChange?.(id, newStatus);
    if (dataMode === 'real' && token && apiBaseUrl) {
      const base = apiBaseUrl.replace(/\/[^/]+$/, '');
      fetch(`${base}/fiscal303/declarations?id=${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      }).catch(() => {});
    }
  }, [dataMode, onStatusChange, token, apiBaseUrl]);

  const handleNewDecl = useCallback(({ model, year, period, status }) => {
    if (dataMode === 'real' && token && apiBaseUrl) {
      const base = apiBaseUrl.replace(/\/[^/]+$/, '');
      fetch(`${base}/fiscal303/declarations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, year: parseInt(year, 10), period, status }),
      })
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(created => setRealDecls(ds => [normDecl(created), ...ds]))
        .catch(() => {
          const id = `${model}-${year}-${period}`;
          setRealDecls(ds => [
            { id, model, year, period, type: 'ord', status, result: null,
              incidents: { blocking: 0, warning: 0 }, file: null,
              updatedAt: new Date().toLocaleDateString('es-ES') },
            ...ds,
          ]);
        });
    } else {
      const id = `${model}-${year}-${period}`;
      setDemoDecls(ds => [
        { id, model, year, period, type: 'ord', status,
          result: { kind: 'informativa', amount: 0 }, incidents: { blocking: 0, warning: 0 },
          file: null, updatedAt: new Date().toLocaleDateString('es-ES') },
        ...ds,
      ]);
    }
  }, [dataMode, token, apiBaseUrl]);

  const years = ['all', ...Array.from(new Set(decls.map(d => String(d.year)))).sort((a,b) => b - a)];
  const statuses = ['all', ...Array.from(new Set(decls.map(d => d.status)))];

  const modelYearFiltered = decls.filter(d =>
    (modelFilter === 'all' || d.model === modelFilter) &&
    (yearFilter  === 'all' || String(d.year) === yearFilter)
  );

  const filtered = modelYearFiltered.filter(d =>
    statusFilter === 'all' || d.status === statusFilter
  );

  const activeCount = Object.values(activeModels).filter(Boolean).length;

  const toggleSelect = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = filtered.length > 0 && filtered.every(d => selected.has(d.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map(d => d.id)));

  return (
    <div className="fm-page">

      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div className="fm-toolbar">
        {/* Year pills */}
        {years.map(y => (
          <button key={y} className={`fm-toolbar__pill${yearFilter === y ? ' fm-toolbar__pill--active-dark' : ''}`} onClick={() => setYearFilter(y)}>
            {y === 'all' ? t('fm.filter.all') : y}
          </button>
        ))}

        <div className="fm-toolbar__sep" />

        {/* Model pills */}
        {['all','303','349'].map(f => (
          <button key={f} className={`fm-toolbar__pill${modelFilter === f ? ' fm-toolbar__pill--active-blue' : ''}`} onClick={() => setModelFilter(f)}>
            {f === 'all' ? t('fm.filter.all') : `${t('fm.filter.model_prefix')} ${f}`}
          </button>
        ))}

        {/* Status dropdown */}
        <StatusSelect
          value={statusFilter}
          options={statuses.filter(s => s !== 'all')}
          onChange={setStatusFilter}
        />

        <div className="fm-toolbar__space" />

        {/* Data mode toggle */}
        <button
          className={`fm-toolbar__pill${dataMode === 'real' ? ' fm-toolbar__pill--active-dark' : ''}`}
          onClick={() => setDataMode(m => m === 'demo' ? 'real' : 'demo')}
          title={dataMode === 'demo' ? t('fm.list.mode.to_real') : t('fm.list.mode.to_demo')}
        >
          {dataMode === 'demo' ? 'Demo' : 'Real'}
        </button>

        {/* Catalog */}
        <button className="fm-toolbar__btn" onClick={() => setShowCatalog(true)}>
          <LayoutGrid size={14} strokeWidth={1.75} />
          {t('fm.catalog.title')}
          <span className="fm-toolbar__count-badge">{activeCount}</span>
          {activeCount > 0 && <span className="fm-toolbar__active-dot" />}
        </button>

        {/* Config */}
        <button className="fm-toolbar__btn" onClick={() => setShowConfig(true)}>
          <Settings2 size={14} strokeWidth={1.75} />
          {t('fm.config.title')}
        </button>

        {/* New declaration */}
        <button className="fm-toolbar__btn fm-toolbar__btn--primary" onClick={() => setShowNewDecl(true)}>
          + {t('fm.action.create')}
        </button>
      </div>

      {/* ── Body: sidebar + main ─────────────────────────────────── */}
      <div className="fm-list-body">

        <UpcomingDeadlines
          decls={modelYearFiltered}
          onSelect={decl => onSelect?.({ ...decl, _precomputed: computedMap[decl.id] })}
          t={t}
        />

        <div className="fm-list-main">
          {/* ── Section header ─────────────────────────────────── */}
          <div className="fm-section-header">
            <span className="fm-section-header__title">{t('fm.list.title')}</span>
            <span className="fm-section-header__count">{filtered.length} {t('fm.list.count')}</span>
            <div className="fm-section-header__actions">
              <button className="fm-section-header__icon-btn" title={t('fm.action.filter')} aria-label={t('fm.action.filter')}><ListFilter size={14} strokeWidth={1.75} /></button>
              <button className="fm-section-header__icon-btn" title={t('fm.action.sort')} aria-label={t('fm.action.sort')}><ArrowUpDown size={14} strokeWidth={1.75} /></button>
            </div>
          </div>

          {/* ── Table ──────────────────────────────────────────── */}
          <div className="fm-table-wrap">
        {filtered.length === 0
          ? <EmptyState />
          : (
            <table className="fm-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input type="checkbox" className="fm-table__cb" checked={allSelected} onChange={toggleAll} />
                  </th>
                  <th>{t('fm.col.model')}</th>
                  <th>{t('fm.col.period')}</th>
                  <th>{t('fm.col.type')}</th>
                  <th style={{ minWidth: 180 }}>{t('fm.col.status')}</th>
                  <th style={{ textAlign: 'right' }}>{t('fm.col.result')}</th>
                  <th>{t('fm.col.incidents')}</th>
                  <th>{t('fm.col.file')}</th>
                  <th>{t('fm.col.updated_at')}</th>
                  <th>{t('fm.col.action')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(decl => {
                  const computed = computedMap[decl.id];
                  const isComputingThis = dataMode === 'real' && decl.model === '303'
                    && decl.status === 'borrador' && !computed;
                  const computeError = computed?.error ?? null;

                  let displayResult = decl.result;
                  if (computed?.summary && !computed.error) {
                    const r = computed.summary.result;
                    const kind = r > 0 ? 'ingresar' : r < 0 ? 'compensar' : 'informativa';
                    displayResult = { kind, amount: Math.abs(r) };
                  }

                  return (
                  <tr
                    key={decl.id}
                    className={decl.current ? 'fm-table__row--current' : ''}
                    onClick={() => onSelect?.({ ...decl, _precomputed: computedMap[decl.id] })}
                  >
                    <td onClick={e => e.stopPropagation()}>
                      <input type="checkbox" className="fm-table__cb" checked={selected.has(decl.id)} onChange={() => toggleSelect(decl.id)} />
                    </td>
                    <td>
                      <ModelBadge model={decl.model} />
                      <span className="fm-model-year">{decl.year}</span>
                    </td>
                    <td><span className="fm-period">{decl.period}</span></td>
                    <td>{decl.type === 'ord' ? t('fm.type.ordinary') : t('fm.type.complementary')}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <StatusPillMenu status={decl.status} onStatusChange={s => handleStatusChange(decl.id, s)} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {isComputingThis ? (
                        <span style={{ color: '#6b7280', fontSize: 12 }}>…</span>
                      ) : computeError ? (
                        <span
                          className="fm-status-pill fm-status-pill--red"
                          title={computeError}
                          style={{ fontSize: 11 }}
                        >
                          {t('fm.status.error')}
                        </span>
                      ) : displayResult?.kind ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                          <ResultPill kind={displayResult.kind} label={t(`fm.result.${displayResult.kind}`) ?? displayResult.kind} />
                          {displayResult.kind !== 'informativa' && displayResult.amount != null && (
                            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
                              {formatAmount(displayResult.amount)}
                            </span>
                          )}
                        </div>
                      ) : <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                    <td>
                      <IncidentsCell blocking={decl.incidents?.blocking ?? 0} warning={decl.incidents?.warning ?? 0} t={t} />
                    </td>
                    <td><FileCell file={decl.file} fileExternal={decl.fileExternal} /></td>
                    <td><span className="fm-date">{decl.updatedAt ?? '—'}</span></td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="fm-table-action" onClick={() => onSelect?.({ ...decl, _precomputed: computedMap[decl.id] })}>
                        {t('fm.action.open')} ›
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>{/* fm-table-wrap */}
        </div>{/* fm-list-main */}

      </div>{/* fm-list-body */}

      {/* ── Overlays ─────────────────────────────────────────────── */}
      {showConfig  && <ConfigDrawer onClose={() => setShowConfig(false)} token={token} apiBaseUrl={apiBaseUrl} />}
      {showNewDecl && <NewDeclModal onConfirm={handleNewDecl} onClose={() => setShowNewDecl(false)} />}

      {/* ── Catalog drawer (slides from right) ───────────────────── */}
      {showCatalog && (
        <>
          <div className="fm-catalog-overlay" onClick={() => setShowCatalog(false)} />
          <div className="fm-catalog-drawer">
            <FmCatalogPage
              activeModels={activeModels}
              onBack={() => setShowCatalog(false)}
              onSave={(newActive) => { setActiveModels(newActive); setShowCatalog(false); }}
              token={token}
              apiBaseUrl={apiBaseUrl}
            />
          </div>
        </>
      )}
    </div>
  );
}
