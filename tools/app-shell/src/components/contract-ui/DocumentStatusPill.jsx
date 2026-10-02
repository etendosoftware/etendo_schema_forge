import { Clock, Check, X } from 'lucide-react';
import { useLocale } from '@/i18n';
import { getStatusTone, statusLabel } from '@/lib/statusBadge.js';
import { TONE_STYLES } from '@/components/ui/status-tag-tokens.js';

const TONE_ICON = {
  success: Check,
  warning: Clock,
  destructive: X,
  neutral: null,
};

const TONE_ICON_COLOR = {
  success: 'var(--status-success-fg)',
  warning: 'var(--status-warning-fg)',
  destructive: 'hsl(var(--destructive))',
  neutral: 'hsl(var(--muted-foreground))',
};

const PILL_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 8px',
  borderRadius: '8px',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: '14px',
  lineHeight: '20px',
  fontWeight: 400,
  whiteSpace: 'nowrap',
  letterSpacing: '-0.01em',
};

const LABEL_STYLE = { padding: '0 4px' };

/**
 * Status pill with tone-driven colors and an optional tone icon.
 *
 * Props:
 * - status: raw status value; nothing renders when null/undefined.
 * - label: explicit text; otherwise resolved via statusLabel(status, dictionary, null, enumLabels).
 * - enumLabels: optional enum-to-label map passed to statusLabel.
 * - tone: overrides getStatusTone(status); one of success | warning | destructive | neutral.
 * - prefix: optional bold "prefix:" rendered before the text.
 * - hint: tooltip (title attribute).
 * - testId (default "document-status-pill"): overrides data-testid for callers that must keep a legacy id.
 * - showIcon (default true): set to false to keep the tone colors but render no icon
 *   (e.g. progress badges such as Delivered/Received/Invoiced %).
 *
 * The root span exposes data-status, data-tone and data-show-icon for tests.
 */
export default function DocumentStatusPill({ status, label, enumLabels, tone: toneProp, prefix, hint, showIcon = true, testId = 'document-status-pill' }) {
  const dictionary = useLocale();
  if (status == null) return null;

  const tone = toneProp ?? getStatusTone(status);
  const Icon = TONE_ICON[tone];
  const text = label ?? statusLabel(status, dictionary, null, enumLabels);
  const palette = TONE_STYLES[tone] ?? TONE_STYLES.neutral;

  return (
    <span
      data-testid={testId}
      data-status={status}
      data-tone={tone}
      data-show-icon={showIcon ? 'true' : 'false'}
      title={hint || undefined}
      style={{ ...PILL_STYLE, background: palette.background, color: palette.color }}
    >
      {showIcon && Icon ? <Icon
        size={16}
        color={TONE_ICON_COLOR[tone]}
        aria-hidden="true"
        data-testid="Icon__1e4f01" /> : null}
      <span style={LABEL_STYLE}>
        {prefix ? <><strong style={{ fontWeight: 600 }}>{prefix}:</strong>{' '}</> : null}{text}
      </span>
    </span>
  );
}
