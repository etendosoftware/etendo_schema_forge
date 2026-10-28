import { readFeatureFlag } from '@/lib/flags/useFeatureFlag.js';
import { DOC_TEMPLATE_SELECTION } from '@/lib/flags/flag-keys.js';
import { fetchJson } from './pdfUtils.js';

/**
 * Whether commercial documents may use the organization's saved template choice (ETP-5988).
 * Off by default; read outside React because the print drawer and the list print are not hooks.
 */
export function isDocTemplateSelectionEnabled() {
  return readFeatureFlag(DOC_TEMPLATE_SELECTION) === true;
}

/**
 * The organization's template choice for one document type, or null when the document must keep
 * the current template: the flag is off (no request is made at all), the organization has saved
 * nothing (`configured: false`) or the endpoint answered anything but a configuration (403, 404,
 * network failure). Printing must never fail because of this, so every failure is a null.
 *
 * @param {string} docType spec name of the document, e.g. `sales-invoice`
 * @param {string} base NEO base url, as the data builders receive it
 * @param {string} token bearer token
 * @returns {Promise<{variant: string, logo: string|null, footerText: string|null}|null>}
 */
export async function loadDocTemplateConfig(docType, base, token) {
  if (!docType || !isDocTemplateSelectionEnabled()) return null;
  try {
    const config = await fetchJson(
      `${base}/doctemplateconfig?docType=${encodeURIComponent(docType)}`, token);
    return config?.configured === true ? config : null;
  } catch {
    return null;
  }
}
