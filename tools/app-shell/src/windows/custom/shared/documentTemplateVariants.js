/**
 * The anchor the custom footer is inserted before: the closing marker of the current template's
 * lines. A test asserts it is found, so editing DOCUMENT_TEMPLATE cannot drop the footer silently.
 */
export const FOOTER_ANCHOR = '<!-- Footer -->';

const CUSTOM_FOOTER_BLOCK = `{{#if customFooter}}
  <div class="inv-custom-footer">{{customFooter}}</div>
  {{/if}}
  `;

/**
 * Appended to DOCUMENT_CSS, never replacing it: only existing CSS variables, sizes and spacing
 * change. The Verifactu QR rules (.inv-verifactu-*) are deliberately untouched — their geometry is
 * mandated by the AEAT spec.
 */
const VARIANT_CSS = {
  classic: '',
  compact: `
/* variant: compact */
.invoice { padding: 36px 40px 32px; gap: 14px; }
.inv-header-b { padding: 12px 16px; gap: 18px; }
.inv-info-card { padding: 10px 12px; }
.inv-table thead th { padding: 6px 6px; }
.inv-table tbody td { padding: 7px 6px; font-size: 12px; }
.inv-totals-inner { gap: 4px; }
`,
  modern: `
/* variant: modern */
:root { --accent: #2F5BEA; --accent-soft: #EEF2FE; }
.inv-header-b { background: var(--accent-soft); border: 0; border-left: 6px solid var(--accent); border-radius: 4px; }
.inv-header-b .meta { border-left-color: var(--accent); }
.inv-header-b .meta .num { color: var(--accent); }
.inv-table thead th { background: var(--accent-soft); color: var(--accent); border-bottom: 2px solid var(--accent); }
.inv-totals .row.grand { color: var(--accent); border-top: 2px solid var(--accent); }
.eyebrow { color: var(--accent); }
`,
};

const CUSTOM_FOOTER_CSS = `
.inv-custom-footer { font-size: 11px; line-height: 16px; color: var(--fg-3); text-align: center; white-space: pre-line; }
`;

/**
 * The template and CSS to render a commercial document with.
 *
 * With no configuration it returns the template and CSS it was given (DOCUMENT_TEMPLATE and
 * DOCUMENT_CSS, passed by documentPdf.js, which this module must not import back) — the very same
 * strings — so the document is the current one by construction. With a configuration it builds a
 * COPY: the variant's CSS appended, and the custom footer block inserted before the standard
 * footer. The footer is printed with double stashes, so it is HTML-escaped.
 *
 * @param {{variant?: string, footerText?: string|null}|null} config
 * @param {string} baseTemplate the current commercial template
 * @param {string} baseCss the current commercial CSS
 * @returns {{template: string, css: string}}
 */
export function resolveDocumentTemplate(config, baseTemplate, baseCss) {
  if (!config) return { template: baseTemplate, css: baseCss };
  const variantCss = VARIANT_CSS[config.variant] ?? '';
  const hasFooter = Boolean(config.footerText);
  return {
    template: hasFooter
      ? baseTemplate.replace(FOOTER_ANCHOR, CUSTOM_FOOTER_BLOCK + FOOTER_ANCHOR)
      : baseTemplate,
    css: baseCss + variantCss + (hasFooter ? CUSTOM_FOOTER_CSS : ''),
  };
}

/** The data to render: a copy carrying the configuration's logo and footer; the caller's object is not touched. */
export function applyTemplateConfigData(data, config) {
  if (!config) return data;
  const next = { ...data };
  if (config.logo) next.companyLogoDataUrl = config.logo;
  if (config.footerText) next.customFooter = config.footerText;
  return next;
}
