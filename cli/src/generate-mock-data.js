import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

// --- Data pools ---

const COMPANY_NAMES = [
  'Acme Corp', 'TechFlow Inc', 'Global Trade Ltd', 'Summit Industries',
  'Pacific Partners', 'Alpine Solutions', 'Meridian Group', 'Vertex Systems',
  'Atlas Manufacturing', 'Nova Enterprises', 'Pinnacle Services', 'Horizon Labs',
  'Cedar Holdings', 'Sterling & Co', 'Quantum Logistics',
];

const PRODUCT_NAMES = [
  'Laptop Pro 15', 'USB-C Cable', 'Wireless Mouse', 'Mechanical Keyboard',
  'Monitor 27"', 'Webcam HD', 'Headset Pro', 'Docking Station',
  'SSD 1TB', 'RAM 16GB', 'Power Supply 750W', 'Network Switch',
  'Printer Laser', 'Scanner Flatbed', 'External HDD 2TB',
];

const WAREHOUSE_NAMES = [
  'Main Warehouse', 'East Distribution Center', 'West Hub',
  'North Storage', 'South Logistics', 'Central Depot',
  'Regional Warehouse A', 'Regional Warehouse B',
];

const DESCRIPTION_PHRASES = [
  'Standard order for Q1 delivery',
  'Rush order - priority shipping required',
  'Bulk purchase for warehouse restocking',
  'Sample order for client evaluation',
  'Recurring monthly supply order',
  'Special pricing agreement applies',
  'Consolidated order from multiple requests',
  'Trial order for new product line',
  'Replacement for damaged goods',
  'Pre-season inventory build-up',
  'Customer-specific configuration',
  'Government contract fulfillment',
];

const TAX_NAMES = [
  'VAT 21%', 'VAT 10%', 'VAT 0%', 'Sales Tax 8.5%',
  'Exempt', 'Reduced Rate 5%', 'Standard Rate 20%',
];

const DOC_STATUSES = ['DR', 'CO', 'VO', 'IP'];
const CURRENCIES = ['USD', 'EUR', 'GBP'];

// --- Helpers ---

/** Seeded pseudo-random for deterministic output based on index. */
function seededRandom(index, salt = 0) {
  const x = Math.sin((index + 1) * 9301 + salt * 49297) * 49297;
  return x - Math.floor(x);
}

function randomInt(min, max, index, salt = 0) {
  return Math.floor(seededRandom(index, salt) * (max - min + 1)) + min;
}

function cyclePool(pool, index) {
  return pool[index % pool.length];
}

function entityPrefix(entityName) {
  // 'order' -> 'SO', 'orderLine' -> 'LN', 'invoice' -> 'IN', etc.
  const prefixes = {
    order: 'SO',
    orderLine: 'LN',
    invoice: 'IN',
    invoiceLine: 'IL',
    shipment: 'SH',
    payment: 'PY',
  };
  if (prefixes[entityName]) return prefixes[entityName];
  // Fallback: first two letters uppercase
  return entityName.slice(0, 2).toUpperCase();
}

function padNumber(n, width = 5) {
  return String(n).padStart(width, '0');
}

// --- Core generator ---

/**
 * Generate a realistic mock value for a field based on its name and type.
 * @param {{ name: string, type: string }} field
 * @param {number} index - Record index (0-based)
 * @param {string} entityName
 * @returns {*}
 */
export function generateMockValue(field, index, entityName) {
  const { name, type } = field;
  const nameLower = name.toLowerCase();

  // lineNo special case
  if (name === 'lineNo') {
    return (index + 1) * 10;
  }

  // documentNo or fields ending in No (but not lineNo which is handled above)
  if (name === 'documentNo' || (name.endsWith('No') && name !== 'lineNo')) {
    const prefix = entityPrefix(entityName);
    return `${prefix}-${padNumber(index + 1)}`;
  }

  // Business partner / customer
  if (nameLower.includes('partner') || nameLower.includes('customer')) {
    return cyclePool(COMPANY_NAMES, index);
  }

  // Doc status
  if (name === 'docStatus' || nameLower.includes('status')) {
    return cyclePool(DOC_STATUSES, index);
  }

  // Currency
  if (nameLower.includes('currency')) {
    return cyclePool(CURRENCIES, index);
  }

  // Warehouse
  if (nameLower.includes('warehouse')) {
    return cyclePool(WAREHOUSE_NAMES, index);
  }

  // Product
  if (nameLower.includes('product')) {
    return cyclePool(PRODUCT_NAMES, index);
  }

  // Description
  if (name === 'description') {
    return cyclePool(DESCRIPTION_PHRASES, index);
  }

  // Tax
  if (nameLower.includes('tax')) {
    return cyclePool(TAX_NAMES, index);
  }

  // Discount
  if (name === 'discount') {
    return randomInt(0, 25, index, 1);
  }

  // Quantity
  if (name === 'quantity' || nameLower.includes('qty')) {
    return randomInt(1, 100, index, 2);
  }

  // Date type
  if (type === 'date') {
    const base = new Date('2026-01-15');
    base.setDate(base.getDate() + index);
    return base.toISOString().split('T')[0];
  }

  // Amount / quantity types
  if (type === 'amount') {
    return randomInt(500, 50000, index, 3);
  }

  if (type === 'quantity') {
    return randomInt(1, 500, index, 6);
  }

  if (type === 'decimal') {
    return parseFloat((randomInt(1, 9999, index, 7) / 100).toFixed(2));
  }

  // Integer type
  if (type === 'integer') {
    return randomInt(1, 100, index, 4);
  }

  // Number type (generic) - check name-based heuristics first handled above
  if (type === 'number') {
    return randomInt(1, 1000, index, 5);
  }

  // Default string
  return `Sample ${name}`;
}

/**
 * Generate an array of mock records for a given entity.
 * @param {string} entityName
 * @param {object} contract - Full contract object
 * @param {number} [count=12]
 * @returns {object[]}
 */
export function generateMockRecords(entityName, contract, count = 12) {
  const entity = contract.frontendContract.entities[entityName];
  if (!entity) {
    throw new Error(`Entity "${entityName}" not found in frontendContract`);
  }

  const records = [];
  for (let i = 0; i < count; i++) {
    const record = {
      id: `mock-${entityName}-${padNumber(i + 1, 3)}`,
    };
    for (const field of entity.fields) {
      record[field.name] = generateMockValue(field, i, entityName);
    }
    records.push(record);
  }
  return records;
}

/**
 * Generate mock data for all entities in the contract.
 * Primary entity is placed first. Child entities get a reference to parent IDs.
 * @param {object} contract
 * @param {number} [recordCount=12]
 * @returns {Record<string, object[]>}
 */
export function generateAllMockData(contract, recordCount = 12) {
  const { primaryEntity } = contract.frontendContract.window;
  const entityNames = Object.keys(contract.frontendContract.entities);

  // Ensure primary entity is first
  const ordered = [primaryEntity, ...entityNames.filter(e => e !== primaryEntity)];

  const result = {};
  for (const entityName of ordered) {
    result[entityName] = generateMockRecords(entityName, contract, recordCount);
  }

  // Add parent references to child entities
  const primaryRecords = result[primaryEntity];
  for (const entityName of ordered) {
    if (entityName === primaryEntity) continue;
    const parentIdField = `${primaryEntity}Id`;
    for (let i = 0; i < result[entityName].length; i++) {
      const parentIndex = i % primaryRecords.length;
      result[entityName][i][parentIdField] = primaryRecords[parentIndex].id;
    }
  }

  return result;
}

/**
 * Generate an ES module file string with exported mock data.
 * @param {object} contract
 * @returns {string}
 */
export function generateMockDataFile(contract) {
  const data = generateAllMockData(contract);
  const lines = [
    '// Auto-generated mock data - do not edit manually',
    '',
  ];

  for (const [entityName, records] of Object.entries(data)) {
    lines.push(`export const ${entityName} = ${JSON.stringify(records, null, 2)};`);
    lines.push('');
  }

  return lines.join('\n');
}

// --- CLI entry point ---

const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('generate-mock-data.js') ||
  process.argv[1].endsWith('generate-mock-data')
);

if (isMainModule && process.argv[2]) {
  const contractPath = resolve(process.argv[2]);
  const contract = JSON.parse(readFileSync(contractPath, 'utf-8'));
  const windowName = contract.frontendContract.window.name;
  const windowSlug = windowName.toLowerCase().replace(/\s+/g, '-');

  // Determine artifact directory from contract path
  const artifactDir = dirname(contractPath);
  const outputDir = resolve(artifactDir, 'generated', 'web', windowSlug);
  mkdirSync(outputDir, { recursive: true });

  const outputPath = resolve(outputDir, 'mockData.js');
  const content = generateMockDataFile(contract);
  writeFileSync(outputPath, content, 'utf-8');

  console.log(`Mock data generated: ${outputPath}`);
}
