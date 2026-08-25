/**
 * Shared branding data for server-rendered document reports.
 *
 * Document report SQL exposes the organization's image id as `header.org_logo_id`. The
 * report API uses the authenticated NEO image endpoint to retrieve the same
 * company document image used by the app-shell PDF previews, then embeds it as
 * a data URL so jsreport does not need browser credentials or network access.
 */
export async function hydrateDocumentBranding(header, {
  authToken,
  etendoBase = 'http://localhost:8080/etendo',
  fetchImpl = fetch,
} = {}) {
  if (!header || !header.org_logo_id || !authToken) return header;

  try {
    const imageUrl = `${etendoBase}/sws/neo/image/${encodeURIComponent(header.org_logo_id)}`;
    const response = await fetchImpl(imageUrl, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) return header;

    const contentType = response.headers.get('content-type') || 'image/png';
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      ...header,
      companyLogoDataUrl: `data:${contentType};base64,${bytes.toString('base64')}`,
    };
  } catch {
    // Branding is deliberately fail-soft: an unavailable image must not make
    // an otherwise valid business document impossible to print.
    return header;
  }
}
