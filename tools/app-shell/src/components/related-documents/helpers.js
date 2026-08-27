import { formatCurrency } from '@/lib/formatCurrency.js';

import { buildHeaders } from '@/auth/api.js';
export function formatAmount(val, currency) {
  if (val == null) return '';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return formatCurrency(currency, num);
}

export function neoBase(apiBaseUrl) {
  return (apiBaseUrl || '').replace(/\/[^/]+$/, '');
}

export function fetchByCriteria(specName, entityName, fieldName, value, token, apiBaseUrl) {
  const base = neoBase(apiBaseUrl);
  const criteria = JSON.stringify([{ fieldName, operator: 'equals', value }]);
  const params = new URLSearchParams({ criteria, _limit: '50' });
  return fetch(`${base}/${specName}/${entityName}?${params}`, {
    headers: buildHeaders(token),
  })
    .then(r => r.ok ? r.json() : { response: { data: [] } })
    .then(j => j.response?.data || [])
    .catch(() => []);
}

export function fetchChild(specName, entityName, parentId, token, apiBaseUrl) {
  const base = neoBase(apiBaseUrl);
  return fetch(`${base}/${specName}/${encodeURIComponent(entityName)}?parentId=${parentId}&_limit=50`, {
    headers: buildHeaders(token),
  })
    .then(r => r.ok ? r.json() : { response: { data: [] } })
    .then(j => j.response?.data || [])
    .catch(() => []);
}

export function fetchById(specName, entityName, id, token, apiBaseUrl) {
  const base = neoBase(apiBaseUrl);
  return fetch(`${base}/${specName}/${entityName}/${id}`, {
    headers: buildHeaders(token),
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
export function patchById(specName, entityName, id, payload, token, apiBaseUrl) {
  const base = neoBase(apiBaseUrl);
  return fetch(`${base}/${specName}/${entityName}/${id}`, {
    method: 'PATCH',
    headers: buildHeaders(token),
    body: JSON.stringify(payload),
  })
    .then(r => (r.ok ? r.json() : r.text().then(msg => Promise.reject(new Error(msg || `Request failed (${r.status})`)))))
    .then(j => j?.response?.data?.[0] || null);
}
