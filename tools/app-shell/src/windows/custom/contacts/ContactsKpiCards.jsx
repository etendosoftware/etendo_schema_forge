import { Users } from 'lucide-react';
import { useLocale } from '@/i18n';

function KpiCard({ title, value, icon: Icon, loading }) {
  return (
    <div className="flex-1 rounded-xl border border-border bg-card px-5 py-4 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground font-medium truncate">{title}</span>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
      </div>
      {loading ? (
        <div className="h-7 w-16 rounded bg-muted animate-pulse" />
      ) : (
        <span className="text-2xl font-semibold text-foreground">{value ?? '—'}</span>
      )}
    </div>
  );
}

export default function ContactsKpiCards({ items = [], loading = false }) {
  const dictionary = useLocale();
  const gl = dictionary?.genericLabels || {};
  const t = (key) => gl[key] || key;

  const total = items.length;
  const customerCount = items.filter(i => i.customer === true || i.customer === 'Y').length;
  const vendorCount = items.filter(i => i.vendor === true || i.vendor === 'Y').length;

  return (
    <div className="flex gap-4 mb-4">
      <KpiCard title={t('totalContacts')} value={total || null} icon={Users} loading={loading} />
      <KpiCard title={t('customers')} value={customerCount || null} loading={loading} />
      <KpiCard title={t('vendors')} value={vendorCount || null} loading={loading} />
    </div>
  );
}
