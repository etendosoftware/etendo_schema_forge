// @covers gateway/src/public-api/public-api.controller.ts
// The master-child document flow shared by sales-order and purchase-order.
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, cleanupCreated, createRecord, expectErrorDocument, expectStatus, resource } from './client.ts';
import { createAddress, createContact, createProduct, firstWarehouseId } from './fixtures.ts';
import {
  expectDeleted, expectListed, expectMissingIfMatchRefused, expectPatchWithEtag, expectStaleEtagRefused,
  itemPath, patch, readWithEtag, type LifecycleSpec,
} from './lifecycle.ts';

export function describeOrderFlow(kind: 'sales-order' | 'purchase-order'): void {
  after(cleanupCreated);

  describe(`${kind} with lines`, () => {
    let order: LifecycleSpec;
    let line: LifecycleSpec;
    let grossBefore = 0;
    let contactId = '';
    let addressId = '';
    let productId = '';
    let warehouseId = '';

    it('creates header and line from prerequisites', async () => {
      const contact = await createContact('partner');
      contactId = contact.id;
      addressId = (await createAddress(contactId)).id;
      const product = await createProduct('item');
      productId = product.id;
      warehouseId = await firstWarehouseId();

      const header = await createDraftOrder(kind, { contactId, addressId, warehouseId });
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

    // Runs last: a completed order cannot be deleted, so it outlives the run (see cleanupCreated).
    describe('complete action', () => {
      let draft: LifecycleSpec;

      it('refuses to complete an order without a payment method: 422, and it stays a draft', async () => {
        const header = await createDraftOrder(kind, { contactId, addressId, warehouseId });
        await createRecord(
          `${kind}/${header.id}/lines`,
          resource(`${kind}-lines`, { ordered_quantity: 1, list_price: 10, discount: 0 }, { product: ['product', productId] }),
        );
        draft = { collection: kind, type: kind, id: header.id, firstPatch: { order_date: '2026-10-15' }, secondPatch: {} };
        assert.equal(header.data.attributes.document_status, 'DR', 'a new order is a draft');
        assert.equal(header.data.attributes.payment_method, null, 'a contact created through the API has no payment method');

        // Etendo's own rule (C_Order_Post) refuses it: proof that the action really reaches the document process.
        expectErrorDocument(await api('POST', `${kind}/${header.id}/actions/complete`), 422, 'business_rule');
        const { res } = await readWithEtag(itemPath(draft));
        assert.equal(res.json.data.attributes.document_status, 'DR');
      });

      it('an action the resource does not declare answers 404 unknown_action', async () => {
        expectErrorDocument(await api('POST', `${kind}/${draft.id}/actions/void`), 404, 'unknown_action');
      });

      it('completes the order once it has a payment method: 200, and it reads back with document_status CO',
        NEEDS_PAYMENT_METHOD,
        async () => {
          const { etag } = await readWithEtag(itemPath(draft));
          expectStatus(await patch(draft, { payment_method: PAYMENT_METHOD_ID }, etag), 200);

          const res = await api('POST', `${kind}/${draft.id}/actions/complete`);
          expectStatus(res, 200);
          assert.equal(res.json.data.id, draft.id, 'the answer is the order re-read after the action');
          assert.equal(res.json.data.attributes.document_status, 'CO', 'the answer shows the new status');
          assert.notEqual(res.json.meta?.alreadyApplied, true, 'the first completion really ran');

          const reread = await api('GET', itemPath(draft));
          expectStatus(reread, 200);
          assert.equal(reread.json.data.attributes.document_status, 'CO');
        });

      it('completing it again answers 200 with meta.alreadyApplied', NEEDS_PAYMENT_METHOD, async () => {
        const res = await api('POST', `${kind}/${draft.id}/actions/complete`);
        expectStatus(res, 200);
        assert.equal(res.json.meta?.alreadyApplied, true);
        assert.equal(res.json.data.attributes.document_status, 'CO');
      });

      it('a PATCH and a DELETE on the completed order are refused and leave it unchanged',
        NEEDS_PAYMENT_METHOD,
        async () => {
          const { etag } = await readWithEtag(itemPath(draft));
          expectErrorDocument(await patch(draft, draft.firstPatch, etag), COMPLETED_WRITE_STATUS);
          expectErrorDocument(await api('DELETE', itemPath(draft)), COMPLETED_WRITE_STATUS);
          const { res } = await readWithEtag(itemPath(draft));
          assert.equal(res.json.data.attributes.document_status, 'CO');
          assert.notEqual(String(res.json.data.attributes.order_date), '2026-10-15', 'the refused PATCH did not land');
        });
    });
  });
}

/**
 * Etendo completes an order only with a payment method, and the public API publishes no resource
 * that lists them (nor the contact's payment method), so the suite takes one from the environment.
 */
const PAYMENT_METHOD_ID = process.env.PUBLIC_API_E2E_PAYMENT_METHOD_ID?.trim() || undefined;
const NO_PAYMENT_METHOD = 'set PUBLIC_API_E2E_PAYMENT_METHOD_ID (a payment method id of the tenant) to complete an order';
/** Skips a test that completes an order when no payment method is configured. */
const NEEDS_PAYMENT_METHOD = { skip: PAYMENT_METHOD_ID ? false : NO_PAYMENT_METHOD };

/** Status the API answers to a write on a completed order (Etendo's own document rule). */
const COMPLETED_WRITE_STATUS = 422;

async function createDraftOrder(
  kind: string,
  { contactId, addressId, warehouseId }: { contactId: string; addressId: string; warehouseId: string },
) {
  return createRecord(
    kind,
    resource(kind, { order_date: '2026-10-14', partner_address: addressId }, {
      business_partner: ['contacts', contactId],
      warehouse: ['warehouse', warehouseId],
    }),
  );
}
