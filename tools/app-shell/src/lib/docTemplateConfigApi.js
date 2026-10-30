/**
 * ETP-5988 — client for `GET|PUT /sws/neo/doctemplateconfig`, the printable template choice of an
 * organization. The settings page edits one set of options for all the commercial document types at once
 * and another for the list print (`listing`);
 * the backend keeps one row per (organization, document type) and authorizes every call itself
 * (admin or client-admin to save, organizations the role reads/writes).
 *
 * `apiFetch` is the app's authenticated fetch (`useApiFetch(NEO_BASE)`), so a call made here
 * carries the session's headers and language like every other request.
 */

export const DEFAULT_VARIANT = 'classic';

/** The variants the page offers: the unchanged design and the two generated ones. */
export const VARIANTS = ['classic', 'compact', 'modern'];

/** Font families, font sizes and striped rows the page offers; `null` is "the design's own". */
export const FONTS = ['sans', 'serif', 'mono'];
export const FONT_SIZES = ['small', 'normal', 'large'];
export const ROW_STRIPES = ['on', 'off'];

/** Spec names of the documents that render through the shared commercial template. */
export const COMMERCIAL_DOC_TYPES = ['sales-invoice', 'sales-order', 'purchase-order', 'sales-quotation'];

/** The list print has one design for every window, stored under one document type. */
export const LISTING_DOC_TYPES = ['listing'];

/** What the page edits for a section; every option unset is the current printable. */
export const DEFAULT_SETTINGS = Object.freeze({
  variant: DEFAULT_VARIANT, color: null, font: null, fontSize: null, rowStripes: null, showLogo: null, logo: null,
  footerText: null,
});

const PATH = '/doctemplateconfig';

async function failure(res, fallback) {
  let message = fallback;
  try {
    const body = await res.json();
    message = body?.message || body?.error || fallback;
  } catch {
    // an empty or non-JSON error body: keep the fallback
  }
  const error = new Error(message);
  error.status = res.status;
  return error;
}

/**
 * The organization's saved configurations.
 *
 * @returns {Promise<Array<{docType: string, variant: string, configured: boolean}>>}
 */
export async function listDocTemplateConfigs(apiFetch) {
  const res = await apiFetch(PATH);
  if (!res.ok) throw await failure(res, `Failed to load the template configuration (${res.status})`);
  const body = await res.json();
  return Array.isArray(body?.configs) ? body.configs : [];
}

const pick = (value, allowed) => (allowed.includes(value) ? value : null);

/**
 * The settings to show for a section: the ones saved for the first of its document types that has
 * any (the page saves a section's types together), the defaults when nothing is saved. A value the
 * page does not know is shown as unset rather than trusted.
 */
export function currentSettings(configs, docTypes) {
  for (const docType of docTypes) {
    const saved = configs.find((c) => c.docType === docType);
    if (saved && VARIANTS.includes(saved.variant)) {
      return {
        variant: saved.variant,
        color: typeof saved.color === 'string' ? saved.color : null,
        font: pick(saved.font, FONTS),
        fontSize: pick(saved.fontSize, FONT_SIZES),
        rowStripes: pick(saved.rowStripes, ROW_STRIPES),
        showLogo: pick(saved.showLogo, ROW_STRIPES),
        logo: typeof saved.logo === 'string' ? saved.logo : null,
        footerText: typeof saved.footerText === 'string' ? saved.footerText : null,
      };
    }
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * Saves a section's settings for each of its document types. An unset option is sent as `null`,
 * which clears it on the server (back to the design's own). The logo and the footer are sent only
 * when the section offers them (`withLogo`, `withFooter`; the list print has a logo and no footer),
 * so saving a section never clears what another one holds.
 */
export async function saveDocTemplateSettings(apiFetch, docType, settings, { withLogo = true, withFooter = true } = {}) {
  const body = {
    docType,
    variant: settings.variant,
    color: settings.color ?? null,
    font: settings.font ?? null,
    fontSize: settings.fontSize ?? null,
    rowStripes: settings.rowStripes ?? null,
    // only the list print reads it; documents always print their logo
    showLogo: settings.showLogo ?? null,
  };
  if (withLogo) body.logo = settings.logo ?? null;
  if (withFooter) body.footerText = settings.footerText ?? null;
  const res = await apiFetch(PATH, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await failure(res, `Failed to save the template (${res.status})`);
  return res.json();
}
