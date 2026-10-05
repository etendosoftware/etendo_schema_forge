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
 * - icon: optional React node rendered in place of the tone icon, left of the label with the
 *   same spacing. When provided it wins over the tone icon and `showIcon`. Omitted -> output
 *   is exactly the tone-icon behaviour above.
 *
 * The root span exposes data-status, data-tone, data-show-icon and, only with a custom `icon`,
 * data-has-icon="true". data-show-icon keeps reporting the `showIcon` prop alone (the TONE icon
 * switch), so existing consumers/tests that assert it are unaffected; data-has-icon flags the
 * custom icon separately.
 */
export default function DocumentStatusPill({ status, label, enumLabels, tone: toneProp, prefix, hint, showIcon = true, icon, testId = 'document-status-pill' }) {
  const dictionary = useLocale();
  if (status == null) return null;

  const tone = toneProp ?? getStatusTone(status);
  const Icon = TONE_ICON[tone];
  const text = label ?? statusLabel(status, dictionary, null, enumLabels);
  const palette = TONE_STYLES[tone] ?? TONE_STYLES.neutral;
  const hasIcon = icon != null;

  return (
    <span
      data-testid={testId}
      data-status={status}
      data-tone={tone}
      data-show-icon={showIcon ? 'true' : 'false'}
      data-has-icon={hasIcon ? 'true' : undefined}
      title={hint || undefined}
      style={{ ...PILL_STYLE, background: palette.background, color: palette.color }}
    >
      {hasIcon ? icon : null}
      {!hasIcon && showIcon && Icon ? <Icon
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
