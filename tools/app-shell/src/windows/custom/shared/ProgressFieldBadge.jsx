import { getProgressTone } from '@/lib/progressTone';
import DocumentStatusPill from '@/components/contract-ui/DocumentStatusPill';

/**
 * Header progress badge backed by a 0..100 percentage field (delivered, received,
 * invoiced). Shown only when the document is completed (documentStatus === 'CO'), like the order
 * windows; when completed it renders even at 0% (neutral tone). A missing value
 * (null/undefined/non-numeric) hides it. With `showWhenPositive`, a non-completed
 * document (e.g. a draft) also shows the badge when the percentage is > 0 (used by the
 * goods receipt / shipment windows); default false. Shared by the per-window topbarExtra wrappers.
 */
export default function ProgressFieldBadge({ value, label, testId, documentStatus, showWhenPositive = false }) {
  if (value == null || value === '') return null;
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  const percent = Math.round(Math.max(0, Math.min(100, raw)));
  if (documentStatus !== 'CO' && !(showWhenPositive && percent > 0)) return null;

  return (
    <DocumentStatusPill
      status={percent}
      tone={getProgressTone(percent / 100)}
      showIcon={false}
      label={`${label} ${percent}%`}
      testId={testId}
    />
  );
}
