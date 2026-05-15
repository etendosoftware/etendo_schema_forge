import { useState, useCallback } from 'react';
import { STATUSES, STATUS_COLOR } from './fiscalModelsUtils.js';
import { useDraggable } from '../fiscal-monitor/useDraggable.js';

// ── Mock payloads ─────────────────────────────────────────────────

const MOCK_303 = {
  id: 'debug-303-2026-T1', model: '303', year: 2026, period: 'T1',
  type: 'ord', status: 'borrador', nif: 'B12345678',
  result: { kind: 'ingresar', amount: 12179.75 },
  incidents: { blocking: 0, warning: 0, items: [] },
  summary: { accrued: 45230.80, deductible: 33051.05, result: 12179.75, previousCompensation: 2100 },
  file: null, sources: [], history: [],
  updatedAt: '14/05/2026',
};

const MOCK_349 = {
  id: 'debug-349-2026-01', model: '349', year: 2026, period: '01',
  type: 'ord', status: 'borrador', nif: 'B12345678',
  result: { kind: 'informativa', amount: 0 },
  incidents: { blocking: 0, warning: 0, items: [] },
  updatedAt: '14/05/2026',
};

const MOCK_SUMMARY = {
  accrued: 45230.80, deductible: 33051.05,
  result: 12179.75, previousCompensation: 2100,
  prev: { accrued: 38400.00, deductible: 31200.50, result: 7199.50 },
};

const MOCK_FILE = {
  name: '303_B12345678_2026_T1.303', size: '3,4 KB',
  generatedAt: '2026-05-02 10:30',
};

const MOCK_SOURCES = [
  { date: '2026-03-21', ref: 'F-2026-0188', type: 'Venta',  party: 'Catering Pirineos S.L.',   regime: 'General 21%',    base: 1200, vat: 252,  total: 1452,  boxes: '7, 8' },
  { date: '2026-03-18', ref: 'F-2026-0185', type: 'Venta',  party: 'Bodegas El Mirador S.A.',  regime: 'General 21%',    base: 8200, vat: 1722, total: 9922,  boxes: '7, 8' },
  { date: '2026-03-09', ref: 'C-2026-0044', type: 'Compra', party: 'Süd Logistik GmbH',        regime: 'Intracomun. UE', base: 1450, vat: 0,    total: 1450,  boxes: '10, 11, 36, 37' },
  { date: '2026-02-22', ref: 'F-2026-0117', type: 'Venta',  party: 'Distribuidora Sur S.A.',   regime: 'General 21%',    base: 9300, vat: 1953, total: 11253, boxes: '7, 8' },
];

const MOCK_HISTORY = [
  { text: 'Declaración creada', at: '2026-04-01 09:00', who: 'Sistema', icon: '○' },
  { text: 'Datos importados de libros registro (126 ventas + 92 compras)', at: '2026-04-08 11:20', who: 'Auto', icon: '↓' },
  { text: 'Casilla 14 ajustada (rectificativa F-2025-0902)', at: '2026-04-12 16:45', who: 'M. Ferrer', icon: '✎' },
  { text: 'Fichero 303 generado', at: '2026-05-02 10:30', who: 'M. Ferrer', icon: '📄' },
];

const MOCK_INCIDENTS = {
  blocking: [
    { severity: 'block', origin: 'Casilla 28', message: 'Base imponible negativa — revisar facturas rectificativas', suggestion: 'Verificar F-2026-0188 en libro registro' },
    { severity: 'block', origin: 'Config.', message: 'IBAN de domiciliación no configurado', suggestion: 'Configurar en Ajustes → Mod. 303' },
  ],
  warning: [
    { severity: 'warn', origin: 'Operador', message: 'NIF-IVA FR40123456789 no validado en VIES', suggestion: 'Validar antes de presentar' },
    { severity: 'warn', origin: 'Casilla 7', message: 'Incremento inusual respecto al periodo anterior (+72%)', suggestion: 'Confirmar que el dato es correcto' },
    { severity: 'warn', origin: 'Factura', message: 'Catering Norte 2026 SL — factura sin IVA no justificada', suggestion: 'Añadir nota de exención' },
  ],
};

// ── Styles ────────────────────────────────────────────────────────

const panelStyle = {
  position: 'fixed',
  top: 56,
  right: 16,
  zIndex: 9999,
  background: '#1a1a2e',
  color: '#e0e0ff',
  borderRadius: 10,
  padding: '10px 14px',
  minWidth: 260,
  maxWidth: 300,
  maxHeight: 'calc(100vh - 80px)',
  overflowY: 'auto',
  boxShadow: '0 4px 24px rgba(0,0,0,.45)',
  fontSize: 12,
  fontFamily: 'var(--font-mono, monospace)',
};

const sectionLabel = {
  fontSize: 9,
  letterSpacing: '0.12em',
  color: '#6060aa',
  textTransform: 'uppercase',
  marginBottom: 5,
  marginTop: 8,
};

const btnBase = {
  border: '1px solid',
  borderRadius: 5,
  cursor: 'pointer',
  padding: '3px 7px',
  fontSize: 11,
  fontFamily: 'inherit',
};

const divider = { borderTop: '1px solid #2d2d4a', margin: '8px 0' };

// ── QuickNum ──────────────────────────────────────────────────────

function QuickNum({ value, onChange }) {
  const btn = {
    ...btnBase,
    background: '#2d2d4a',
    borderColor: '#3d3d5c',
    color: '#e0e0ff',
    padding: '2px 8px',
    fontSize: 14,
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <button style={btn} onClick={() => onChange(Math.max(0, value - 1))}>−</button>
      <span style={{ minWidth: 20, textAlign: 'center', color: '#e0e0ff', fontSize: 13, fontWeight: 600 }}>{value}</span>
      <button style={btn} onClick={() => onChange(Math.min(10, value + 1))}>+</button>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────

export default function FmDebugPanel({ view, setView }) {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState('status');
  const { panelRef, posStyle, handleMouseDown } = useDraggable();

  const decl = view?.decl ?? null;
  const viewType = view?.type ?? 'list';

  const patchDecl = useCallback((patch) => {
    setView(v => v.decl ? { ...v, decl: { ...v.decl, ...patch } } : v);
  }, [setView]);

  const setStatus = useCallback((s) => patchDecl({ status: s }), [patchDecl]);

  const setBlocking = useCallback((n) => {
    setView(v => {
      if (!v.decl) return v;
      const items = [
        ...MOCK_INCIDENTS.blocking.slice(0, n),
        ...(v.decl.incidents?.items ?? []).filter(i => i.severity !== 'block'),
      ];
      return { ...v, decl: { ...v.decl, incidents: { ...v.decl.incidents, blocking: n, items } } };
    });
  }, [setView]);

  const setWarning = useCallback((n) => {
    setView(v => {
      if (!v.decl) return v;
      const items = [
        ...(v.decl.incidents?.items ?? []).filter(i => i.severity === 'block'),
        ...MOCK_INCIDENTS.warning.slice(0, n),
      ];
      return { ...v, decl: { ...v.decl, incidents: { ...v.decl.incidents, warning: n, items } } };
    });
  }, [setView]);

  function applyPreset(key) {
    const presets = {
      'clean': { blocking: 0, warning: 0, items: [] },
      '0-1':   { blocking: 0, warning: 1, items: [MOCK_INCIDENTS.warning[0]] },
      '2-0':   { blocking: 2, warning: 0, items: [...MOCK_INCIDENTS.blocking] },
      '2-3':   { blocking: 2, warning: 3, items: [...MOCK_INCIDENTS.blocking, ...MOCK_INCIDENTS.warning] },
    };
    if (presets[key]) patchDecl({ incidents: presets[key] });
  }

  function navTo(type, mockDecl) {
    setView({ type, decl: { ...mockDecl } });
    setTab('status');
  }

  const blocking = decl?.incidents?.blocking ?? 0;
  const warning  = decl?.incidents?.warning  ?? 0;

  const tabBtnStyle = (active) => ({
    ...btnBase,
    background: active ? '#5423E7' : '#2d2d4a',
    borderColor: active ? '#8860ff' : '#3d3d5c',
    color: active ? '#fff' : '#c0c0ff',
    flex: 1,
    textAlign: 'center',
    padding: '3px 4px',
    fontSize: 10,
  });

  const chipStyle = (active, color) => ({
    ...btnBase,
    background: active ? (color ? color + '33' : '#2d2d4a') : '#2d2d4a',
    borderColor: active ? (color ?? '#8860ff') : '#3d3d5c',
    color: active ? (color ?? '#e0e0ff') : '#c0c0ff',
    marginBottom: 3,
  });

  return (
    <div ref={panelRef} style={{ ...panelStyle, ...posStyle }}>
      {/* Header / drag handle */}
      <div
        onMouseDown={handleMouseDown}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsed ? 0 : 8, cursor: 'grab', userSelect: 'none' }}
      >
        <span style={{ fontSize: 10, letterSpacing: '0.08em', color: '#a0a0cc', textTransform: 'uppercase' }}>
          ⚙ Debug · Fiscal Models
        </span>
        <button
          onClick={() => setCollapsed(c => !c)}
          onMouseDown={e => e.stopPropagation()}
          style={{ background: 'none', border: 'none', color: '#a0a0cc', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
        >
          {collapsed ? '▾' : '▴'}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* State bar */}
          <div style={{ fontSize: 10, color: '#a0a0cc', marginBottom: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{
              background: viewType === '303' ? '#172554' : viewType === '349' ? '#1e1b4b' : '#2d2d4a',
              color:      viewType === '303' ? '#60a5fa' : viewType === '349' ? '#a78bfa' : '#e0e0ff',
              border:     `1px solid ${viewType === '303' ? '#1d4ed8' : viewType === '349' ? '#4f46e5' : '#3d3d5c'}`,
              borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700,
            }}>
              {viewType === 'list' ? 'LIST' : viewType}
            </span>
            {decl ? (
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#7070aa' }}>
                {decl.id}
              </span>
            ) : (
              <span style={{ color: '#4040aa' }}>no decl</span>
            )}
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 3, marginBottom: 10 }}>
            {['status', 'incidents', 'data', 'nav', 'json'].map(t => (
              <button key={t} style={tabBtnStyle(tab === t)} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {/* ── STATUS ── */}
          {tab === 'status' && (
            <>
              <div style={sectionLabel}>Quick-set status</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {STATUSES.map(s => (
                  <button
                    key={s}
                    disabled={!decl}
                    onClick={() => setStatus(s)}
                    style={{
                      ...btnBase,
                      background: decl?.status === s ? '#5423E7' : '#2d2d4a',
                      borderColor: decl?.status === s ? '#8860ff' : '#3d3d5c',
                      color: decl?.status === s ? '#fff' : '#c0c0ff',
                      textAlign: 'left',
                    }}
                  >
                    {decl?.status === s ? '✓ ' : '  '}{s}
                    <span style={{ fontSize: 9, color: '#6060aa', marginLeft: 4 }}>({STATUS_COLOR[s]})</span>
                  </button>
                ))}
              </div>
              {!decl && (
                <div style={{ fontSize: 10, color: '#4040aa', marginTop: 8 }}>
                  Go to NAV tab → navigate to a declaration first
                </div>
              )}
            </>
          )}

          {/* ── INCIDENTS ── */}
          {tab === 'incidents' && (
            <>
              <div style={sectionLabel}>Blocking</div>
              <QuickNum value={blocking} onChange={setBlocking} />
              <div style={sectionLabel}>Warning</div>
              <QuickNum value={warning} onChange={setWarning} />
              <div style={divider} />
              <div style={sectionLabel}>Presets</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {[
                  { key: 'clean', label: '0/0 clean' },
                  { key: '0-1',   label: '0/1 warn' },
                  { key: '2-0',   label: '2/0 block' },
                  { key: '2-3',   label: '2/3 all' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    disabled={!decl}
                    onClick={() => applyPreset(key)}
                    style={{ ...btnBase, background: '#2d2d4a', borderColor: '#3d3d5c', color: '#c0c0ff' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {!decl && (
                <div style={{ fontSize: 10, color: '#4040aa', marginTop: 8 }}>
                  Navigate to a declaration first (NAV tab)
                </div>
              )}
            </>
          )}

          {/* ── DATA ── */}
          {tab === 'data' && (
            <>
              {[
                { label: 'Summary',          active: !!decl?.summary,               onInject: () => patchDecl({ summary: MOCK_SUMMARY }),   onClear: () => patchDecl({ summary: null }) },
                { label: 'File',             active: !!decl?.file,                  onInject: () => patchDecl({ file: MOCK_FILE }),          onClear: () => patchDecl({ file: null }) },
                { label: 'Sources (4 rows)', active: (decl?.sources ?? []).length > 0, onInject: () => patchDecl({ sources: MOCK_SOURCES }), onClear: () => patchDecl({ sources: [] }) },
                { label: 'History (4)',      active: (decl?.history ?? []).length > 0, onInject: () => patchDecl({ history: MOCK_HISTORY }), onClear: () => patchDecl({ history: [] }) },
              ].map(({ label, active, onInject, onClear }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, padding: '5px 8px', borderRadius: 6, background: '#0f0f1e', border: '1px solid #2d2d4a' }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#c0c0ff' }}>{label}</div>
                    <div style={{ fontSize: 9, color: active ? '#6dffb3' : '#4040aa', letterSpacing: '0.06em' }}>{active ? '● injected' : '○ empty'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button disabled={!decl} onClick={onInject} style={{ ...btnBase, background: '#1a3a1a', borderColor: '#2a5c2a', color: '#b3ffb3' }}>inject</button>
                    <button disabled={!decl} onClick={onClear}  style={{ ...btnBase, background: '#3d1a1a', borderColor: '#5c2a2a', color: '#ffb3b3' }}>clear</button>
                  </div>
                </div>
              ))}

              <div style={divider} />
              <div style={sectionLabel}>Result kind</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {['ingresar', 'compensar', 'devolver', 'zero', 'informativa'].map(k => (
                  <button
                    key={k}
                    disabled={!decl}
                    onClick={() => patchDecl({ result: { kind: k, amount: MOCK_SUMMARY.result } })}
                    style={chipStyle(decl?.result?.kind === k)}
                  >
                    {k}
                  </button>
                ))}
              </div>

              <div style={sectionLabel}>Type</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[['ord', 'ordinaria'], ['comp', 'complement.']].map(([tp, label]) => (
                  <button
                    key={tp}
                    disabled={!decl}
                    onClick={() => patchDecl({ type: tp })}
                    style={chipStyle(decl?.type === tp)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── NAV ── */}
          {tab === 'nav' && (
            <>
              <div style={sectionLabel}>Navigate to</div>
              <button
                onClick={() => setView({ type: 'list' })}
                style={{ ...btnBase, width: '100%', textAlign: 'left', background: '#2d2d4a', borderColor: '#3d3d5c', color: '#c0c0ff', marginBottom: 6 }}
              >
                ▤ List page
              </button>

              <div style={divider} />
              <div style={sectionLabel}>Modelo 303</div>
              {[
                { label: '2026 T1 · borrador',        patch: { status: 'borrador', incidents: { blocking: 0, warning: 0, items: [] } } },
                { label: '2026 T1 · 2 blocking',      patch: { status: 'borrador', incidents: { blocking: 2, warning: 3, items: [...MOCK_INCIDENTS.blocking, ...MOCK_INCIDENTS.warning] } } },
                { label: '2026 T1 · listo + file',    patch: { status: 'listo', file: MOCK_FILE, incidents: { blocking: 0, warning: 0, items: [] } } },
                { label: '2026 T1 · presentadoAcuse', patch: { status: 'presentadoAcuse', file: MOCK_FILE, incidents: { blocking: 0, warning: 0, items: [] } } },
                { label: '2025 T4 · complementaria',  patch: { year: 2025, period: 'T4', type: 'comp', status: 'pendiente' } },
              ].map(({ label, patch }) => (
                <button
                  key={label}
                  onClick={() => navTo('303', { ...MOCK_303, ...patch })}
                  style={{ ...btnBase, width: '100%', textAlign: 'left', background: '#0f1a3a', borderColor: '#1d3a7a', color: '#90b8ff', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <span style={{ background: '#172554', color: '#60a5fa', borderRadius: 3, padding: '1px 4px', fontSize: 9, fontWeight: 700 }}>303</span>
                  {label}
                </button>
              ))}

              <div style={divider} />
              <div style={sectionLabel}>Modelo 349</div>
              {[
                { label: '2026 01 · borrador',        patch: { status: 'borrador' } },
                { label: '2026 01 · presentadoAcuse', patch: { status: 'presentadoAcuse' } },
              ].map(({ label, patch }) => (
                <button
                  key={label}
                  onClick={() => navTo('349', { ...MOCK_349, ...patch })}
                  style={{ ...btnBase, width: '100%', textAlign: 'left', background: '#0f0f2e', borderColor: '#3d2a7a', color: '#c0a0ff', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <span style={{ background: '#1e1b4b', color: '#a78bfa', borderRadius: 3, padding: '1px 4px', fontSize: 9, fontWeight: 700 }}>349</span>
                  {label}
                </button>
              ))}
            </>
          )}

          {/* ── JSON ── */}
          {tab === 'json' && (
            <>
              <div style={sectionLabel}>Current view</div>
              <pre style={{ background: '#0f0f1e', border: '1px solid #2d2d4a', borderRadius: 6, padding: 8, fontSize: 9.5, color: '#7070aa', overflowX: 'auto', maxHeight: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5 }}>
                {JSON.stringify({
                  type: viewType,
                  decl: decl ? {
                    ...decl,
                    sources: decl.sources?.length ? `[${decl.sources.length} items]` : [],
                    history: decl.history?.length ? `[${decl.history.length} items]` : [],
                  } : null,
                }, null, 2)}
              </pre>
              {decl?.incidents && (
                <>
                  <div style={{ ...sectionLabel, marginTop: 8 }}>Incidents</div>
                  <pre style={{ background: '#0f0f1e', border: '1px solid #2d2d4a', borderRadius: 6, padding: 8, fontSize: 9.5, color: '#7070aa', overflowX: 'auto', maxHeight: 140, whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5 }}>
                    {JSON.stringify(decl.incidents, null, 2)}
                  </pre>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
