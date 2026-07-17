import { cn } from '@/lib/utils';

/**
 * Formats a monetary value with locale-aware number formatting.
 *
 * Props:
 *   value    — number
 *   currency — ISO currency code, e.g. 'EUR'
 *   tone     — 'auto' | 'positive' | 'negative' | 'neutral'
 *              'auto': positive if value >= 0, negative if value < 0
 *   compact  — boolean, uses compact notation (e.g. 12,5K)
 *   className — extra classes passed to the span
 *
 * Examples:
 *   <MoneyAmount value={12450} currency="EUR" />   → "+12.450,00 €"
 *   <MoneyAmount value={-200} currency="EUR" />    → "-200,00 €"
 */

const TONE_CLASS = {
  positive: 'text-[var(--status-success-fg)]',
  negative: 'text-[hsl(var(--destructive))]',
  neutral:  'text-[hsl(var(--foreground))]',
};

function resolveTone(tone, value) {
  if (tone !== 'auto') return tone;
  return value >= 0 ? 'positive' : 'negative';
}

/** @param {{ value: number; currency: string; tone?: 'auto'|'positive'|'negative'|'neutral'; compact?: boolean; className?: string }} props */
export function MoneyAmount({ value, currency = 'EUR', tone = 'auto', compact = false, className }) {
  const resolvedTone = resolveTone(tone, value);
  const colorClass = TONE_CLASS[resolvedTone] ?? TONE_CLASS.neutral;

  const absValue = Math.abs(value);
  const formatted = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    notation: compact ? 'compact' : 'standard',
    // Explicit: the 'auto' default silently drops thousand separators for
    // style:'currency' in some Intl implementations (e.g. Node's V8), so
    // amounts over 999 render as "2345,00 €" instead of "2.345,00 €".
    useGrouping: true,
  }).format(absValue);

  let prefix = '';
  if (resolvedTone === 'positive' && value > 0) prefix = '+';
  else if (resolvedTone === 'negative' || value < 0) prefix = '-';

  return (
    <span className={cn(colorClass, className)}>
      {prefix}{formatted}
    </span>
  );
}
