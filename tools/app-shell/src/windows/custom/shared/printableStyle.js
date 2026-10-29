/**
 * ETP-5988 — The common appearance options of a printable (base color, font family, font size,
 * striped rows) as CSS appended AFTER the design's own, for both the commercial documents and the
 * list print. Every option is optional: an unset one adds nothing, so a printable with no options
 * is byte-for-byte what it was before.
 *
 * The color reaches a stylesheet, so it is only ever used after `isHexColor` (the backend refuses
 * anything but `#RRGGBB` too) and everything derived from it is computed here, never concatenated
 * from user text.
 */

const HEX = /^#[0-9A-Fa-f]{6}$/;

export const isHexColor = (value) => typeof value === 'string' && HEX.test(value);

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const mix = (hex, other, weight) => toHex(channels(hex).map((c, i) => c * (1 - weight) + other[i] * weight));

/** WCAG relative luminance of a `#RRGGBB`. */
function luminance(hex) {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** A very light tint of the color, for header backgrounds and striped rows. */
export const softTint = (hex) => mix(hex, [255, 255, 255], 0.9);

/**
 * The color to print TEXT in over the tint: the color itself, darkened until it reads on white when
 * it is too light (a yellow accent would otherwise print unreadable titles).
 */
export function readableInk(hex) {
  let ink = hex;
  for (let i = 0; i < 6 && luminance(ink) > 0.2; i += 1) ink = mix(ink, [0, 0, 0], 0.25);
  return ink;
}

const FONT_STACKS = {
  serif: "Georgia, 'Times New Roman', Times, serif",
  mono: "'SF Mono', 'Fira Code', Menlo, Consolas, monospace",
};

const fontStack = (font) => FONT_STACKS[font] ?? null;

/** CSS appended to DOCUMENT_CSS (after the variant). The Verifactu QR rules are never touched. */
export function documentStyleCss(config) {
  if (!config) return '';
  const css = [];
  if (isHexColor(config.color)) {
    const accent = config.color.toUpperCase();
    css.push(`
/* style: base color */
:root { --accent: ${accent}; --accent-soft: ${softTint(accent)}; --accent-ink: ${readableInk(accent)}; }
.inv-header-b .meta .num, .eyebrow { color: var(--accent-ink); }
.inv-header-b { border-color: var(--accent); }
.inv-header-b .meta { border-left-color: var(--accent); }
.inv-table thead th { color: var(--accent-ink); border-bottom: 2px solid var(--accent); }
.inv-totals { border-top-color: var(--accent); }
.inv-totals .row.grand { color: var(--accent-ink); border-top: 2px solid var(--accent); }
`);
  }
  const stack = fontStack(config.font);
  if (stack) css.push(`\n/* style: font */\n:root { --font-sans: ${stack}; }\n`);
  if (config.fontSize === 'small') {
    css.push(`
/* style: small text */
body { font-size: 11px; line-height: 15px; }
.inv-table, .inv-table tbody td, .inv-info-card .row, .inv-totals .row, .inv-observ .body, .inv-company-lines { font-size: 11px; line-height: 15px; }
.inv-totals .row.grand { font-size: 13px; }
`);
  }
  if (config.fontSize === 'large') {
    css.push(`
/* style: large text */
body { font-size: 15px; line-height: 21px; }
.inv-table, .inv-table tbody td, .inv-info-card .row, .inv-totals .row, .inv-observ .body, .inv-company-lines { font-size: 15px; line-height: 21px; }
.inv-totals .row.grand { font-size: 17px; }
`);
  }
  if (config.rowStripes === 'on') {
    const tint = isHexColor(config.color) ? softTint(config.color.toUpperCase()) : '#F6F7F9';
    css.push(`\n/* style: striped rows */\n.inv-table tbody tr:nth-child(even) td { background: ${tint}; }\n`);
  }
  return css.join('');
}

// The list print (ReportDrawer's LISTING_TEMPLATE) has its own design variants. `modern` carries its
// own default accent so it differs from `classic` before any color is chosen.
const LISTING_MODERN_ACCENT = '#2F5BEA';

const LISTING_VARIANT_CSS = {
  classic: '',
  compact: `
/* variant: compact */
.report-container { padding: 12mm 10mm; }
.report-header { margin-bottom: 3mm; padding-bottom: 2.5mm; }
.report-title { font-size: 14pt; }
.report-table { font-size: 8.5pt; }
.report-table thead th { padding: 1.2mm 2mm; }
.report-table tbody td { padding: 0.9mm 2mm; }
`,
};

function listingAccentCss(accent) {
  return `
/* accent */
.report-header { border-bottom-color: ${accent}; }
.report-title { color: ${readableInk(accent)}; }
.report-table thead th { background: ${softTint(accent)}; color: ${readableInk(accent)}; border-bottom: 2px solid ${accent}; }
`;
}

/**
 * The list print's CSS: the one it was given, itself, when there is no configuration (so the
 * current print is the current print by construction); otherwise a copy with the variant and the
 * common options appended. Alternating rows are the exception to "unset = the design's own": a
 * configured list print has none unless `rowStripes` is `on`.
 */
export function resolveListingCss(config, baseCss) {
  if (!config) return baseCss;
  const css = [baseCss, LISTING_VARIANT_CSS[config.variant] ?? ''];
  const accent = isHexColor(config.color) ? config.color.toUpperCase()
    : (config.variant === 'modern' ? LISTING_MODERN_ACCENT : null);
  if (accent) css.push(listingAccentCss(accent));
  const stack = fontStack(config.font);
  if (stack) css.push(`\n/* style: font */\nbody { font-family: ${stack}; }\n`);
  if (config.fontSize === 'small') {
    css.push('\n/* style: small text */\nbody { font-size: 8.5pt; }\n.report-table { font-size: 7.5pt; }\n.report-table thead th { font-size: 6.5pt; }\n.cell-amount { font-size: 7pt; }\n');
  }
  if (config.fontSize === 'large') {
    css.push('\n/* style: large text */\nbody { font-size: 12pt; }\n.report-table { font-size: 11pt; }\n.report-table thead th { font-size: 9.5pt; }\n.cell-amount { font-size: 10.5pt; }\n');
  }
  if (config.showLogo === 'on') css.push('\n/* option: company logo */\n.report-brand { display: flex; align-items: center; gap: 4mm; }\n.report-logo { display: block; max-height: 14mm; max-width: 45mm; object-fit: contain; flex-shrink: 0; }\n');
  // The list print does not stripe its rows unless the organization asks for it. The base CSS stripes
  // with `hsl(var(--muted))`, a variable that does not exist inside jsreport, so that background is
  // invalid and was never drawn: "on" therefore has to bring a concrete color of its own.
  if (config.rowStripes === 'on') {
    const tint = accent ? softTint(accent) : '#F3F4F6';
    css.push(`\n/* style: striped rows */\n.report-table tbody tr:nth-child(even) { background: ${tint}; }\n`);
  } else {
    css.push('\n/* style: no stripes */\n.report-table tbody tr:nth-child(even) { background: transparent; }\n');
  }
  return css.join('');
}

/** No option set at all is the current document: it renders with no configuration, exactly as it prints today. */
export function isCurrentDesign(settings) {
  return !settings || (settings.variant === 'classic' && !settings.color && !settings.font
    && !settings.fontSize && !settings.rowStripes && settings.showLogo !== 'on' && !settings.logo && !settings.footerText);
}
