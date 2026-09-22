import { registerImportDescriptor } from '@etendosoftware/app-shell-core/lib/import/buildOperations.js';
import { registerImportRowValidator } from '@etendosoftware/app-shell-core/lib/import/rowValidators.js';
import { getFkResolver } from '@etendosoftware/app-shell-core/lib/import/fkResolvers.js';
import { resolveOrAutoCreateDependentEntity, getResolutionCache } from '@etendosoftware/app-shell-core/lib/import/resolveDependentEntity.js';
import { fetchNeoList } from '@etendosoftware/app-shell-core/lib/import/fetchNeoList.js';
import {
  getCachedCategories,
  categoryLookupFailedMessage,
  categoryCreateFailedError,
} from '@/lib/importCategoryResolution.js';
import { resolveCodedCellOrThrow, codedCellError, codeLabels } from '@/lib/codedValue.js';
import {
  getTaxIdError,
  TAX_ID_CHECK_DIGIT_ERROR_KEY,
} from '@/lib/taxIdValidation.js';
import { registerExportHints } from '@/lib/importExportColumns.js';
import { asDependentEntityInput } from '@/lib/dependentEntityCell.js';

import { apiFetch } from '@etendosoftware/app-shell-core/auth/api';
// `creditLimit` used to be listed here with no matching decisions.json column, so nothing
// could ever populate it — the mirror image of the "column with no consumer" problem.
const BP_TARGETS = ['name', 'etgoFirstname', 'etgoLastname', 'etgoEmail', 'etgoPhone', 'etgoWeb', 'oBTIKTaxIDKey', 'etgoIsperson', 'taxID'];
const CONTACT_TARGETS = ['firstName', 'lastName', 'email', 'phone', 'position'];
/**
 * Whether the row says anything about where the contact is, i.e. whether a `locationAddress`
 * op has to be built at all.
 *
 * `region` belongs in this list even though it is the only part that cannot stand on its own.
 * Leaving it out (ETP-5350) meant a row carrying a province and nothing else produced NO
 * location op, so the province was dropped without a word — the exact silent-drop failure
 * ETP-4997 removed from the browser-side resolver, reintroduced one level up in the predicate
 * that decides whether to ask at all.
 *
 * A province with no country now reaches `resolveLocation` and fails its row on the country
 * check instead. That is the intended posture, not a regression: `ContactsLocationAddressHandler`
 * refuses a region name with no country for a reason it states — "does this country have
 * regions" is unanswerable without the country — and a reported row beats a lost value.
 *
 * The province is TRIMMED before the test while the other parts keep plain truthiness. A
 * whitespace-only province already meant "absent" everywhere else in this descriptor, and a
 * bare `Boolean("   ")` is true — it would build a location op out of nothing but spaces.
 */
const HAS_ADDRESS = (row) => Boolean(
  row.address || row.city || row.postal || row.country || String(row.region ?? '').trim(),
);
const businessPartnerCategoriesCache = new Map();

function detectEtendoBase() {
  if (typeof window !== 'undefined' && window.location) {
    const path = window.location.pathname;
    const webIdx = path.indexOf('/web/');
    if (webIdx !== -1) return path.substring(0, webIdx);
  }
  return import.meta.env?.VITE_API_BASE || '';
}

/**
 * ETP-5227 — the same defect as `productImportDescriptor`, and here for the same reason: this
 * descriptor was copied from that one, `?limit=1000` included. NEO does not read that parameter
 * and caps an unpaged list at 100 rows, so a tenant past 100 contact categories got a phantom
 * "does not exist" and an auto-create the database rejected. See `fetchNeoList`'s header.
 */
function fetchBusinessPartnerCategories(token) {
  const base = detectEtendoBase();
  return fetchNeoList(`${base}/sws/neo/business-partner-category/businessPartnerCategory`, { token });
}

function getExistingBusinessPartnerCategories(token, existingCategoriesOverride) {
  if (existingCategoriesOverride) return Promise.resolve(existingCategoriesOverride);
  return getCachedCategories(
    businessPartnerCategoriesCache,
    token,
    () => fetchBusinessPartnerCategories(token),
  );
}

function pick(row, targets) {
  const body = {};
  for (const t of targets) if (row[t] !== undefined) body[t] = row[t];
  return body;
}

/**
 * ETP-5031 follow-up — `etgoWeb` is stored WITHOUT its scheme: the Contacts form's fixed
 * "https://" chip (decisions.json `inputPrefix`) means a manually-entered contact never has
 * one in the stored value, and BusinessPartnerHandler's server-side domain-shape check
 * (added alongside the email/phone checks) now rejects a value that still carries one — it
 * cannot tell "the scheme" from "part of an invalid host". A CSV `web` column commonly
 * contains a full URL ("https://acme.com") since that is what a human actually types/copies,
 * so the import must normalize it the same way the form's chip does, not assume the cell is
 * already bare. Reproduced live: an un-normalized cell 400'd the whole business partner
 * create, which is what silently dropped rows from ETP-4905's own Tomcat integration spec.
 */
function stripUrlScheme(value) {
  return String(value ?? '').replace(/^https?:\/\//i, '');
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
// symptom. '1' matches the AD default configured on the column itself
// (C_BPartner.EM_OBTIK_Tax_ID_Key, defaultvalue '1'), so a row that says nothing about its
// tax-id type lands on exactly the value the manual create flow would have produced.
const DEFAULT_TAX_ID_KEY = '1';

// AD_Ref_List for C_BPartner.EM_OBTIK_Tax_ID_Key (AD_Reference FF8081812FFD74ED012FFE428D290033),
// read straight from the instance: 1=NIF, 2=NOI, 3=Pasaporte, 4=Documento oficial de
// identificacion expedido por el pais, 5=Certificado de residencia fiscal, 6=Otro documento
// probatorio, 7=No Censado. Before ETP-4995 the column accepted ONLY the raw code, so a user
// who typed the label they see in the UI ("NIF") had the row rejected by the list reference.
// Exported since ETP-5373 so the template test can dispatch the tax-id example on the SAME
// label table the import itself resolves with, instead of restating which labels mean NIF.
export const TAX_ID_KEY_VALUES = {
  // 'CIF' is not an AD_Ref_List name, but it is what people actually type: CIF was the
  // Spanish company tax ID until it was folded into NIF in 2008, and this window's own
  // tax-id column was labelled "CIF/NIF" until ETP-4992 renamed it to "NIF" (CIF no longer
  // exists in Spain). A QA plan authored independently used 'CIF' here too, which is
  // evidence enough that rejecting it would just be pedantry.
  1: ['NIF', 'CIF', 'CIF/NIF', 'NIF/CIF'],
  2: ['NOI'],
  3: ['Pasaporte', 'Passport'],
  4: ['Documento oficial de identificacion expedido por el pais', 'Documento oficial de identificacion', 'Documento oficial'],
  5: ['Certificado de residencia fiscal', 'Certificado de residencia'],
  6: ['Otro documento probatorio', 'Otro documento'],
  7: ['No Censado'],
};

// C_BPartner.EM_Etgo_Isperson is an AD Yes/No column (AD_Reference 20), NOT a list — its
// stored values are 'Y'/'N' and its AD default is 'N' (a company). Without a column here the
// descriptor never wrote the field at all, so every imported row landed on the same type.
const IS_PERSON_VALUES = {
  Y: ['Persona', 'Persona fisica', 'Fisica', 'Particular', 'Individuo', 'Person', 'Si', 'True'],
  N: ['Empresa', 'Persona juridica', 'Juridica', 'Sociedad', 'Compania', 'Company', 'Organizacion', 'No', 'False'],
};

const DEFAULT_IS_PERSON = 'N';

const SEARCH_KEY_MAX_LENGTH = 40;
const SEARCH_KEY_HASH_LENGTH = 7;

/**
 * FNV-1a (32-bit) as base36. Deterministic and dependency-free — `crypto.subtle` is async
 * and would force this whole hot path to change shape. Determinism matters: re-importing
 * the same file must produce the same searchKey, not a second near-duplicate contact.
 */
function fnv1a32(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(SEARCH_KEY_HASH_LENGTH, '0').slice(-SEARCH_KEY_HASH_LENGTH);
}

/**
 * C_BPartner.Value is capped at 40 chars, but a blind `.slice(0, 40)` collapses every
 * commercial name that shares a 40-char prefix onto ONE key — e.g. two "Asociacion
 * Espanola de Fabricantes de …" rows, which then fight over the same business partner.
 * Names that fit are used verbatim (readable keys for the common case); longer ones keep a
 * readable prefix and take a deterministic hash of the FULL name as a discriminator.
 */
function deriveSearchKey(name) {
  const full = String(name ?? '').trim();
  if (full.length <= SEARCH_KEY_MAX_LENGTH) return full;
  const prefix = full.slice(0, SEARCH_KEY_MAX_LENGTH - SEARCH_KEY_HASH_LENGTH - 1);
  return `${prefix}-${fnv1a32(full)}`;
}

/**
 * Normalizes the identity fields according to the selected contact type. C_BPartner.Name
 * is mandatory for both types, but it means Legal Name for a company and is server-derived
 * from first+last for a person. The CSV must not leak the inactive type's fields into the
 * persisted business partner.
 */
function normalizeBusinessPartnerIdentity(bpFields, config) {
  const isPerson = resolveCodedCellOrThrow(bpFields.etgoIsperson, IS_PERSON_VALUES, {
    defaultCode: DEFAULT_IS_PERSON, fieldLabelKey: 'importFieldContactType', fieldLabelFallback: 'Contact Type', translate: config.translate,
  });
  const explicit = String(bpFields.name ?? '').trim();
  const firstName = String(bpFields.etgoFirstname ?? '').trim();
  const lastName = String(bpFields.etgoLastname ?? '').trim();
  const derived = derivePersonName(firstName, lastName);
  if (isPerson === 'Y') {
    if (!firstName || !lastName) {
      const message = typeof config.translate === 'function'
        ? config.translate('importErrorPersonNameRequired')
        : 'A person contact requires both first name and last name.';
      throw new Error(message);
    }
    return { isPerson, name: derived };
  }
  if (explicit) {
    delete bpFields.etgoFirstname;
    delete bpFields.etgoLastname;
    return { isPerson, name: explicit };
  }
  if (firstName && lastName) {
    delete bpFields.etgoFirstname;
    delete bpFields.etgoLastname;
    return { isPerson, name: derived };
  }
  const message = typeof config.translate === 'function'
    ? config.translate('importErrorMissingContactName')
    : 'This row has no commercial name and no first/last name, so the contact cannot be created.';
  throw new Error(message);
}

async function resolveCategoryId(row, config) {
  if (!row.category) return null;
  let categories;
  try {
    categories = await getExistingBusinessPartnerCategories(config.token, config.existingCategories);
  } catch (error) {
    throw new Error(categoryLookupFailedMessage(row.category, config));
  }
  const runCache = getResolutionCache(config.token || 'contacts-import');
  const createFn = config.createCategoryFn || (async ({ searchKey, name }) => {
    const base = detectEtendoBase();
    const url = `${base}/sws/neo/business-partner-category/businessPartnerCategory`;
    const res = await apiFetch(url, {
      method: 'POST',
      baseUrl: '',
      token: config.token,
      body: JSON.stringify({ searchKey, name }),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw categoryCreateFailedError(errJson?.error?.message || errJson?.message || '', row.category, config);
    }
    const json = await res.json().catch(() => null);
    const record = json?.response?.data?.[0] ?? json?.data?.[0] ?? json;
    const createdId = record?.id ?? record?.cBpGroupId ?? record?.C_BP_Group_ID;
    if (createdId) categories.push({ id: createdId, searchKey, name });
    return { id: createdId, searchKey, name };
  });
  const categoryResolution = await resolveOrAutoCreateDependentEntity({
    // ETP-4995: categoryCode/categoryName/category were three separate columns for one
    // concept. `category` is now the only declared column, so the cell is probed against
    // the existing codes first and only then treated as a name (see asDependentEntityInput).
    ...asDependentEntityInput(row.category, categories),
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
  return {
    id: 'location', spec: config.spec, entity: 'locationAddress', parentRef: 'bp',
    body: {
      name: [row.city, row.address].filter(Boolean).join(', ') || 'Location',
      addressLine1: row.address, cityName: row.city, postalCode: row.postal,
      country: countryResult.id,
      // ETP-4997: the province travels as free text and `ContactsLocationAddressHandler`
      // resolves it, scoped to the country in this very payload. It used to be resolved here,
      // which could not work: scoping the candidates meant fetching each one's country from
      // `/sws/neo/contacts/region`, and no NEO spec exposes a region entity — every fetch 404'd,
      // every candidate was discarded, and the field was skipped WITHOUT an error, so an address
      // silently arrived with no province. The server has the country in hand and the client
      // context needed to tell the tenant's own province row from the System one, so it is the
      // only place the lookup can be decided at all.
      // Trimmed before the check, not just before sending: a cell holding only spaces is
      // visually empty to whoever typed it, but it is truthy here, so the raw value would ship
      // the key — and the key's PRESENCE is what the handler reads as an instruction. Blank
      // must be indistinguishable from absent.
      ...(String(row.region ?? '').trim() ? { regionName: row.region.trim() } : {}),
    },
  };
}

/**
 * ETP-4996: the two AD-coded columns are checked while the user is still REVIEWING the
 * file, not when the row is sent. Before this, a mistyped "Persona Fisica" sat in the
 * Correctas tab, and the user only discovered the problem after confirming the import.
 *
 * Same tables and same wording as the send path below — see `codedCellError`.
 */
/**
 * ETP-5350 — the CIF/NIF, checked while the user is still REVIEWING.
 *
 * `taxIdValidation.js` is the browser mirror of `SpanishTaxIdValidator.java` and the Contacts
 * FORM has used it all along, but the import never called it: `registerImportRowValidator`
 * only covered the two AD-coded cells. So a malformed tax id sat in "Correctas", and the user
 * discovered it only after confirming, as a raw untranslated server message — the same
 * late-and-technical failure ETP-4996 removed for `oBTIKTaxIDKey` and `etgoIsperson`.
 *
 * Reproduced live on 2026-09-20: a check-digit typo and an 18-character paste both reached
 * "Correctas" and came back 400 from `BusinessPartnerHandler` at confirm time.
 *
 * Blank is deliberately NOT an error here. `getTaxIdError` waves an empty value through, and
 * the column's own `required: true` is enforced by `validateRow`; reporting it twice would put
 * two messages on one cell.
 */
function taxIdCellError(raw, translate) {
  const key = getTaxIdError(raw);
  if (!key) return null;
  const fallback = key === TAX_ID_CHECK_DIGIT_ERROR_KEY
    ? 'The check digit does not match. Review the number.'
    : 'Enter a valid NIF, CIF or NIE.';
  return { target: 'taxID', message: translatedOrFallback(key, fallback, translate) };
}

/**
 * The translated text for `key`, or `fallback` when there is no dictionary or the dictionary
 * echoes the key back — the standing posture of this import: an echoed key is a miss, not a
 * translation. Extracted because the same four-line dance sat at three call sites and carried
 * most of `contactIdentityErrors`'s cognitive complexity (S3776).
 */
function translatedOrFallback(key, fallback, translate) {
  if (typeof translate !== 'function') return fallback;
  const translated = translate(key);
  return translated && translated !== key ? translated : fallback;
}

/**
 * A person contact is identified by first AND last name, so a missing half fails the row on
 * that very cell. Split out of `contactIdentityErrors` for S3776.
 */
function personNameErrors(firstName, lastName, translate) {
  const message = translatedOrFallback('importErrorPersonNameRequired',
    'A person contact requires both first name and last name.', translate);
  return [
    ...(!firstName ? [{ target: 'etgoFirstname', message }] : []),
    ...(!lastName ? [{ target: 'etgoLastname', message }] : []),
  ];
}

function contactIdentityErrors(row, translate) {
  if (row.name === undefined && row.etgoFirstname === undefined
      && row.etgoLastname === undefined && row.etgoIsperson === undefined) {
    return [];
  }
  let type;
  try {
    type = resolveCodedCellOrThrow(row.etgoIsperson, IS_PERSON_VALUES, {
      defaultCode: DEFAULT_IS_PERSON, fieldLabelKey: 'importFieldContactType', fieldLabelFallback: 'Contact Type', translate,
    });
  } catch {
    // The coded-value validator below owns the invalid-type error.
    return [];
  }
  const firstName = String(row.etgoFirstname ?? '').trim();
  const lastName = String(row.etgoLastname ?? '').trim();
  if (type === 'Y') {
    return personNameErrors(firstName, lastName, translate);
  }
  if (!String(row.name ?? '').trim() && !(firstName && lastName)) {
    const message = translatedOrFallback('importErrorMissingContactName',
      'This row has no commercial name and no first/last name, so the contact cannot be created.',
      translate);
    return [{ target: 'name', message }];
  }
  return [];
}

registerImportRowValidator('contacts', (row, { translate } = {}) => [
  taxIdCellError(row.taxID, translate),
  codedCellError(row.oBTIKTaxIDKey, TAX_ID_KEY_VALUES, {
    target: 'oBTIKTaxIDKey', fieldLabelKey: 'importFieldTaxIdType', fieldLabelFallback: 'Tax ID Type', translate,
  }),
  codedCellError(row.etgoIsperson, IS_PERSON_VALUES, {
    target: 'etgoIsperson', fieldLabelKey: 'importFieldContactType', fieldLabelFallback: 'Contact Type', translate,
  }),
  ...contactIdentityErrors(row, translate),
].filter(Boolean));

// ETP-4997 — the CSV export derives its columns from these same import fields, but reads the
// values off a businessPartner LIST row, where the names do not always line up. Only the
// exceptions are declared; every other target is read straight off the row.
//
// The ten child-scoped fields (the contact person on AD_User, the address on
// C_BPartner_Location + C_Location) are NOT on a C_BPartner row at all — its only
// address-shaped property is `eTGOLocation`, a single FK to C_Location whose label is one
// concatenated identifier that cannot be split back into columns (ETP-5060 turned it from a
// pre-rendered string into the id + its `$_identifier`; either way it is not column-shaped). `BusinessPartnerHandler.attachChildData` therefore attaches each
// partner's primary contact and primary address under `etgoChildData` when the list GET carries
// `includeChildData=1` (which ListView's export sends), and these dotted paths read them —
// `NeoCsvExportService` resolves a dotted column key into nested values. Nested rather than
// flattened so the added keys cannot collide with a DAL property.
//
// Without the flag those columns come back empty, which is still a valid file: the headers match
// the template, so a user can fill them in by hand. The export always sends it.
registerExportHints('contacts', {
  sourceKeys: {
    // Written as `category`, but the list row carries the FK as `businessPartnerCategory`
    // (+ its `$_identifier` label, which is the half the import can resolve back).
    category: 'businessPartnerCategory$_identifier',
    // Contact person (AD_User) — the oldest active one, the same contact the `etgoEmail`
    // fallback picks, so the two can never name different people.
    email: 'etgoChildData.email',
    firstName: 'etgoChildData.firstName',
    lastName: 'etgoChildData.lastName',
    phone: 'etgoChildData.phone',
    position: 'etgoChildData.position',
    // Address (C_Location) — bill-to, then ship-to, then newest, mirroring ETGO_GET_LOCATION so
    // the exported address is the one the grid's Location column already shows.
    address: 'etgoChildData.address',
    city: 'etgoChildData.city',
    postal: 'etgoChildData.postal',
    country: 'etgoChildData.country',
    region: 'etgoChildData.region',
  },
  // Codes are unreadable in a spreadsheet ("false", "6"), which defeats the edit half of
  // export -> edit -> import. Both tables are inverted from the very synonym tables validated
  // above, so every exported word is one this descriptor accepts back.
  valueLabels: {
    // EM_Etgo_Isperson is an AD Yes/No column, so the list row carries a JSON boolean rather
    // than the 'Y'/'N' the synonym table is keyed by. Both spellings are mapped: NEO serializes
    // it as `true`/`false` today, and a Yes/No column read through another path still answers
    // 'Y'/'N'.
    etgoIsperson: {
      true: IS_PERSON_VALUES.Y[0], Y: IS_PERSON_VALUES.Y[0],
      false: IS_PERSON_VALUES.N[0], N: IS_PERSON_VALUES.N[0],
    },
    oBTIKTaxIDKey: codeLabels(TAX_ID_KEY_VALUES),
  },
});

registerImportDescriptor('contacts', async (row, config) => {
  const bpFields = pick(row, BP_TARGETS);
  if (bpFields.etgoWeb !== undefined) bpFields.etgoWeb = stripUrlScheme(bpFields.etgoWeb);
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
  // ETP-4995: every AD-coded default is applied AFTER the row's own fields, not before.
  // The Tax ID Type column IS declared in decisions.json (`oBTIKTaxIDKey`), so
  // buildTemplateCsv emits it into the downloaded template — and a user who leaves that
  // column empty produces `''`, not `undefined`. With the default spread first,
  // `...bpFields` then overwrote '1' with '', and the mandatory column failed with
  // MISSING_REQUIRED_FIELDS for EVERY row: the template the popup itself hands out could
  // not be imported without manually deleting the column. Only a non-blank, VALID cell
  // may override a default; an unrecognized one fails its own row with a message naming
  // the accepted values, instead of a bare 400 from the backend.
  const identity = normalizeBusinessPartnerIdentity(bpFields, config);
  const bpBody = {
    ...bpFields,
    name: identity.name,
    oBTIKTaxIDKey: resolveCodedCellOrThrow(bpFields.oBTIKTaxIDKey, TAX_ID_KEY_VALUES, {
      defaultCode: DEFAULT_TAX_ID_KEY, fieldLabelKey: 'importFieldTaxIdType', fieldLabelFallback: 'Tax ID Type', translate: config.translate,
    }),
    etgoIsperson: identity.isPerson,
    searchKey: deriveSearchKey(identity.name),
  };

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
