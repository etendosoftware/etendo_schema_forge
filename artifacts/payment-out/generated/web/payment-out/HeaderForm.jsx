import { useState, useEffect } from 'react';

/* eslint-disable react/prop-types */

const DEPOSITED = new Set(['RPR', 'RPPC', 'RDNC', 'PPM']);
const DET_COLS = '1.8fr 1fr 1fr 1fr';

function fmtAmt(val) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  const abs = Math.abs(n).toFixed(2).split('.');
  abs[0] = abs[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-' : '') + abs[0] + ',' + abs[1] + ' €';
}

function fmtDate(raw) {
  if (!raw) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(raw);
}

const METHOD_ICONS = {
  transfer: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h18M3 7l4-4M3 7l4 4M21 17H3M21 17l-4-4M21 17l-4 4"/></svg>,
  card:     <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>,
  cash:     <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>,
  direct:   <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4v16M4 8h12a3 3 0 0 1 0 6H4M14 14l4 4M14 14l4-4"/></svg>,
};

function resolveMethodKey(name) {
  const s = (name || '').toLowerCase();
  if (s.includes('transferencia') || s.includes('transfer')) return 'transfer';
  if (s.includes('tarjeta') || s.includes('card')) return 'card';
  if (s.includes('efectivo') || s.includes('cash')) return 'cash';
  if (s.includes('domiciliac') || s.includes('direct')) return 'direct';
  return 'transfer';
}

function Card({ title, desc, children }) {
  return (
    <div style={{ border: '1px solid #E3E7EC', borderRadius: 12, background: '#fff' }}>
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ font: '600 15px/20px Inter', color: '#19191D' }}>{title}</div>
        {desc && <div style={{ font: '400 13px/18px Inter', color: '#828FA3', marginTop: 2 }}>{desc}</div>}
      </div>
      <div style={{ padding: '14px 16px 16px' }}>{children}</div>
    </div>
  );
}

function KV({ label, children, span = 6, mono }) {
  return (
    <div style={{ gridColumn: `span ${span}`, minWidth: 0 }}>
      <div style={{ font: '500 12px/16px Inter', color: '#828FA3', marginBottom: 4 }}>{label}</div>
      <div style={{ font: `500 14px/20px ${mono ? 'JetBrains Mono, monospace' : 'Inter'}`, color: '#19191D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {children || <span style={{ color: '#A9A9BC' }}>—</span>}
      </div>
    </div>
  );
}

function GeneralFields({ data }) {
  const methodRaw = data?.['paymentMethod$_identifier'] || '';
  const methodKey = resolveMethodKey(methodRaw);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: '16px 18px' }}>
      <KV label="Nº documento" span={3} mono>{data?.documentNo}</KV>
      <KV label="Proveedor" span={6}>{data?.['businessPartner$_identifier']}</KV>
      <KV label="Fecha" span={3} mono>{fmtDate(data?.paymentDate)}</KV>
      <KV label="Método" span={4}>
        {methodRaw && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <span style={{ color: '#828FA3' }}>{METHOD_ICONS[methodKey]}</span>
            {methodRaw}
          </span>
        )}
      </KV>
      <KV label="Pagar desde" span={5}>{data?.['account$_identifier']}</KV>
      <KV label="Moneda" span={3}>{data?.['currency$_identifier'] || 'EUR'}</KV>
      <KV label="Referencia" span={7}>{data?.referenceNo}</KV>
    </div>
  );
}

function LinesTable({ data, token, apiBaseUrl }) {
  const [lines, setLines] = useState(null);
  const totalPayment = parseFloat(data?.amount ?? 0);

  useEffect(() => {
    if (!data?.id || !token || !apiBaseUrl) return;
    const base = (apiBaseUrl || '').replace(/\/[^/]+$/, '');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    (async () => {
      try {
        const res = await fetch(`${base}/payment-out/lines?parentId=${data.id}&_startRow=0&_endRow=100`, { headers });
        if (!res.ok) { setLines([]); return; }
        const rows = (await res.json())?.response?.data || [];
        setLines(rows);
      } catch { setLines([]); }
    })();
  }, [data?.id, token, apiBaseUrl]);

  if (!data?.id) {
    return <div style={{ padding: '12px 0', color: '#828FA3', font: '400 13px/18px Inter' }}>Sin líneas de pago.</div>;
  }
  if (lines === null) {
    return <div style={{ padding: '16px 0', color: '#828FA3', font: '400 13px/18px Inter' }}>Cargando...</div>;
  }
  if (lines.length === 0) {
    return <div style={{ padding: '12px 0', color: '#828FA3', font: '400 13px/18px Inter' }}>Sin líneas de pago.</div>;
  }

  const totalApplied = lines.filter(r => r.invoicePaymentSchedule).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const remaining = Math.max(0, totalPayment - totalApplied);

  return (
    <div style={{ border: '1px solid #E3E7EC', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: DET_COLS, gap: 12, padding: '10px 14px', background: '#FCFCFD', borderBottom: '1px solid #E3E7EC' }}>
        {['Factura', 'Importe', 'Aplicado', 'Pendiente'].map((h, i) => (
          <div key={i} style={{ font: '500 12px/16px Inter', color: '#828FA3', textAlign: i >= 1 ? 'right' : 'left' }}>{h}</div>
        ))}
      </div>
      {lines.map((row, i) => {
        const applied = parseFloat(row.amount) || 0;
        const invoiceTotal = parseFloat(row.invoiceAmount) || 0;
        const docDisplay = row.invoiceNo || `Línea ${i + 1}`;
        const subText = `FC · ${fmtDate(row.dueDate)}`;
        const pendingAmt = Math.max(0, invoiceTotal - applied);
        return (
          <div key={row.id || i} style={{ display: 'grid', gridTemplateColumns: DET_COLS, gap: 12, padding: '13px 14px', borderBottom: i < lines.length - 1 ? '1px solid #E3E7EC' : 'none', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#828FA3" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <div style={{ minWidth: 0 }}>
                <div style={{ font: '600 13px/17px JetBrains Mono, monospace', color: '#19191D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{docDisplay}</div>
                {subText && <div style={{ font: '400 11px/15px Inter', color: '#828FA3', marginTop: 1 }}>{subText}</div>}
              </div>
            </div>
            <div style={{ textAlign: 'right', font: '500 14px/19px Inter', color: '#55556D', fontVariantNumeric: 'tabular-nums' }}>{invoiceTotal > 0 ? fmtAmt(invoiceTotal) : '—'}</div>
            <div style={{ textAlign: 'right', font: '600 14px/19px Inter', color: '#19191D', fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(applied)}</div>
            <div style={{ textAlign: 'right', font: '500 14px/19px Inter', color: '#828FA3', fontVariantNumeric: 'tabular-nums' }}>{invoiceTotal > 0 ? fmtAmt(pendingAmt) : '—'}</div>
          </div>
        );
      })}
      <div style={{ display: 'grid', gridTemplateColumns: DET_COLS, gap: 12, padding: '12px 14px', background: '#FCFCFD', borderTop: '1px solid #E3E7EC', alignItems: 'center' }}>
        <div style={{ font: '600 13px/18px Inter', color: '#19191D' }}>Total aplicado</div>
        <div style={{ textAlign: 'right', font: '500 13px/18px Inter', color: '#828FA3', fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(totalPayment)}</div>
        <div style={{ textAlign: 'right', font: '700 14px/19px Inter', color: '#19191D', fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(totalApplied)}</div>
        <div style={{ textAlign: 'right', font: '500 13px/18px Inter', color: '#828FA3', fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(remaining)}</div>
      </div>
    </div>
  );
}

// @sf-generated-start component:HeaderForm
export default function HeaderForm({ data, token, apiBaseUrl, section, ...props }) {
  if (section === 'other') return null;
  const isDraft = !DEPOSITED.has(data?.status || '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: '#FAFAFB', minHeight: '100%', padding: '18px 24px' }}>
      {isDraft && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '10px 14px', background: '#FFF9EB', borderRadius: 8, border: '1px solid #F2E2BC' }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#A37700" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span style={{ font: '500 12px/16px Inter', color: '#8A6E25' }}>Borrador — sin efecto sobre la cuenta financiera. Al confirmar, el importe se paga de inmediato y se reduce el saldo de la factura.</span>
        </div>
      )}
      <Card title="Datos del pago">
        <GeneralFields data={data} />
      </Card>
      <Card title="Líneas del pago" desc="Facturas de compra saldadas con este pago.">
        <LinesTable data={data} token={token} apiBaseUrl={apiBaseUrl} />
      </Card>
    </div>
  );
}
HeaderForm.hasCollapsedFields = false;
// @sf-generated-end component:HeaderForm
