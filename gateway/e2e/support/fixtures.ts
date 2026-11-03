// @covers gateway/src/public-api/public-api.controller.ts
// Prerequisite records shared by the document flows (contact + address, product, warehouse).
import assert from 'node:assert/strict';
import { api, createRecord, expectStatus, resource } from './client.ts';
import { RUN_PREFIX } from './env.ts';

export const CONTACT_HINT =
  'Locally this is usually a 502 because the tenant lacks the EM_Etgo_Identifier sequence (known environment gap, not a gateway bug).';

export async function createContact(label: string) {
  return createRecord(
    'contacts',
    resource('contacts', { name: `${RUN_PREFIX}-${label}`, email: `${RUN_PREFIX}-${label}@example.com`, phone: '600000000' }),
    CONTACT_HINT,
  );
}

export async function createAddress(contactId: string, attributes: Record<string, unknown> = {}) {
  return createRecord(
    `contacts/${contactId}/location-address`,
    resource('contacts-locationAddress', {
      name: `${RUN_PREFIX}-address`,
      address_line1: 'Calle Mayor 1',
      city_name: 'Madrid',
      postal_code: '28001',
      country: 'ES',
      ship_to_address: true,
      invoice_to_address: true,
      ...attributes,
    }),
  );
}

export async function createProduct(label: string, attributes: Record<string, unknown> = {}) {
  return createRecord(
    'product',
    resource('product', { search_key: `${RUN_PREFIX}-${label}`, name: `${RUN_PREFIX}-${label}`, ...attributes }),
  );
}

export async function firstWarehouseId(): Promise<string> {
  const res = await api('GET', 'warehouse?page[size]=1');
  expectStatus(res, 200, 'orders need a warehouse; the tenant has none readable through the public API');
  const id = res.json.data?.[0]?.id;
  assert.ok(id, 'no warehouse available to create an order');
  return id;
}
