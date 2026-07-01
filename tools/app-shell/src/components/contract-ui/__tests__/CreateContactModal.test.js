import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'CreateContactModal.jsx'), 'utf8');

describe('CreateContactModal', () => {
  it('accepts bpApiBaseUrl, headers, onClose, onCreated, initialQuery, documentType props', () => {
    assert.match(src, /bpApiBaseUrl/);
    assert.match(src, /headers/);
    assert.match(src, /onClose/);
    assert.match(src, /onCreated/);
    assert.match(src, /initialQuery/);
    assert.match(src, /documentType/);
  });

  it('includes etgoIsperson in the BP create payload', () => {
    assert.match(src, /etgoIsperson/);
  });

  it('sets etgoIsperson based on contactType being person', () => {
    assert.match(src, /etgoIsperson: contactType === 'person'/);
  });

  it('POSTs to the businessPartner endpoint', () => {
    assert.match(src, /\/businessPartner/);
    assert.match(src, /method: 'POST'/);
  });

  it('includes etgoFirstname and etgoLastname in person mode payload', () => {
    assert.match(src, /etgoFirstname/);
    assert.match(src, /etgoLastname/);
  });

  it('includes name (legal name) in company mode payload', () => {
    assert.match(src, /contactType === 'company' && legalName/);
  });

  it('exposes ContactModeToggle with Person and Company options', () => {
    assert.match(src, /ContactModeToggle/);
    assert.match(src, /ui\('Person'\)/);
    assert.match(src, /ui\('company'\)/);
  });

  it('initializes contactType state to company', () => {
    assert.match(src, /useState\('company'\)/);
  });

  it('renders different header fields for person vs company mode', () => {
    assert.match(src, /contactType === 'person'/);
    assert.match(src, /contactLegalName/);
    assert.match(src, /contactFirstName/);
    assert.match(src, /contactLastName/);
  });

  it('auto-checks customer flag when documentType is sale', () => {
    assert.match(src, /documentType === 'sale'/);
    assert.match(src, /isCustomer/);
  });

  it('auto-checks vendor flag when documentType is purchase', () => {
    assert.match(src, /documentType === 'purchase'/);
    assert.match(src, /isVendor/);
  });

  it('passes locale as language param in country selector fetch URL', () => {
    assert.match(src, /language=\$\{locale\}/);
  });

  it('fetches country selectors from C_Country_ID endpoint', () => {
    assert.match(src, /selectors\/C_Country_ID/);
  });
});
