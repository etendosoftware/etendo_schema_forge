import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const excludedCategories = new Set([
  // These modules are not part of the public API scope.
  'accounting',
  'configuration',
  'crm',
  'finance',
  'hr',
  'settings',
  'setup',
]);

const excludedWindows = new Set([
  // HR windows are present in the shared frontend catalog, but the HR module
  // is not part of the Etendo Go runtime and therefore has no valid NEO API
  // contract to expose.
  'absence',
  // Contacts is the canonical public business-partner surface. The legacy
  // business-partner window shares the same primary entity and is not exposed
  // as a second public resource.
  'business-partner',
  'business-partner-category',
  'bp-location',
  'bom-production',
  'commission-payment',
  'commission',
  'cost-adjustment',
  'employee',
  'inventory-quality-inspection',
  'landed-cost',
  'manage-requisitions',
  'packing',
  'requisition',
  'stock-reservation',
  'time-tracking',
  'warehouse-picking-list',
  // Legacy artifacts with no NeoServlet spec (no ETGO_SF_SPEC row): every
  // request to them answers "Spec not found", so publishing them would
  // advertise resources that cannot work.
  // - document: a mock window (DM-DOCUMENT) with no AD window behind it.
  // - project: the only project window with a spec, service-project, is a
  //   finance window, and finance stays excluded until it is curated.
  // - uom: the real window, unit-of-measure, was removed on purpose by
  //   ETP-4191. Bringing it back as an API-only artifact breaks pipeline rule
  //   F3 (every window with a contract.json must be in registry.js, the UI).
  'document',
  'project',
  'uom',
]);

const excludedChildTabs = [
  /accounting/i,
  // Bank accounts of a business partner. Their identifiers are excluded
  // fields, and what remains has no legitimate use on its own; the tab comes
  // back when the team that owns banking data decides on it.
  /^bank account$/i,
];

export const fiscalMonitorWindows = new Set([
  'monitor-verifactu',
  'sii-monitor',
  'tbai-facturas-enviadas',
]);

// Fields that are never published, whether curated or derived from the window
// form. Deriving the default exposure from the form is opt-out, so this list is
// the safety net for values that are visible to a logged-in user but must not
// be readable or writable by an external integration.
export const neverExposedFields = new Set([
  // Tenant and organization ownership come from the API key, never from the
  // caller. NeoServlet also drops `organization` on writes; this keeps it out
  // of the contract too.
  'client',
  'organization',
  // Grants a contact access to the customer portal: a security decision that
  // stays in the application.
  'grantPortalAccess',
  // Bank account identifiers of a business partner (contacts-bankAccount).
  // Held back until the team that owns banking data decides on them.
  'accountNo',
  'bankName',
  'displayedAccount',
  'iBAN',
  'swiftCode',
  // Accounting bulk-posting module fields shown on logistic documents.
  // Accounting is outside the public API scope (excluded category and tabs).
  'etblkpAccountingstatus',
  'etblkpBulkposting',
]);

// Structural marker of a window's lines entity: the entity keyed `lines` in a
// window that declares `linesLayout` renders it as its inline lines grid.
export function isLinesEntity(entityName, windowContract) {
  return entityName === 'lines' && Boolean(windowContract?.linesLayout);
}

// Internal references must not reach the public OpenAPI document: the
// functional texts are written for the team and may cite tickets or people.
const internalReference = /\bETP-\d+\b|\bjira\b/i;

// Keeps the functional text that is safe to publish: capability lines that cite
// an internal reference are dropped, and so are such sentences of the summary.
export function publicFunctionalText({ summary, capabilities }) {
  return {
    summary: summary
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => !internalReference.test(sentence))
      .join(' '),
    capabilities: capabilities.filter((capability) => !internalReference.test(capability)),
  };
}

// A field is published as its NEO value under a public name; nothing transforms it. The
// `type` / `handlerId` keys of an earlier curation format promised custom handlers that were
// never implemented, so they are refused rather than silently ignored.
export function assertNoFieldMapping(field, where) {
  for (const key of ['type', 'handlerId']) {
    if (field.publicApi && Object.hasOwn(field.publicApi, key)) {
      throw new Error(`${where}.${field.name}: publicApi.${key} is not supported; `
        + 'a public field is its NEO value under a public name. Remove the key.');
    }
  }
}

// An entity is curated when at least one of its fields declares
// `publicApi.exposed: true`. A curated entity publishes exactly its curation.
export function isCurated(source) {
  return (source?.fields ?? []).some((field) => field.publicApi?.exposed === true);
}

// Decides whether a frontend-contract field is published.
// - Curated entity: only fields with `publicApi.exposed: true`.
// - Non-curated entity (until the functional team curates it field by field):
//   the fields its window form shows (`form !== false`), plus the read-only
//   fields its window list shows (`visibility === 'readOnly' && grid !== false`),
//   e.g. document status and totals. The added fields are read-only, so they
//   are published `out`.
// - Fiscal monitors are never derived: their curation belongs to the Spanish
//   localization team, so without it they publish only `id` and `updated`.
// - `system` / `discarded` fields and `neverExposedFields` are never published.
export function isPublicField(field, { curated, specName }) {
  if (field.visibility === 'system' || field.visibility === 'discarded') return false;
  if (neverExposedFields.has(field.name)) return false;
  if (curated) return field.publicApi?.exposed === true;
  if (fiscalMonitorWindows.has(specName)) return false;
  if (field.form !== false) return true;
  return field.visibility === 'readOnly' && field.grid !== false;
}

function publicName(specName, entityName, primaryEntity) {
  return entityName === primaryEntity ? specName : `${specName}-${entityName}`;
}

function pathSegment(entityName) {
  return entityName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase();
}

const publicFieldOverrides = {
  etgoIdentifier: 'id',
  uOM: 'uom',
  uOMForWeight: 'uom_for_weight',
  businessPartnerCategory: 'category',
  etgoFirstname: 'first_name',
  etgoLastname: 'last_name',
  oBTIKTaxIDKey: 'tax_id_type',
  taxID: 'tax_id',
  oBTIKVIESStatus: 'vies_status',
  etgoWeb: 'website',
  etgoEmail: 'email',
  etgoPhone: 'phone',
  etgoIsperson: 'is_person',
  name2: 'secondary_name',
  uRL: 'url',
  referenceNo: 'reference_number',
  consumptionDays: 'consumption_days',
  setNewCurrency: 'set_new_currency',
  creditLimit: 'credit_limit',
  bPCurrencyID: 'currency',
  isCustomerConsent: 'customer_consent',
  tbaiIssimplifiedinv: 'simplified_invoice',
  creditUsed: 'credit_used',
  paymentTerms: 'payment_terms',
  salaryCategory: 'salary_category',
  customerBlocking: 'customer_blocking',
  aeatsiiDefaultsiikey: 'sii_default_key',
  aeatsiiSiikeylist: 'sii_key_list',
  paymentMethod: 'payment_method',
  isSalesRepresentative: 'sales_representative',
  priceList: 'price_list',
  pOFinancialAccount: 'purchase_financial_account',
  pOPaymentTerms: 'purchase_payment_terms',
  pOPaymentMethod: 'purchase_payment_method',
  purchasePricelist: 'purchase_price_list',
  vendorBlocking: 'vendor_blocking',
  eTGOLocation: 'location',
  iBAN: 'iban',
};

export function publicFieldName(internalName) {
  if (publicFieldOverrides[internalName]) return publicFieldOverrides[internalName];
  const withoutTechnicalPrefix = internalName
    .replace(/^etgo/i, '')
    .replace(/^eTGO/i, '')
    .replace(/^oBTIK/i, '')
    .replace(/^pO(?=[A-Z])/, 'purchase');
  return withoutTechnicalPrefix
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function openApiType(fieldType) {
  switch (fieldType) {
    case 'boolean': return { type: 'boolean' };
    case 'integer': return { type: 'integer', format: 'int32' };
    case 'decimal':
    case 'amount': return { type: 'number', format: 'double' };
    case 'date': return { type: 'string', format: 'date' };
    case 'datetime': return { type: 'string', format: 'date-time' };
    default: return { type: 'string' };
  }
}

/**
 * Public actions of a top-level resource (POST /<resource>/:id/actions/<action>).
 * Structural: v1 knows only `complete`, derived from the window's draftMode
 * completion flow (the document-action column, whose body NEO reads as
 * `docAction`), and only when the window opts in with `window.publicApi.actions`
 * in decisions.json. Declared processEndpoints are not public actions.
 */
function buildProcesses({ source, entityName, actions }) {
  const draft = source?.draftMode;
  if (actions.includes('complete') && draft?.enabled && draft.processField === 'documentAction' && draft.processValue) {
    return [{
      action: 'complete',
      method: 'POST',
      path: `/${entityName}/:id/action/${draft.processField}`,
      body: { docAction: draft.processValue },
    }];
  }
  return [];
}

// API-only input fields: values the resource accepts (and may echo) that are not
// contract fields, declared per entity in decisions.json as
// `entities.<entity>.publicApi.inputFields: [{ name, internalPath, dataType, required?, readable? }]`.
// `readable: true` means a GET returns the value, so the field is `inout`; otherwise `in`.
// A resource with no write endpoint publishes nothing from this list.
export function inputFieldsOf(decisions, entityName) {
  const list = decisions?.entities?.[entityName]?.publicApi?.inputFields;
  return Array.isArray(list) ? list : [];
}

// Exposure policy declared by the product cell in decisions.json:
// - `window.publicApi.actions: ["complete"]`: actions the window publishes (absent: none).
// - `entities.<entity>.publicApi.readOnly: true`: GET/LIST only, every field `out`.
// - `entities.<entity>.fields.<field>.publicApi.readOnly: true` (or the entity-level list
//   `entities.<entity>.publicApi.readOnlyFields: ["field"]`): the field is `out`.
// Field names are the internal (contract) names. Platform guardrails
// (`neverExposedFields`, fiscal monitors) are applied by the generator and win over this.
export function exposurePolicyOf(decisions, entityName) {
  const entity = decisions?.entities?.[entityName];
  const actions = decisions?.window?.publicApi?.actions;
  const listed = entity?.publicApi?.readOnlyFields;
  const readOnlyFields = new Set(Array.isArray(listed) ? listed : []);
  for (const [name, field] of Object.entries(entity?.fields ?? {})) {
    if (field?.publicApi?.readOnly === true) readOnlyFields.add(name);
  }
  return {
    actions: Array.isArray(actions) ? actions : [],
    readOnly: entity?.publicApi?.readOnly === true,
    readOnlyFields,
  };
}

export function buildEntity({
  specName, entityName, contract, functional, parent, rawEntity, inputFields = [],
  policy = { actions: [], readOnly: false, readOnlyFields: new Set() },
}) {
  const source = contract.frontendContract.entities[entityName];
  const backend = contract.backendContract ?? {};
  const backendEntity = backend.entities?.[entityName] ?? {};
  const writeMethods = new Set(['POST', 'PUT', 'PATCH']);
  const endpoints = (backend.endpoints ?? []).filter(
    (endpoint) => endpoint.entity === entityName
  );
  let operations = [...new Set(
    endpoints.map((endpoint) => endpoint.method).concat(['GET', 'LIST'])
  )];
  // NeoServlet supports partial updates through the same resource endpoint
  // as PUT. Publish PATCH whenever PUT is available so the public contract
  // exposes the complete update surface instead of depending on whether the
  // backend metadata listed both aliases explicitly.
  if (operations.includes('PUT') && !operations.includes('PATCH')) {
    operations.push('PATCH');
  }
  const readOnlyFiscalMonitor = fiscalMonitorWindows.has(specName);
  if (readOnlyFiscalMonitor) operations = ['GET', 'LIST'];
  const pubName = publicName(specName, entityName, contract.frontendContract.window.primaryEntity);
  const readOnlyResource = policy.readOnly;
  if (readOnlyResource) operations = ['GET', 'LIST'];
  const writable = !readOnlyResource && endpoints.some((endpoint) => writeMethods.has(endpoint.method));

  const fields = {};
  const curated = isCurated(source);
  for (const field of source.fields ?? []) {
    assertNoFieldMapping(field, `${specName}/${entityName}`);
    if (!isPublicField(field, { curated, specName })) continue;
    const apiName = publicFieldName(field.publicApi?.name ?? field.name);
    if (fields[apiName]) {
      throw new Error(`Public field name collision in ${specName}/${entityName}: ${apiName}`);
    }
    fields[apiName] = {
      sourceVisibility: field.visibility,
      direction: writable && field.visibility === 'editable' && !policy.readOnlyFields.has(field.name) ? 'inout' : 'out',
      internalPath: field.name,
      dataType: openApiType(field.type),
      reference: field.reference ?? null,
    };
  }

  for (const input of writable ? inputFields : []) {
    const apiName = publicFieldName(input.name);
    if (fields[apiName]) {
      throw new Error(`Public field name collision in ${specName}/${entityName}: ${apiName}`);
    }
    fields[apiName] = {
      sourceVisibility: 'editable',
      direction: input.readable === true ? 'inout' : 'in',
      internalPath: input.internalPath,
      dataType: { type: input.dataType ?? 'string' },
      reference: null,
      ...(input.required === true ? { required: true } : {}),
    };
  }

  // Child tabs often keep their identifier and optimistic-concurrency value
  // in system fields, so they are absent from the frontend projection. They
  // are still required by a stable JSON:API resource representation.
  for (const rawField of rawEntity?.fields ?? []) {
    if (rawField.type === 'id' && !fields.id) {
      fields.id = {
        sourceVisibility: rawField.visibility,
        direction: 'out',
        internalPath: rawField.name,
        dataType: { type: 'string' },
        reference: null,
      };
    }
    if (rawField.name === 'updated' && !fields.updated) {
      fields.updated = {
        sourceVisibility: rawField.visibility,
        direction: 'out',
        internalPath: rawField.name,
        dataType: { type: 'string', format: 'date-time' },
        reference: null,
      };
    }
  }

  // Some legacy artifacts do not include schema-raw.json. Their NEO
  // resources still expose the standard `id` response key, so keep the
  // JSON:API identifier present even when extraction metadata is incomplete.
  if (!fields.id) {
    fields.id = {
      sourceVisibility: 'system',
      direction: 'out',
      internalPath: 'id',
      dataType: { type: 'string' },
      reference: null,
    };
  }

  // NeoServlet always returns the JSON resource identifier under `id`, even
  // when the curated contract exposes a legacy alias such as
  // `etgoIdentifier`. Keep the public name stable while mapping the runtime
  // source to the actual NEO response key.
  if (fields.id) fields.id.internalPath = 'id';

  // A resource with nothing to write is read-only: create, update and delete
  // would bypass the processes that own those rows (matching, tax recompute).
  const hasWritableField = Object.values(fields).some((field) => field.direction !== 'out');
  if (!hasWritableField) operations = operations.filter((operation) => operation === 'GET' || operation === 'LIST');

  return {
    publicName: pubName,
    specName,
    entityName,
    publicApi: true,
    ...(readOnlyFiscalMonitor ? { group: 'Fiscal Monitors' } : {}),
    operations,
    fields,
    processes: readOnlyFiscalMonitor || parent || !policy.actions.length ? [] : buildProcesses({ source, entityName, actions: policy.actions }),
    ...(parent ? {
      parent: {
        resource: parent.resource,
        entityName: parent.entityName,
        foreignKey: parent.foreignKey,
        pathSegment: pathSegment(entityName),
      },
    } : {}),
    functional: parent
      ? {
        ...functional,
        functionalName: `${functional.functionalName} — ${source.tabName ?? entityName}`,
      }
      : functional,
    source: {
      artifact: specName,
      contractVersion: contract.version,
      backendEntity: Boolean(backendEntity.tableName),
    },
  };
}

export async function generateManifest({
  artifactsRoot = 'artifacts',
  functionalDocsRoot = 'docs/generated-custom-windows',
} = {}) {
  const entities = {};
  for (const entry of await readdir(artifactsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || excludedWindows.has(entry.name)) continue;
    const contractPath = join(artifactsRoot, entry.name, 'contract.json');
    let contract;
    try {
      contract = JSON.parse(await readFile(contractPath, 'utf8'));
    } catch {
      continue;
    }
    const category = contract.frontendContract?.window?.category;
    if (excludedCategories.has(category)) continue;
    let rawContract;
    try {
      rawContract = JSON.parse(await readFile(join(artifactsRoot, entry.name, 'schema-raw.json'), 'utf8'));
    } catch {
      rawContract = null;
    }
    if (!rawContract) {
      throw new Error(
        `Missing ${join(artifactsRoot, entry.name, 'schema-raw.json')}. It is gitignored, so a clean `
        + 'checkout does not have it; without it the manifest loses child resources and `updated`. '
        + `Extract it (make regen ONLY=${entry.name} or npx sf-extract-db) or copy it from a checkout that has it.`
      );
    }
    let decisions;
    try {
      decisions = JSON.parse(await readFile(join(artifactsRoot, entry.name, 'decisions.json'), 'utf8'));
    } catch {
      decisions = null;
    }
    const configuredVisibleChildren = new Set(Object.keys(decisions?.window?.secondaryTabs ?? {}));
    const hasExplicitChildVisibility = configuredVisibleChildren.size > 0;
    const primaryEntityName = contract.frontendContract.window.primaryEntity;
    const primarySource = contract.frontendContract.entities[primaryEntityName];
    const primaryRaw = rawContract?.entities?.find((candidate) => candidate.tableName === primarySource?.tableName);
    const primaryTable = primaryRaw?.tableName;
    const primaryIdField = primaryRaw?.fields?.find((field) => field.type === 'id');
    for (const entityName of Object.keys(contract.frontendContract?.entities ?? {})) {
      const source = contract.frontendContract.entities[entityName];
      const rawEntity = rawContract?.entities?.find((candidate) => candidate.tableName === source?.tableName);
      const isPrimary = entityName === primaryEntityName;
      let parent = null;
      if (!isPrimary && excludedChildTabs.some((pattern) => pattern.test(source.tabName ?? ''))) continue;
      if (!isPrimary && rawEntity && rawEntity.tableName !== primaryTable && primaryTable && primaryIdField) {
        const parentField = (rawEntity.fields ?? []).find((field) =>
          field.visibility === 'system' &&
          field.type === 'foreignKey' &&
          field.reference?.targetTable === primaryTable &&
          field.reference?.keyColumn === primaryIdField.columnName,
        );
        if (parentField) {
          parent = { resource: entry.name, entityName: primaryEntityName, foreignKey: parentField.name };
        }
      }
      // Custom window decisions are the source of truth for which child tabs are
      // actually visible in that window. Do not publish every schema-linked tab
      // when the UI intentionally exposes only a curated subset. Standard
      // windows without an explicit child-tab map retain their linked children.
      if (!isPrimary && hasExplicitChildVisibility && !configuredVisibleChildren.has(entityName)
        && !isLinesEntity(entityName, contract.frontendContract.window)) continue;
      // Only expose children whose parent link is explicitly present in the
      // extracted schema. This prevents unrelated tabs and orphan technical
      // datasets from becoming public resources by accident.
      if (!isPrimary && !parent) continue;
      const functionalPath = join(functionalDocsRoot, `${entry.name}.md`);
      let functional = {
        functionalName: contract.frontendContract.window.name ?? entry.name,
        functionalSummary: `Public API resource for the ${contract.frontendContract.window.name ?? entry.name} window.`,
        functionalCapabilities: [],
        functionalDoc: null,
      };
      try {
        const markdown = await readFile(functionalPath, 'utf8');
        const intent = markdown.match(/^## Intent\n([\s\S]*?)(?=\n## )/m)?.[1]?.trim();
        if (intent) functional.functionalSummary = intent.split(/\n\s*\n/)[0].replace(/\s+/g, ' ');
        const capabilities = markdown.match(/^## What this window should allow\n([\s\S]*?)(?=\n## )/m)?.[1] ?? '';
        const published = publicFunctionalText({
          summary: functional.functionalSummary,
          capabilities: capabilities
            .split('\n')
            .map((line) => line.match(/^[-*]\s+(.*)$/)?.[1]?.trim())
            .filter(Boolean),
        });
        functional.functionalSummary = published.summary
          || `Public API resource for the ${functional.functionalName} window.`;
        functional.functionalCapabilities = published.capabilities.slice(0, 8);
        functional.functionalDoc = functionalPath;
      } catch {
        // Keep the generated resource available, but make the missing guide
        // explicit so documentation work can fill the gap without guessing.
      }
      const entity = buildEntity({ specName: entry.name, entityName, contract, functional, parent, rawEntity, inputFields: inputFieldsOf(decisions, entityName), policy: exposurePolicyOf(decisions, entityName) });
      entities[entity.publicName] = entity;
    }
  }

  // Resolve relationships only after the complete public resource set is known.
  // References to excluded resources remain ordinary scalar fields and never
  // create links to an unavailable API. Contract references use Java entity
  // naming (for example, `UOM` or `ProductCategory`), while the manifest uses
  // the exact entity casing from each window. Compare canonical identifiers so
  // the relationship does not depend on casing or underscore conventions.
  const canonicalEntityName = (value) => String(value).replace(/[^a-z0-9]/gi, '').toLowerCase();
  const publicResourceByEntity = new Map(
    Object.values(entities).map((entity) => [canonicalEntityName(entity.entityName), entity.publicName])
  );
  for (const entity of Object.values(entities)) {
    for (const [publicFieldName, field] of Object.entries(entity.fields)) {
      if (!field.reference) continue;
      const resource = publicResourceByEntity.get(canonicalEntityName(field.reference));
      if (resource) {
        field.relationship = {
          resource,
          cardinality: 'one',
          foreignKey: publicFieldName,
        };
      }
    }
  }

  return {
    apiVersion: 'v1',
    generatedFrom: 'artifacts/*/contract.json',
    policy: {
      entitySelection: 'primary-entity-and-schema-linked-children-per-base-window',
      fieldSelection: 'curated-publicApi-else-form-plus-readonly-list',
      excludedCategories: [...excludedCategories],
      excludedWindows: [...excludedWindows],
      excludedChildTabs: excludedChildTabs.map((pattern) => pattern.source),
      excludedFields: [...neverExposedFields],
      // Mechanism, not a list of windows: what a window publishes beyond the
      // conservative default is declared in its own decisions.json.
      guardrails: ['neverExposedFields', 'fiscalMonitors'],
      actions: 'window.publicApi.actions in decisions.json (absent means none)',
      readOnlyResources: 'entities.<entity>.publicApi.readOnly in decisions.json',
      readOnlyFields: 'fields.<field>.publicApi.readOnly or entities.<entity>.publicApi.readOnlyFields in decisions.json',
      inputFields: 'entities.<entity>.publicApi.inputFields in decisions.json',
      failClosed: true,
    },
    entities,
  };
}

async function main() {
  const artifactsRoot = process.argv[2] ?? 'artifacts';
  const outputPath = process.argv[3] ?? 'public-api/base.v1.json';
  const functionalDocsRoot = process.argv[4] ?? 'docs/generated-custom-windows';
  const manifest = await generateManifest({ artifactsRoot, functionalDocsRoot });
  await mkdir(join(outputPath, '..'), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(manifest.entities).length} Base public API entities to ${outputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
