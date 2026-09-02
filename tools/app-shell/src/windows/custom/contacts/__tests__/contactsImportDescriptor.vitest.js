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

  // ETP-4995 (P0): the CSV template the import popup hands out ALWAYS contains the Tax ID
  // Type column ("clave nif pais residencia" — buildTemplateCsv emits every declared
  // field's first alias). A user who fills the template without deleting that column sends
  // an EMPTY cell, which arrives as '' (defined), not undefined — so `pick()` copies it and
  // the old default-first spread let it overwrite '1'. Result: MISSING_REQUIRED_FIELDS on
  // the mandatory column for every row, with no workaround other than deleting the column.
  it('regression (ETP-4995): an empty oBTIKTaxIDKey cell falls back to the default instead of overriding it', async () => {
    const row = { name: 'Acme Corp', etgoFirstname: 'Lucia', etgoLastname: 'Fernandez', etgoEmail: 'lucia@x.com', oBTIKTaxIDKey: '' };
    const ops = await buildOperations(row, { spec: 'contacts', descriptorName: 'contacts', token: 't' });
    assert.equal(ops[0].body.oBTIKTaxIDKey, '1');
  });

  it('regression (ETP-4995): a whitespace-only oBTIKTaxIDKey cell also falls back to the default', async () => {
    const row = { name: 'Acme Corp', etgoFirstname: 'Lucia', etgoLastname: 'Fernandez', etgoEmail: 'lucia@x.com', oBTIKTaxIDKey: '   ' };
    const ops = await buildOperations(row, { spec: 'contacts', descriptorName: 'contacts', token: 't' });
    assert.equal(ops[0].body.oBTIKTaxIDKey, '1');
  });

  // ETP-4995: the codes AD stores ('1'…'7', 'Y'/'N') are not what a human types into a
  // spreadsheet. Before this, only the raw code was accepted and anything else was
  // rejected by the list reference with a bare 400.
  describe('AD-coded columns', () => {
    it('accepts the human label for the Tax ID Type column and stores its AD code', async () => {
      const [op] = await buildOperations({ name: 'Acme Corp', oBTIKTaxIDKey: 'NIF' }, { spec: 'contacts', descriptorName: 'contacts', token: 't' });
      assert.equal(op.body.oBTIKTaxIDKey, '1');
    });

    it('matches the Tax ID Type label case- and accent-insensitively', async () => {
      const [op] = await buildOperations({ name: 'Acme Corp', oBTIKTaxIDKey: '  PASAPORTE ' }, { spec: 'contacts', descriptorName: 'contacts', token: 't' });
      assert.equal(op.body.oBTIKTaxIDKey, '3');
    });

    it("accepts 'CIF' as the Tax ID Type, since the column was labelled CIF/NIF before ETP-4992 renamed it to NIF", async () => {
      const [byCif] = await buildOperations({ name: 'Importadora Test SL', oBTIKTaxIDKey: 'CIF' }, { spec: 'contacts', descriptorName: 'contacts', token: 't' });
      const [bySlash] = await buildOperations({ name: 'Otra SL', oBTIKTaxIDKey: 'cif/nif' }, { spec: 'contacts', descriptorName: 'contacts', token: 't' });
      assert.equal(byCif.body.oBTIKTaxIDKey, '1');
      assert.equal(bySlash.body.oBTIKTaxIDKey, '1');
    });

    it('still accepts the raw AD code, so an Etendo-exported CSV round-trips', async () => {
      const [op] = await buildOperations({ name: 'Acme Corp', oBTIKTaxIDKey: '5' }, { spec: 'contacts', descriptorName: 'contacts', token: 't' });
      assert.equal(op.body.oBTIKTaxIDKey, '5');
    });

    it('fails the row with the accepted values when the Tax ID Type cell is unrecognized', async () => {
      await assert.rejects(
        () => buildOperations({ name: 'Acme Corp', oBTIKTaxIDKey: 'Cedula' }, { spec: 'contacts', descriptorName: 'contacts', token: 't' }),
        /Cedula.*Accepted values.*1 \(NIF\)/s,
      );
    });

    it('imports a person and a company through the etgoIsperson column', async () => {
      const [person] = await buildOperations({ name: 'Lucia Fernandez', etgoIsperson: 'Persona' }, { spec: 'contacts', descriptorName: 'contacts', token: 't' });
      const [company] = await buildOperations({ name: 'Acme Corp', etgoIsperson: 'Empresa' }, { spec: 'contacts', descriptorName: 'contacts', token: 't' });
      assert.equal(person.body.etgoIsperson, 'Y');
      assert.equal(company.body.etgoIsperson, 'N');
    });

    it('defaults etgoIsperson to the AD default (company) when the column is absent', async () => {
      const [op] = await buildOperations({ name: 'Acme Corp' }, { spec: 'contacts', descriptorName: 'contacts', token: 't' });
      assert.equal(op.body.etgoIsperson, 'N');
    });

    it('fails the row when the contact-type cell is unrecognized', async () => {
      await assert.rejects(
        () => buildOperations({ name: 'Acme Corp', etgoIsperson: 'Cooperativa' }, { spec: 'contacts', descriptorName: 'contacts', token: 't' }),
        /Cooperativa/,
      );
    });

    it('localizes the invalid-coded-value error through config.translate', async () => {
      const translate = (key, params) => (key === 'importErrorInvalidCodedValue'
        ? `Valor invalido: ${params.value}`
        : key);
      await assert.rejects(
        () => buildOperations({ name: 'Acme Corp', oBTIKTaxIDKey: 'Cedula' }, { ...{ spec: 'contacts', descriptorName: 'contacts', token: 't' }, translate }),
        /Valor invalido: Cedula/,
      );
    });
  });

  // ETP-4995: a CSV whose only name column was "nombre" used to map to etgoFirstname,
  // leaving both the commercial name and the derived searchKey empty — a silently
  // malformed business partner. "nombre" now maps to `name`; this guards the descriptor
  // itself for any caller that still reaches it without one.
  describe('commercial name guard', () => {
    it('falls back to the person name when the row carries no commercial name', async () => {
      const [op] = await buildOperations({ etgoFirstname: 'Lucia', etgoLastname: 'Fernandez' }, { spec: 'contacts', descriptorName: 'contacts', token: 't' });
      assert.equal(op.body.name, 'Lucia Fernandez');
      assert.equal(op.body.searchKey, 'Lucia Fernandez');
    });

    it('fails the row instead of creating a business partner with no name at all', async () => {
      await assert.rejects(
        () => buildOperations({ etgoEmail: 'nobody@example.com' }, { spec: 'contacts', descriptorName: 'contacts', token: 't' }),
        /no commercial name/,
      );
    });
  });

  it('carries typical company contact data into the businessPartner operation', async () => {
    const row = {
      name: 'Acme Iberia', etgoFirstname: 'Ana', etgoLastname: 'García',
      etgoEmail: 'ana@acme.example', etgoPhone: '+34 910 000 001',
      etgoWeb: 'https://acme.example', oBTIKTaxIDKey: '1', taxID: 'B12345678',
    };
    const ops = await buildOperations(row, { spec: 'contacts', descriptorName: 'contacts', token: 't' });
    assert.deepEqual(ops[0].body, {
      oBTIKTaxIDKey: '1',
      etgoIsperson: 'N',
      name: 'Acme Iberia',
      etgoFirstname: 'Ana',
      etgoLastname: 'García',
      etgoEmail: 'ana@acme.example',
      etgoPhone: '+34 910 000 001',
      etgoWeb: 'https://acme.example',
      taxID: 'B12345678',
      searchKey: 'Acme Iberia',
    });
  });

  it('builds a location operation when an imported contact includes address data', async () => {
    const resolveCountry = vi.fn().mockResolvedValue({ status: 'auto-resolved', id: 'C-ES', name: 'Spain' });
    const resolveRegion = vi.fn().mockResolvedValue({ status: 'auto-resolved', id: 'R-MAD', name: 'Madrid' });
    const ops = await buildOperations({
      name: 'Acme Iberia', etgoFirstname: 'Ana', etgoLastname: 'García',
      address: 'Calle Mayor 1', city: 'Madrid', postal: '28013', country: 'Spain', region: 'Madrid',
    }, {
      spec: 'contacts', descriptorName: 'contacts', token: 't', resolveCountryFn: resolveCountry, resolveRegionFn: resolveRegion,
    });
    const location = ops.find((op) => op.entity === 'locationAddress');
    assert.deepEqual(location.body, {
      name: 'Madrid, Calle Mayor 1', addressLine1: 'Calle Mayor 1', cityName: 'Madrid',
      postalCode: '28013', country: 'C-ES', region: 'R-MAD',
    });
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
    assert.equal(ops[0].body.searchKey.length, 40);
    assert.ok(ops[0].body.searchKey.startsWith(longName.slice(0, 32)));
    assert.equal(ops[0].body.name, longName);
  });

  // ETP-4995: a blind `.slice(0, 40)` gave every name sharing a 40-char prefix the SAME
  // C_BPartner.Value, so two distinct companies collided onto one business partner.
  it('regression (ETP-4995): two commercial names sharing a 40-char prefix get different searchKeys', async () => {
    const shared = 'Asociacion Espanola de Fabricantes de ';
    assert.ok(shared.length < 40);
    const config = { spec: 'contacts', descriptorName: 'contacts', token: 't' };
    const [a] = await buildOperations({ name: `${shared}Componentes Electronicos` }, config);
    const [b] = await buildOperations({ name: `${shared}Componentes Mecanicos` }, config);
    assert.equal(a.body.searchKey.length, 40);
    assert.equal(b.body.searchKey.length, 40);
    assert.notEqual(a.body.searchKey, b.body.searchKey);
  });

  it('regression (ETP-4995): the derived searchKey is deterministic across runs', async () => {
    const config = { spec: 'contacts', descriptorName: 'contacts', token: 't' };
    const row = { name: 'Consorcio Internacional de Servicios Logisticos Integrados' };
    const [first] = await buildOperations(row, config);
    const [second] = await buildOperations(row, config);
    assert.equal(first.body.searchKey, second.body.searchKey);
  });

  it('leaves a commercial name that already fits within 40 chars verbatim as the searchKey', async () => {
    const config = { spec: 'contacts', descriptorName: 'contacts', token: 't' };
    const [op] = await buildOperations({ name: 'Acme Iberia' }, config);
    assert.equal(op.body.searchKey, 'Acme Iberia');
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

    it('resolves an existing contact category by exact code in the single category column', async () => {
      const ops = await buildOperations(
        { name: 'Acme Corp', category: 'CLIENTS' },
        contactConfig('contacts-cat-code'),
      );
      assert.equal(ops[0].body.businessPartnerCategory, 'BPG-CLIENTS');
    });

    it('resolves an existing contact category by normalized name in the single category column', async () => {
      const ops = await buildOperations(
        { name: 'Acme Corp', category: '  CLIENTÉS  ' },
        contactConfig('contacts-cat-name'),
      );
      assert.equal(ops[0].body.businessPartnerCategory, 'BPG-CLIENTS');
    });

    it('resolves an existing contact category by name through the category column', async () => {
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
          { name: 'Acme Corp', category: 'Servicios' },
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
