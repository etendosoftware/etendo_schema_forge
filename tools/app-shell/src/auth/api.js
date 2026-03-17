function detectBaseUrl() {
  const path = window.location.pathname;
  const webIdx = path.indexOf('/web/');
  if (webIdx !== -1) return path.substring(0, webIdx);
  return import.meta.env.VITE_API_BASE || '';
}

const DEFAULT_BASE_URL = detectBaseUrl();

export function buildHeaders(token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export function isTokenExpired(token) {
  return !token;
}

export async function login(baseUrl, username, password, roleId, orgId) {
  const body = { username, password };
  const headers = { 'Content-Type': 'application/json' };

  if (roleId) body.role = roleId;
  if (orgId) body.organization = orgId;

  const res = await fetch(`${baseUrl || DEFAULT_BASE_URL}/sws/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Login failed: ${res.status}`);
  }
  // Etendo's /sws/login responds with charset=ISO-8859-1.
  // res.json() always decodes as UTF-8, which corrupts ñ, á, etc.
  // Read as ArrayBuffer and decode with the response's actual charset.
  const ct = res.headers.get('content-type') || '';
  const charsetMatch = ct.match(/charset=([^\s;]+)/i);
  const charset = charsetMatch ? charsetMatch[1] : 'utf-8';
  const buf = await res.arrayBuffer();
  const text = new TextDecoder(charset).decode(buf);
  return JSON.parse(text);
}

export function createApiFetch(baseUrl, getToken, onUnauthorized) {
  return async function apiFetch(path, options = {}) {
    const token = getToken();
    const res = await fetch(`${baseUrl || DEFAULT_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...buildHeaders(token),
        ...options.headers,
      },
    });
    if (res.status === 401) {
      onUnauthorized();
      throw new Error('Unauthorized');
    }
    return res;
  };
}
