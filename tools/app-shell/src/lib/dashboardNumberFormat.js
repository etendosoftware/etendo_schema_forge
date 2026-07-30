import { formatCurrency } from './formatCurrency.js';

const DASHBOARD_NUMBER_LOCALE = 'en-US';

export function localeFromUi(locale) {
  return locale === 'es_ES' ? 'es-ES' : 'en-US';
}

export function formatDashboardNumber(value, locale = 'en-US', options = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value ?? '—');

  const {
    minimumFractionDigits = 0,
    maximumFractionDigits = 0,
  } = options;

  return new Intl.NumberFormat(DASHBOARD_NUMBER_LOCALE, {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(num);
}

/**
 * Formats a dashboard amount as `1.234,56 \u20ac` (delegates to the shared
 * `formatCurrency()` for the actual number/symbol formatting, es-ES locale,
 * symbol only \u2014 never the literal ISO code). `currencyLabel` may be a raw
 * ISO code (`"EUR"`) or a longer label containing one (`"1.14 EUR"`); the
 * 3-letter code is extracted from it either way.
 */
export function formatDashboardAmount(value, currencyLabel) {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value ?? '\u2014');

  if (!currencyLabel) {
    return formatCurrency(undefined, num);
  }

  const normalizedLabel = String(currencyLabel).trim();
  const codeMatch = normalizedLabel.toUpperCase().match(/\b[A-Z]{3}\b/);
  const currencyCode = codeMatch ? codeMatch[0] : normalizedLabel.toUpperCase();
  return formatCurrency(currencyCode, num);
}

export function formatDashboardCompact(value, { locale = 'en-US', currencyLabel = '', maxDecimals = 1 } = {}) {
  const num = Number(value) || 0;
  const abs = Math.abs(num);

  const formatCompact = (divisor, suffix) => {
    const compact = num / divisor;
    const hasFraction = Math.abs(compact) < 100 && Math.abs(compact % 1) >= 0.05;

    if (currencyLabel) {
      return `${formatDashboardAmount(compact, currencyLabel)}${suffix}`;
    }

    return `${formatDashboardNumber(compact, locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: hasFraction ? maxDecimals : 0,
    })}${suffix}`;
  };

  if (abs >= 1_000_000_000) return formatCompact(1_000_000_000, 'B');
  if (abs >= 1_000_000) return formatCompact(1_000_000, 'M');
  if (abs >= 1_000) return formatCompact(1_000, 'K');

  if (currencyLabel) return formatDashboardAmount(num, currencyLabel);
  return formatDashboardNumber(num, locale);
}

export function formatDashboardAxisTick(value, locale = 'en-US') {
  return formatDashboardCompact(value, { locale, maxDecimals: 1 });
}

export function niceScale(dataMax) {
  if (dataMax <= 0) return { niceMax: 100, ticks: [0, 25, 50, 75, 100] };

  const exp = Math.floor(Math.log10(dataMax));
  const niceFactors = [1, 2, 2.5, 5, 10, 20, 25, 50];

  for (let e = exp - 1; e <= exp + 1; e++) {
    const base = Math.pow(10, e);
    for (const f of niceFactors) {
      const step = f * base;
      const niceMax = Math.ceil(dataMax / step - 1e-10) * step;
      const count = Math.round(niceMax / step) + 1;
      if (count >= 4 && count <= 6) {
        return { niceMax, ticks: Array.from({ length: count }, (_, i) => i * step) };
      }
    }
  }

  const step = Math.pow(10, exp);
  const niceMax = Math.ceil(dataMax / step) * step;
  const count = Math.round(niceMax / step) + 1;
  return { niceMax, ticks: Array.from({ length: count }, (_, i) => i * step) };
}

export function toBezierPath(pts) {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const cpx = (curr.x - prev.x) * 0.35;
    d += ` C ${prev.x + cpx},${prev.y} ${curr.x - cpx},${curr.y} ${curr.x},${curr.y}`;
  }
  return d;
}

export function toBezierFillPath(pts, baseY) {
  if (pts.length === 0) return '';
  return `${toBezierPath(pts)} L ${pts[pts.length - 1].x},${baseY} L ${pts[0].x},${baseY} Z`;
}
