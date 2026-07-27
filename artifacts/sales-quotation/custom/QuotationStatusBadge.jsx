import { useUI } from '@/i18n';

const STATUS_CONFIG = {
  DR:      { key: 'statusDraft',           dot: 'var(--status-neutral-fg)', bg: 'var(--status-neutral-bg)', text: 'var(--status-neutral-fg)', border: 'var(--status-neutral-border)' },
  UE:      { key: 'statusUnderEvaluation', dot: 'var(--status-warning-fg)', bg: 'var(--status-warning-bg)', text: 'var(--status-warning-fg)', border: 'var(--status-warning-border)' },
  CO:      { key: 'statusComplete',        dot: 'var(--status-success-fg)', bg: 'var(--status-success-bg)', text: 'var(--status-success-fg)', border: 'var(--status-success-border)' },
  CA:      { key: 'statusOrderCreated',    dot: 'var(--status-success-fg)', bg: 'var(--status-success-bg)', text: 'var(--status-success-fg)', border: 'var(--status-success-border)' },
  ETGO_CI: { key: 'statusInvoiceCreated',  dot: 'var(--status-success-fg)', bg: 'var(--status-success-bg)', text: 'var(--status-success-fg)', border: 'var(--status-success-border)' },
  CL:      { key: 'statusClosed',          dot: 'var(--status-neutral-fg)', bg: 'var(--status-neutral-bg)', text: 'var(--status-neutral-fg)', border: 'var(--status-neutral-border)' },
  CJ:      { key: 'statusRejected',        dot: 'hsl(var(--destructive))', bg: 'hsl(var(--destructive) / 0.12)', text: 'hsl(var(--destructive))', border: 'hsl(var(--destructive) / 0.35)' },
  VO:      { key: 'statusVoid',            dot: 'hsl(var(--destructive))', bg: 'hsl(var(--destructive) / 0.12)', text: 'hsl(var(--destructive))', border: 'hsl(var(--destructive) / 0.35)' },
};

export default function QuotationStatusBadge({ data }) {
  const ui = useUI();
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
      {ui(cfg.key)}
    </span>
  );
}
