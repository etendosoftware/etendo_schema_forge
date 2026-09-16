import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const artifactsRoot = process.argv[2] ?? 'artifacts';
const outputPath = process.argv[3] ?? 'public-api/base.v1.json';
const functionalDocsRoot = process.argv[4] ?? 'docs/generated-custom-windows';

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
]);

const excludedChildTabs = [/accounting/i];

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
};

function publicFieldName(internalName) {
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

function buildEntity({ specName, entityName, contract, functional, parent, rawEntity }) {
  const source = contract.frontendContract.entities[entityName];
  const backend = contract.backendContract ?? {};
  const backendEntity = backend.entities?.[entityName] ?? {};
  const writeMethods = new Set(['POST', 'PUT', 'PATCH']);
  const endpoints = (backend.endpoints ?? []).filter(
    (endpoint) => endpoint.entity === entityName
  );
  const operations = [...new Set(
    endpoints.map((endpoint) => endpoint.method).concat(['GET', 'LIST'])
  )];
  // NeoServlet supports partial updates through the same resource endpoint
  // as PUT. Publish PATCH whenever PUT is available so the public contract
  // exposes the complete update surface instead of depending on whether the
  // backend metadata listed both aliases explicitly.
  if (operations.includes('PUT') && !operations.includes('PATCH')) {
    operations.push('PATCH');
  }
  const writable = endpoints.some((endpoint) => writeMethods.has(endpoint.method));

  const fields = {};
  for (const field of source.fields ?? []) {
    if (field.visibility === 'system' || field.visibility === 'discarded') continue;
    const apiName = publicFieldName(field.name);
    if (fields[apiName]) {
      throw new Error(`Public field name collision in ${specName}/${entityName}: ${apiName}`);
    }
    fields[apiName] = {
      sourceVisibility: field.visibility,
      direction: writable && field.visibility === 'editable' ? 'inout' : 'out',
      internalPath: field.name,
      type: 'passthrough',
      dataType: openApiType(field.type),
      reference: field.reference ?? null,
      handlerId: null,
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
        type: 'passthrough',
        dataType: { type: 'string' },
        reference: null,
        handlerId: null,
      };
    }
    if (rawField.name === 'updated' && !fields.updated) {
      fields.updated = {
        sourceVisibility: rawField.visibility,
        direction: 'out',
        internalPath: rawField.name,
        type: 'passthrough',
        dataType: { type: 'string', format: 'date-time' },
        reference: null,
        handlerId: null,
      };
    }
  }

  return {
    publicName: publicName(specName, entityName, contract.frontendContract.window.primaryEntity),
    specName,
    entityName,
    publicApi: true,
    operations,
    fields,
    processes: (backend.processEndpoints ?? []).filter(
      (process) => process.entity === entityName
    ),
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
      functional.functionalCapabilities = capabilities
        .split('\n')
        .map((line) => line.match(/^[-*]\s+(.*)$/)?.[1]?.trim())
        .filter(Boolean)
        .slice(0, 8);
      functional.functionalDoc = functionalPath;
    } catch {
      // Keep the generated resource available, but make the missing guide
      // explicit so documentation work can fill the gap without guessing.
    }
    const entity = buildEntity({ specName: entry.name, entityName, contract, functional, parent, rawEntity });
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

const manifest = {
  apiVersion: 'v1',
  generatedFrom: 'artifacts/*/contract.json',
  policy: {
    entitySelection: 'primary-entity-and-schema-linked-children-per-base-window',
    fieldSelection: 'editable-readOnly-until-removed',
    excludedCategories: [...excludedCategories],
    excludedWindows: [...excludedWindows],
    excludedChildTabs: excludedChildTabs.map((pattern) => pattern.source),
    failClosed: true,
  },
  entities,
};

await mkdir(join(outputPath, '..'), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${Object.keys(entities).length} Base public API entities to ${outputPath}`);
