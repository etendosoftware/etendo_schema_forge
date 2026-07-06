import { registerImportDescriptor } from '@etendosoftware/app-shell-core/lib/import/buildOperations.js';
import { getFkResolver } from '@etendosoftware/app-shell-core/lib/import/fkResolvers.js';

const BP_TARGETS = ['name', 'etgoFirstname', 'etgoLastname', 'etgoEmail', 'etgoPhone', 'oBTIKTaxIDKey', 'creditLimit', 'taxID'];
const CONTACT_TARGETS = ['firstName', 'lastName', 'email', 'phone', 'position'];
const HAS_ADDRESS = (row) => Boolean(row.address || row.city || row.postal || row.country);

function pick(row, targets) {
  const body = {};
  for (const t of targets) if (row[t] !== undefined) body[t] = row[t];
  return body;
}

// EM_OBTIK_Tax_ID_Key (AD_Column) is mandatory with a configured DB default of '1', but
// the /batch create pipeline's own default-injection fails to apply it (server error
// references an unserialized `CachedSet` instead of the field's real value list — a
// pre-existing NEO bug, reproduced independently of this import feature: any
// businessPartner create through /batch that omits this field hits it). '1' ("NIF") is
// confirmed a valid value in the field's own AD_Ref_List, so setting it explicitly here
// sidesteps the broken server-side default path entirely rather than working around a
// symptom. Not exposed as a decisions.import field for v1 — every imported contact gets
// this identical default until a real per-row tax-id-type CSV column is needed.
const DEFAULT_TAX_ID_KEY = '1';

registerImportDescriptor('contacts', async (row, config) => {
  const bpBody = { oBTIKTaxIDKey: DEFAULT_TAX_ID_KEY, ...pick(row, BP_TARGETS) };
  const bpOp = { id: 'bp', spec: config.spec, entity: 'businessPartner', body: bpBody };
  const ops = [bpOp];

  if (HAS_ADDRESS(row)) {
    const resolveCountry = config.resolveCountryFn || getFkResolver('contacts-country');
    const countryResult = await resolveCountry(row.country, { token: config.token });
    if (countryResult.status !== 'auto-resolved') {
      throw new Error(`Row's country "${row.country}" could not be resolved to an existing record.`);
    }
    let regionId;
    if (row.region) {
      const resolveRegion = config.resolveRegionFn || getFkResolver('contacts-region');
      const regionResult = await resolveRegion(row.region, { token: config.token, countryId: countryResult.id });
      if (regionResult.status === 'auto-resolved') regionId = regionResult.id;
      // An unresolved region is not fatal — country alone satisfies C_Location's only
      // NOT NULL geography column (verified: c_region_id is nullable) — the row still
      // imports, just without a region on its location.
    }
    ops.push({
      id: 'location',
      spec: config.spec,
      entity: 'locationAddress',
      parentRef: 'bp',
      body: { address1: row.address, city: row.city, postal: row.postal, country: countryResult.id, ...(regionId ? { region: regionId } : {}) },
    });
  }

  ops.push({ id: 'contact', spec: config.spec, entity: 'contact', parentRef: 'bp', body: pick(row, CONTACT_TARGETS) });
  return ops;
});
