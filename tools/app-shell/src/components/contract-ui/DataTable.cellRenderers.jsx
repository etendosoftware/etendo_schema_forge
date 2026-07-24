import { Switch } from '@/components/ui/switch';
import { StatusTag } from '@/components/ui/status-tag';
import { Tag } from '@/components/ui/tag';
import { BoxIcon } from '@/components/ui/box-icon';
import { useNeoImage } from '@/hooks/useNeoImage';
import { formatAmount } from '@/lib/formatAmount.js';
import { formatSignedDelta } from '@/lib/formatSigned.js';
import { resolveColumnLabel } from '@/lib/resolveColumnLabel.js';
import { getStatusDotColor, getStatusTone, statusLabel } from '@/lib/statusBadge.js';

function getDateDotColor(dateValue) {
  if (!dateValue) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const str = String(dateValue);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(str) ? new Date(str + 'T00:00:00') : new Date(str);
  d.setHours(0, 0, 0, 0);
  if (d.getTime() === today.getTime()) return null;
  return d > today ? 'bg-status-success' : 'bg-destructive';
}

function isTruthyBoolean(value) {
  return value === true || value === 'Y' || value === 'true';
}

function isFalsyBoolean(value) {
  return value === false || value === 'N' || value === 'false';
}

function renderBooleanFallback(val, ui) {
  if (isTruthyBoolean(val)) return <span className="text-status-success-foreground">{ui('yes')}</span>;
  if (isFalsyBoolean(val)) return <span className="text-muted-foreground">{ui('no')}</span>;
  return <span className="text-muted-foreground">&mdash;</span>;
}

function renderBooleanBadge(col, val, trueLabel, falseLabel) {
  const trueVariant = col.badgeVariants?.true ?? 'green';
  const falseVariant = col.badgeVariants?.false ?? 'neutral';
  if (isTruthyBoolean(val)) return <Tag variant={trueVariant} label={trueLabel} data-testid="Tag__eb5261" />;
  if (isFalsyBoolean(val)) return <Tag variant={falseVariant} label={falseLabel} data-testid="Tag__eb5261" />;
  return null;
}

function renderColoredBooleanBadge(col, val, trueLabel, falseLabel) {
  const trueColor = col.badgeColors.true ?? 'bg-status-success text-status-success-foreground';
  const falseColor = col.badgeColors.false ?? 'bg-status-warning text-status-warning-foreground';
  if (isTruthyBoolean(val)) return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${trueColor}`}>
      {trueLabel}
    </span>
  );
  if (isFalsyBoolean(val)) return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${falseColor}`}>
      {falseLabel}
    </span>
  );
  return null;
}

function parseDateValue(raw) {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(raw + 'T00:00:00');
  }
  return new Date(raw);
}

function formatDateCellDisplay(row, col, dateFormatter) {
  const raw = row[col.key];
  const parsed = parseDateValue(raw);
  const formatted = parsed && !Number.isNaN(parsed) ? dateFormatter.format(parsed) : '\u2014';
  const dotColor = col.dot === false ? null : getDateDotColor(raw);
  return { formatted, dotColor };
}

function createBadgeLabelResolver(locale) {
  return (raw, fallback) => {
    if (raw && typeof raw === 'object') return raw[locale] ?? raw.en_US ?? fallback;
    return raw ?? fallback;
  };
}

function renderBooleanBadgeCell(locale, col, ui, val) {
  const resolveBadgeLabel = createBadgeLabelResolver(locale);
  const trueLabel = resolveBadgeLabel(col.badgeLabels?.true, ui('statusComplete'));
  const falseLabel = resolveBadgeLabel(col.badgeLabels?.false, ui('statusInProcess'));
  if (col.badgeColors) {
    return renderColoredBooleanBadge(col, val, trueLabel, falseLabel);
  }
  return renderBooleanBadge(col, val, trueLabel, falseLabel);
}

function getPillLabel(pill, row) {
  return pill?.when(row) ? pill.label : null;
}

function isFirstVisibleStringColumn(col, visibleColumns) {
  return col === visibleColumns[0] && col.type === 'string';
}

function getPercentCellPalette(row, col) {
  const val = Number(row[col.key]);
  const pct = Number.isNaN(val) ? 0 : val;
  let color;
  if (pct >= 100) {
    color = 'bg-status-success';
  } else if (pct > 0) {
    color = 'bg-status-warning';
  } else {
    color = 'bg-muted';
  }
  let textColor;
  if (pct >= 100) {
    textColor = 'text-status-success-foreground';
  } else if (pct > 0) {
    textColor = 'text-status-warning-foreground';
  } else {
    textColor = 'text-muted-foreground';
  }
  return { color, pct, textColor };
}

export function renderEnumCell({ rawValue, tMenu, col }) {
  const raw = rawValue;
  const label = tMenu(col.enumLabels?.[raw] ?? raw);
  if (col.display === 'dot') {
    const dotColor = getStatusDotColor(raw);
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
        {label}
      </span>
    );
  }
  if (col.enumVariants) {
    const variant = col.enumVariants[raw] ?? 'neutral';
    return <Tag variant={variant} label={label} data-testid="Tag__eb5261" />;
  }
  return <span>{label}</span>;
}

export function renderStatusCell({ row, col, dictionary, ui }) {
  const raw = row[col.key];
  const label = statusLabel(raw, dictionary, ui, col.enumLabels);
  if (col.display === 'dot') {
    const dotColor = getStatusDotColor(raw);
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
        {label}
      </span>
    );
  }
  return <StatusTag status={raw} label={label} tone={getStatusTone(raw)} data-testid="StatusTag__eb5261" />;
}

export function renderPercentCell({ row, col }) {
  const { color, pct, textColor } = getPercentCellPalette(row, col);
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`text-xs tabular-nums ${textColor}`}>{pct}%</span>
    </div>
  );
}

export function renderBooleanCell({
  rawValue, col, savingToggles, toggleKey, handleInlineToggle, row, locale, t, ui,
}) {
  const val = rawValue;
  if (col.toggle) {
    const checked = isTruthyBoolean(val);
    const disabled = !!savingToggles[toggleKey] || (!isTruthyBoolean(val) && !isFalsyBoolean(val));
    return (
      <div
        className="flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Switch
          checked={checked}
          disabled={disabled}
          onCheckedChange={(nextChecked) => {
            handleInlineToggle(row, col, nextChecked).catch((err) => {
              console.error('Failed to toggle inline boolean cell:', err);
            });
          }}
          aria-label={resolveColumnLabel(col, locale, t)}
          data-testid="Switch__eb5261" />
      </div>
    );
  }
  if (col.badge) {
    const badge = renderBooleanBadgeCell(locale, col, ui, val);
    if (badge) return badge;
  }
  return renderBooleanFallback(val, ui);
}

export function renderDateCell({ row, col, dateFormatter }) {
  const { formatted, dotColor } = formatDateCellDisplay(row, col, dateFormatter);
  return (
    <span className="inline-flex items-center gap-1.5">
      {dotColor && <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${dotColor}`} />}
      {formatted}
    </span>
  );
}

export function renderAmountCell({ row, col }) {
  return <span className="tabular-nums">{formatAmount(row[col.key], row['currency$_identifier'])}</span>;
}

// Mirrors TONE_CLASS in components/ui/money-amount.jsx and the sibling
// InlineLinesPanel ReadCell branch — kept as a single source via
// formatSignedDelta so both grids render identical text/color for the same
// `signedDelta` column type.
const SIGNED_DELTA_TONE_COLOR = {
  positive: 'var(--status-success-fg)',
  negative: 'hsl(var(--destructive))',
  neutral: 'hsl(var(--foreground))',
};

export function renderSignedDeltaCell({ row, col }) {
  const { text, tone } = formatSignedDelta(row[col.key]);
  return (
    <span
      className="block text-right tabular-nums"
      style={{ fontWeight: 600, color: SIGNED_DELTA_TONE_COLOR[tone] }}
    >
      {text}
    </span>
  );
}

/**
 * Built-in `multiField` cell body: bold title + optional subtitle chip +
 * optional authenticated media box. Renders purely from column config — no
 * `render` function needed — and is pixel-identical to the legacy Product
 * identity cell (`ProductNameCell`). Kept as a component (not an inline render)
 * so `useNeoImage` is a valid hook call.
 *
 * Config consumed: `col.title` (row field → bold title), `col.subtitle` (row
 * field → chip, only when present), `col.media` (`{ field, kind: 'neoImage',
 * fallback: 'box' }`, optional). The hook runs unconditionally with a possibly
 * undefined id (no media → no fetch) to keep the hook order stable.
 */
export function MultiFieldCell({ row, col, token, apiBaseUrl }) {
  const media = col.media;
  const imageId = media?.kind === 'neoImage' ? row[media.field] : undefined;
  const imgSrc = useNeoImage(imageId, token, apiBaseUrl);
  const titleValue = row[col.title];
  const subtitleValue = col.subtitle ? row[col.subtitle] : undefined;

  return (
    <div className="flex items-center gap-3">
      {media && (
        <div className="w-10 h-10 rounded-lg bg-[#F5F7F9] flex items-center justify-center overflow-hidden flex-shrink-0">
          {imgSrc
            ? <img src={imgSrc} alt={titleValue} className="w-full h-full object-cover" />
            : <BoxIcon data-testid="BoxIcon__fed565" />
          }
        </div>
      )}
      <div className="flex flex-col justify-center gap-0.5">
        <span className="text-sm font-semibold text-[#121217] leading-5">{titleValue}</span>
        {subtitleValue && (
          <span className="inline-flex items-center px-2 py-0.5 bg-[#F5F7F9] rounded-full text-xs text-[#3F3F50] leading-4 w-fit">
            {subtitleValue}
          </span>
        )}
      </div>
    </div>
  );
}

export function renderMultiFieldCell({ row, col, token, apiBaseUrl }) {
  return (
    <MultiFieldCell
      row={row}
      col={col}
      token={token}
      apiBaseUrl={apiBaseUrl}
      data-testid="MultiFieldCell__a91437" />
  );
}

export function renderDefaultCell({ row, col, display, visibleColumns }) {
  if (isFirstVisibleStringColumn(col, visibleColumns)) {
    const pill = col.pill;
    const pillLabel = getPillLabel(pill, row);
    return (
      <span className="inline-flex items-center gap-2">
        <span>{display}</span>
        {pillLabel && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${pill.className || 'bg-muted text-muted-foreground border-border-subtle'}`} style={{ borderWidth: '0.5px' }}>
            {pillLabel}
          </span>
        )}
      </span>
    );
  }
  const val = display;
  if (typeof val === 'string' && val.length > 30) {
    return <span className="block max-w-[200px] truncate" title={val}>{val}</span>;
  }
  return val;
}

export const CELL_RENDERERS = {
  enum: renderEnumCell,
  status: renderStatusCell,
  percent: renderPercentCell,
  boolean: renderBooleanCell,
  date: renderDateCell,
  amount: renderAmountCell,
  signedDelta: renderSignedDeltaCell,
  multiField: renderMultiFieldCell,
  default: renderDefaultCell,
};
