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
      warehouseId = await firstWarehouseId(kind);

      const header = await createDraftOrder(kind, { contactId, addressId, warehouseId });
      order = { collection: kind, type: kind, id: header.id, firstPatch: { order_date: '2026-10-15' }, secondPatch: { order_date: '2026-10-16' } };
      assert.equal(header.data.relationships?.business_partner?.data?.id, contactId);
      assert.equal(header.data.attributes.warehouse, warehouseId);
      assert.equal(header.data.relationships?.warehouse, undefined);

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

    it('assigns a warehouse on create when the new order omits it', async () => {
      const draft = await createRecord(
        kind,
        resource(kind, { order_date: '2026-10-14', partner_address: addressId }, { business_partner: ['contacts', contactId] }),
        'an order without warehouse is accepted',
      );
      const { res } = await readWithEtag(`${kind}/${draft.id}`);
      const warehouse = res.json.data.attributes.warehouse;
      assert.equal(typeof warehouse, 'string', 'the created order carries a warehouse');
      assert.ok(warehouse.length > 0, 'Etendo assigned a non-empty warehouse');
      await expectDeleted({ collection: kind, id: draft.id });
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

    // An order in a currency other than the organization's (docs/public-api.md 4.12): the header
    // carries the tenant's conversion rate as `currency_rate`, and a line created without a price
    // is priced from the catalog converted with that rate.
    describe('foreign currency', () => {
      const orderDate = new Date().toISOString().slice(0, 10);
      let setup: ForeignCurrencySetup | undefined;
      let skipReason = '';
      let foreign: LifecycleSpec;

      it('finds a foreign currency with a published conversion rate from the organization currency', async (t) => {
        const found = await findForeignCurrency(kind, { contactId, addressId, warehouseId }, orderDate);
        if (typeof found === 'string') {
          skipReason = found;
          t.skip(found);
          return;
        }
        setup = found;
      });

      it('answers the published rate as currency_rate on create, and a line without list_price is converted', async (t) => {
        if (!setup) return t.skip(skipReason);
        const { currencyId, rate, catalogPrice, productId: pricedProductId } = setup;
        const header = await createDraftOrder(kind, { contactId, addressId, warehouseId }, { order_date: orderDate, currency: currencyId });
        foreign = { collection: kind, type: kind, id: header.id, firstPatch: {}, secondPatch: {} };
        assert.equal(header.data.attributes.currency, currencyId);
        assert.equal(Number(header.data.attributes.currency_rate), rate, 'currency_rate is the multiple_rate_by of the published conversion rate');

        const line = await createRecord(
          `${kind}/${header.id}/lines`,
          resource(`${kind}-lines`, { ordered_quantity: 1, discount: 0 }, { product: ['product', pricedProductId] }),
        );
        assert.equal(Number(line.data.attributes.list_price), round2(catalogPrice * rate),
          `list_price is the catalog price ${catalogPrice} x rate ${rate}, rounded to 2 decimals`);
      });

      it('a line created WITH list_price keeps it unchanged', async (t) => {
        if (!setup) return t.skip(skipReason);
        const line = await createRecord(
          `${kind}/${foreign.id}/lines`,
          resource(`${kind}-lines`, { ordered_quantity: 1, list_price: 7.77, discount: 0 }, { product: ['product', setup.productId] }),
        );
        assert.equal(Number(line.data.attributes.list_price), 7.77, 'a caller price is in the document currency and is never converted');
      });

      it('a PATCH sending currency_rate keeps the sent rate', async (t) => {
        if (!setup) return t.skip(skipReason);
        const sent = round2(setup.rate * 2 + 0.5);
        const { etag } = await readWithEtag(itemPath(foreign));
        const res = await patch(foreign, { currency_rate: sent }, etag);
        expectStatus(res, 200);
        assert.equal(Number(res.json.data.attributes.currency_rate), sent, 'the PATCH answers the rate that was sent');
        const { res: reread } = await readWithEtag(itemPath(foreign));
        assert.equal(Number(reread.json.data.attributes.currency_rate), sent, 'the rate is kept on read');
      });

      it('accepts currency_rate on create and keeps the sent rate', async (t) => {
        if (!setup) return t.skip(skipReason);
        const sent = round2(setup.rate * 3 + 0.25);
        const header = await createDraftOrder(kind, { contactId, addressId, warehouseId },
          { order_date: orderDate, currency: setup.currencyId, currency_rate: sent });
        assert.equal(Number(header.data.attributes.currency_rate), sent, 'a rate sent on create is kept, not replaced by the published one');
      });
    });

    // Runs last: a completed order cannot be deleted, so it outlives the run (see cleanupCreated).
    // The integrator's flow, with no id known beforehand: look a payment method up, set it on the
    // contact, create an order (it inherits it) and complete it.
    describe('complete action', () => {
      let draft: LifecycleSpec;
      let completable: LifecycleSpec;
      let paymentMethodId = '';
      const contactField = CONTACT_PAYMENT_FIELD[kind];

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

      it('looks a payment method up on the contact and on the order, and an undeclared lookup is 404 unknown_lookup', async () => {
        const contactLookup = await api('GET', `contacts/lookups/${contactField}?page[size]=100`);
        expectStatus(contactLookup, 200);
        const values: Array<{ type: string; id: string; attributes: { label: string | null } }> = contactLookup.json.data;
        assert.ok(values.length > 0, EMPTY_LOOKUP);
        for (const value of values) {
          assert.equal(value.type, 'payment-method');
          assert.equal(typeof value.id, 'string');
        }
        const [first] = values;
        paymentMethodId = first.id;

        const orderLookup = await api('GET', `${kind}/lookups/payment_method?page[size]=100`);
        expectStatus(orderLookup, 200);
        assert.ok(orderLookup.json.data.some((value: { id: string }) => value.id === paymentMethodId),
          `the ${kind} lookup offers the payment method the contact lookup offered`);

        if (first.attributes.label) {
          const searched = await api('GET', `${kind}/lookups/payment_method?filter[search]=${encodeURIComponent(first.attributes.label)}`);
          expectStatus(searched, 200);
          assert.ok(searched.json.data.some((value: { id: string }) => value.id === paymentMethodId), 'filter[search] by its label finds it');
        }

        expectErrorDocument(await api('GET', `${kind}/lookups/payment_terms`), 404, 'unknown_lookup');
      });

      it('sets the payment method on the contact with If-Match, and a new order inherits it', async () => {
        assert.ok(paymentMethodId, 'the lookup test must run first');
        const contact: LifecycleSpec = { collection: 'contacts', type: 'contacts', id: contactId, firstPatch: {}, secondPatch: {} };
        const { etag } = await readWithEtag(itemPath(contact));
        const updated = await patch(contact, { [contactField]: paymentMethodId }, etag);
        expectStatus(updated, 200);
        assert.equal(updated.json.data.attributes[contactField], paymentMethodId, `the contact reads back its ${contactField}`);

        const header = await createDraftOrder(kind, { contactId, addressId, warehouseId });
        await createRecord(
          `${kind}/${header.id}/lines`,
          resource(`${kind}-lines`, { ordered_quantity: 1, list_price: 10, discount: 0 }, { product: ['product', productId] }),
        );
        completable = { collection: kind, type: kind, id: header.id, firstPatch: { order_date: '2026-10-15' }, secondPatch: {} };
        assert.equal(header.data.attributes.payment_method, paymentMethodId, 'the order inherits the payment method of its contact');
      });

      it('completes the order: 200, and it reads back with document_status CO', async () => {
        const res = await api('POST', `${kind}/${completable.id}/actions/complete`);
        expectStatus(res, 200);
        assert.equal(res.json.data.id, completable.id, 'the answer is the order re-read after the action');
        assert.equal(res.json.data.attributes.document_status, 'CO', 'the answer shows the new status');
        assert.notEqual(res.json.meta?.alreadyApplied, true, 'the first completion really ran');

        const reread = await api('GET', itemPath(completable));
        expectStatus(reread, 200);
        assert.equal(reread.json.data.attributes.document_status, 'CO');
      });

      it('completing it again answers 200 with meta.alreadyApplied', async () => {
        const res = await api('POST', `${kind}/${completable.id}/actions/complete`);
        expectStatus(res, 200);
        assert.equal(res.json.meta?.alreadyApplied, true);
        assert.equal(res.json.data.attributes.document_status, 'CO');
      });

      it('a PATCH and a DELETE on the completed order are refused and leave it unchanged', async () => {
        const { etag } = await readWithEtag(itemPath(completable));
        expectErrorDocument(await patch(completable, completable.firstPatch, etag), COMPLETED_WRITE_STATUS);
        expectErrorDocument(await api('DELETE', itemPath(completable)), COMPLETED_WRITE_STATUS);
        const { res } = await readWithEtag(itemPath(completable));
        assert.equal(res.json.data.attributes.document_status, 'CO');
        assert.notEqual(String(res.json.data.attributes.order_date), '2026-10-15', 'the refused PATCH did not land');
      });

      it('a PATCH sending only currency_rate on the completed order answers 422 and leaves the rate unchanged', async () => {
        const { res: before, etag } = await readWithEtag(itemPath(completable));
        const rateBefore = Number(before.json.data.attributes.currency_rate);
        const sent = rateBefore + 0.5;
        expectErrorDocument(await patch(completable, { currency_rate: sent }, etag), COMPLETED_WRITE_STATUS);
        const { res } = await readWithEtag(itemPath(completable));
        assert.equal(Number(res.json.data.attributes.currency_rate), rateBefore, 'the refused PATCH did not change currency_rate');
      });
    });
  });
}

/** The contact field an order of each kind inherits its payment method from. */
const CONTACT_PAYMENT_FIELD = { 'sales-order': 'payment_method', 'purchase-order': 'purchase_payment_method' } as const;

const EMPTY_LOOKUP = 'the payment-method lookup answered no value: the test tenant needs at least one active payment method '
  + '(the lookup lists the same payment methods the app offers)';

/** Status the API answers to a write on a completed order (Etendo's own document rule). */
const COMPLETED_WRITE_STATUS = 422;

async function createDraftOrder(
  kind: string,
  { contactId, addressId, warehouseId }: { contactId: string; addressId: string; warehouseId: string },
  extra: Record<string, unknown> = {},
) {
  return createRecord(
    kind,
    resource(kind, { order_date: '2026-10-14', partner_address: addressId, warehouse: warehouseId, ...extra }, {
      business_partner: ['contacts', contactId],
    }),
  );
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

interface ForeignCurrencySetup { currencyId: string; rate: number; catalogPrice: number; productId: string }

const MAX_PRODUCT_CANDIDATES = 10;

/**
 * The organization currency is read from a draft order created without `currency` (Etendo defaults
 * it), and the foreign one from the first published conversion rate that starts at it and is valid
 * on `orderDate`. The catalog price of a product is what the same line costs on that org-currency
 * order (no `list_price` sent), which is the price list the foreign order converts, so the
 * expectation does not depend on how the tenant maintains product prices. Returns the reason to
 * skip when the tenant lacks the setup.
 */
async function findForeignCurrency(
  kind: string,
  ids: { contactId: string; addressId: string; warehouseId: string },
  orderDate: string,
): Promise<ForeignCurrencySetup | string> {
  const probe = await createDraftOrder(kind, ids, { order_date: orderDate });
  const orgCurrency = probe.data.attributes.currency;
  if (typeof orgCurrency !== 'string' || !orgCurrency) return `the ${kind} created without currency carries no currency: cannot tell the organization currency`;

  const rates = await api('GET', 'conversion-rates?page[size]=100');
  expectStatus(rates, 200);
  const match = (rates.json.data as Array<{ attributes: Record<string, any> }>).find(({ attributes: a }) =>
    a.currency === orgCurrency && a.to_currency && a.to_currency !== orgCurrency && Number(a.multiple_rate_by) > 0
    && (!a.valid_from_date || a.valid_from_date <= orderDate) && (!a.valid_to_date || a.valid_to_date >= orderDate));
  if (!match) {
    return `the tenant has no conversion rate from the organization currency (${orgCurrency}) valid on ${orderDate}: `
      + 'add one (Currency > Conversion Rates) to run the foreign-currency order checks';
  }

  const products = await api('GET', `product?page[size]=${MAX_PRODUCT_CANDIDATES}`);
  expectStatus(products, 200);
  for (const product of products.json.data as Array<{ id: string }>) {
    const res = await api('POST', `${kind}/${probe.id}/lines`, {
      body: resource(`${kind}-lines`, { ordered_quantity: 1, discount: 0 }, { product: ['product', product.id] }),
    });
    if (res.status !== 201) continue;
    const price = Number(res.json.data.attributes.list_price);
    if (Number.isFinite(price) && price > 0) {
      return { currencyId: match.attributes.to_currency, rate: Number(match.attributes.multiple_rate_by), catalogPrice: price, productId: product.id };
    }
  }
  return `no product among the first ${MAX_PRODUCT_CANDIDATES} has a positive catalog price on the ${kind} price list: `
    + 'the tenant needs a priced product to check the conversion';
}
