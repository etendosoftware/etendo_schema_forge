// @covers gateway/src/public-api/public-api.controller.ts
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, cleanupCreated, createRecord, expectErrorDocument, expectStatus, resource } from './support/client.ts';
import { CONTACT_HINT, createAddress, createContact, personAttributes } from './support/fixtures.ts';
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
    assert.equal(row.attributes.country_code, 'ES', 'the address created with country ES reads back its ISO code');
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

// A contact is a person (is_person true: first_name and last_name, name derived) or a company
// (name). Cases marked [GO] need the person/company rules of the Etendo GO server: a server
// without them answers 201 where a 400 is expected, or leaves the derived name empty.
describe('contacts as a person or a company', () => {
  it('[GO] creates a person from first and last name and reads back is_person and the derived name', async () => {
    const attributes = personAttributes('person');
    const created = await createRecord('contacts', resource('contacts', attributes), CONTACT_HINT);
    const res = await api('GET', `contacts/${created.id}`);
    expectStatus(res, 200);
    const read = res.json.data.attributes;
    assert.equal(read.is_person, true);
    assert.equal(read.first_name, attributes.first_name);
    assert.equal(read.last_name, 'Person');
    assert.equal(read.name, `${attributes.first_name} Person`, 'name is derived from first_name and last_name');
    assert.equal(read.phone, '600000001', 'a person keeps its phone');
  });

  it('creates a company with name, and reads it back as not a person', async () => {
    const created = await createContact('company', { is_person: false });
    const read = (await api('GET', `contacts/${created.id}`)).json.data.attributes;
    assert.equal(read.is_person, false);
    assert.match(read.name, /-company$/);
    assert.equal(read.phone, '600000000', 'a company keeps its phone');
  });

  it('[GO] refuses a company with first_name', async () => {
    const res = await api('POST', 'contacts', {
      body: resource('contacts', { name: 'e2e-company-with-first-name', first_name: 'Ana' }),
    });
    expectErrorDocument(res, 400);
  });

  it('[GO] refuses a person without last_name', async () => {
    const attributes = personAttributes('no-last-name');
    delete attributes.last_name;
    expectErrorDocument(await api('POST', 'contacts', { body: resource('contacts', attributes) }), 400);
  });

  it('[GO] refuses a person with name', async () => {
    const attributes = { ...personAttributes('with-name'), name: 'e2e-person-with-name' };
    expectErrorDocument(await api('POST', 'contacts', { body: resource('contacts', attributes) }), 400);
  });

  it('lists the contact categories and creates a contact in one of them', async () => {
    const lookup = await api('GET', 'contacts/lookups/category?page[size]=5');
    expectStatus(lookup, 200, 'the category selector offers no value');
    const first = lookup.json.data?.[0];
    assert.ok(first, 'no contact category available');
    assert.equal(first.type, 'business-partner-category');
    assert.equal(typeof first.attributes.label, 'string');
    const created = await createContact('category', { category: first.id });
    const read = (await api('GET', `contacts/${created.id}`)).json.data.attributes;
    assert.equal(read.category, first.id);
  });

  it('accepts tax_id_key with a valid NIF and reads the key back', async () => {
    const created = await createContact('tax-id-key', { tax_id_key: '1', tax_id: '12345678Z' });
    const read = (await api('GET', `contacts/${created.id}`)).json.data.attributes;
    assert.equal(read.tax_id_key, '1');
    assert.equal(read.tax_id, '12345678Z');
  });

  it('refuses an invalid NIF on create, with the key sent and [GO] with the key defaulted', async () => {
    // 12345678 takes the control letter Z; A makes the NIF invalid.
    expectErrorDocument(await api('POST', 'contacts', {
      body: resource('contacts', { name: 'e2e-invalid-nif', tax_id_key: '1', tax_id: '12345678A' }),
    }), 400);
    expectErrorDocument(await api('POST', 'contacts', {
      body: resource('contacts', { name: 'e2e-invalid-nif-default-key', tax_id: '12345678A' }),
    }), 400);
  });
});
