import { describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';
import { buildOperations } from '@etendosoftware/app-shell-core/lib/import/buildOperations.js';
import '../contactsImportDescriptor.js';

const baseRow = {
  name: 'Acme Corp', etgoFirstname: 'Lucia', etgoLastname: 'Fernandez', etgoEmail: 'lucia@x.com',
  address: 'Av. Siempreviva 742', city: 'Springfield', postal: '1000',
  country: 'Argentina', region: 'Córdoba',
};

describe('contacts import descriptor', () => {
  it('builds businessPartner, location, and contact ops with location parentRef to the businessPartner', async () => {
    const resolveCountry = vi.fn().mockResolvedValue({ status: 'auto-resolved', id: 'C-AR', name: 'Argentina' });
    const resolveRegion = vi.fn().mockResolvedValue({ status: 'auto-resolved', id: 'R-1', name: 'Córdoba' });
    const ops = await buildOperations(baseRow, {
      spec: 'contacts', descriptorName: 'contacts', token: 't',
      resolveCountryFn: resolveCountry, resolveRegionFn: resolveRegion,
    });
    assert.equal(ops.length, 3);
    const [bp, location, contact] = ops;
    assert.equal(bp.entity, 'businessPartner');
    assert.equal(bp.body.name, 'Acme Corp');
    assert.equal(bp.body.oBTIKTaxIDKey, '1');
    assert.equal(location.entity, 'locationAddress');
    assert.equal(location.parentRef, bp.id);
    // `locationAddress` (contacts spec) routes through ContactsLocationAddressHandler,
    // which reads addressLine1/cityName/postalCode — NOT address1/city/postal, the
    // generic entity's own (unrelated) contract field names. Sending the wrong names
    // meant the handler silently created an address with no data at all (reproduced via
    // a real import run: a raw Postgres NOT NULL violation on c_bpartner_location.name).
    assert.equal(location.body.addressLine1, 'Av. Siempreviva 742');
    assert.equal(location.body.cityName, 'Springfield');
    assert.equal(location.body.postalCode, '1000');
    assert.equal(location.body.country, 'C-AR');
    assert.equal(location.body.region, 'R-1');
    assert.equal(contact.entity, 'contact');
    assert.equal(contact.parentRef, bp.id);
  });

  it('regression: computes a human-readable location name (city, address) instead of relying on the handler\'s "." fallback', async () => {
    const resolveCountry = vi.fn().mockResolvedValue({ status: 'auto-resolved', id: 'C-AR', name: 'Argentina' });
    const row = { ...baseRow, region: undefined };
    const ops = await buildOperations(row, {
      spec: 'contacts', descriptorName: 'contacts', token: 't', resolveCountryFn: resolveCountry,
    });
    const location = ops.find((op) => op.entity === 'locationAddress');
    assert.equal(location.body.name, 'Springfield, Av. Siempreviva 742');
  });

  it('regression: falls back to "Location" as the name when the row has a country but no city/address text', async () => {
    const resolveCountry = vi.fn().mockResolvedValue({ status: 'auto-resolved', id: 'C-AR', name: 'Argentina' });
    const row = { name: 'Acme Corp', etgoFirstname: 'Lucia', etgoLastname: 'Fernandez', etgoEmail: 'lucia@x.com', country: 'Argentina' };
    const ops = await buildOperations(row, {
      spec: 'contacts', descriptorName: 'contacts', token: 't', resolveCountryFn: resolveCountry,
    });
    const location = ops.find((op) => op.entity === 'locationAddress');
    assert.equal(location.body.name, 'Location');
  });

  it('omits the location op entirely when no address fields are present on the row', async () => {
    const row = { name: 'Acme Corp', etgoFirstname: 'Lucia', etgoLastname: 'Fernandez', etgoEmail: 'lucia@x.com' };
    const ops = await buildOperations(row, { spec: 'contacts', descriptorName: 'contacts', token: 't' });
    assert.equal(ops.find((op) => op.entity === 'locationAddress'), undefined);
  });

  it('defaults oBTIKTaxIDKey to a valid enum value (NIF) when the row has no tax-id-key column', async () => {
    const row = { name: 'Acme Corp', etgoFirstname: 'Lucia', etgoLastname: 'Fernandez', etgoEmail: 'lucia@x.com' };
    const ops = await buildOperations(row, { spec: 'contacts', descriptorName: 'contacts', token: 't' });
    assert.equal(ops[0].body.oBTIKTaxIDKey, '1');
  });

  it('lets a row-supplied oBTIKTaxIDKey override the default', async () => {
    const row = { name: 'Acme Corp', etgoFirstname: 'Lucia', etgoLastname: 'Fernandez', etgoEmail: 'lucia@x.com', oBTIKTaxIDKey: '3' };
    const ops = await buildOperations(row, { spec: 'contacts', descriptorName: 'contacts', token: 't' });
    assert.equal(ops[0].body.oBTIKTaxIDKey, '3');
  });

  it('surfaces an unresolved country as a thrown, catchable error the caller can turn into a row-level failure', async () => {
    const resolveCountry = vi.fn().mockResolvedValue({ status: 'needs-review', candidates: [] });
    await assert.rejects(
      () => buildOperations(baseRow, { spec: 'contacts', descriptorName: 'contacts', token: 't', resolveCountryFn: resolveCountry }),
      /country .* could not be resolved/i,
    );
  });

  it('regression: defaults searchKey (C_BPartner.Value) to the row\'s name — required by the DB, hidden from every create form, no server-side default', async () => {
    // Reproduced via a real import run: `null value in column "value" of relation
    // "c_bpartner" violates not-null constraint`. Confirmed against
    // artifacts/contacts/contract.json that searchKey has `required: true, form: false`
    // (hidden from every BusinessPartner create form, this one included) and against the
    // AD_Column config that there is no server-side default or sequence for it — the
    // manual "Nuevo contacto" flow only succeeds because useEntity.js's own createRecord
    // path applies this exact fallback before calling
    // POST /sws/neo/contacts/businessPartner. This composite descriptor builds /batch
    // operations directly, bypassing useEntity.js entirely, so it must replicate the
    // same fallback itself.
    const row = { name: 'Acme Corp', etgoFirstname: 'Lucia', etgoLastname: 'Fernandez', etgoEmail: 'lucia@x.com' };
    const ops = await buildOperations(row, { spec: 'contacts', descriptorName: 'contacts', token: 't' });
    assert.equal(ops[0].body.searchKey, 'Acme Corp');
  });
});
