import { useUI } from '@/i18n';

const CONFIG = {
  CO:                { color: '#15803d', bg: '#f0fdf4', key: 'fiscalMonitor.status.sii.CO' },
  AE:                { color: '#854d0e', bg: '#fefce8', key: 'fiscalMonitor.status.sii.AE' },
  IN:                { color: '#b91c1c', bg: '#fef2f2', key: 'fiscalMonitor.status.sii.IN' },
  PE:                { color: '#6b7280', bg: '#f9fafb', key: 'fiscalMonitor.status.sii.PE' },
  EE:                { color: '#b91c1c', bg: '#fef2f2', key: 'fiscalMonitor.status.sii.EE' },
  AN:                { color: '#4b5563', bg: '#f3f4f6', key: 'fiscalMonitor.status.sii.AN' },
  Recibido:          { color: '#15803d', bg: '#f0fdf4', key: 'fiscalMonitor.tbai.status.Recibido' },
  Rechazado:         { color: '#b91c1c', bg: '#fef2f2', key: 'fiscalMonitor.tbai.status.Rechazado' },
  Error:             { color: '#b91c1c', bg: '#fef2f2', key: 'fiscalMonitor.tbai.status.Error' },
  Pendiente:         { color: '#6b7280', bg: '#f9fafb', key: 'fiscalMonitor.tbai.status.Pendiente' },
  accepted:          { color: '#15803d', bg: '#f0fdf4', key: 'fiscalMonitor.status.vf.accepted' },
  partiallyAccepted: { color: '#854d0e', bg: '#fefce8', key: 'fiscalMonitor.status.vf.partiallyAccepted' },
  rejected:          { color: '#b91c1c', bg: '#fef2f2', key: 'fiscalMonitor.status.vf.rejected' },
  invalid:           { color: '#b91c1c', bg: '#fef2f2', key: 'fiscalMonitor.status.vf.invalid' },
};

export function FiscalStatusBadge({ status, loading }) {
  const ui = useUI();
  if (loading) {
    return <span style={{ display: 'inline-block', height: 16, width: 52, borderRadius: 8, background: '#e5e7eb', animation: 'pulse 1.5s ease-in-out infinite' }} />;
  }
  if (!status) return <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>;
  const cfg = CONFIG[status];
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 99,
      fontSize: 11,
      fontWeight: 500,
      lineHeight: '18px',
      color: cfg?.color ?? '#6b7280',
      background: cfg?.bg ?? '#f9fafb',
      border: `1px solid ${(cfg?.color ?? '#6b7280')}33`,
      whiteSpace: 'nowrap',
    }}>
      {cfg ? ui(cfg.key) : status}
    </span>
  );
}
