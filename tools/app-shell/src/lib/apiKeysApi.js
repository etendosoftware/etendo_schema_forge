/** API client for the authenticated user's public API credentials. */

async function parseError(response, fallback) {
  const text = await response.text().catch(() => '');
  if (!text) return new Error(`${fallback}: ${response.status}`);
  try {
    const payload = JSON.parse(text);
    return new Error(payload.error_description || payload.message || fallback);
  } catch {
    return new Error(text);
  }
}

async function request(apiFetch, path, options, fallback) {
  const response = await apiFetch(path, options);
  if (!response.ok) throw await parseError(response, fallback);
  return response.status === 204 ? null : response.json();
}

export async function listApiKeys(apiFetch) {
  const result = await request(apiFetch, '/oauth2/api-keys', undefined, 'Failed to list API keys');
  return Array.isArray(result) ? result : (result?.apiKeys || []);
}

export function createApiKey(apiFetch, { name, capabilities }) {
  return request(apiFetch, '/oauth2/api-keys', {
    method: 'POST',
    body: JSON.stringify({ name, capabilities }),
  }, 'Failed to create API key');
}

export function updateApiKey(apiFetch, id, { name, isActive }) {
  return request(apiFetch, `/oauth2/api-keys/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, isActive }),
  }, 'Failed to update API key');
}

export function deleteApiKey(apiFetch, id) {
  return request(apiFetch, `/oauth2/api-keys/${id}`, { method: 'DELETE' }, 'Failed to delete API key');
}

export function rotateApiKey(apiFetch, id) {
  return request(apiFetch, `/oauth2/api-keys/${id}/rotate`, { method: 'POST' }, 'Failed to rotate API key');
}

export function revokeApiKeyTokens(apiFetch, id) {
  return request(apiFetch, `/oauth2/api-keys/${id}/revoke-tokens`, { method: 'POST' }, 'Failed to revoke API key tokens');
}
