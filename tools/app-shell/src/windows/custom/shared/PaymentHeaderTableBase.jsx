import { useState, useMemo } from 'react';
import { useUI } from '@/i18n';

/* eslint-disable react/prop-types */

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPOSITED_STATUSES = new Set(['RPR', 'RPPC', 'RDNC', 'PPM']);
const FULL_COLS = '44px 120px 110px 1.7fr 185px 150px 36px';

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtAmt(val, curr) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  const abs = Math.abs(n).toFixed(2).split('.');
  abs[0] = abs[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-' : '') + abs[0] + ',' + abs[1] + ' ' + (curr || 'EUR');
}

function fmtDate(raw) {
  if (!raw) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(raw);
}

// ─── DirBadge ─────────────────────────────────────────────────────────────────

function DirBadge({ dir, size = 34 }) {
  const isIn = dir === 'in';
  const bg = isIn ? '#E2F7EA' : '#FDE2E9';
  const color = isIn ? '#17663A' : '#C5234A';
  const half = Math.round(size * 0.45);
  return (
    <div style={{ width: size, height: size, borderRadius: 9, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}
      data-testid="DirBadge__743b1b">
      {isIn
        ? <svg width={half} height={half} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><polyline points="19 12 12 19 5 12"/></svg>
        : <svg width={half} height={half} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><polyline points="5 12 12 5 19 12"/></svg>
      }
    </div>
  );
}

// ─── PaymentStateTag ──────────────────────────────────────────────────────────

function PaymentStateTag({ status, dir, ui }) {
  const isDeposited = DEPOSITED_STATUSES.has(status);
  if (isDeposited) {
    return (
      <span data-testid="PaymentStateTag__deposited"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '500 12px/18px Inter', padding: '2px 10px', borderRadius: 6, background: '#E2F7EA', color: '#17663A', whiteSpace: 'nowrap' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2DCA72', flexShrink: 0 }} />
        {dir === 'in' ? ui('cobroDepositado') : ui('pagoDepositado')}
      </span>
    );
  }
  return (
    <span data-testid="PaymentStateTag__draft"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '500 12px/18px Inter', padding: '2px 10px', borderRadius: 6, background: '#F1F2F4', color: '#55556D', whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#A9A9BC', flexShrink: 0 }} />
      {ui('draft')}
    </span>
  );
}

// ─── RowMenu (⋮) ──────────────────────────────────────────────────────────────

function RowMenu({ row, dir, onNavigate, onReactivate, ui }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const isDeposited = DEPOSITED_STATUSES.has(row.status || '');

  const toggle = (e) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: r.right, y: r.bottom });
    setOpen(v => !v);
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
      <button
        onClick={toggle}
        aria-label="Menú"
        style={{ border: 0, background: open ? '#F1F2F4' : 'transparent', color: '#828FA3', cursor: 'pointer', width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      >
        <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />
          <div style={{ position: 'fixed', top: pos.y + 4, left: pos.x - 200, width: 200, zIndex: 201, background: '#fff', border: '1px solid #E3E7EC', borderRadius: 12, boxShadow: '0 10px 30px rgba(16,20,28,.16)', padding: 6 }}>
            <button
              onClick={() => { setOpen(false); onNavigate && onNavigate(row); }}
              style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', border: 0, background: 'transparent', cursor: 'pointer', font: '500 13px/1 Inter', color: '#19191D', padding: '9px 10px', borderRadius: 8, textAlign: 'left' }}
            >
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#828FA3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              {ui('verDetalle')}
            </button>
            {isDeposited && (
              <button
                onClick={() => { setOpen(false); onReactivate && onReactivate(row); }}
                style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', border: 0, background: 'transparent', cursor: 'pointer', font: '500 13px/1 Inter', color: '#D50B3E', padding: '9px 10px', borderRadius: 8, textAlign: 'left' }}
              >
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
                {ui('reactivar')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── ReadonlyNote ─────────────────────────────────────────────────────────────

function ReadonlyNote({ ui }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, font: '500 12px/16px Inter', color: '#828FA3', background: '#F1F2F4', padding: '6px 11px', borderRadius: 8 }}>
      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      {ui('readonlyNote')}
    </div>
  );
}

// ─── FilterPill ───────────────────────────────────────────────────────────────

function FilterPill({ children, icon }) {
  return (
    <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px', borderRadius: 7, border: '1px solid #E3E7EC', background: '#fff', color: '#55556D', font: '500 12px/1 Inter', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {icon}
      {children}
    </button>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function Toolbar({ ui, search, onSearch }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderBottom: '1px solid #E3E7EC', flexWrap: 'wrap' }}>
      <ReadonlyNote ui={ui} data-testid="ReadonlyNote__743b1b" />
      <div style={{ flex: 1 }} />
      <FilterPill data-testid="FilterPill__743b1b">{ui('allStatuses')}</FilterPill>
      <FilterPill
        icon={<svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>}
        data-testid="FilterPill__743b1b">{ui('anyDate')}</FilterPill>
      <input
        type="text"
        placeholder={ui('searchDoc')}
        value={search}
        onChange={e => onSearch(e.target.value)}
        style={{ height: 30, padding: '0 10px', borderRadius: 7, border: '1px solid #E3E7EC', font: '400 12px/1 Inter', color: '#19191D', outline: 'none', minWidth: 0, width: 220 }}
      />
    </div>
  );
}

// ─── Column headers ───────────────────────────────────────────────────────────

function ColHeaders({ ui }) {
  const cell = { font: '500 12px/16px Inter', color: '#828FA3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: FULL_COLS, gap: 16, alignItems: 'center', padding: '11px 24px 10px', background: '#fff', borderBottom: '1px solid #E3E7EC' }}>
      <div />
      <div style={cell}>{ui('documentNo')}</div>
      <div style={cell}>{ui('date')}</div>
      <div style={cell}>{ui('businessPartner')}</div>
      <div style={cell}>{ui('statusLabel')}</div>
      <div style={{ ...cell, textAlign: 'right' }}>{ui('amount')}</div>
      <div />
    </div>
  );
}

// ─── PayRow ───────────────────────────────────────────────────────────────────

function PayRow({ row, dir, onNavigate, onReactivate, ui }) {
  const isDeposited = DEPOSITED_STATUSES.has(row.status || '');
  const currency = row['currency$_identifier'] || 'EUR';
  const amount = parseFloat(row.amount ?? 0);
  const amtColor = dir === 'in'
    ? (isDeposited ? '#17663A' : '#55556D')
    : '#19191D';
  const bpName = row['businessPartner$_identifier'] || row.businessPartner || '—';
  const origin = row.origin === 'concilia' ? ui('originConcilia') : ui('originFactura');

  return (
    <div
      onClick={() => onNavigate && onNavigate(row)}
      data-testid="PayRow__743b1b"
      style={{ display: 'grid', gridTemplateColumns: FULL_COLS, gap: 16, alignItems: 'center', padding: '13px 24px', borderBottom: '1px solid #E3E7EC', cursor: 'pointer', transition: 'background .1s' }}
      onMouseEnter={e => { e.currentTarget.style.background = '#FAFAFA'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <DirBadge dir={dir} size={34} data-testid="DirBadge__743b1b" />
      <div style={{ font: '600 13px/17px JetBrains Mono, monospace', color: '#19191D', letterSpacing: '.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {row.documentNo || row.id}
      </div>
      <div style={{ font: '400 13px/18px Inter', color: '#55556D', fontVariantNumeric: 'tabular-nums' }}>
        {fmtDate(row.paymentDate)}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: '500 14px/18px Inter', color: '#19191D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bpName}</div>
        <div style={{ font: '400 11px/15px Inter', color: '#828FA3', marginTop: 2 }}>{origin}</div>
      </div>
      <div>
        <PaymentStateTag
          status={row.status || ''}
          dir={dir}
          ui={ui}
          data-testid="PaymentStateTag__743b1b" />
      </div>
      <div style={{ textAlign: 'right', font: '700 15px/20px Inter', color: amtColor, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {dir === 'in' ? '+ ' : '− '}{fmtAmt(amount, currency)}
      </div>
      <RowMenu
        row={row}
        dir={dir}
        onNavigate={onNavigate}
        onReactivate={onReactivate}
        ui={ui}
        data-testid="RowMenu__743b1b" />
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ dir, ui }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48, color: '#828FA3' }}>
      <DirBadge dir={dir} size={48} data-testid="DirBadge__743b1b" />
      <div style={{ marginTop: 16, font: '500 14px/20px Inter', color: '#55556D' }}>
        {dir === 'in' ? 'No hay cobros registrados' : 'No hay pagos registrados'}
      </div>
    </div>
  );
}

// ─── SidebarSkeleton ──────────────────────────────────────────────────────────

function SidebarSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {[90, 70, 60].map((w, i) => (
        <div key={i} style={{ height: 14, borderRadius: 6, background: '#F1F2F4', width: `${w}%` }} />
      ))}
    </div>
  );
}

// ─── Method icons ─────────────────────────────────────────────────────────────

const METHOD_ICONS = {
  transfer: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7h18M3 7l4-4M3 7l4 4M21 17H3M21 17l-4-4M21 17l-4 4"/>
    </svg>
  ),
  card: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
    </svg>
  ),
  cash: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>
    </svg>
  ),
  direct: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4v16M4 8h12a3 3 0 0 1 0 6H4M14 14l4 4M14 14l4-4"/>
    </svg>
  ),
};

// ─── PaymentSidebar ───────────────────────────────────────────────────────────

function computeSidebarStats(rows) {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let thisMonth = 0;
  let pending = 0;
  let draftCount = 0;
  const methodMap = {};

  (rows || []).forEach(r => {
    const amt = parseFloat(r.amount ?? 0);
    const isDeposited = DEPOSITED_STATUSES.has(r.status || '');
    if (isDeposited) {
      if ((r.paymentDate || '').startsWith(ym)) thisMonth += amt;
      const methodId = r['paymentMethod$_identifier'] || 'other';
      if (!methodMap[methodId]) methodMap[methodId] = 0;
      methodMap[methodId] += amt;
    } else {
      pending += amt;
      draftCount += 1;
    }
  });

  const methods = Object.entries(methodMap).map(([label, amount]) => ({ label, amount }));
  return { thisMonth, pending, draftCount, methods };
}

function PaymentSidebar({ dir, data, ui }) {
  const isIn = dir === 'in';

  const { thisMonth, pending, draftCount, methods } = useMemo(
    () => computeSidebarStats(data),
    [data]
  );

  const collectedValue = data ? thisMonth : null;
  const pendingValue = data ? pending : null;

  const heroColor = isIn ? '#17663A' : '#19191D';
  const heroLabel = isIn ? ui('cobradoEsteMes') : ui('pagadoEsteMes');
  const pendLabel = isIn ? ui('pendientesCobrar') : ui('pendientesPagar');
  const heroSign = isIn ? '+ ' : '− ';

  return (
    <aside
      style={{ width: 300, padding: '22px 24px', borderRight: '1px solid #E3E7EC', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 22, background: '#FCFCFD', overflowY: 'auto' }}
      data-testid="PaymentSidebar__panel"
    >
      {/* Hero amount */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <h2 style={{ margin: 0, font: '700 20px/24px Inter', letterSpacing: '-0.01em', color: '#19191D' }}>{heroLabel}</h2>
        </div>
        {collectedValue === null ? (
          <SidebarSkeleton data-testid="SidebarSkeleton__743b1b" />
        ) : (
          <>
            <div className="tabular-nums" style={{ font: '700 30px/36px Inter', color: heroColor, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
              {heroSign}{fmtAmt(collectedValue, 'EUR')}
            </div>
          </>
        )}
      </div>
      {/* Pending */}
      <div style={{ borderTop: '1px solid #E3E7EC', paddingTop: 18 }}>
        <div style={{ font: '500 12px/16px Inter', color: '#828FA3', marginBottom: 4 }}>{pendLabel}</div>
        {pendingValue === null ? (
          <SidebarSkeleton data-testid="SidebarSkeleton__743b1b" />
        ) : (
          <>
            <div className="tabular-nums" style={{ font: '700 22px/26px Inter', color: '#C28800', letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
              {fmtAmt(pendingValue, 'EUR')}
            </div>
          </>
        )}
      </div>
      {/* Draft count — only shown if > 0 */}
      {(draftCount ?? 0) > 0 && (
        <div style={{ borderTop: '1px solid #E3E7EC', paddingTop: 18 }}>
          <div style={{ font: '500 12px/16px Inter', color: '#828FA3', marginBottom: 4 }}>{ui('borradoresLabel')}</div>
          <div className="tabular-nums" style={{ font: '700 22px/26px Inter', color: '#55556D', letterSpacing: '-0.01em' }}>
            {draftCount}
          </div>
          <div style={{ font: '400 12px/16px Inter', color: '#828FA3', marginTop: 3 }}>{ui('borradoresSub')}</div>
        </div>
      )}
      {/* By method */}
      {methods.length > 0 && (
        <div style={{ borderTop: '1px solid #E3E7EC', paddingTop: 18 }}>
          <div style={{ font: '600 13px/17px Inter', color: '#19191D', marginBottom: 10 }}>{ui('porMetodo')}</div>
          {methods.map((m) => (
            <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, font: '500 13px/18px Inter', color: '#55556D' }}>
                <span style={{ color: '#828FA3' }}>{METHOD_ICONS.transfer}</span>
                {m.label}
              </span>
              <span className="tabular-nums" style={{ font: '500 13px/18px Inter', color: '#828FA3', fontVariantNumeric: 'tabular-nums' }}>
                {fmtAmt(m.amount || 0, 'EUR')}
              </span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

// ─── ReactivarModal ───────────────────────────────────────────────────────────

function ReactivarModal({ row, dir, onClose, ui }) {
  const [checked, setChecked] = useState(false);
  const noun = dir === 'in' ? 'cobro' : 'pago';
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(16,20,28,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 24 }}>
      <div style={{ width: 520, maxWidth: '100%', background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(16,20,28,.28)', overflow: 'hidden' }}>
        <div style={{ padding: '22px 24px 18px', display: 'flex', gap: 14, alignItems: 'flex-start', borderBottom: '1px solid #E3E7EC' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#FDE2E9', color: '#C5234A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, font: '700 17px/22px Inter', color: '#19191D' }}>
              {ui('reactivar')} {noun} conciliado
            </h3>
            <div style={{ font: '400 13px/19px Inter', color: '#828FA3', marginTop: 4 }}>
              Este {noun} está conciliado. Al reactivarlo se <b style={{ color: '#55556D', fontWeight: 600 }}>deshará la conciliación</b>, la transacción financiera y el asiento contable asociados.
            </div>
          </div>
        </div>
        <div style={{ padding: '18px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['Conciliación bancaria', 'Se romperá el vínculo con la línea de extracto'],
              ['Transacción financiera', `Se revertirá el movimiento en la cuenta`],
              ['Asiento contable', 'Se eliminará el asiento generado'],
            ].map(([t, d], i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#C5234A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><path d="M18 6 6 18M6 6l12 12"/></svg>
                <div>
                  <span style={{ font: '600 13px/18px Inter', color: '#19191D' }}>{t}</span>
                  <span style={{ font: '400 13px/18px Inter', color: '#828FA3' }}> — {d}</span>
                </div>
              </div>
            ))}
          </div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 18, padding: '12px 14px', border: '1px solid #E3E7EC', borderRadius: 10, background: '#FCFCFD', cursor: 'pointer' }}>
            <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} style={{ width: 16, height: 16 }} />
            <span style={{ font: '500 13px/18px Inter', color: '#19191D' }}>Entiendo que se deshará la conciliación y la contabilización.</span>
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 24px', borderTop: '1px solid #E3E7EC', background: '#FAFAFB' }}>
          <button onClick={onClose} style={{ height: 34, padding: '0 16px', borderRadius: 8, border: '1px solid #E3E7EC', background: '#fff', font: '500 13px/1 Inter', color: '#19191D', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button disabled={!checked} style={{ height: 34, padding: '0 16px', borderRadius: 8, border: 0, background: checked ? '#D50B3E' : '#F1F2F4', font: '500 13px/1 Inter', color: checked ? '#fff' : '#A9A9BC', cursor: checked ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
            {ui('reactivarTodosModoss')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PaymentHeaderTableBase({ dir, specName, data, onNavigate, apiBaseUrl, ...props }) {
  const ui = useUI();
  const isIn = dir === 'in';
  const [search, setSearch] = useState('');
  const [reactivateRow, setReactivateRow] = useState(null);

  const rows = useMemo(() => {
    const all = data || [];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter(r =>
      (r.documentNo || '').toLowerCase().includes(q) ||
      (r['businessPartner$_identifier'] || '').toLowerCase().includes(q) ||
      (r.businessPartner || '').toLowerCase().includes(q)
    );
  }, [data, search]);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <PaymentSidebar dir={dir} data={data} ui={ui} data-testid="PaymentSidebar__743b1b" />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Toolbar
          ui={ui}
          search={search}
          onSearch={setSearch}
          data-testid="Toolbar__743b1b" />
        <ColHeaders ui={ui} data-testid="ColHeaders__743b1b" />
        <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
          {rows.length === 0
            ? <EmptyState dir={dir} ui={ui} data-testid="EmptyState__743b1b" />
            : rows.map(row => (
              <PayRow
                key={row.id}
                row={row}
                dir={dir}
                onNavigate={onNavigate}
                onReactivate={setReactivateRow}
                ui={ui}
                data-testid="PayRow__743b1b" />
            ))
          }
        </div>
      </div>
      {reactivateRow && (
        <ReactivarModal
          row={reactivateRow}
          dir={dir}
          onClose={() => setReactivateRow(null)}
          ui={ui}
          data-testid="ReactivarModal__743b1b" />
      )}
    </div>
  );
}
