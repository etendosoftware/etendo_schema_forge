import { formatCurrency } from '@/lib/formatCurrency.js';
import { jsonHeaders, writeHeaders } from '@/lib/sessionHeaders.js';

// ETP-4576: these four request helpers used to take a `token` and hand-build
// `Authorization: Bearer <token>`. The credential is no longer something a
// caller holds or threads — it comes from the active session scheme — so the
// parameter is gone from every signature and the builders decide what travels.
// `credentials: 'include'` is required for the `__Host-` session cookie to reach
// a cross-origin backend (dev :3100 -> :8080, split-origin deploys); same-origin
// sends it either way.

export function formatAmount(val, currency) {
  if (val == null) return '';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return formatCurrency(currency, num);
}

export function neoBase(apiBaseUrl) {
  return (apiBaseUrl || '').replace(/\/[^/]+$/, '');
}

export function fetchByCriteria(specName, entityName, fieldName, value, apiBaseUrl) {
  const base = neoBase(apiBaseUrl);
  const criteria = JSON.stringify([{ fieldName, operator: 'equals', value }]);
  const params = new URLSearchParams({ criteria, _limit: '50' });
  return fetch(`${base}/${specName}/${entityName}?${params}`, {
    headers: jsonHeaders(),
    credentials: 'include',
  })
    .then(r => r.ok ? r.json() : { response: { data: [] } })
    .then(j => j.response?.data || [])
    .catch(() => []);
}

export function fetchChild(specName, entityName, parentId, apiBaseUrl) {
  const base = neoBase(apiBaseUrl);
  return fetch(`${base}/${specName}/${encodeURIComponent(entityName)}?parentId=${parentId}&_limit=50`, {
    headers: jsonHeaders(),
    credentials: 'include',
  })
    .then(r => r.ok ? r.json() : { response: { data: [] } })
    .then(j => j.response?.data || [])
    .catch(() => []);
}

export function fetchById(specName, entityName, id, apiBaseUrl) {
  const base = neoBase(apiBaseUrl);
  return fetch(`${base}/${specName}/${entityName}/${id}`, {
    headers: jsonHeaders(),
    credentials: 'include',
  })
    .then(r => r.ok ? r.json() : null)
    .then(j => j?.response?.data?.[0] || null)
    .catch(() => null);
}

// Cross-spec PATCH-by-id — sibling of `fetchById` above. Mirrors useEntity.js's own
// save shape (getUrl/getMethod: PATCH `${apiBaseUrl}/${entity}/${id}`, response parsed
// via `response.data[0]`), but targeting a DIFFERENT spec/entity than the one the
// current window renders (same segment-swap mechanism as `fetchById`/`neoBase`).
// Unlike `fetchById`, errors are NOT swallowed — a failed write must surface to the
// caller (toast) rather than silently resolve to null. First consumer: TaxSifModal.jsx
// (ETP-4888), saving a tax record's SIF fields from an invoice-line quick-fix modal.
export function patchById(specName, entityName, id, payload, apiBaseUrl) {
  const base = neoBase(apiBaseUrl);
  return fetch(`${base}/${specName}/${entityName}/${id}`, {
    method: 'PATCH',
    headers: writeHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  })
    .then(r => (r.ok ? r.json() : r.text().then(msg => Promise.reject(new Error(msg || `Request failed (${r.status})`)))))
    .then(j => j?.response?.data?.[0] || null);
}
