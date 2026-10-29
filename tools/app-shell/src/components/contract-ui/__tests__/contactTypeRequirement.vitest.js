// @covers tools/app-shell/src/components/contract-ui/contactTypeRequirement.js
// @covers tools/app-shell/src/components/contract-ui/contactCategoryFlags.js
/**
 * The create-contact popup opened from a document must produce a contact the document can use:
 * a purchase needs a vendor, a sale a customer. The contact's type now comes from its CATEGORY,
 * so the check reads the category's flags and refuses one that does not grant the type.
 * Unknown flags (refused read, network error, row without the columns) and a legacy category
 * with neither flag are let through — the backend still refuses a contact with no type at all.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildContactTypeCreateCheck, contactTypeRequirementFor } from '../contactTypeRequirement.js';
import { contactCategoryApiBaseUrl } from '../contactCategoryFlags.js';

const ui = (key, params) => `${key}|${params?.category ?? ''}`;
const DATA = { businessPartnerCategory: 'G-1', 'businessPartnerCategory$_identifier': 'Cliente' };

const row = (customer, vendor) => async () => ({
  ok: true, json: async () => ({ response: { data: [{ id: 'G-1', etgoIscustomer: customer, etgoIsvendor: vendor }] } }),
});
const refused = async () => ({ ok: false, json: async () => ({}) });
const thrown = async () => { throw new Error('network down'); };
const noFlags = async () => ({ ok: true, json: async () => ({ response: { data: [{ id: 'G-1', name: 'Cliente' }] } }) });

describe('buildContactTypeCreateCheck', () => {
  it.each([
    ['purchase, customer-only category', 'purchase', row('Y', 'N'), 'contactCategoryNotVendor|Cliente'],
    ['purchase, vendor category', 'purchase', row('N', 'Y'), null],
    ['purchase, both types', 'purchase', row(true, true), null],
    ['sale, vendor-only category', 'sale', row(false, 'true'), 'contactCategoryNotCustomer|Cliente'],
    ['sale, customer category', 'sale', row('Y', 'N'), null],
    ['purchase, legacy category with neither flag', 'purchase', row('N', 'N'), null],
    ['purchase, category read refused', 'purchase', refused, null],
    ['purchase, category read throws', 'purchase', thrown, null],
    ['purchase, row without the flag columns', 'purchase', noFlags, null],
  ])('%s -> %s', async (_label, documentType, impl, expected) => {
    const apiFetch = vi.fn(impl);
    const check = buildContactTypeCreateCheck({ requirement: contactTypeRequirementFor(documentType), apiFetch, ui });
    await expect(check(DATA)).resolves.toBe(expected);
    expect(apiFetch).toHaveBeenCalledWith('/businessPartnerCategory/G-1');
  });

  it.each([[undefined], [null], ['other']])('imposes no check when the document nature is %s', (documentType) => {
    expect(buildContactTypeCreateCheck({ requirement: contactTypeRequirementFor(documentType), apiFetch: vi.fn(), ui }))
      .toBeUndefined();
  });

  it('lets a form with no category through without reading anything', async () => {
    const apiFetch = vi.fn();
    const check = buildContactTypeCreateCheck({ requirement: contactTypeRequirementFor('purchase'), apiFetch, ui });
    await expect(check({})).resolves.toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('contactCategoryApiBaseUrl', () => {
  it.each([
    ['/sws/neo/contacts', '/sws/neo/business-partner-category'],
    ['https://host/etendo/sws/neo/contacts/', 'https://host/etendo/sws/neo/business-partner-category'],
    [null, null],
  ])('derives the category spec base from %s', (input, expected) => {
    expect(contactCategoryApiBaseUrl(input)).toBe(expected);
  });
});
