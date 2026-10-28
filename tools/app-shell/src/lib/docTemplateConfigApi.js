/**
 * ETP-5988 — client for `GET|PUT /sws/neo/doctemplateconfig`, the printable template choice of an
 * organization. The settings page edits ONE variant for all the commercial document types at once;
 * the backend keeps one row per (organization, document type) and authorizes every call itself
 * (admin or client-admin to save, organizations the role reads/writes).
 *
 * `apiFetch` is the app's authenticated fetch (`useApiFetch(NEO_BASE)`), so a call made here
 * carries the session's headers and language like every other request.
 */

export const DEFAULT_VARIANT = 'classic';

/** The variants the page offers: the unchanged document and the two generated ones. */
export const VARIANTS = ['classic', 'compact', 'modern'];

/** Spec names of the documents that render through the shared commercial template. */
export const COMMERCIAL_DOC_TYPES = ['sales-invoice', 'sales-order', 'purchase-order', 'sales-quotation'];

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

/** Saves one variant for one document type; the logo and footer already saved are kept. */
export async function saveDocTemplateVariant(apiFetch, docType, variant) {
  const res = await apiFetch(PATH, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docType, variant }),
  });
  if (!res.ok) throw await failure(res, `Failed to save the template (${res.status})`);
  return res.json();
}

/**
 * The variant to show: the one saved for the first commercial document type that has one (the page
 * saves them together), `classic` when nothing is saved.
 */
export function currentVariant(configs) {
  for (const docType of COMMERCIAL_DOC_TYPES) {
    const saved = configs.find((c) => c.docType === docType);
    if (saved && VARIANTS.includes(saved.variant)) return saved.variant;
  }
  return DEFAULT_VARIANT;
}
