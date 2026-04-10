export function formatAmount(val, currency) {
  if (val == null) return '';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  const formatted = num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${formatted} ${currency}` : formatted;
}

export function neoBase(apiBaseUrl) {
  return (apiBaseUrl || '').replace(/\/[^/]+$/, '');
}

export function fetchByCriteria(specName, entityName, fieldName, value, token, apiBaseUrl) {
  const base = neoBase(apiBaseUrl);
  const criteria = JSON.stringify([{ fieldName, operator: 'equals', value }]);
  const params = new URLSearchParams({ criteria, _limit: '50' });
  return fetch(`${base}/${specName}/${entityName}?${params}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
    .then(r => r.ok ? r.json() : { response: { data: [] } })
    .then(j => j.response?.data || [])
    .catch(() => []);
}

export function fetchChild(specName, entityName, parentId, token, apiBaseUrl) {
  const base = neoBase(apiBaseUrl);
  return fetch(`${base}/${specName}/${encodeURIComponent(entityName)}?parentId=${parentId}&_limit=50`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
    .then(r => r.ok ? r.json() : { response: { data: [] } })
    .then(j => j.response?.data || [])
    .catch(() => []);
}

export function fetchById(specName, entityName, id, token, apiBaseUrl) {
  const base = neoBase(apiBaseUrl);
  return fetch(`${base}/${specName}/${entityName}/${id}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
    .then(r => r.ok ? r.json() : null)
    .then(j => j?.response?.data?.[0] || null)
    .catch(() => null);
}
