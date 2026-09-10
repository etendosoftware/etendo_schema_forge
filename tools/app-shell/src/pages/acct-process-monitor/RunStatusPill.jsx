import { useUI } from '@/i18n';
import { statusMeta } from './useAcctProcessMonitor.js';

/**
 * ETP-5269 — renders an `AD_PROCESS_RUN.STATUS` code as a human-readable, tone-coded pill.
 *
 * Modelled on `AccessTierPill`: the `status-*` semantic Tailwind utilities (backed by the
 * `--status-*` custom properties, which carry their own dark-mode variants), never a raw green or
 * amber. The error tone uses `destructive`, because the preset defines no `status-error`.
 *
 * An unmapped code falls back to the neutral tone and shows the raw code rather than rendering
 * nothing — a status core adds later stays legible instead of silently disappearing.
 */

const TONE_CLASSES = Object.freeze({
  success: 'border-status-success-border bg-status-success text-status-success-foreground',
  warning: 'border-status-warning-border bg-status-warning text-status-warning-foreground',
  info: 'border-status-info-border bg-status-info text-status-info-foreground',
  neutral: 'border-status-neutral-border bg-status-neutral text-status-neutral-foreground',
  error: 'border-destructive/40 bg-destructive/10 text-destructive',
});

export default function RunStatusPill({ status, 'data-testid': dataTestId }) {
  const ui = useUI();
  const { tone, labelKey } = statusMeta(status);
  const label = labelKey ? ui(labelKey) : status;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
      data-status={status}
      data-tone={tone}
      data-testid={dataTestId ?? `RunStatusPill__${status}`}
    >
      {label}
    </span>
  );
}
