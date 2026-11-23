// @covers gateway/src/public-api/public-api.controller.ts
// Read-only reference data published from windows outside the default categories:
// taxes, tax categories and conversion rates. GET and LIST only; a write is an
// operation the resource does not expose, which the gateway answers 404 without
// calling Etendo (docs/public-api.md 4.2).
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RUN_PREFIX } from './support/env.ts';
import { api, cleanupCreated, expectErrorDocument, expectStatus, resource } from './support/client.ts';
import { itemPath, patch, readWithEtag } from './support/lifecycle.ts';

after(cleanupCreated);

// `attributes` is a plausible write body; `change` a one-field PATCH. Both must be refused before
// anything reaches Etendo.
const resources: Array<{ name: string; attributes: Record<string, unknown>; change: Record<string, unknown> }> = [
  { name: 'tax', attributes: { name: `${RUN_PREFIX}-tax`, rate: 1 }, change: { name: `${RUN_PREFIX}-renamed` } },
  { name: 'tax-category', attributes: { name: `${RUN_PREFIX}-tax-category` }, change: { name: `${RUN_PREFIX}-renamed` } },
  { name: 'conversion-rates', attributes: { multiple_rate_by: 1, divide_rate_by: 1 }, change: { multiple_rate_by: 2 } },
];

for (const { name, attributes, change } of resources) {
  describe(`${name} (read-only)`, () => {
    let firstId: string | undefined;

    it(`lists ${name}`, async () => {
      const res = await api('GET', `${name}?page[size]=5`);
      expectStatus(res, 200);
      assert.ok(Array.isArray(res.json.data), 'list data is an array');
      for (const row of res.json.data) assert.equal(row.type, name);
      firstId = res.json.data[0]?.id;
    });

    it(`reads one ${name} record`, async (t) => {
      if (!firstId) {
        t.skip(`the tenant has no ${name} record to read`);
        return;
      }
      const res = await api('GET', `${name}/${firstId}`);
      expectStatus(res, 200);
      assert.equal(res.json.data.type, name);
      assert.equal(res.json.data.id, firstId);
      assert.ok(res.headers.get('etag'), 'a read carries an ETag');
    });

    it(`refuses a write on ${name} with 404: POST is not exposed`, async () => {
      const error = expectErrorDocument(await api('POST', name, { body: resource(name, attributes) }), 404);
      assert.match(error.detail, new RegExp(`Operation POST is not exposed for ${name}`));
    });

    it(`refuses PATCH and DELETE on one ${name} record with 404, and the record is unchanged`, async (t) => {
      if (!firstId) {
        t.skip(`the tenant has no ${name} record to write to`);
        return;
      }
      const spec = { collection: name, type: name, id: firstId, firstPatch: change, secondPatch: change };
      const { res: before, etag } = await readWithEtag(itemPath(spec));
      // A current ETag, so the only thing wrong with the request is the operation.
      const patched = expectErrorDocument(await patch(spec, change, etag), 404);
      assert.match(patched.detail, new RegExp(`Operation PATCH is not exposed for ${name}`));
      const deleted = expectErrorDocument(await api('DELETE', itemPath(spec)), 404);
      assert.match(deleted.detail, new RegExp(`Operation DELETE is not exposed for ${name}`));
      const { res: after } = await readWithEtag(itemPath(spec));
      assert.deepEqual(after.json.data.attributes, before.json.data.attributes, 'a refused write leaves the record as it was');
    });
  });
}

describe('tax (relationships)', () => {
  it('links a tax to its tax category', async (t) => {
    const res = await api('GET', 'tax?page[size]=1');
    expectStatus(res, 200);
    const tax = res.json.data[0];
    if (!tax) {
      t.skip('the tenant has no tax to read');
      return;
    }
    const link = tax.relationships?.tax_category?.data;
    assert.ok(link, 'a tax carries its tax category as a relationship');
    assert.equal(link.type, 'tax-category');
    expectStatus(await api('GET', `tax-category/${link.id}`), 200, 'the related tax category is readable');
  });
});
