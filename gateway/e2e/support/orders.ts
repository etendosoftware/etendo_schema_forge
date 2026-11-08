// @covers gateway/src/public-api/public-api.controller.ts
// The master-child document flow shared by sales-order and purchase-order.
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanupCreated, createRecord, expectStatus, resource, api } from './client.ts';
import { createAddress, createContact, createProduct, firstWarehouseId } from './fixtures.ts';
import {
  expectDeleted, expectListed, expectMissingIfMatchRefused, expectPatchWithEtag, expectStaleEtagRefused,
  readWithEtag, type LifecycleSpec,
} from './lifecycle.ts';

export function describeOrderFlow(kind: 'sales-order' | 'purchase-order'): void {
  after(cleanupCreated);

  describe(`${kind} with lines`, () => {
    let order: LifecycleSpec;
    let line: LifecycleSpec;
    let grossBefore = 0;
    let contactId = '';
    let productId = '';

    it('creates header and line from prerequisites', async () => {
      const contact = await createContact('partner');
      contactId = contact.id;
      const address = await createAddress(contactId);
      const product = await createProduct('item');
      productId = product.id;
      const warehouseId = await firstWarehouseId();

      const header = await createRecord(
        kind,
        resource(kind, { order_date: '2026-10-14', partner_address: address.id }, {
          business_partner: ['contacts', contactId],
          warehouse: ['warehouse', warehouseId],
        }),
      );
      order = { collection: kind, type: kind, id: header.id, firstPatch: { order_date: '2026-10-15' }, secondPatch: { order_date: '2026-10-16' } };
      assert.equal(header.data.relationships?.business_partner?.data?.id, contactId);

      const created = await createRecord(
        `${kind}/${order.id}/lines`,
        resource(`${kind}-lines`, { ordered_quantity: 2, list_price: 25, discount: 0 }, { product: ['product', productId] }),
      );
      line = {
        collection: `${kind}/${order.id}/lines`, type: `${kind}-lines`, id: created.id,
        firstPatch: { ordered_quantity: 3 }, secondPatch: { description: 'stale write must not land' },
      };
      grossBefore = Number(created.data.attributes.line_gross_amount);
      assert.ok(Number.isFinite(grossBefore) && grossBefore > 0, 'the line carries a positive line_gross_amount');
    });

    it('reads the header with its ETag and a grand total, and lists it', async () => {
      const { res } = await readWithEtag(`${kind}/${order.id}`);
      const total = res.json.data.attributes.grand_total_amount;
      assert.equal(typeof total, 'number', 'grand_total_amount is present');
      assert.ok(total > 0, 'grand_total_amount is positive once a line exists');
      await expectListed(order);
      await expectListed(line);
    });

    it('PATCHing the line quantity recomputes its amount, and the header total follows', async () => {
      await expectPatchWithEtag(line);
      const reread = (await readWithEtag(`${line.collection}/${line.id}`)).res.json.data.attributes;
      assert.equal(String(reread.ordered_quantity), '3');
      assert.ok(Number(reread.line_gross_amount) > grossBefore, 'line_gross_amount grew with the quantity');
      const header = await api('GET', `${kind}/${order.id}`);
      expectStatus(header, 200);
      assert.ok(Number(header.json.data.attributes.grand_total_amount) >= Number(reread.line_gross_amount), 'header total covers the line');
    });

    it('line: a stale ETag is 412 and a missing If-Match is 428', async () => {
      await expectStaleEtagRefused(line);
      await expectMissingIfMatchRefused(line);
    });

    it('header: PATCH with the ETag from the read, stale is 412, missing is 428', async () => {
      await expectPatchWithEtag(order);
      await expectStaleEtagRefused(order);
      await expectMissingIfMatchRefused(order);
    });

    it('deletes the line and the draft header, and both answer 404 afterwards', async () => {
      await expectDeleted(line);
      await expectDeleted(order);
    });
  });
}
