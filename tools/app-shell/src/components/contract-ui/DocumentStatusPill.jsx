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
  success: '#17663A',
  warning: '#C28800',
  destructive: '#D50B3E',
  neutral: '#3F3F50',
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
};

const LABEL_STYLE = { padding: '0 4px' };

export default function DocumentStatusPill({ status, label, enumLabels, tone: toneProp }) {
  const dictionary = useLocale();
  if (status == null) return null;

  const tone = toneProp ?? getStatusTone(status);
  const Icon = TONE_ICON[tone];
  const text = label ?? statusLabel(status, dictionary, null, enumLabels);
  const palette = TONE_STYLES[tone] ?? TONE_STYLES.neutral;

  return (
    <span
      data-testid="document-status-pill"
      data-status={status}
      data-tone={tone}
      style={{ ...PILL_STYLE, background: palette.background, color: palette.color }}
    >
      {Icon ? <Icon
        size={16}
        color={TONE_ICON_COLOR[tone]}
        aria-hidden="true"
        data-testid="Icon__1e4f01" /> : null}
      <span style={LABEL_STYLE}>{text}</span>
    </span>
  );
}
