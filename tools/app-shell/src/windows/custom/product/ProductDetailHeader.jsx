import { useState, useEffect } from 'react';
import { Boxes, Lock } from 'lucide-react';

function StatCard({ icon: Icon, label, value, color = 'blue' }) {
  const colorMap = {
    blue:  { bg: 'bg-blue-50',   text: 'text-blue-700',   icon: 'text-blue-400'  },
    amber: { bg: 'bg-amber-50',  text: 'text-amber-700',  icon: 'text-amber-400' },
  };
  const c = colorMap[color] ?? colorMap.blue;

  return (
    <div className={`flex items-center gap-3 ${c.bg} rounded-lg px-4 py-2.5 min-w-[110px]`}>
      <Icon size={18} className={c.icon} />
      <div>
        <div className={`text-lg font-semibold leading-tight ${c.text}`}>
          {value === null ? <span className="text-gray-300">—</span> : value}
        </div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );
}

export default function ProductDetailHeader({ recordId, token, apiBaseUrl }) {
  const [stockRows, setStockRows] = useState(null);
  useEffect(() => {
    if (!recordId || !token) return;
    fetch(`${apiBaseUrl}/storageDetail?parentId=${recordId}&_startRow=0&_endRow=200`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((stock) => setStockRows(stock?.response?.data ?? []))
      .catch(() => setStockRows([]));
  }, [recordId, token, apiBaseUrl]);

  const onHand = stockRows?.reduce((s, r) => s + (Number(r.quantityOnHand) || 0), 0) ?? null;
  const reserved = stockRows?.reduce((s, r) => s + (Number(r.reservedQty) || 0), 0) ?? null;

  const binCount = stockRows ? new Set(stockRows.map((r) => r.storageBin ?? r.id)).size : 0;

  return (
    <div className="flex flex-wrap gap-3 pt-4 pb-3 mb-2 border-b border-gray-100">
      <StatCard
        icon={Boxes}
        label={binCount > 1 ? `On Hand (${binCount} bins)` : 'On Hand'}
        value={onHand !== null ? onHand.toLocaleString() : null}
        color="blue"
      />
      <StatCard
        icon={Lock}
        label="Reserved"
        value={reserved !== null ? reserved.toLocaleString() : null}
        color="amber"
      />
    </div>
  );
}
