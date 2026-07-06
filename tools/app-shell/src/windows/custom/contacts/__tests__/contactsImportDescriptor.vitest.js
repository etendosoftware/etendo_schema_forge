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
    assert.equal(location.entity, 'locationAddress');
    assert.equal(location.parentRef, bp.id);
    assert.equal(location.body.country, 'C-AR');
    assert.equal(location.body.region, 'R-1');
    assert.equal(contact.entity, 'contact');
    assert.equal(contact.parentRef, bp.id);
  });

  it('omits the location op entirely when no address fields are present on the row', async () => {
    const row = { name: 'Acme Corp', etgoFirstname: 'Lucia', etgoLastname: 'Fernandez', etgoEmail: 'lucia@x.com' };
    const ops = await buildOperations(row, { spec: 'contacts', descriptorName: 'contacts', token: 't' });
    assert.equal(ops.find((op) => op.entity === 'locationAddress'), undefined);
  });

  it('surfaces an unresolved country as a thrown, catchable error the caller can turn into a row-level failure', async () => {
    const resolveCountry = vi.fn().mockResolvedValue({ status: 'needs-review', candidates: [] });
    await assert.rejects(
      () => buildOperations(baseRow, { spec: 'contacts', descriptorName: 'contacts', token: 't', resolveCountryFn: resolveCountry }),
      /country .* could not be resolved/i,
    );
  });
});
