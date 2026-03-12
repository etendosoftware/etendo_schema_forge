import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { MARKERS } from './custom-section-markers.js';

/**
 * Capitalize the first letter of a string.
 */
export function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Convert camelCase name to "Title Case" label.
 * e.g., 'orderLine' -> 'Order Line'
 */
export function toLabel(name) {
  if (!name) return '';
  const words = name.replace(/([A-Z])/g, ' $1').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Get process endpoints that match a given entity.
 */
export function getProcessesForEntity(contract, entityName) {
  const endpoints = contract.backendContract?.processEndpoints ?? [];
  return endpoints.filter(p => p.entity === entityName);
}

/**
 * Get the read-only fields for an entity (used by page component for summary strip).
 */
export function getReadOnlyFields(contract, entityName) {
  const entity = contract.frontendContract.entities[entityName];
  return entity.fields.filter(f => f.form && f.visibility === 'readOnly');
}

/**
 * Map a contract field type to a column/field type for the declarative config.
 */
function mapFieldType(field) {
  if (field.name.toLowerCase().includes('status')) return 'status';
  if (field.type === 'boolean') return 'boolean';
  if (field.type === 'amount') return 'amount';
  if (field.type === 'number' || field.type === 'integer') return 'number';
  if (field.type === 'date') return 'date';
  return 'string';
}

/**
 * Map a contract field to a form field type.
 * FK fields use inputMode (search/selector/dependent); non-FK fields use type.
 */
function mapFormFieldType(field) {
  if (field.type === 'foreignKey') {
    if (field.inputMode === 'selector') return 'selector';
    if (field.inputMode === 'dependent') return 'dependent';
    return 'search';
  }
  if (field.type === 'boolean') return 'checkbox';
  if (field.tsType === 'number') return 'number';
  if (field.type === 'date') return 'date';
  if (/notes|description|comments|remarks/i.test(field.name)) return 'textarea';
  return 'text';
}

/**
 * Generate a data table component for an entity.
 * Produces a thin declarative component that imports DataTable from contract-ui.
 */
export function generateTableComponent(entityName, contract) {
  const entity = contract.frontendContract.entities[entityName];
  const gridFields = entity.fields.filter(f => f.grid);
  const searchableFields = entity.searchableFields ?? [];
  const compName = `${capitalize(entityName)}Table`;

  const columnsArray = gridFields.map(f => {
    const type = mapFieldType(f);
    const selectionPart = f.isSelectionColumn ? ', isSelectionColumn: true' : '';
    return `  { key: '${f.name}', column: '${f.column}', type: '${type}'${selectionPart} },`;
  }).join('\n');

  const filtersArray = searchableFields.map(f => `'${f}'`).join(', ');

  return `import { DataTable } from '@/components/contract-ui';

${MARKERS.GENERATED_START(`columns:${entityName}`)}
const columns = [
${columnsArray}
];
${MARKERS.GENERATED_END(`columns:${entityName}`)}

const filters = [${filtersArray}];

${MARKERS.GENERATED_START(`component:${compName}`)}
export default function ${compName}(props) {
  ${MARKERS.CUSTOM_SLOT(`hooks:${compName}`)}
  return <DataTable columns={columns} filters={filters} {...props} />;
}
${MARKERS.GENERATED_END(`component:${compName}`)}

${MARKERS.CUSTOM_SLOT(`section:${compName}-custom`)}
`;
}

/**
 * Generate a detail/edit form component for an entity.
 * Produces a thin declarative component that imports EntityForm from contract-ui.
 * Only renders editable fields (visibility !== 'readOnly').
 */
export function generateFormComponent(entityName, contract) {
  const entity = contract.frontendContract.entities[entityName];
  const formFields = entity.fields.filter(f => f.form);
  const compName = `${capitalize(entityName)}Form`;

  const fieldsArray = formFields.map(f => {
    const type = mapFormFieldType(f);
    const requiredPart = f.required ? ', required: true' : '';
    const readOnlyPart = f.visibility === 'readOnly' ? ', readOnly: true' : '';
    const referencePart = f.reference ? `, reference: '${f.reference}'` : '';
    const inputModePart = f.inputMode ? `, inputMode: '${f.inputMode}'` : '';
    const dependsOnPart = f.dependsOn
      ? `, dependsOn: { field: '${f.dependsOn.field}', filterKey: '${f.dependsOn.filterKey}' }`
      : '';
    // UI hints
    const defaultValuePart = f.defaultValue ? `, defaultValue: '${f.defaultValue.replace(/'/g, "\\'")}'` : '';
    const helpPart = f.help ? `, help: '${f.help.replace(/'/g, "\\'")}'` : '';
    const fieldGroupPart = f.fieldGroup ? `, fieldGroup: '${f.fieldGroup.replace(/'/g, "\\'")}'` : '';
    const precisionPart = f.precision ? `, precision: ${f.precision}` : '';
    // Behavioral metadata: displayLogic and readOnlyLogic
    let displayLogicPart = '';
    if (f.displayLogic) {
      if (f.displayLogic.evaluable === false) {
        displayLogicPart = `, visible: null, visibilitySource: 'server', displayLogicReason: '${f.displayLogic.reason || 'unknown'}'`;
      } else if (f.displayLogic.js) {
        displayLogicPart = `, displayLogic: (record) => ${f.displayLogic.js}`;
      }
    }
    let readOnlyLogicPart = '';
    if (f.readOnlyLogic) {
      if (f.readOnlyLogic.evaluable === false) {
        readOnlyLogicPart = `, readOnlySource: 'server', readOnlyLogicReason: '${f.readOnlyLogic.reason || 'unknown'}'`;
      } else if (f.readOnlyLogic.js) {
        readOnlyLogicPart = `, readOnlyLogic: (record) => ${f.readOnlyLogic.js}`;
      }
    }
    // Custom slots for callout and onChangeFunction behavioral hints
    const slotLines = [];
    if (f.callout) {
      const calloutId = f.callout.className.replace(/.*\./, '');
      slotLines.push(`  ${MARKERS.CUSTOM_SLOT(`callout:${calloutId}`)}`);
    }
    if (f.onChangeFunction) {
      slotLines.push(`  ${MARKERS.CUSTOM_SLOT(`onchange:${f.onChangeFunction.name}`)}`);
    }
    const fieldLine = `  { key: '${f.name}', column: '${f.column}', type: '${type}'${requiredPart}${readOnlyPart}${referencePart}${inputModePart}${dependsOnPart}${defaultValuePart}${helpPart}${fieldGroupPart}${precisionPart}${displayLogicPart}${readOnlyLogicPart} },`;
    return [...slotLines, fieldLine].join('\n');
  }).join('\n');

  // Generate field groups comment if any fields have fieldGroup
  const uniqueGroups = [...new Set(formFields.map(f => f.fieldGroup).filter(Boolean))];
  const fieldGroupsComment = uniqueGroups.length > 0
    ? `// Field groups: ${uniqueGroups.join(', ')}\n`
    : '';

  return `import { EntityForm } from '@/components/contract-ui';

${MARKERS.GENERATED_START(`fields:${entityName}`)}
${fieldGroupsComment}const fields = [
${fieldsArray}
];
${MARKERS.GENERATED_END(`fields:${entityName}`)}

${MARKERS.GENERATED_START(`component:${compName}`)}
export default function ${compName}(props) {
  ${MARKERS.CUSTOM_SLOT(`hooks:${compName}`)}
  return <EntityForm fields={fields} {...props} />;
}
${MARKERS.GENERATED_END(`component:${compName}`)}

${MARKERS.CUSTOM_SLOT(`section:${compName}-custom`)}
`;
}

/**
 * Generate a header-detail page component with ListView/DetailView pattern.
 * Produces a thin declarative component that routes by recordId.
 */
export function generatePageComponent(headerEntity, detailEntity, contract) {
  const headerName = capitalize(headerEntity);
  const detailName = capitalize(detailEntity);
  const compName = `${headerName}Page`;
  const processes = getProcessesForEntity(contract, headerEntity);
  const readOnlyFields = getReadOnlyFields(contract, headerEntity);

  // Detail entity editable fields for the add-line mini form
  const detailFields = contract.frontendContract.entities[detailEntity]?.fields ?? [];
  const detailEditableFields = detailFields.filter(f => f.form && f.visibility !== 'readOnly');

  // Status field gets a badge in the header; others go in the summary strip
  const statusField = readOnlyFields.find(f => f.name.toLowerCase().includes('status'));
  const summaryFields = readOnlyFields.filter(f => f !== statusField);

  // Summary config
  const summaryArray = summaryFields.map(f => {
    const type = mapFieldType(f);
    return `  { key: '${f.name}', column: '${f.column}', type: '${type}' },`;
  }).join('\n');

  // Status field config
  const statusFieldLine = statusField ? `'${statusField.name}'` : 'null';

  // Process config
  const processesArray = processes.map(p => {
    const isDestructive = /void|cancel|reject/i.test(p.name);
    const style = isDestructive ? 'destructive' : 'positive';
    return `  { name: '${p.name}', label: '${toLabel(p.name)}', style: '${style}' },`;
  }).join('\n');

  // Separate entry fields (user types) from auto-derived fields (price, tax, discount, amount)
  const autoPatterns = /price|tax|discount|amount|total|cost|net/i;
  const entryFields = detailEditableFields.filter(f => !autoPatterns.test(f.name));
  const derivedFields = detailEditableFields.filter(f => autoPatterns.test(f.name));

  // The first entry field (usually product) triggers a lookup
  const entryArray = entryFields.map((f, i) => {
    const type = mapFormFieldType(f);
    const requiredPart = f.required ? ', required: true' : '';
    const lookupPart = i === 0 ? ', lookup: true' : '';
    const referencePart = f.reference ? `, reference: '${f.reference}'` : '';
    const inputModePart = f.inputMode ? `, inputMode: '${f.inputMode}'` : '';
    const dependsOnPart = f.dependsOn
      ? `, dependsOn: { field: '${f.dependsOn.field}', filterKey: '${f.dependsOn.filterKey}' }`
      : '';
    return `    { key: '${f.name}', column: '${f.column}', type: '${type}'${requiredPart}${lookupPart}${referencePart}${inputModePart}${dependsOnPart} },`;
  }).join('\n');

  const derivedArray = derivedFields.map(f => {
    const type = mapFormFieldType(f);
    const referencePart = f.reference ? `, reference: '${f.reference}'` : '';
    const inputModePart = f.inputMode ? `, inputMode: '${f.inputMode}'` : '';
    return `    { key: '${f.name}', column: '${f.column}', type: '${type}'${referencePart}${inputModePart} },`;
  }).join('\n');

  // API prediction config
  const apiPrediction = contract.apiPrediction;
  const apiBlock = apiPrediction
    ? `\nconst api = ${JSON.stringify(apiPrediction, null, 2)};\n`
    : '';
  const apiProp = apiPrediction ? '\n      api={api}' : '';

  return `import { ListView, DetailView } from '@/components/contract-ui';
import ${headerName}Table from './${headerName}Table';
import ${headerName}Form from './${headerName}Form';
import ${detailName}Table from './${detailName}Table';
import catalogs from './mockCatalogs';

${MARKERS.GENERATED_START(`summary:${headerEntity}`)}
const summary = [
${summaryArray}
];

const statusField = ${statusFieldLine};
${MARKERS.GENERATED_END(`summary:${headerEntity}`)}

${MARKERS.GENERATED_START(`processes:${headerEntity}`)}
const processes = [
${processesArray}
];
${MARKERS.GENERATED_END(`processes:${headerEntity}`)}

${MARKERS.GENERATED_START(`addLineFields:${detailEntity}`)}
const addLineFields = {
  entry: [
${entryArray}
  ],
  derived: [
${derivedArray}
  ],
};
${MARKERS.GENERATED_END(`addLineFields:${detailEntity}`)}
${apiBlock}
${MARKERS.GENERATED_START(`component:${compName}`)}
export default function ${compName}({ windowName, recordId, ...props }) {
  ${MARKERS.CUSTOM_SLOT(`hooks:${compName}`)}
  if (recordId) {
    return (
      <DetailView
        entity="${headerEntity}"
        detailEntity="${detailEntity}"
        Form={${headerName}Form}
        DetailTable={${detailName}Table}
        summary={summary}
        statusField={statusField}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="${toLabel(headerEntity)}"
        detailLabel="${toLabel(detailEntity)}"
        windowName={windowName}
        recordId={recordId}${apiProp}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="${headerEntity}"
      Table={${headerName}Table}
      entityLabel="${toLabel(headerEntity)}s"
      windowName={windowName}
      {...props}
    />
  );
}
${MARKERS.GENERATED_END(`component:${compName}`)}

${MARKERS.CUSTOM_SLOT(`section:${compName}-custom`)}
`;
}

/**
 * Generate the entry point / index component.
 * Accepts { token, apiBaseUrl, window } props.
 */
export function generateIndexComponent(headerEntity, detailEntity, contract) {
  const headerName = capitalize(headerEntity);
  const category = contract?.frontendContract?.window?.category ?? 'general';
  const windowName = contract?.frontendContract?.window?.name ?? toLabel(headerEntity);
  const apiPrediction = contract?.apiPrediction;

  if (detailEntity) {
    const apiBlock = apiPrediction
      ? `\nconst api = ${JSON.stringify(apiPrediction, null, 2)};\n`
      : '';
    const apiProp = apiPrediction ? ' api={api}' : '';
    return `import ${headerName}Page from './${headerName}Page';

const windowMeta = { category: '${category}', name: '${windowName}' };
${apiBlock}
${MARKERS.GENERATED_START('component:App')}
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  ${MARKERS.CUSTOM_SLOT('hooks:App')}
  return <${headerName}Page windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta}${apiProp} {...rest} />;
}
${MARKERS.GENERATED_END('component:App')}

${MARKERS.CUSTOM_SLOT('section:App-custom')}
`;
  }

  const apiBlock = apiPrediction
    ? `\nconst api = ${JSON.stringify(apiPrediction, null, 2)};\n`
    : '';
  const apiProp = apiPrediction ? '\n      api={api}' : '';

  return `import { ListView, DetailView } from '@/components/contract-ui';
import ${headerName}Table from './${headerName}Table';
import ${headerName}Form from './${headerName}Form';
import catalogs from './mockCatalogs';

const windowMeta = { category: '${category}', name: '${windowName}' };
${apiBlock}
${MARKERS.GENERATED_START('component:App')}
export default function App({ windowName, recordId, ...props }) {
  ${MARKERS.CUSTOM_SLOT('hooks:App')}
  if (recordId) {
    return (
      <DetailView
        entity="${headerEntity}"
        Form={${headerName}Form}
        catalogs={catalogs}
        entityLabel="${toLabel(headerEntity)}"
        windowName={windowName}
        recordId={recordId}
        window={windowMeta}${apiProp}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="${headerEntity}"
      Table={${headerName}Table}
      entityLabel="${toLabel(headerEntity)}"
      windowName={windowName}
      window={windowMeta}${apiProp}
      {...props}
    />
  );
}
${MARKERS.GENERATED_END('component:App')}

${MARKERS.CUSTOM_SLOT('section:App-custom')}
`;
}

// --- Mock Catalog Data Pools ---

const CATALOG_DATA = {
  BusinessPartner: Array.from({ length: 15 }, (_, i) => ({
    id: `bp-${String(i + 1).padStart(3, '0')}`,
    name: [
      'Acme Corp', 'TechFlow Inc', 'Global Trade Ltd', 'Summit Industries',
      'Pacific Partners', 'Alpine Solutions', 'Meridian Group', 'Vertex Systems',
      'Atlas Manufacturing', 'Nova Enterprises', 'Pinnacle Services', 'Horizon Labs',
      'Cedar Holdings', 'Sterling & Co', 'Quantum Logistics',
    ][i],
  })),
  Product: Array.from({ length: 20 }, (_, i) => ({
    id: `prod-${String(i + 1).padStart(3, '0')}`,
    name: [
      'Laptop Pro 15', 'USB-C Cable', 'Wireless Mouse', 'Mechanical Keyboard',
      'Monitor 27"', 'Webcam HD', 'Headset Pro', 'Docking Station',
      'SSD 1TB', 'RAM 16GB', 'Power Supply 750W', 'Network Switch',
      'Printer Laser', 'Scanner Flatbed', 'External HDD 2TB', 'Tablet 10"',
      'Router Pro', 'UPS Battery', 'Graphics Card', 'CPU Cooler',
    ][i],
    price: [1299, 15, 29, 89, 549, 79, 149, 199, 109, 65, 95, 45, 299, 189, 79, 449, 129, 159, 699, 49][i],
    uomId: 'uom-001',
  })),
  User: Array.from({ length: 8 }, (_, i) => ({
    id: `user-${String(i + 1).padStart(3, '0')}`,
    name: [
      'Alice Johnson', 'Bob Smith', 'Carol Williams', 'David Brown',
      'Eva Martinez', 'Frank Lee', 'Grace Kim', 'Henry Davis',
    ][i],
  })),
  Warehouse: Array.from({ length: 5 }, (_, i) => ({
    id: `wh-${String(i + 1).padStart(3, '0')}`,
    name: ['Main Warehouse', 'East Distribution Center', 'West Hub', 'North Storage', 'South Logistics'][i],
  })),
  PriceList: Array.from({ length: 4 }, (_, i) => ({
    id: `pl-${String(i + 1).padStart(3, '0')}`,
    name: ['Standard Price List', 'Wholesale Prices', 'Retail Prices', 'VIP Pricing'][i],
  })),
  PaymentTerm: Array.from({ length: 5 }, (_, i) => ({
    id: `pt-${String(i + 1).padStart(3, '0')}`,
    name: ['Immediate', 'Net 15', 'Net 30', 'Net 60', '2/10 Net 30'][i],
  })),
  PaymentMethod: Array.from({ length: 4 }, (_, i) => ({
    id: `pm-${String(i + 1).padStart(3, '0')}`,
    name: ['Wire Transfer', 'Credit Card', 'Check', 'Cash'][i],
  })),
  Tax: Array.from({ length: 6 }, (_, i) => ({
    id: `tax-${String(i + 1).padStart(3, '0')}`,
    name: ['VAT 21%', 'VAT 10%', 'VAT 0%', 'Sales Tax 8.5%', 'Exempt', 'Reduced Rate 5%'][i],
    rate: [21, 10, 0, 8.5, 0, 5][i],
  })),
  UOM: Array.from({ length: 5 }, (_, i) => ({
    id: `uom-${String(i + 1).padStart(3, '0')}`,
    name: ['Each', 'Box', 'Kg', 'Meter', 'Liter'][i],
  })),
  StorageBin: Array.from({ length: 10 }, (_, i) => ({
    id: `sb-${String(i + 1).padStart(3, '0')}`,
    name: ['A-01-01', 'A-01-02', 'A-02-01', 'A-02-02', 'B-01-01', 'B-01-02', 'B-02-01', 'B-02-02', 'C-01-01', 'C-01-02'][i],
    warehouseId: `wh-${String(Math.floor(i / 2) + 1).padStart(3, '0')}`,
  })),
  ProductCategory: Array.from({ length: 9 }, (_, i) => ({
    id: `cat-${String(i + 1).padStart(3, '0')}`,
    name: ['Electronics', 'Accessories', 'Peripherals', 'Displays', 'Audio', 'Storage', 'Components', 'Networking', 'Power'][i],
  })),
  BusinessPartnerLocation: Array.from({ length: 20 }, (_, i) => ({
    id: `bploc-${String(i + 1).padStart(3, '0')}`,
    name: [
      'HQ - 100 Main St', 'Branch - 200 Oak Ave', 'Warehouse - 300 Elm Dr',
      'Office - 50 Pine Rd', 'Factory - 400 Maple Ln', 'Store - 150 Cedar Blvd',
      'Depot - 250 Birch Way', 'Lab - 75 Spruce Ct', 'HQ - 500 Willow St',
      'Branch - 600 Ash Ave', 'Office - 10 Palm Dr', 'Store - 20 Ivy Rd',
      'Depot - 30 Fern Ln', 'Lab - 40 Sage Blvd', 'HQ - 55 Rose Way',
      'Branch - 65 Lily Ct', 'Office - 70 Daisy St', 'Store - 80 Tulip Ave',
      'Depot - 90 Orchid Dr', 'Lab - 95 Violet Rd',
    ][i],
    businessPartnerId: `bp-${String(Math.floor(i / 2) + 1).padStart(3, '0')}`,
  })),
};

/**
 * Collect all unique reference names from a contract's frontend entities.
 */
function collectReferences(contract) {
  const refs = new Set();
  for (const entity of Object.values(contract.frontendContract.entities)) {
    for (const field of entity.fields) {
      if (field.reference) refs.add(field.reference);
    }
  }
  return refs;
}

/**
 * Generate a mockCatalogs.js file with reference data for all FK fields in the contract.
 */
export function generateMockCatalogs(contract) {
  const refs = collectReferences(contract);
  const lines = [
    '// Auto-generated mock catalogs for FK reference data - do not edit manually',
    '',
    'const catalogs = {};',
    '',
  ];

  for (const ref of refs) {
    const data = CATALOG_DATA[ref];
    if (data) {
      lines.push(`catalogs['${ref}'] = ${JSON.stringify(data, null, 2)};`);
      lines.push('');
    }
  }

  lines.push('export default catalogs;');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate all frontend components from a contract.
 * Returns a map of { filename: code }.
 */
export function generateAll(contract) {
  const { frontendContract } = contract;
  const { window: win, entities } = frontendContract;
  const primaryEntity = win.primaryEntity;
  const entityNames = Object.keys(entities);
  const detailEntity = entityNames.find(name => name !== primaryEntity);

  const files = {};

  // Generate Table + Form for each entity
  for (const entityName of entityNames) {
    const capName = capitalize(entityName);
    files[`${capName}Table.jsx`] = generateTableComponent(entityName, contract);
    files[`${capName}Form.jsx`] = generateFormComponent(entityName, contract);
  }

  // Generate Page if there is a detail entity
  if (detailEntity) {
    files[`${capitalize(primaryEntity)}Page.jsx`] = generatePageComponent(primaryEntity, detailEntity, contract);
  }

  // Generate mock catalogs
  files['mockCatalogs.js'] = generateMockCatalogs(contract);

  // Always generate index
  files['index.jsx'] = generateIndexComponent(primaryEntity, detailEntity, contract);

  return files;
}

/**
 * Capture the current state of generated files for a window.
 * Returns a { filename: content } map for use as the "before" snapshot.
 */
export function captureCurrentState(windowName, baseDir) {
  const webDir = resolve(baseDir || '.', `artifacts/${windowName}/generated/web/${windowName}`);
  const files = {};
  if (!existsSync(webDir)) return files;
  for (const filename of readdirSync(webDir)) {
    if (filename.endsWith('.jsx') || filename.endsWith('.js')) {
      files[filename] = readFileSync(resolve(webDir, filename), 'utf-8');
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// Process form generation
// ---------------------------------------------------------------------------

/**
 * Convert a kebab-case string to PascalCase.
 * "generate-invoices" -> "GenerateInvoices"
 */
function toPascalCase(kebab) {
  return kebab
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Generate a process form component from a process contract.
 */
export function generateProcessFormComponent(contract) {
  const proc = contract.process;
  const compName = toPascalCase(proc.specName) + 'Process';

  const paramsArray = contract.parameters.map(p => {
    const requiredPart = p.required ? ', required: true' : '';
    const defaultPart = p.defaultValue ? `, defaultValue: '${p.defaultValue.replace(/'/g, "\\'")}'` : '';
    const referencePart = p.referenceValueId ? `, reference: '${p.referenceValueId}'` : '';
    return `  { key: '${p.name}', column: '${p.column}', type: '${p.inputMode}'${requiredPart}${defaultPart}${referencePart} },`;
  }).join('\n');

  const executeUrl = contract.apiPrediction?.baseUrl || `/sws/neo/${proc.specName}`;

  return `import { ProcessForm } from '@/components/contract-ui';

const parameters = [
${paramsArray}
];

const processConfig = {
  name: '${proc.name.replace(/'/g, "\\'")}',
  specName: '${proc.specName}',
  executeUrl: '${executeUrl}',
};

export default function ${compName}(props) {
  return <ProcessForm parameters={parameters} process={processConfig} {...props} />;
}
`;
}

/**
 * Generate the index/entry point for a process form.
 */
export function generateProcessIndex(contract) {
  const proc = contract.process;
  const compName = toPascalCase(proc.specName) + 'Process';

  return `import ${compName} from './${compName}';

const processMeta = { name: '${proc.name.replace(/'/g, "\\'")}', specName: '${proc.specName}' };

export default function App({ token, apiBaseUrl }) {
  return <${compName} token={token} apiBaseUrl={apiBaseUrl} process={processMeta} />;
}
`;
}

/**
 * Generate all frontend files for a process contract.
 * Returns { filename: code } map.
 */
export function generateAllProcess(contract) {
  const compName = toPascalCase(contract.process.specName) + 'Process';
  const files = {};
  files[`${compName}.jsx`] = generateProcessFormComponent(contract);
  files['index.jsx'] = generateProcessIndex(contract);
  return files;
}

// ---------------------------------------------------------------------------
// Report form generation
// ---------------------------------------------------------------------------

/**
 * Generate a report form component from a report contract.
 * Similar to process form but uses ReportForm, adds format selector,
 * and targets the generateReport endpoint.
 */
export function generateReportFormComponent(contract) {
  const proc = contract.process;
  const compName = toPascalCase(proc.specName) + 'Report';

  const paramsArray = contract.parameters.map(p => {
    const requiredPart = p.required ? ', required: true' : '';
    const defaultPart = p.defaultValue ? `, defaultValue: '${p.defaultValue.replace(/'/g, "\\'")}'` : '';
    const referencePart = p.referenceValueId ? `, reference: '${p.referenceValueId}'` : '';
    return `  { key: '${p.name}', column: '${p.column}', type: '${p.inputMode}'${requiredPart}${defaultPart}${referencePart} },`;
  }).join('\n');

  const generateUrl = `/sws/neo/${proc.specName}/generateReport`;

  return `import { ReportForm } from '@/components/contract-ui';

const parameters = [
${paramsArray}
];

const reportConfig = {
  name: '${proc.name.replace(/'/g, "\\'")}',
  specName: '${proc.specName}',
  generateUrl: '${generateUrl}',
  supportedFormats: ['PDF', 'XLS', 'XLSX', 'HTML', 'CSV'],
};

export default function ${compName}(props) {
  return <ReportForm parameters={parameters} report={reportConfig} {...props} />;
}
`;
}

/**
 * Generate the index/entry point for a report form.
 */
export function generateReportIndex(contract) {
  const proc = contract.process;
  const compName = toPascalCase(proc.specName) + 'Report';

  return `import ${compName} from './${compName}';

const reportMeta = { name: '${proc.name.replace(/'/g, "\\'")}', specName: '${proc.specName}' };

export default function App({ token, apiBaseUrl }) {
  return <${compName} token={token} apiBaseUrl={apiBaseUrl} report={reportMeta} />;
}
`;
}

/**
 * Generate all frontend files for a report contract.
 * Returns { filename: code } map.
 */
export function generateAllReport(contract) {
  const compName = toPascalCase(contract.process.specName) + 'Report';
  const files = {};
  files[`${compName}.jsx`] = generateReportFormComponent(contract);
  files['index.jsx'] = generateReportIndex(contract);
  return files;
}

// CLI entry point -- only runs when executed directly
const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/.*\//, ''));
if (isDirectRun) {
  const contractPath = process.argv[2];
  if (!contractPath) {
    console.error('Usage: node cli/src/generate-frontend.js <contract-path>');
    process.exit(1);
  }

  const contractJson = readFileSync(resolve(contractPath), 'utf-8');
  const contract = JSON.parse(contractJson);
  const files = generateAll(contract);

  const windowName = contract.frontendContract.window.name
    .toLowerCase()
    .replace(/\s+/g, '-');

  const outDir = resolve(`artifacts/${windowName}/generated/web/${windowName}`);
  mkdirSync(outDir, { recursive: true });

  for (const [filename, code] of Object.entries(files)) {
    const filePath = resolve(outDir, filename);
    writeFileSync(filePath, code, 'utf-8');
    console.log(`  wrote ${filePath}`);
  }

  console.log(`\nGenerated ${Object.keys(files).length} files in ${outDir}`);
}
