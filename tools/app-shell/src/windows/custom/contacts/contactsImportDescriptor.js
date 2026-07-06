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

registerImportDescriptor('contacts', async (row, config) => {
  const bpOp = { id: 'bp', spec: config.spec, entity: 'businessPartner', body: pick(row, BP_TARGETS) };
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
