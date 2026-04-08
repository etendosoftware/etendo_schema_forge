import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const STATUS_LABELS = {
  CO: 'Completed', DR: 'Draft', VO: 'Voided', CL: 'Closed',
};

const STATUS_BADGE = {
  CO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CL: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  DR: 'bg-gray-50 text-gray-600 border-gray-200',
  VO: 'bg-red-50 text-red-700 border-red-200',
};

const CHIP_ICONS = {
  shipment: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="3" width="22" height="5" rx="1" />
      <path d="M1 8l2 13h18l2-13" />
    </svg>
  ),
  invoice: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" />
    </svg>
  ),
};

function neoBase(apiBaseUrl) {
  return (apiBaseUrl || '').replace(/\/[^/]+$/, '');
}

function formatAmount(val, currency) {
  if (val == null) return '';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  const formatted = num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${formatted} ${currency}` : formatted;
}

function DocChip({ icon, iconColor, title, amount, currency, status, onClick }) {
  const badgeClass = STATUS_BADGE[status] || 'bg-gray-50 text-gray-600 border-gray-200';
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 border border-border/40 rounded-full bg-white text-sm ${onClick ? 'hover:bg-muted/30 cursor-pointer' : ''} transition-colors`}
      style={{ borderWidth: '0.5px' }}
    >
      <span className={`shrink-0 ${iconColor}`}>{icon}</span>
      <span className="font-medium text-foreground/80">{title}</span>
      {amount != null && (
        <span className="text-xs text-muted-foreground tabular-nums">{formatAmount(amount, currency)}</span>
      )}
      {status && (
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${badgeClass}`} style={{ borderWidth: '0.5px' }}>
          {STATUS_LABELS[status] || status}
        </span>
      )}
    </Tag>
  );
}

export default function RelatedDocuments({ recordId, data, token, apiBaseUrl }) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!recordId) { setLoading(false); return; }
    const base = neoBase(apiBaseUrl);
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    // Step 1: Fetch return order lines to get goodsShipmentLine (M_Inoutline_ID) references
    fetch(`${base}/return-from-customer/customerReturnLine?parentId=${recordId}&_limit=50`, { headers })
      .then(r => r.ok ? r.json() : { response: { data: [] } })
      .then(async (j) => {
        const lines = j.response?.data || [];

        // Collect unique shipment line IDs
        const seen = new Set();
        const shipmentLineIds = [];
        for (const l of lines) {
          const slId = l.goodsShipmentLine;
          if (slId && !seen.has(slId)) {
            seen.add(slId);
            shipmentLineIds.push(slId);
          }
        }

        if (shipmentLineIds.length === 0) { setLoading(false); return; }

        // Step 2: For each shipment line, fetch it to get the parent shipment ID
        // The shipment line has a shipmentReceipt (M_InOut_ID) field
        const shipmentIds = new Set();
        await Promise.all(shipmentLineIds.map(async (lineId) => {
          try {
            const r = await fetch(`${base}/goods-shipment/goodsShipmentLine/${lineId}`, { headers });
            if (!r.ok) return;
            const d = await r.json();
            const sl = d.response?.data?.[0];
            if (sl?.shipmentReceipt) shipmentIds.add(sl.shipmentReceipt);
          } catch {}
        }));

        if (shipmentIds.size === 0) { setLoading(false); return; }

        // Step 3: Fetch each unique shipment
        const results = await Promise.all([...shipmentIds].map(async (shipId) => {
          try {
            const r = await fetch(`${base}/goods-shipment/goodsShipment/${shipId}`, { headers });
            if (!r.ok) return null;
            const d = await r.json();
            return d.response?.data?.[0] || null;
          } catch { return null; }
        }));

        setShipments(results.filter(Boolean));
        setLoading(false);
      })
      .catch(() => { setShipments([]); setLoading(false); });
  }, [recordId, token, apiBaseUrl]);

  if (loading) return <span className="text-xs text-muted-foreground">Loading...</span>;

  const chips = [];

  for (const s of shipments) {
    chips.push(
      <DocChip
        key={`ship-${s.id}`}
        icon={CHIP_ICONS.shipment}
        iconColor="text-blue-600"
        title={`Shipment #${s.documentNo}`}
        status={s.documentStatus}
        onClick={() => navigate(`/goods-shipment/${s.id}`)}
      />
    );
  }

  // Credit notes: pending backend — when the return generates a credit note,
  // the invoice will have C_Order_ID pointing to this return order.
  // To show it here, search invoices with salesOrder = recordId.
  // Currently no credit notes are linked to returns in the DB.

  if (chips.length === 0) {
    return <span className="text-xs text-muted-foreground/50">No related documents</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips}
    </div>
  );
}
