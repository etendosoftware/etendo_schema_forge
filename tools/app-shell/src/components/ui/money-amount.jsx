import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatCurrency.js';

/**
 * Formats a monetary value with locale-aware number formatting.
 *
 * Thin presentational wrapper around the shared `formatCurrency()` util — that function is the
 * ONE true currency-formatting implementation in the app; MoneyAmount only adds tone/color and
 * the +/- sign prefix on top of it. Do not re-implement Intl formatting here.
 *
 * Props:
 *   value    — number
 *   currency — ISO currency code, e.g. 'EUR'
 *   tone     — 'auto' | 'positive' | 'negative' | 'neutral'
 *              'auto': positive if value >= 0, negative if value < 0
 *   compact  — boolean, uses compact notation (e.g. "$12.5K")
 *   className — extra classes passed to the span
 *
 * Examples:
 *   <MoneyAmount value={12450} currency="EUR" />   → "+12,450.00 €"
 *   <MoneyAmount value={-200} currency="EUR" />    → "-200.00 €"
 */

const TONE_CLASS = {
  positive: 'text-[#1E874C]',
  negative: 'text-[#d50b3e]',
  neutral:  'text-[#121217]',
};

function resolveTone(tone, value) {
  if (tone !== 'auto') return tone;
  return value >= 0 ? 'positive' : 'negative';
}

/** @param {{ value: number; currency: string; tone?: 'auto'|'positive'|'negative'|'neutral'; compact?: boolean; className?: string }} props */
export function MoneyAmount({ value, currency = 'EUR', tone = 'auto', compact = false, className }) {
  const resolvedTone = resolveTone(tone, value);
  const colorClass = TONE_CLASS[resolvedTone] ?? TONE_CLASS.neutral;

  // formatCurrency() itself guards non-finite/null values and returns '—' — Math.abs(NaN) is
  // NaN, which formatCurrency also treats as invalid, so this flows through safely without a
  // separate finite check here. Only compute a +/- prefix for an actually-finite value, so an
  // invalid input renders a plain "—" rather than "+—"/"-—".
  const valueIsFinite = Number.isFinite(Number(value));
  const absValue = valueIsFinite ? Math.abs(value) : value;
  const formatted = formatCurrency(currency, absValue, { compact });

  let prefix = '';
  if (valueIsFinite) {
    if (resolvedTone === 'positive' && value > 0) prefix = '+';
    else if (resolvedTone === 'negative' || value < 0) prefix = '-';
  }

  return (
    <span className={cn(colorClass, className)}>
      {prefix}{formatted}
    </span>
  );
}
