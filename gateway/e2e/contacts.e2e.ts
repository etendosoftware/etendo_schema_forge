// @covers gateway/src/public-api/public-api.controller.ts
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, cleanupCreated, createRecord, expectErrorDocument, expectStatus, resource } from './support/client.ts';
import { CONTACT_HINT, createAddress, createContact, createContactCategory, personAttributes } from './support/fixtures.ts';
import {
  expectDeleted, expectListed, expectMissingIfMatchRefused, expectPatchWithEtag, expectStaleEtagRefused,
  patch, readWithEtag, type LifecycleSpec,
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

  it('[GO] accepts a person with a name matching first_name and last_name', async () => {
    const attributes = personAttributes('matching-name');
    attributes.name = `${attributes.first_name} ${attributes.last_name}`;
    const created = await createRecord('contacts', resource('contacts', attributes), CONTACT_HINT);
    const { res } = await readWithEtag(`contacts/${created.id}`);
    const read = res.json.data.attributes;
    assert.equal(read.is_person, true);
    assert.equal(read.first_name, attributes.first_name);
    assert.equal(read.last_name, attributes.last_name);
    assert.equal(read.name, attributes.name);
  });

  it('[GO] refuses first and last name without is_person and explains how to create a person', async () => {
    const attributes = personAttributes('missing-type');
    delete attributes.is_person;
    const error = expectErrorDocument(await api('POST', 'contacts', {
      body: resource('contacts', attributes),
    }), 400);
    assert.match(error.detail, /is_person\s*:\s*true/, 'the error tells the integrator to send is_person: true');
  });

  it('[GO] switching a person to a company clears the persisted first and last name', async () => {
    const attributes = personAttributes('becomes-company');
    const created = await createRecord('contacts', resource('contacts', attributes), CONTACT_HINT);
    const { res: before, etag } = await readWithEtag(`contacts/${created.id}`);
    assert.equal(before.json.data.attributes.first_name, attributes.first_name);
    assert.equal(before.json.data.attributes.last_name, attributes.last_name);
    expectStatus(await api('PATCH', `contacts/${created.id}`, {
      body: resource('contacts', { is_person: false }, undefined, created.id),
      headers: { 'If-Match': etag },
    }), 200);
    const { res } = await readWithEtag(`contacts/${created.id}`);
    const read = res.json.data.attributes;
    assert.equal(read.is_person, false);
    for (const field of ['first_name', 'last_name']) {
      assert.ok(read[field] === null || read[field] === '', `${field} is empty in the persisted company`);
    }
    assert.equal(read.name, before.json.data.attributes.name, 'changing only the type preserves the contact name');
    assert.equal(read.phone, attributes.phone, 'changing only the type preserves the phone');
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
    assert.equal(first.type, 'contact-category', 'a lookup value is sent back as the relationship as is');
    assert.equal(typeof first.attributes.label, 'string');
    const created = await createContact('category', {}, { category: [first.type, first.id] });
    const read = (await api('GET', `contacts/${created.id}`)).json.data;
    assert.deepEqual(read.relationships.category.data, { type: 'contact-category', id: first.id });
    assert.equal(read.attributes.category, undefined, 'a relationship is never an attribute');
  });

  it('refuses the category as an attribute: it is a relationship', async () => {
    const lookup = await api('GET', 'contacts/lookups/category?page[size]=1');
    expectStatus(lookup, 200);
    const error = expectErrorDocument(await api('POST', 'contacts', {
      body: resource('contacts', { name: 'e2e-category-as-attribute', category: lookup.json.data[0].id }),
    }), 400);
    assert.match(error.detail, /relationship/);
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

describe('contact categories', () => {
  let category: LifecycleSpec;

  it('creates a contact category and reads it back with an ETag', async () => {
    const created = await createContactCategory('category', { description: 'initial' });
    category = {
      collection: 'contact-category', type: 'contact-category', id: created.id,
      firstPatch: { description: 'changed' }, secondPatch: { name: 'renamed' },
    };
    assert.equal(created.data.type, 'contact-category');
    const { res } = await readWithEtag(`contact-category/${category.id}`);
    const attributes = res.json.data.attributes;
    assert.equal(attributes.search_key, created.data.attributes.search_key);
    assert.equal(attributes.description, 'initial');
    assert.equal(attributes.is_customer, true);
    assert.equal(attributes.default, false);
  });

  it('lists the contact category', async () => {
    await expectListed(category);
  });

  it('PATCH with the ETag from the read updates only the sent field', async () => {
    const before = (await readWithEtag(`contact-category/${category.id}`)).res.json.data.attributes;
    await expectPatchWithEtag(category);
    const after = (await readWithEtag(`contact-category/${category.id}`)).res.json.data.attributes;
    assert.equal(after.description, 'changed');
    assert.equal(after.name, before.name);
  });

  it('a stale ETag is 412 and a missing If-Match is 428', async () => {
    await expectStaleEtagRefused(category);
    await expectMissingIfMatchRefused(category);
  });

  it('creates a contact in a new contact category and reads the relationship back', async () => {
    const own = await createContactCategory('category-of-contact');
    const contact = await createContact('in-new-category', {}, { category: ['contact-category', own.id] });
    const read = (await api('GET', `contacts/${contact.id}`)).json.data;
    assert.deepEqual(read.relationships.category.data, { type: 'contact-category', id: own.id });
    assert.equal(read.relationships.category.links.related, `/api/v1/contact-category/${own.id}`);
  });

  it('refuses a contact category linked with the type of the NEO spec', async () => {
    const own = await createContactCategory('category-wrong-type');
    const res = await api('POST', 'contacts', {
      body: resource('contacts', { name: 'e2e-category-wrong-type' }, { category: ['business-partner-category', own.id] }),
    });
    expectErrorDocument(res, 409);
  });

  it('refuses a contact category without a name: search_key and name are required', async () => {
    const res = await api('POST', 'contact-category', {
      body: resource('contact-category', { search_key: `e2e-category-no-name-${Date.now()}`, is_customer: true }),
    });
    // The gateway forwards the create; Etendo refuses the missing mandatory column (400 or 422).
    assert.ok([400, 422].includes(res.status), `expected 400 or 422, got ${res.status}: ${res.text.slice(0, 400)}`);
    expectErrorDocument(res, res.status);
  });

  it('deletes the contact category and it answers 404 afterwards', async () => {
    await expectDeleted(category);
  });
});

describe('contact roles: is_customer and is_vendor', () => {
  it('reads back the roles a contact is created with', async () => {
    const created = await createContact('vendor-only', { is_vendor: true, is_customer: false });
    const read = (await api('GET', `contacts/${created.id}`)).json.data.attributes;
    assert.equal(read.is_vendor, true);
    assert.equal(read.is_customer, false);
  });

  it('a contact created with neither role reads back as customer and not vendor', async () => {
    // The contact sends neither flag. It goes into its own customer category so the result is the same
    // with `contact-category-type` on (the flags come from that category) and off (the AD defaults apply).
    const own = await createContactCategory('role-defaults');
    const created = await createContact('role-defaults', {}, { category: ['contact-category', own.id] });
    const read = (await api('GET', `contacts/${created.id}`)).json.data.attributes;
    assert.equal(read.is_customer, true, 'an omitted is_customer is true');
    assert.equal(read.is_vendor, false, 'an omitted is_vendor is false');
  });

  it('PATCHing a role with the ETag changes it and leaves the other one alone', async () => {
    const created = await createContact('role-patch', { is_vendor: false, is_customer: true });
    const spec: LifecycleSpec = {
      collection: 'contacts', type: 'contacts', id: created.id, firstPatch: { is_vendor: true }, secondPatch: {},
    };
    const { etag } = await readWithEtag(`contacts/${created.id}`);
    expectStatus(await patch(spec, { is_vendor: true }, etag), 200);
    const read = (await readWithEtag(`contacts/${created.id}`)).res.json.data.attributes;
    assert.equal(read.is_vendor, true, 'the patched role changed');
    assert.equal(read.is_customer, true, 'the other role is untouched');
  });
});
