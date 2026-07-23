/**
 * Creates a mock fetch function that intercepts API calls and simulates
 * CRUD operations against an in-memory data store.
 *
 * @param {Record<string, Array<Record<string, unknown>>>} mockData - Entity data keyed by entity name
 * @param {string} basePath - API base path to intercept (e.g. '/etendo_sf/api')
 * @param {Record<string, Array<Record<string, unknown>>>} [catalogData={}] - Reference catalog data keyed by reference name
 * @returns {function} A fetch-like async function
 */
export function createMockFetch(mockData, basePath, catalogData = {}) {
  // Deep clone to avoid mutation across calls
  const store = structuredClone(mockData);
  const catalogStore = structuredClone(catalogData);

  return async function mockFetch(url, options = {}) {
    if (isWindowAccessMapRequest(url)) {
      return handleWindowAccessMapRequest();
    }

    if (!url.startsWith(basePath)) {
      return undefined;
    }

    const method = (options.method || 'GET').toUpperCase();
    const path = url.slice(basePath.length);
    const segments = path.split('/').filter(Boolean);

    if (isEmailContractSend(method, segments)) {
      return handleEmailContractSend(options);
    }

    if (method === 'POST' && segments[0] === 'process') {
      return handleProcessRequest(store, segments, options);
    }

    if (segments[0] === 'catalog') {
      return handleCatalogRequest(catalogStore, method, url, segments, options);
    }

    const entity = segments[0];

    if (method === 'GET') {
      return handleGetRequest(store, entity, segments);
    }

    if (method === 'POST' && segments.length === 1) {
      return handlePostEntityRequest(store, entity, options);
    }

    if (method === 'PUT' && segments.length === 2) {
      return handlePutEntityRequest(store, entity, segments[1], options);
    }

    return makeResponse(404, { error: 'Not found' });
  };
}

// ETP-4520 — the SFWindowAccessMap webhook lives under `/webhooks/`, not under
// the entity API `basePath` this file otherwise intercepts (see `App.jsx`'s
// `fetchWindowAccess`), so it needs its own path check ahead of the
// `basePath` guard above rather than falling through it. Without this, the
// call bypasses the mock override entirely, hits a real network request that
// doesn't exist in mock mode, and fails closed — `AuthProvider` then treats
// every window/field as access-denied, which is not the intent of mock mode.
const WINDOW_ACCESS_MAP_PATH = '/webhooks/SFWindowAccessMap';

function isWindowAccessMapRequest(url) {
  return url.includes(WINDOW_ACCESS_MAP_PATH);
}

// Grants full access to every window plus the accounting capability, so mock/
// demo mode is fully usable by default. `windowAccess` is a Proxy (rather
// than a fixed window-id list) so it resolves `"full"` for any window id
// looked up (`useWindowAccess`'s `windowAccess?.[windowId]`) without needing
// to hardcode or keep in sync a list of window ids here.
const FULL_WINDOW_ACCESS = new Proxy({}, { get: () => 'full', has: () => true });

function handleWindowAccessMapRequest() {
  return makeResponse(200, {
    windowAccess: FULL_WINDOW_ACCESS,
    capabilities: { showAccountingFields: true },
  });
}

function isEmailContractSend(method, segments) {
  return method === 'POST' && segments[0] === 'email-contracts' && segments[2] === 'send';
}

function handleEmailContractSend(options) {
  const body = parseJsonBody(options);
  if (!body) {
    return makeEmailContractValidationResponse('Invalid request body');
  }
  if (!body.recordId || !body.version || !body.intent) {
    return makeEmailContractValidationResponse('Invalid contract command');
  }
  return makeResponse(200, { status: 'SENT', auditId: `mock-email-${Date.now()}` });
}

function handleProcessRequest(store, segments, options) {
  const body = parseJsonBody(options);
  if (!body) {
    return makeResponse(400, { error: 'Invalid request body' });
  }
  const record = findRecordById(store, body.id);
  if (record) {
    record.docStatus = segments[1] === 'voidOrder' ? 'VO' : 'CO';
  }
  return makeResponse(200, { status: 'success', message: `${segments[1]} executed` });
}

function handleCatalogRequest(catalogStore, method, url, segments, options) {
  const refName = segments[1];
  if (!refName) return makeResponse(404, { error: 'Reference name required' });
  if (method === 'GET') return handleCatalogGet(catalogStore, refName, url);
  if (method === 'POST') return handleCatalogPost(catalogStore, refName, options);
  if (method === 'PUT' && segments.length === 3) return handleCatalogPut(catalogStore, refName, segments[2], options);
  if (method === 'DELETE' && segments.length === 3) return handleCatalogDelete(catalogStore, refName, segments[2]);
  return makeResponse(404, { error: 'Not found' });
}

function handleCatalogGet(catalogStore, refName, url) {
  const data = catalogStore[refName];
  if (!data) return makeResponse(404, { error: `Catalog '${refName}' not found` });
  const urlObj = new URL(url, 'http://localhost');
  const parentId = urlObj.searchParams.get('parentId');
  const filterKey = urlObj.searchParams.get('filterKey') || 'businessPartnerId';
  return makeResponse(200, parentId ? data.filter(item => item[filterKey] === parentId) : data);
}

function handleCatalogPost(catalogStore, refName, options) {
  const body = parseJsonBody(options);
  if (!body) return makeResponse(400, { error: 'Invalid request body' });
  const newItem = { id: `${refName.toLowerCase()}-${Date.now()}`, ...body };
  if (!catalogStore[refName]) catalogStore[refName] = [];
  catalogStore[refName].push(newItem);
  return makeResponse(201, newItem);
}

function handleCatalogPut(catalogStore, refName, itemId, options) {
  const data = catalogStore[refName];
  const index = findCatalogIndex(data, refName, itemId);
  if (index.response) return index.response;
  const body = parseJsonBody(options);
  if (!body) return makeResponse(400, { error: 'Invalid request body' });
  data[index.value] = { ...data[index.value], ...body };
  return makeResponse(200, data[index.value]);
}

function handleCatalogDelete(catalogStore, refName, itemId) {
  const data = catalogStore[refName];
  const index = findCatalogIndex(data, refName, itemId);
  if (index.response) return index.response;
  const deleted = data.splice(index.value, 1)[0];
  return makeResponse(200, deleted);
}

function handleGetRequest(store, entity, segments) {
  if (segments.length === 1) return getEntityList(store, entity);
  if (segments.length === 2) return getEntityRecord(store, entity, segments[1]);
  if (segments.length === 3) return getEntityChildren(store, entity, segments[1], segments[2]);
  return makeResponse(404, { error: 'Not found' });
}

function handlePostEntityRequest(store, entity, options) {
  const body = parseJsonBody(options);
  if (!body) return makeResponse(400, { error: 'Invalid request body' });
  const newRecord = { id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...body };
  if (!store[entity]) store[entity] = [];
  store[entity].push(newRecord);
  return makeResponse(201, newRecord);
}

function handlePutEntityRequest(store, entity, id, options) {
  const data = store[entity];
  if (!data) return makeResponse(404, { error: 'Entity not found' });
  const index = data.findIndex(r => r.id === id);
  if (index === -1) return makeResponse(404, { error: 'Record not found' });
  const body = parseJsonBody(options);
  if (!body) return makeResponse(400, { error: 'Invalid request body' });
  data[index] = { ...data[index], ...body };
  return makeResponse(200, data[index]);
}

function getEntityList(store, entity) {
  const data = store[entity];
  return data ? makeResponse(200, data) : makeResponse(404, { error: 'Entity not found' });
}

function getEntityRecord(store, entity, id) {
  const data = store[entity];
  if (!data) return makeResponse(404, { error: 'Entity not found' });
  const record = data.find(r => r.id === id);
  return record ? makeResponse(200, record) : makeResponse(404, { error: 'Record not found' });
}

function getEntityChildren(store, entity, parentId, childEntity) {
  const childData = store[childEntity];
  if (!childData) return makeResponse(404, { error: 'Child entity not found' });
  const parentKey = `${entity}Id`;
  return makeResponse(200, childData.filter(r => r[parentKey] === parentId));
}

function parseJsonBody(options) {
  try {
    return JSON.parse(options.body);
  } catch {
    return null;
  }
}

function findRecordById(store, id) {
  for (const collection of Object.values(store)) {
    const record = collection.find(r => r.id === id);
    if (record) return record;
  }
  return null;
}

function findCatalogIndex(data, refName, itemId) {
  if (!data) return { response: makeResponse(404, { error: `Catalog '${refName}' not found` }) };
  const value = data.findIndex(r => r.id === itemId);
  return value === -1 ? { response: makeResponse(404, { error: 'Catalog item not found' }) } : { value };
}

function makeEmailContractValidationResponse(message) {
  return makeResponse(400, { status: 'VALIDATION_FAILED', message });
}

function makeResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}
