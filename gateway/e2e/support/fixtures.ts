// @covers gateway/src/public-api/public-api.controller.ts
// Prerequisite records shared by the document flows (contact + address, product, warehouse).
import assert from 'node:assert/strict';
import { api, createRecord, expectStatus, resource } from './client.ts';
import { RUN_PREFIX } from './env.ts';

export const CONTACT_HINT =
  'Locally this is usually a 502 because the tenant lacks the EM_Etgo_Identifier sequence (known environment gap, not a gateway bug).';

/**
 * Creates a company: a contact with `name` and no `is_person` (a contact is a company by default).
 * `relationships` maps a relationship field to [type, id], e.g. `{ category: ['contact-category', id] }`.
 */
export async function createContact(label: string, attributes: Record<string, unknown> = {}, relationships?: Record<string, [string, string]>) {
  return createRecord(
    'contacts',
    resource('contacts', { name: `${RUN_PREFIX}-${label}`, email: `${RUN_PREFIX}-${label}@example.com`, phone: '600000000', ...attributes }, relationships),
    CONTACT_HINT,
  );
}

/**
 * Creates a contact category. It is a customer category and never the default one: with the
 * contact-type rules on, Etendo refuses a category that is neither customer nor vendor, and the
 * vendor flag is not published.
 */
export async function createContactCategory(label: string, attributes: Record<string, unknown> = {}) {
  return createRecord(
    'contact-category',
    resource('contact-category', {
      search_key: `${RUN_PREFIX}-${label}`, name: `${RUN_PREFIX}-${label}`, default: false, is_customer: true, ...attributes,
    }),
  );
}

/** Attributes of a person: `is_person` with a first and last name, never `name` (Etendo derives it). */
export function personAttributes(label: string): Record<string, unknown> {
  return {
    is_person: true, first_name: `${RUN_PREFIX}-${label}`, last_name: 'Person',
    email: `${RUN_PREFIX}-${label}@example.com`, phone: '600000001',
  };
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

export async function firstWarehouseId(kind: 'sales-order' | 'purchase-order'): Promise<string> {
  const res = await api('GET', `${kind}/lookups/warehouse?page[size]=1`);
  expectStatus(res, 200, 'orders need a warehouse; the UI selector offers no warehouse');
  const id = res.json.data?.[0]?.id;
  assert.ok(id, 'no warehouse available to create an order');
  assert.equal(res.json.data[0].type, 'warehouse');
  return id;
}
