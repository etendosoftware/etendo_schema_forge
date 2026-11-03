import { fetchImageDataUrl, fetchJson, fetchOptionalJson } from './pdfUtils.js';

/**
 * The organization's template choice for one document type, or null when the document must keep
 * the current template: the organization has saved nothing (`configured: false`) or the endpoint
 * answered anything but a configuration (403, 404, network failure). Printing must never fail
 * because of this, so every failure is a null.
 *
 * Deliberately NOT gated by the `doc-template-selection` flag: the flag only hides the settings
 * page. A choice that exists is applied to every print, whoever is printing; with nothing saved
 * the printable is the current one.
 *
 * @param {string} docType spec name of the document, e.g. `sales-invoice`
 * @param {string} base NEO base url (`.../sws/neo`), as the data builders receive it — NOT a window's url
 * @param {string} token bearer token
 * @returns {Promise<{variant: string, logo: string|null, footerText: string|null}|null>}
 */
export async function loadDocTemplateConfig(docType, base, token) {
  if (!docType) return null;
  try {
    const config = await fetchJson(
      `${base}/doctemplateconfig?docType=${encodeURIComponent(docType)}`, token);
    if (config?.configured !== true) {
      console.info(`[doc-template] ${docType}: nothing saved for this organization`);
      return null;
    }
    return config;
  } catch (error) {
    console.warn(`[doc-template] ${docType}: the configuration could not be read (${error.message})`);
    return null;
  }
}

/**
 * The company logo as a data URL (the one the printed documents carry: the session's document
 * image), or null when there is none or it cannot be read. For the list print's "show the logo"
 * option, which only exists with the `doc-template-selection` flag on.
 */
export async function loadCompanyLogo(base, token) {
  const session = await fetchOptionalJson(`${base}/session`, token);
  return fetchImageDataUrl(session?.yourCompanyDocumentImageId, base, token);
}
