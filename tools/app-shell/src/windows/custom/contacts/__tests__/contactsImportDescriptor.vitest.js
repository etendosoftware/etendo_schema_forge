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
    // baseRow has no contact-level firstName/lastName, only BP-level
    // etgoFirstname/etgoLastname ('Lucia'/'Fernandez') — falls back to those.
    assert.equal(contact.body.name, 'Lucia Fernandez');
  });

  it('regression: derives contact.name (AD_User.Name) from the contact-level firstName/lastName when both are present, mirroring the server-side ContactHandler derivation', async () => {
    const row = { name: 'Acme Corp', etgoFirstname: 'Lucia', etgoLastname: 'Fernandez', etgoEmail: 'lucia@x.com', firstName: 'Andres', lastName: 'Rojaz' };
    const ops = await buildOperations(row, { spec: 'contacts', descriptorName: 'contacts', token: 't' });
    const contact = ops.find((op) => op.entity === 'contact');
    assert.equal(contact.body.name, 'Andres Rojaz');
  });

  it('regression: falls back to the BP-level etgoFirstname/etgoLastname when the contact-level firstName/lastName are blank', async () => {
    // Reproduced via a real import run: `null value in column "name" of relation
    // "ad_user" violates not-null constraint`. Confirmed against
    // artifacts/contacts/contract.json that contact.name has `required: true,
    // form: false` — same pattern as businessPartner.searchKey. The CSV's
    // contact-level firstName/lastName columns are frequently blank (the row's real
    // name lives in etgoFirstname/etgoLastname instead), so useEntity.js's own
    // firstName+lastName-only derivation isn't enough on its own here.
    const row = { name: 'Acme Corp', etgoFirstname: 'Andrés', etgoLastname: 'Rojaz', etgoEmail: 'lucia@x.com' };
    const ops = await buildOperations(row, { spec: 'contacts', descriptorName: 'contacts', token: 't' });
    const contact = ops.find((op) => op.entity === 'contact');
    assert.equal(contact.body.name, 'Andrés Rojaz');
  });

  it('regression: falls back all the way to the BusinessPartner\'s own name when no person name is available at all', async () => {
    const row = { name: 'Acme Corp', etgoEmail: 'lucia@x.com' };
    const ops = await buildOperations(row, { spec: 'contacts', descriptorName: 'contacts', token: 't' });
    const contact = ops.find((op) => op.entity === 'contact');
    assert.equal(contact.body.name, 'Acme Corp');
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

  it('regression (ETP-4669): localizes the unresolved-country error via config.translate when ImportDialog injects one', async () => {
    // The descriptor is module-scope async code (no hooks), so it can't call useUI() — the
    // dialog injects the app translator as config.translate. When present, the thrown error is
    // the localized string with the row's country interpolated, not the English fallback.
    const resolveCountry = vi.fn().mockResolvedValue({ status: 'needs-review', candidates: [] });
    const translate = vi.fn((key, params) => `No se pudo resolver el país "${params.country}".`);
    await assert.rejects(
      () => buildOperations(baseRow, { spec: 'contacts', descriptorName: 'contacts', token: 't', resolveCountryFn: resolveCountry, translate }),
      /No se pudo resolver el país "Argentina"\./,
    );
    assert.ok(
      translate.mock.calls.some(([key, params]) => key === 'importErrorCountryUnresolved' && params?.country === 'Argentina'),
      'expected the descriptor to call translate with the importErrorCountryUnresolved key and the row country',
    );
  });

  it('regression: defaults searchKey (C_BPartner.Value) to the row\'s name — required by the DB, hidden from every create form, no server-side default', async () => {
    // Reproduced via a real import run: `null value in column "value" of relation
    // "c_bpartner" violates not-null constraint`. Confirmed against
    // artifacts/contacts/contract.json that searchKey has `required: true, form: false`
    // (hidden from every BusinessPartner create form, this one included) and against the
    // AD_Column config that there is no server-side default or sequence for it — the
    // manual "New contact" flow only succeeds because useEntity.js's own createRecord
    // path applies this exact fallback before calling
    // POST /sws/neo/contacts/businessPartner. This composite descriptor builds /batch
    // operations directly, bypassing useEntity.js entirely, so it must replicate the
    // same fallback itself.
    const row = { name: 'Acme Corp', etgoFirstname: 'Lucia', etgoLastname: 'Fernandez', etgoEmail: 'lucia@x.com' };
    const ops = await buildOperations(row, { spec: 'contacts', descriptorName: 'contacts', token: 't' });
    assert.equal(ops[0].body.searchKey, 'Acme Corp');
  });

  it('regression: truncates searchKey (C_BPartner.Value) to 40 chars for a long commercial name, without truncating name itself', async () => {
    // Reproduced via a real import run: a 48-char commercial name produced
    // `Value too long. Length 48, maximum allowed 40` from C_BPartner.Value's
    // AD column constraint. Name itself has more headroom (60), so it must
    // stay untouched.
    const longName = 'Guajardo Davila, Lugo Paz y Muro Serna Asociados Legal'; // > 40 chars
    assert.ok(longName.length > 40);
    const row = { name: longName, etgoFirstname: 'Lucia', etgoLastname: 'Fernandez', etgoEmail: 'lucia@x.com' };
    const ops = await buildOperations(row, { spec: 'contacts', descriptorName: 'contacts', token: 't' });
    assert.equal(ops[0].body.searchKey, longName.slice(0, 40));
    assert.equal(ops[0].body.searchKey.length, 40);
    assert.equal(ops[0].body.name, longName);
  });

  describe('contact category resolution and auto-creation', () => {
    const existingCategories = [
      { id: 'BPG-CLIENTS', searchKey: 'CLIENTS', name: 'Clientes' },
      { id: 'BPG-SUPPLIERS', searchKey: 'SUPPLIERS', name: 'Proveedores' },
      { id: 'BPG-DUP-1', searchKey: 'SERVICES-1', name: 'Servicios' },
      { id: 'BPG-DUP-2', searchKey: 'SERVICES-2', name: 'Servicios' },
    ];

    const contactConfig = (token, overrides = {}) => ({
      spec: 'contacts', descriptorName: 'contacts', token,
      existingCategories: [...existingCategories],
      ...overrides,
    });

    it('resolves an existing contact category by exact categoryCode', async () => {
      const ops = await buildOperations(
        { name: 'Acme Corp', categoryCode: 'CLIENTS' },
        contactConfig('contacts-cat-code'),
      );
      assert.equal(ops[0].body.businessPartnerCategory, 'BPG-CLIENTS');
    });

    it('resolves an existing contact category by normalized categoryName', async () => {
      const ops = await buildOperations(
        { name: 'Acme Corp', categoryName: '  CLIENTÉS  ' },
        contactConfig('contacts-cat-name'),
      );
      assert.equal(ops[0].body.businessPartnerCategory, 'BPG-CLIENTS');
    });

    it('resolves an existing contact category through the legacy category column', async () => {
      const ops = await buildOperations(
        { name: 'Acme Corp', category: 'Proveedores' },
        contactConfig('contacts-cat-legacy'),
      );
      assert.equal(ops[0].body.businessPartnerCategory, 'BPG-SUPPLIERS');
    });

    it('auto-creates a missing contact category with a deterministic code', async () => {
      const createCategoryFn = vi.fn(async ({ searchKey, name }) => ({ id: 'BPG-NEW', searchKey, name }));
      const ops = await buildOperations(
        { name: 'Acme Corp', category: 'Distribución Especial' },
        contactConfig('contacts-cat-create', { createCategoryFn }),
      );
      assert.equal(ops[0].body.businessPartnerCategory, 'BPG-NEW');
      assert.deepEqual(createCategoryFn.mock.calls[0][0], {
        searchKey: 'DISTRIBUCION_ESPECIAL', name: 'Distribución Especial',
      });
    });

    it('reuses one in-flight category creation across concurrent contact rows', async () => {
      const createCategoryFn = vi.fn(async ({ searchKey, name }) => ({ id: 'BPG-SHARED', searchKey, name }));
      const rows = [
        { name: 'Acme One', category: 'Retail' },
        { name: 'Acme Two', category: 'Retail' },
        { name: 'Acme Three', category: 'Retail' },
      ];
      const results = await Promise.all(rows.map((row) => buildOperations(
        row,
        contactConfig('contacts-cat-concurrent', { createCategoryFn }),
      )));
      assert.equal(createCategoryFn.mock.calls.length, 1);
      for (const ops of results) assert.equal(ops[0].body.businessPartnerCategory, 'BPG-SHARED');
    });

    it('rejects ambiguous normalized category names without guessing', async () => {
      await assert.rejects(
        () => buildOperations(
          { name: 'Acme Corp', categoryName: 'Servicios' },
          contactConfig('contacts-cat-ambiguous'),
        ),
        /Multiple records match "Servicios"/,
      );
    });

    it('keeps legacy imports valid when no category column is present', async () => {
      const ops = await buildOperations(
        { name: 'Acme Corp', etgoEmail: 'legacy@example.com' },
        contactConfig('contacts-cat-legacy-empty'),
      );
      assert.equal(ops[0].body.businessPartnerCategory, undefined);
    });

    it('surfaces category creation failures as row-level errors', async () => {
      const createCategoryFn = vi.fn().mockRejectedValue(new Error('Category service unavailable'));
      await assert.rejects(
        () => buildOperations(
          { name: 'Acme Corp', category: 'Blocked Category' },
          contactConfig('contacts-cat-create-error', { createCategoryFn }),
        ),
        /Category service unavailable/,
      );
    });
  });
});
