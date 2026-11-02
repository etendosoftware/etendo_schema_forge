// @covers gateway/src/public-api/public-api.controller.ts
// The JSON:API error contract (docs/public-api.md 4.1, 4.3, 4.8, 4.10).
// Gateway-originated errors have no `code` per the docs, so `code` is asserted
// only where the docs promise one.
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { API_KEY_READONLY, RUN_PREFIX } from './support/env.ts';
import { api, cleanupCreated, expectErrorDocument, MISSING_ID, resource } from './support/client.ts';
import { createAddress, createContact } from './support/fixtures.ts';

after(cleanupCreated);

describe('authentication errors', () => {
  it('401 when the Authorization header is missing', async () => {
    const error = expectErrorDocument(await api('GET', 'product', { key: null }), 401);
    assert.match(error.detail, /Missing API key/);
  });

  it('401 when the credential is not <id>:<secret>', async () => {
    const error = expectErrorDocument(await api('GET', 'product', { key: 'no-colon-here' }), 401);
    assert.match(error.detail, /Malformed API key/);
  });

  it('401 when the key is unknown or wrong', async () => {
    const error = expectErrorDocument(await api('GET', 'product', { key: 'etgo-doesnotexist:wrong-secret' }), 401);
    assert.match(error.detail, /Invalid API key/);
  });
});

describe('not found', () => {
  it('404 for an unknown record id', async () => {
    expectErrorDocument(await api('GET', `product/${MISSING_ID}`), 404);
  });

  it('404 for an unknown resource', async () => {
    const error = expectErrorDocument(await api('GET', `no-such-resource-${RUN_PREFIX}`), 404);
    assert.match(error.detail, /Unknown public entity/);
  });

  it('404 for a child resource addressed at top level', async () => {
    expectErrorDocument(await api('GET', 'sales-order-lines'), 404);
  });
});

describe('write validation', () => {
  it('400 for an attribute that is not in the manifest', async () => {
    const res = await api('POST', 'product', {
      body: resource('product', { search_key: `${RUN_PREFIX}-x`, name: `${RUN_PREFIX}-x`, no_such_field: 'x' }),
    });
    const error = expectErrorDocument(res, 400);
    assert.match(error.detail, /no_such_field/);
  });

  it('400 for a read-only field (sale_price, updated)', async () => {
    for (const field of ['sale_price', 'updated']) {
      const res = await api('POST', 'product', {
        body: resource('product', { search_key: `${RUN_PREFIX}-ro`, name: `${RUN_PREFIX}-ro`, [field]: field === 'updated' ? '2026-01-01T00:00:00Z' : 10 }),
      });
      const error = expectErrorDocument(res, 400);
      assert.match(error.detail, new RegExp(field));
    }
  });

  it('400 for an invalid country code on an address', async () => {
    const contact = await createContact('country');
    const res = await api('POST', `contacts/${contact.id}/location-address`, {
      body: resource('contacts-locationAddress', { address_line1: 'x', city_name: 'x', postal_code: '1', country: 'ZZ' }),
    });
    expectErrorDocument(res, 400);
    const ok = await createAddress(contact.id); // the same contact accepts a valid code
    assert.ok(ok.id);
  });

  // 422 is reachable only through an Etendo business rule; none of the published
  // resources exposes an action in v1 (complete is opt-in), so a missing required
  // field is the validation failure within reach. Etendo may answer 400 or 422.
  it('a missing required field yields a validation error document (400 or 422)', async () => {
    const res = await api('POST', 'product', { body: resource('product', { search_key: `${RUN_PREFIX}-noname` }) });
    assert.ok([400, 422].includes(res.status), `expected 400 or 422, got ${res.status}: ${res.text.slice(0, 400)}`);
    expectErrorDocument(res, res.status);
  });

  it('400 with code invalid_query_parameter and source.parameter for an unknown filter field', async () => {
    const error = expectErrorDocument(await api('GET', 'product?filter[no_such_field]=x'), 400, 'invalid_query_parameter');
    assert.ok(error.source?.parameter, 'source.parameter names the offending parameter');
  });
});

describe('write-protected key', { skip: API_KEY_READONLY ? false : 'PUBLIC_API_KEY_READONLY is not set' }, () => {
  it('403 when a read-only key tries to create', async () => {
    const res = await api('POST', 'product', {
      key: API_KEY_READONLY!,
      body: resource('product', { search_key: `${RUN_PREFIX}-403`, name: `${RUN_PREFIX}-403` }),
    });
    if (res.status === 201) await api('DELETE', `product/${res.json.data.id}`); // never leave a record if the key was not read-only
    expectErrorDocument(res, 403);
  });
});
