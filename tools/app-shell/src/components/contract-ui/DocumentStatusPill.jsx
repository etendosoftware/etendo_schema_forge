import { useUI, useLocale } from '@/i18n';
import { statusLabel } from '@/lib/statusBadge.js';

const DOC_STATUS = {
  CO: { bg: '#d1fae5', color: '#065f46', dot: '#10b981' },
  DR: { bg: '#f3f4f6', color: '#374151', dot: '#9ca3af' },
  VO: { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
  CL: { bg: '#dbeafe', color: '#1e40af', dot: '#3b82f6' },
  IP: { bg: '#fef3c7', color: '#78350f', dot: '#f59e0b' },
};

export default function DocumentStatusPill({ data }) {
  const ui = useUI();
  const dictionary = useLocale();
  const docStatus = data?.documentStatus;
  if (!docStatus) return null;

  const ds = DOC_STATUS[docStatus] || { bg: '#f3f4f6', color: '#374151', dot: '#9ca3af' };
  const label = statusLabel(docStatus, dictionary);

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[13px] font-medium"
      style={{ padding: '4px 12px', borderRadius: '6px', backgroundColor: ds.bg, color: ds.color }}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ds.dot }} />
      {ui('documentStatus')}
      <span style={{ opacity: 0.4 }}>&middot;</span>
      <span className="font-semibold">{label}</span>
    </span>
  );
}
