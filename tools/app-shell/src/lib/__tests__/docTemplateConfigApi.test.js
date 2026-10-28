// ETP-5988 — client of GET|PUT /sws/neo/doctemplateconfig.
// @covers tools/app-shell/src/lib/docTemplateConfigApi.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMERCIAL_DOC_TYPES, currentVariant, listDocTemplateConfigs, saveDocTemplateVariant,
} from '../docTemplateConfigApi.js';

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const fail = (status, body) => ({ ok: false, status, json: async () => body });

describe('docTemplateConfigApi', () => {
  it('lists the configurations of the organization', async () => {
    const calls = [];
    const configs = await listDocTemplateConfigs(async (path) => {
      calls.push(path);
      return ok({ orgId: 'O', configs: [{ docType: 'sales-order', variant: 'modern' }] });
    });
    assert.deepEqual(calls, ['/doctemplateconfig']);
    assert.equal(configs[0].variant, 'modern');
  });

  it('a list without configs is an empty list', async () => {
    assert.deepEqual(await listDocTemplateConfigs(async () => ok({})), []);
  });

  it('a refused list carries the server message and status', async () => {
    await assert.rejects(
      listDocTemplateConfigs(async () => fail(403, { message: 'Not allowed' })),
      (e) => e.message === 'Not allowed' && e.status === 403);
  });

  it('saves one document type with only the variant, as a PUT', async () => {
    let seen;
    await saveDocTemplateVariant(async (path, options) => { seen = { path, options }; return ok({}); },
      'sales-invoice', 'compact');
    assert.equal(seen.path, '/doctemplateconfig');
    assert.equal(seen.options.method, 'PUT');
    assert.deepEqual(JSON.parse(seen.options.body), { docType: 'sales-invoice', variant: 'compact' });
  });

  it('a refused save rejects with the status; an empty error body keeps the fallback message', async () => {
    const res = { ok: false, status: 400, json: async () => { throw new Error('no body'); } };
    await assert.rejects(saveDocTemplateVariant(async () => res, 'sales-invoice', 'x'),
      (e) => e.status === 400 && /Failed to save/.test(e.message));
  });

  it('shows the first saved commercial variant and classic when nothing is saved', () => {
    assert.equal(currentVariant([]), 'classic');
    assert.equal(currentVariant([{ docType: 'purchase-order', variant: 'modern' }]), 'modern');
    assert.equal(currentVariant([{ docType: 'goods-shipment', variant: 'modern' }]), 'classic');
    assert.equal(currentVariant([{ docType: 'sales-invoice', variant: 'fancy' }]), 'classic');
    assert.equal(COMMERCIAL_DOC_TYPES.length, 4);
  });
});
