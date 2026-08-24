import { registerImportDescriptor } from '@etendosoftware/app-shell-core/lib/import/buildOperations.js';
import { getFkResolver } from '@etendosoftware/app-shell-core/lib/import/fkResolvers.js';
import { resolveOrAutoCreateDependentEntity, getResolutionCache } from '@etendosoftware/app-shell-core/lib/import/resolveDependentEntity.js';
import { readCredentialHeaders, writeHeaders } from '../../../lib/sessionHeaders.js';

const BP_TARGETS = ['name', 'etgoFirstname', 'etgoLastname', 'etgoEmail', 'etgoPhone', 'etgoWeb', 'oBTIKTaxIDKey', 'creditLimit', 'taxID'];
const CONTACT_TARGETS = ['firstName', 'lastName', 'email', 'phone', 'position'];
const HAS_ADDRESS = (row) => Boolean(row.address || row.city || row.postal || row.country);
const businessPartnerCategoriesCache = new Map();

function detectEtendoBase() {
  if (typeof window !== 'undefined' && window.location) {
    const path = window.location.pathname;
    const webIdx = path.indexOf('/web/');
    if (webIdx !== -1) return path.substring(0, webIdx);
  }
  return import.meta.env?.VITE_API_BASE || '';
}

async function fetchBusinessPartnerCategories(token) {
  const base = detectEtendoBase();
  const url = `${base}/sws/neo/business-partner-category/businessPartnerCategory?limit=1000`;
  try {
    const res = await fetch(url, { credentials: 'include', headers: readCredentialHeaders() });
    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    const data = json?.response?.data ?? json?.data ?? [];
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function getExistingBusinessPartnerCategories(token, existingCategoriesOverride) {
  if (existingCategoriesOverride) return Promise.resolve(existingCategoriesOverride);
  const key = token || 'default';
  if (!businessPartnerCategoriesCache.has(key)) {
    businessPartnerCategoriesCache.set(key, fetchBusinessPartnerCategories(token));
  }
  return businessPartnerCategoriesCache.get(key);
}

function pick(row, targets) {
  const body = {};
  for (const t of targets) if (row[t] !== undefined) body[t] = row[t];
  return body;
}

// Mirrors useEntity.js's derivePersonName exactly (the known-working manual create flow).
function derivePersonName(firstName, lastName) {
  return [firstName, lastName].filter(Boolean).join(' ').trim();
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

async function resolveCategoryId(row, config) {
  if (!Boolean(row.categoryCode || row.categoryName || row.category)) return null;
  const categories = await getExistingBusinessPartnerCategories(config.token, config.existingCategories);
  const runCache = getResolutionCache(config.token || 'contacts-import');
  const createFn = config.createCategoryFn || (async ({ searchKey, name }) => {
    const base = detectEtendoBase();
    const url = `${base}/sws/neo/business-partner-category/businessPartnerCategory`;
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: writeHeaders(),
      body: JSON.stringify({ searchKey, name }),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error?.message || errJson?.message || 'Contact category creation failed');
    }
    const json = await res.json().catch(() => null);
    const record = json?.response?.data?.[0] ?? json?.data?.[0] ?? json;
    const createdId = record?.id ?? record?.cBpGroupId ?? record?.C_BP_Group_ID;
    if (createdId) categories.push({ id: createdId, searchKey, name });
    return { id: createdId, searchKey, name };
  });
  const categoryResolution = await resolveOrAutoCreateDependentEntity({
    code: row.categoryCode,
    name: row.categoryName,
    fallbackValue: row.category,
    existingRecords: categories,
    allowCreate: true,
    createFn,
    cache: runCache,
    translate: config.translate,
  });
  if (categoryResolution.status === 'error' || categoryResolution.status === 'unresolved') {
    throw categoryResolution.error || new Error('Contact category could not be resolved');
  }
  return categoryResolution.id ?? null;
}

async function resolveLocation(row, config) {
  if (!HAS_ADDRESS(row)) return null;
  const resolveCountry = config.resolveCountryFn || getFkResolver('contacts-country');
  const countryResult = await resolveCountry(row.country, { token: config.token });
  if (countryResult.status !== 'auto-resolved') {
    const message = typeof config.translate === 'function'
      ? config.translate('importErrorCountryUnresolved', { country: row.country })
      : `The country "${row.country}" could not be resolved to an existing record.`;
    throw new Error(message);
  }
  let regionId;
  if (row.region) {
    const resolveRegion = config.resolveRegionFn || getFkResolver('contacts-region');
    const regionResult = await resolveRegion(row.region, { token: config.token, countryId: countryResult.id });
    if (regionResult.status === 'auto-resolved') regionId = regionResult.id;
  }
  return {
    id: 'location', spec: config.spec, entity: 'locationAddress', parentRef: 'bp',
    body: {
      name: [row.city, row.address].filter(Boolean).join(', ') || 'Location',
      addressLine1: row.address, cityName: row.city, postalCode: row.postal,
      country: countryResult.id, ...(regionId ? { region: regionId } : {}),
    },
  };
}

registerImportDescriptor('contacts', async (row, config) => {
  const bpFields = pick(row, BP_TARGETS);
  // C_BPartner.Value (DAL property `searchKey`) is `required: true` but `form: false` —
  // hidden from every BusinessPartner create form, this one included (verified against
  // artifacts/contacts/contract.json). There is no server-side default for it (confirmed:
  // AD_Column has no defaultvalue and isusedsequence='N') — the manual "New contact"
  // flow only succeeds because useEntity.js's own createRecord path falls back to
  // `payload.searchKey || source.name || payload.name` before ever calling
  // POST /sws/neo/contacts/businessPartner. This composite descriptor builds /batch
  // operations directly, bypassing useEntity.js entirely, so it must apply the same
  // fallback itself — omitting it hits a raw `null value in column "value" ... violates
  // not-null constraint` from Postgres (reproduced via a real import run).
  // C_BPartner.Value (searchKey) is AD-constrained to 40 chars — reproduced via a real
  // import row whose commercial name was 48 chars ("Value too long. Length 48, maximum
  // allowed 40"). Name itself is untouched, it has more headroom (60).
  // ETP-4156: BusinessPartnerHandler.handle() now applies the same fallback+truncation
  // server-side for every create path (this /batch one included, BatchService routes
  // through handleWithHooks), so this line is belt-and-braces rather than the only guard.
  const bpBody = { oBTIKTaxIDKey: DEFAULT_TAX_ID_KEY, ...bpFields, searchKey: String(bpFields.name || '').slice(0, 40) };

  const categoryId = await resolveCategoryId(row, config);
  if (categoryId) bpBody.businessPartnerCategory = categoryId;

  const bpOp = { id: 'bp', spec: config.spec, entity: 'businessPartner', body: bpBody };
  const ops = [bpOp];

  const locationOperation = await resolveLocation(row, config);
  if (locationOperation) {
    // `locationAddress` (contacts spec) routes through the custom ContactsLocationAddressHandler
    // NeoHandler (verified: ETGO_SF_ENTITY.Java_Qualifier = 'contactsLocationAddressHandler'),
    // which creates C_Location + C_BPartner_Location atomically from a DIFFERENT, flattened
    // field set than the generic entity's own contract fields (name/phone/shipToAddress/...) —
    // `addressLine1`/`addressLine2`/`cityName`/`postalCode`, not `address1`/`city`/`postal` (the
    // names LocationEditorModal.jsx, the known-working manual flow, actually sends). Reproduced
    // via a real import run: the wrong field names meant the address data never reached the
    // handler's own body-reading code, leaving `name` unset (only rescued by the handler's own
    // "." fallback) — a computed display name here matches LocationEditorModal.jsx's own
    // convention instead of relying on that fallback.
    ops.push(locationOperation);
  }

  // AD_User.Name (DAL property `name`) is `required: true` but `form: false` — hidden
  // from every Contact create form, this one included (verified against
  // artifacts/contacts/contract.json) — same pattern as businessPartner's searchKey
  // above. ETP-4156: ContactHandler now derives it from firstName+lastName server-side,
  // but this CSV's contact-level firstName/lastName columns are frequently blank (the
  // row's real name lives in the BP-level etgoFirstname/etgoLastname instead), which the
  // handler cannot see — hence the extra, import-only fallback to the BP's own name,
  // mirroring searchKey's fallback. Omitting it hits a raw
  // `null value in column "name" of relation "ad_user" ... violates not-null
  // constraint` from Postgres (reproduced via a real import run).
  const contactFields = pick(row, CONTACT_TARGETS);
  const contactName = derivePersonName(contactFields.firstName ?? row.etgoFirstname, contactFields.lastName ?? row.etgoLastname)
    || bpBody.name;
  ops.push({ id: 'contact', spec: config.spec, entity: 'contact', parentRef: 'bp', body: { name: contactName, ...contactFields } });
  return ops;
});
