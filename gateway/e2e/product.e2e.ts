// @covers gateway/src/public-api/public-api.controller.ts
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanupCreated } from './support/client.ts';
import { createProduct } from './support/fixtures.ts';
import {
  expectDeleted, expectListed, expectMissingIfMatchRefused, expectPatchWithEtag, expectStaleEtagRefused,
  readWithEtag, type LifecycleSpec,
} from './support/lifecycle.ts';

after(cleanupCreated);

describe('product', () => {
  let product: LifecycleSpec;

  it('creates a product and reads it back with an ETag', async () => {
    const created = await createProduct('product', { description: 'initial' });
    product = { collection: 'product', type: 'product', id: created.id, firstPatch: { description: 'changed' }, secondPatch: { name: 'renamed' } };
    const { res } = await readWithEtag(`product/${product.id}`);
    assert.equal(res.json.data.attributes.search_key, created.data.attributes.search_key);
    assert.equal(res.json.data.attributes.description, 'initial');
  });

  it('lists the product', async () => {
    await expectListed(product);
  });

  it('PATCH with the ETag from the read updates only the sent field', async () => {
    const before = (await readWithEtag(`product/${product.id}`)).res.json.data.attributes;
    await expectPatchWithEtag(product);
    const after = (await readWithEtag(`product/${product.id}`)).res.json.data.attributes;
    assert.equal(after.description, 'changed');
    assert.equal(after.name, before.name);
  });

  it('a stale ETag is 412 and a missing If-Match is 428', async () => {
    await expectStaleEtagRefused(product);
    await expectMissingIfMatchRefused(product);
  });

  it('deletes the product and it answers 404 afterwards', async () => {
    await expectDeleted(product);
  });
});
