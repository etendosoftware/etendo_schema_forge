import { useState, useEffect, useMemo, useCallback } from 'react';
import { DataTable } from '@/components/contract-ui';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { formatCurrency } from '@/lib/formatCurrency';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAID_STATUSES = new Set(['RPR', 'RPPC', 'RDNC', 'PPM']);
const FILTERS = ['documentNo', 'paymentDate', 'businessPartner', 'status'];

const METHOD_ICONS = {
  transfer: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
    </svg>
  ),
  direct: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h18M3 21h18M3 12h18M9 6v6M15 12v6"/>
    </svg>
  ),
  cash: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><path d="M14.4 8.4A3 3 0 0 0 9 10.5v3a3 3 0 0 0 5.4 1.8"/>
    </svg>
  ),
  card: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/>
    </svg>
  ),
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function DirBadge({ dir, size = 34 }) {
  const isIn = dir === 'in';
  const bg = isIn ? '#E2F7EA' : '#FDE2E9';
  const color = isIn ? '#17663A' : '#C5234A';
  const half = Math.round(size * 0.45);
  return (
    <div style={{ width: size, height: size, borderRadius: 9, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
      {isIn
        ? <svg width={half} height={half} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><polyline points="19 12 12 19 5 12"/></svg>
        : <svg width={half} height={half} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><polyline points="5 12 12 5 19 12"/></svg>
      }
    </div>
  );
}

function PaymentStateTag({ status, dir, ui }) {
  const isDeposited = PAID_STATUSES.has(status);
  if (isDeposited) {
    return (
      <span
        data-testid="PaymentStateTag__deposited"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, padding: '2px 10px', borderRadius: 6, background: '#E2F7EA', color: '#17663A', whiteSpace: 'nowrap' }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2DCA72', flexShrink: 0 }} />
        {dir === 'in' ? ui('cobroDepositado') : ui('pagoDepositado')}
      </span>
    );
  }
  return (
    <span
      data-testid="PaymentStateTag__draft"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, padding: '2px 10px', borderRadius: 6, background: '#F1F2F4', color: '#55556D', whiteSpace: 'nowrap' }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#A9A9BC', flexShrink: 0 }} />
      {ui('draft')}
    </span>
  );
}

function Stat({ label, value, subLabel, color, small }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 500, color: '#828FA3', marginBottom: 4, lineHeight: '15px' }}>{label}</div>
      <div className="tabular-nums" style={{ fontSize: small ? 20 : 26, fontWeight: 700, color: color || '#19191D', letterSpacing: '-0.02em', lineHeight: '1.15' }}>
        {value}
      </div>
      {subLabel && <div style={{ fontSize: 12, color: '#828FA3', marginTop: 3 }}>{subLabel}</div>}
    </div>
  );
}

function SidebarSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {[90, 70, 60].map((w, i) => (
        <div key={i} style={{ height: 14, borderRadius: 6, background: '#F1F2F4', width: `${w}%` }} />
      ))}
    </div>
  );
}

function PaymentSidebar({ dir, specName, apiBaseUrl, ui }) {
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const apiFetch = useApiFetch(base);
  const isIn = dir === 'in';

  const [stats, setStats] = useState(null);
  const [drafts, setDrafts] = useState(null);

  useEffect(() => {
    if (!base) return;
    (async () => {
      try {
        const [statsRes, draftsRes] = await Promise.allSettled([
          apiFetch(`/${specName}/header/action/paymentStats`, { method: 'POST', body: '{}' }),
          apiFetch(`/${specName}/header?status=RPAP&_startRow=0&_endRow=0`),
        ]);

        if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
          const json = await statsRes.value.json();
          setStats(json.response?.data || json);
        }
        if (draftsRes.status === 'fulfilled' && draftsRes.value.ok) {
          const json = await draftsRes.value.json();
          setDrafts(json.response?.totalRows ?? 0);
        }
      } catch { /* silent */ }
    })();
  }, [apiFetch, base, specName]);

  const collectedValue = stats?.collectedThisMonth ?? stats?.totalThisMonth ?? null;
  const pendingValue = stats?.pendingCollection ?? stats?.pending ?? null;
  const methods = stats?.methodBreakdown || [];
  const draftCount = drafts ?? stats?.drafts ?? null;

  const heroColor = isIn ? '#17663A' : '#19191D';
  const heroLabel = isIn ? ui('cobradoEsteMes') : ui('pagadoEsteMes');
  const pendLabel = isIn ? ui('pendientesCobrar') : ui('pendientesPagar');
  const heroSign = isIn ? '+ ' : '− ';

  return (
    <aside
      style={{ width: 300, padding: '22px 24px', borderRight: '1px solid #E3E7EC', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 20, background: '#FCFCFD', overflowY: 'auto' }}
      data-testid="PaymentSidebar__panel"
    >
      {/* Hero: collected/paid this month */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#55556D', marginBottom: 5 }}>{heroLabel}</div>
        {collectedValue === null ? (
          <SidebarSkeleton />
        ) : (
          <>
            <div className="tabular-nums" style={{ fontSize: 28, fontWeight: 700, color: heroColor, letterSpacing: '-0.02em', lineHeight: '1.1' }}>
              {heroSign}{formatCurrency('EUR', collectedValue)}
            </div>
            {stats?.collectedThisMonthSub && (
              <div style={{ fontSize: 12, color: '#828FA3', marginTop: 4 }}>{stats.collectedThisMonthSub}</div>
            )}
          </>
        )}
      </div>

      {/* Pending */}
      <div style={{ borderTop: '1px solid #E3E7EC', paddingTop: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#828FA3', marginBottom: 4 }}>{pendLabel}</div>
        {pendingValue === null ? (
          <SidebarSkeleton />
        ) : (
          <>
            <div className="tabular-nums" style={{ fontSize: 22, fontWeight: 700, color: '#C28800', letterSpacing: '-0.01em', lineHeight: '1.15' }}>
              {formatCurrency('EUR', pendingValue)}
            </div>
            {stats?.pendingSub && (
              <div style={{ fontSize: 12, color: '#828FA3', marginTop: 3 }}>{stats.pendingSub}</div>
            )}
          </>
        )}
      </div>

      {/* Draft count — only shown if > 0 */}
      {draftCount > 0 && (
        <div style={{ borderTop: '1px solid #E3E7EC', paddingTop: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#828FA3', marginBottom: 4 }}>{ui('borradoresLabel')}</div>
          <div className="tabular-nums" style={{ fontSize: 22, fontWeight: 700, color: '#55556D', letterSpacing: '-0.01em', lineHeight: '1.15' }}>
            {draftCount}
          </div>
          <div style={{ fontSize: 12, color: '#828FA3', marginTop: 3 }}>{ui('borradoresSub')}</div>
        </div>
      )}

      {/* By method */}
      {methods.length > 0 && (
        <div style={{ borderTop: '1px solid #E3E7EC', paddingTop: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#19191D', marginBottom: 10 }}>{ui('porMetodo')}</div>
          {methods.map((m) => (
            <div key={m.method || m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: '#55556D' }}>
                <span style={{ color: '#828FA3' }}>{METHOD_ICONS[m.method] || METHOD_ICONS.transfer}</span>
                {m.label || m.method}
              </span>
              <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 500, color: '#828FA3' }}>
                {formatCurrency('EUR', m.amount || 0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * PaymentHeaderTableBase — shared split-layout list for payment-in and payment-out.
 *
 * Renders a 300px stats sidebar on the left and the standard DataTable on the right.
 * Sidebar fetches aggregate stats from /${specName}/header/action/paymentStats (POST),
 * gracefully degrades to skeleton if the endpoint is not yet available.
 *
 * Columns match the bandeja.jsx design: DirBadge · Doc · Date · Contact · Status · Amount.
 *
 * Props:
 *   dir      — "in" | "out"
 *   specName — "payment-in" | "payment-out"
 *   ...rest  — all props forwarded from the generated HeaderPage (apiBaseUrl, onRowClick, etc.)
 */
export default function PaymentHeaderTableBase({ dir, specName, ...props }) {
  const ui = useUI();
  const { apiBaseUrl } = props;
  const isIn = dir === 'in';

  const columns = useMemo(() => [
    {
      key: '_dirBadge',
      type: 'custom',
      label: '',
      render: () => <DirBadge dir={dir} size={34} />,
    },
    {
      key: 'documentNo',
      column: 'DocumentNo',
      type: 'string',
      label: ui('documentNo'),
      render: (row) => (
        <span style={{ fontSize: 13, fontWeight: 600, color: '#19191D', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.01em' }}>
          {row.documentNo || row.id}
        </span>
      ),
    },
    {
      key: 'paymentDate',
      column: 'Paymentdate',
      type: 'date',
      label: ui('date'),
    },
    {
      key: 'businessPartner',
      column: 'C_Bpartner_ID',
      type: 'custom',
      label: ui('businessPartner'),
      render: (row) => {
        const name = row['businessPartner$_identifier'] || row.businessPartner || '—';
        const origin = row.origin === 'concilia' ? ui('originConcilia') : ui('originFactura');
        return (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#19191D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
            <div style={{ fontSize: 11, color: '#828FA3', marginTop: 2 }}>{origin}</div>
          </div>
        );
      },
    },
    {
      key: 'status',
      column: 'Status',
      type: 'custom',
      label: ui('statusLabel'),
      render: (row) => <PaymentStateTag status={row.status || ''} dir={dir} ui={ui} />,
    },
    {
      key: 'amount',
      column: 'Amount',
      type: 'custom',
      label: ui('amount'),
      render: (row) => {
        const n = parseFloat(row.amount ?? 0);
        const curr = row['currency$_identifier'] || 'EUR';
        const isDeposited = PAID_STATUSES.has(row.status || '');
        const color = (isIn && isDeposited) ? '#17663A' : '#19191D';
        return (
          <div className="tabular-nums" style={{ textAlign: 'right', fontSize: 15, fontWeight: 700, color, whiteSpace: 'nowrap' }}>
            {isIn ? '+ ' : '− '}{formatCurrency(curr, n)}
          </div>
        );
      },
    },
  ], [dir, isIn, ui]);

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <PaymentSidebar dir={dir} specName={specName} apiBaseUrl={apiBaseUrl} ui={ui} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <DataTable columns={columns} filters={FILTERS} {...props} />
      </div>
    </div>
  );
}
