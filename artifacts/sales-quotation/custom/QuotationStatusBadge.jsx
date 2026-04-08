const STATUS_CONFIG = {
  DR: { label: 'Draft', dot: '#9CA3AF', bg: '#F3F4F6', text: '#6B7280', border: '#E5E7EB' },
  UE: { label: 'Under Evaluation', dot: '#F59E0B', bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
  CO: { label: 'Confirmed', dot: '#10B981', bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' },
  CA: { label: 'Converted', dot: '#3B82F6', bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  VO: { label: 'Voided', dot: '#EF4444', bg: '#FEE2E2', text: '#DC2626', border: '#FECACA' },
};

export default function QuotationStatusBadge({ data }) {
  const status = data?.documentStatus;
  if (!status) return null;
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return null;

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 99,
      background: cfg.bg, color: cfg.text, border: `0.5px solid ${cfg.border}`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0,
      }} />
      {cfg.label}
    </span>
  );
}
