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
    // `url` may be a `Request` object (a valid `fetch` argument) rather than a
    // string — normalize before any string-only method (`.includes`/`.startsWith`).
    const urlStr = typeof url === 'string' ? url : url.url;

    if (isWindowAccessMapRequest(urlStr)) {
      return handleWindowAccessMapRequest();
    }

    if (isRolesOverviewRequest(urlStr)) {
      return handleRolesOverviewRequest();
    }

    if (!urlStr.startsWith(basePath)) {
      return undefined;
    }

    const method = (options.method || 'GET').toUpperCase();
    const path = urlStr.slice(basePath.length);
    const segments = path.split('/').filter(Boolean);

    if (isEmailContractSend(method, segments)) {
      return handleEmailContractSend(options);
    }

    if (method === 'POST' && segments[0] === 'process') {
      return handleProcessRequest(store, segments, options);
    }

    if (segments[0] === 'catalog') {
      return handleCatalogRequest(catalogStore, method, urlStr, segments, options);
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

// ETP-4520 — the SFWindowAccessMap endpoint lives under `/sws/neo/windowaccessmap`
// (NEO's own auth, not the Webhooks module's `/webhooks/*` — see App.jsx's
// `fetchWindowAccess` and NeoGoWebhookBridge's class javadoc in
// com.etendoerp.go for why), not under the entity API `basePath` this file
// otherwise intercepts, so it needs its own path check ahead of the
// `basePath` guard above rather than falling through it. Without this, the
// call bypasses the mock override entirely, hits a real network request that
// doesn't exist in mock mode, and fails closed — `AuthProvider` then treats
// every window/field as access-denied, which is not the intent of mock mode.
const WINDOW_ACCESS_MAP_PATH = '/sws/neo/windowaccessmap';

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
    // ETP-4513 — `isAdminOrClientAdmin: true` alongside the pre-existing
    // `showAccountingFields`, so mock/demo mode also shows the
    // "Configuración > Roles" menu entry by default (see menu.json's
    // `roles` item and registry.js's `filterMenuGroupsByAccess`).
    capabilities: { showAccountingFields: true, isAdminOrClientAdmin: true },
  });
}

// ETP-4513 — SFRolesOverview lives under `/sws/neo/rolesoverview`, same
// reasoning as WINDOW_ACCESS_MAP_PATH above: it needs its own path check
// ahead of the `basePath` guard, or the call falls through to a real network
// request that doesn't exist in mock mode.
const ROLES_OVERVIEW_PATH = '/sws/neo/rolesoverview';

function isRolesOverviewRequest(url) {
  return url.includes(ROLES_OVERVIEW_PATH);
}

// The 4 non-admin GOClient roles all carry the same boilerplate AD_Role.description text (see
// SFRolesOverview.java's class javadoc) — hoisted once instead of repeated per role literal.
const ROLE_BOILERPLATE_DESCRIPTION = '*** Please, do not edit this role. Use Copy Record instead ***';

// Builds one mock role entry. `windows` is a list of `[id, name, tier]` tuples rather than
// object literals so the 5 roles below read as data, not 5 near-identical object shapes —
// keeps this file's mock fixture from tripping SonarQube's copy-paste detector on structurally
// repeated `{ id, name, tier }` / `{ id, name, rawDescription, userCount, windows }` blocks.
function mockRole(id, name, rawDescription, userCount, windows) {
  return {
    id,
    name,
    rawDescription,
    userCount,
    windows: windows.map(([winId, winName, tier]) => ({ id: winId, name: winName, tier })),
  };
}

// Mirrors the real SFRolesOverview.java response shape for the 5 fixed GOClient roles, so
// mock/demo mode and E2E tests can exercise the "Configuración > Roles" page without a live
// Etendo backend. `rawDescription` intentionally mirrors the real boilerplate AD_Role text
// (see SFRolesOverview.java's class javadoc) — the frontend never displays it directly.
function handleRolesOverviewRequest() {
  return makeResponse(200, {
    roles: [
      mockRole('9B8D736190724807AB256DC95F20EC5E', 'GOClient Admin', 'GOClient Admin', 2, [
        ['108', 'User', 'full'],
        ['146', 'Price List', 'full'],
        ['137', 'Tax', 'full'],
      ]),
      mockRole('127AE77FE2994067B7FE6495FC21D51E', 'Finance', ROLE_BOILERPLATE_DESCRIPTION, 2, [
        ['mock-financial-account', 'Financial Account', 'full'],
        ['mock-payment-in', 'Payment In', 'full'],
        ['mock-payment-out', 'Payment Out', 'full'],
        ['mock-sales-invoice', 'Sales Invoice', 'read-only'],
      ]),
      mockRole('2A159DF4F4B944A6AA903202AD35B545', 'Sales', ROLE_BOILERPLATE_DESCRIPTION, 1, [
        ['mock-business-partner', 'Business Partner', 'full'],
        ['mock-sales-order', 'Sales Order', 'full'],
        ['mock-sales-quotation', 'Sales Quotation', 'full'],
      ]),
      mockRole('A826430F723E4C1B9A53EBB0746A98C0', 'Purchasing', ROLE_BOILERPLATE_DESCRIPTION, 0, [
        ['mock-purchase-order', 'Purchase Order', 'full'],
        ['mock-purchase-invoice', 'Purchase Invoice', 'full'],
      ]),
      mockRole('55E05A4B43514A029D6FB6B8D94B49D4', 'Inventory', ROLE_BOILERPLATE_DESCRIPTION, 0, [
        ['mock-goods-receipt', 'Goods Receipt', 'full'],
        ['mock-goods-shipment', 'Goods Shipment', 'full'],
        ['mock-warehouse', 'Warehouse and Storage Bins', 'read-only'],
      ]),
    ],
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
