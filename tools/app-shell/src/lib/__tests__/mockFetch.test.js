import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMockFetch } from '../mockFetch.js';

const mockData = {
  order: [
    { id: 'mock-001', documentNo: 'SO-00001', businessPartner: 'Acme Corp', docStatus: 'DR' },
    { id: 'mock-002', documentNo: 'SO-00002', businessPartner: 'TechFlow Inc', docStatus: 'CO' },
  ],
  orderLine: [
    { id: 'mock-line-001', orderId: 'mock-001', product: 'Laptop', quantity: 5 },
    { id: 'mock-line-002', orderId: 'mock-001', product: 'Mouse', quantity: 10 },
    { id: 'mock-line-003', orderId: 'mock-002', product: 'Keyboard', quantity: 3 },
  ],
};
const basePath = '/etendo_sf/api';

describe('createMockFetch', () => {
  it('returns a function', () => {
    const mockFetch = createMockFetch(mockData, basePath);
    assert.equal(typeof mockFetch, 'function');
  });

  it('GET list returns all records for an entity', async () => {
    const mockFetch = createMockFetch(mockData, basePath);
    const res = await mockFetch(`${basePath}/order`);
    assert.equal(res.ok, true);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.length, 2);
    assert.equal(data[0].documentNo, 'SO-00001');
  });

  it('GET returns 404 for unknown entity', async () => {
    const mockFetch = createMockFetch(mockData, basePath);
    const res = await mockFetch(`${basePath}/invoice`);
    assert.equal(res.ok, false);
    assert.equal(res.status, 404);
  });

  it('GET by id returns single record', async () => {
    const mockFetch = createMockFetch(mockData, basePath);
    const res = await mockFetch(`${basePath}/order/mock-001`);
    assert.equal(res.ok, true);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.id, 'mock-001');
    assert.equal(data.businessPartner, 'Acme Corp');
  });

  it('GET by id returns 404 for unknown id', async () => {
    const mockFetch = createMockFetch(mockData, basePath);
    const res = await mockFetch(`${basePath}/order/mock-999`);
    assert.equal(res.ok, false);
    assert.equal(res.status, 404);
  });

  it('GET children returns filtered by parentId', async () => {
    const mockFetch = createMockFetch(mockData, basePath);
    const res = await mockFetch(`${basePath}/order/mock-001/orderLine`);
    assert.equal(res.ok, true);
    const data = await res.json();
    assert.equal(data.length, 2);
    assert.ok(data.every(line => line.orderId === 'mock-001'));
  });

  it('POST creates with generated id, returns 201', async () => {
    const mockFetch = createMockFetch(mockData, basePath);
    const res = await mockFetch(`${basePath}/order`, {
      method: 'POST',
      body: JSON.stringify({ documentNo: 'SO-00003', businessPartner: 'NewCo' }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.id, 'should have a generated id');
    assert.equal(data.documentNo, 'SO-00003');

    // Verify it was added to the store
    const listRes = await mockFetch(`${basePath}/order`);
    const list = await listRes.json();
    assert.equal(list.length, 3);
  });

  it('PUT updates and returns merged record', async () => {
    const mockFetch = createMockFetch(mockData, basePath);
    const res = await mockFetch(`${basePath}/order/mock-001`, {
      method: 'PUT',
      body: JSON.stringify({ businessPartner: 'Acme Corp Updated' }),
    });
    assert.equal(res.ok, true);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.businessPartner, 'Acme Corp Updated');
    assert.equal(data.documentNo, 'SO-00001'); // original field preserved
  });

  it('POST process returns success and toggles docStatus', async () => {
    const mockFetch = createMockFetch(mockData, basePath);
    const res = await mockFetch(`${basePath}/process/completeOrder`, {
      method: 'POST',
      body: JSON.stringify({ id: 'mock-001' }),
    });
    assert.equal(res.ok, true);
    const data = await res.json();
    assert.equal(data.status, 'success');

    // Verify docStatus changed from DR to CO
    const orderRes = await mockFetch(`${basePath}/order/mock-001`);
    const order = await orderRes.json();
    assert.equal(order.docStatus, 'CO');
  });

  it('POST process with voidOrder sets docStatus to VO', async () => {
    const mockFetch = createMockFetch(mockData, basePath);
    const res = await mockFetch(`${basePath}/process/voidOrder`, {
      method: 'POST',
      body: JSON.stringify({ id: 'mock-001' }),
    });
    assert.equal(res.ok, true);
    const data = await res.json();
    assert.equal(data.status, 'success');

    const orderRes = await mockFetch(`${basePath}/order/mock-001`);
    const order = await orderRes.json();
    assert.equal(order.docStatus, 'VO');
  });

  it('POST email contract send returns a mock contract success', async () => {
    const mockFetch = createMockFetch(mockData, basePath);
    const res = await mockFetch(`${basePath}/email-contracts/sales-invoice-send/send`, {
      method: 'POST',
      body: JSON.stringify({ version: 'v1', recordId: 'mock-001', intent: 'send-document' }),
    });
    assert.equal(res.ok, true);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'SENT');
    assert.match(data.auditId, /^mock-email-/);
  });

  it('PUT to unknown entity returns 404', async () => {
    const mockFetch = createMockFetch(mockData, basePath);
    const res = await mockFetch(`${basePath}/invoice/mock-001`, {
      method: 'PUT',
      body: JSON.stringify({ total: 100 }),
    });
    assert.equal(res.ok, false);
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.error, 'Entity not found');
  });

  it('PUT to unknown id returns 404', async () => {
    const mockFetch = createMockFetch(mockData, basePath);
    const res = await mockFetch(`${basePath}/order/mock-999`, {
      method: 'PUT',
      body: JSON.stringify({ businessPartner: 'Ghost' }),
    });
    assert.equal(res.ok, false);
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.error, 'Record not found');
  });

  it('GET SFWindowAccessMap returns full access regardless of basePath', async () => {
    const mockFetch = createMockFetch(mockData, basePath);
    // This endpoint lives under /sws/neo/, not under `basePath` — it must be
    // intercepted anyway (see ETP-4520 App.jsx `fetchWindowAccess`).
    const res = await mockFetch('/etendo_sf/sws/neo/windowaccessmap');
    assert.equal(res.ok, true);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.windowAccess['any-window-id'], 'full');
    assert.equal(data.windowAccess['another-window-id'], 'full');
    assert.equal(data.capabilities.showAccountingFields, true);
  });

  it('non-API URL returns undefined (passthrough)', async () => {
    const mockFetch = createMockFetch(mockData, basePath);
    const result = await mockFetch('https://example.com/other');
    assert.equal(result, undefined);
  });

  it('deep clones mockData to avoid mutation across instances', async () => {
    const fetch1 = createMockFetch(mockData, basePath);
    await fetch1(`${basePath}/order`, {
      method: 'POST',
      body: JSON.stringify({ documentNo: 'SO-NEW' }),
    });

    // A new instance should still have only the original 2 orders
    const fetch2 = createMockFetch(mockData, basePath);
    const res = await fetch2(`${basePath}/order`);
    const data = await res.json();
    assert.equal(data.length, 2);
  });
});
