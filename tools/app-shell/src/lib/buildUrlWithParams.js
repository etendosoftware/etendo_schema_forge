export function buildUrlWithParams(baseUrl, params = {}) {
  if (!baseUrl) return baseUrl;

  const [path, existingQuery = ''] = baseUrl.split('?');
  const searchParams = new URLSearchParams(existingQuery);

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value == null || value === '') continue;
    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}
