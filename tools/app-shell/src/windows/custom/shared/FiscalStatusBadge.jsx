import { useUI } from '@/i18n';

const CONFIG = {
  CO:                { tone: 'success', key: 'fiscalMonitor.status.sii.CO' },
  AE:                { tone: 'warning', key: 'fiscalMonitor.status.sii.AE' },
  IN:                { tone: 'destructive', key: 'fiscalMonitor.status.sii.IN' },
  PE:                { tone: 'neutral', key: 'fiscalMonitor.status.sii.PE' },
  EE:                { tone: 'destructive', key: 'fiscalMonitor.status.sii.EE' },
  AN:                { tone: 'neutral', key: 'fiscalMonitor.status.sii.AN' },
  BA:                { tone: 'neutral', key: 'fiscalMonitor.status.sii.BA' },
  NR:                { tone: 'neutral', key: 'fiscalMonitor.status.sii.NR' },
  Recibido:          { tone: 'success', key: 'fiscalMonitor.tbai.status.Recibido' },
  // ETP-5087: "Enviada" is the ONLY thing the `EM_Tbai_Issent` boolean proves —
  // the invoice was submitted. It is deliberately NOT mapped to `Recibido`,
  // which means "accepted by the Diputación" and is a stronger claim the flag
  // cannot back. Tone stays `success` (the send succeeded) but the wording does
  // not promise acceptance.
  Enviada:           { tone: 'success', key: 'fiscalMonitor.tbai.status.Enviada' },
  Rechazado:         { tone: 'destructive', key: 'fiscalMonitor.tbai.status.Rechazado' },
  Error:             { tone: 'destructive', key: 'fiscalMonitor.tbai.status.Error' },
  Pendiente:         { tone: 'neutral', key: 'fiscalMonitor.tbai.status.Pendiente' },
  accepted:          { tone: 'success', key: 'fiscalMonitor.status.vf.accepted' },
  partiallyAccepted: { tone: 'warning', key: 'fiscalMonitor.status.vf.partiallyAccepted' },
  rejected:          { tone: 'destructive', key: 'fiscalMonitor.status.vf.rejected' },
  invalid:           { tone: 'destructive', key: 'fiscalMonitor.status.vf.invalid' },
  vf_pending:        { tone: 'neutral', key: 'fiscalMonitor.status.vf.pending' },
};

const TONE_STYLE = {
  success: { color: 'var(--status-success-fg)', background: 'var(--status-success-bg)', borderColor: 'var(--status-success-border)' },
  warning: { color: 'var(--status-warning-fg)', background: 'var(--status-warning-bg)', borderColor: 'var(--status-warning-border)' },
  destructive: { color: 'var(--status-destructive-fg)', background: 'var(--status-destructive-bg)', borderColor: 'hsl(var(--destructive))' },
  neutral: { color: 'var(--status-neutral-fg)', background: 'var(--status-neutral-bg)', borderColor: 'var(--status-neutral-border)' },
};

// Maps raw em_etvfac_invoice_status short codes → badge CONFIG keys.
// Passes through any value not in the map (e.g. already-normalised strings).
const VF_CODE_MAP = {
  AC: 'accepted',
  AE: 'partiallyAccepted',
  ER: 'rejected',
  IN: 'invalid',
  PE: 'vf_pending',
};

export function normalizeVerifactuStatus(raw) {
  if (!raw) return raw;
  return VF_CODE_MAP[raw] ?? raw;
}

export function FiscalStatusBadge({ status, loading }) {
  const ui = useUI();
  if (loading) {
    return <span style={{ display: 'inline-block', height: 16, width: 52, borderRadius: 8, background: 'hsl(var(--muted))', animation: 'pulse 1.5s ease-in-out infinite' }} />;
  }
  if (!status) return <span style={{ color: 'hsl(var(--text-disabled))', fontSize: 12 }}>—</span>;
  const cfg = CONFIG[status];
  const tone = TONE_STYLE[cfg?.tone ?? 'neutral'];
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 99,
      fontSize: 11,
      fontWeight: 500,
      lineHeight: '18px',
      color: tone.color,
      background: tone.background,
      border: `1px solid ${tone.borderColor}`,
      whiteSpace: 'nowrap',
    }}>
      {cfg ? ui(cfg.key) : status}
    </span>
  );
}
