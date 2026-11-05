// @covers gateway/src/public-api/public-api.controller.ts
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, cleanupCreated, expectStatus } from './support/client.ts';
import { createAddress, createContact } from './support/fixtures.ts';
import {
  expectDeleted, expectListed, expectMissingIfMatchRefused, expectPatchWithEtag, expectStaleEtagRefused,
  readWithEtag, type LifecycleSpec,
} from './support/lifecycle.ts';

after(cleanupCreated);

describe('contacts and their location address', () => {
  let contact: LifecycleSpec;
  let address: LifecycleSpec;

  it('creates a contact and reads it back with an ETag', async () => {
    const created = await createContact('contact');
    contact = { collection: 'contacts', type: 'contacts', id: created.id, firstPatch: { web: 'example.com' }, secondPatch: { phone: '600000002' } };
    assert.match(created.data.attributes.name, /^e2e-/);
    const { res } = await readWithEtag(`contacts/${contact.id}`);
    assert.equal(res.json.data.attributes.email, created.data.attributes.email);
  });

  it('lists the contact', async () => {
    await expectListed(contact);
  });

  it('creates a location address through its master and lists its fields', async () => {
    const created = await createAddress(contact.id);
    address = {
      collection: `contacts/${contact.id}/location-address`, type: 'contacts-locationAddress', id: created.id,
      firstPatch: { city_name: 'Sevilla' }, secondPatch: { city_name: 'Bilbao' },
    };
    await expectListed(address);
    const list = await api('GET', address.collection);
    expectStatus(list, 200);
    const row = list.json.data.find((r: any) => r.id === address.id);
    for (const field of ['address_line1', 'city_name', 'postal_code', 'country']) {
      assert.ok(row.attributes[field] !== undefined && row.attributes[field] !== null, `list row carries ${field}`);
    }
  });

  it('PATCHing one address field keeps the others', async () => {
    const before = (await readWithEtag(`${address.collection}/${address.id}`)).res.json.data.attributes;
    await expectPatchWithEtag(address);
    const after = (await readWithEtag(`${address.collection}/${address.id}`)).res.json.data.attributes;
    assert.equal(after.city_name, 'Sevilla');
    for (const field of ['address_line1', 'postal_code', 'country', 'name']) {
      assert.equal(after[field], before[field], `${field} is unchanged by a single-field PATCH`);
    }
  });

  it('address: a stale ETag is 412 and a missing If-Match is 428', async () => {
    await expectStaleEtagRefused(address);
    await expectMissingIfMatchRefused(address);
  });

  it('PATCHes the contact with the ETag from its read', async () => {
    await expectPatchWithEtag(contact);
  });

  it('contact: a stale ETag is 412 and a missing If-Match is 428', async () => {
    await expectStaleEtagRefused(contact);
    await expectMissingIfMatchRefused(contact);
  });

  it('deletes the address and the contact, and both answer 404 afterwards', async () => {
    await expectDeleted(address);
    await expectDeleted(contact);
  });
});
