import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

/**
 * Convert a kebab-case section id to camelCase variable name.
 * e.g., 'stock-levels' -> 'stockLevels'
 */
function toCamelCase(id) {
  return id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Generate config.js and mockData.js from an aggregate contract.
 *
 * @param {object} contract - The aggregate-contract.json object
 * @returns {{ 'config.js': string, 'mockData.js': string }}
 */
export function generateAggregateFiles(contract) {
  return {
    'config.js': generateConfig(contract),
    'mockData.js': generateMockData(contract),
  };
}

/**
 * Generate the config.js file content.
 */
function generateConfig(contract) {
  const { meta, sections: sectionsList, layout, actions } = contract;

  // Build kpisConfig from individual kpi-single sections (new format)
  // or fall back to the legacy kpi-header.kpis array (old format)
  const kpiHeaderSection = sectionsList.find(s => s.id === 'kpi-header');
  const kpisConfig = kpiHeaderSection?.kpis
    ?? sectionsList
        .filter(s => s.type === 'kpi-single')
        .map(({ id, type, ...cfg }) => cfg);

  // Build sections object keyed by id, excluding kpi-header and kpi-single entries
  // (kpi-single sections are represented via kpisConfig, not as standalone sections)
  const sectionsObj = {};
  for (const section of sectionsList) {
    if (section.id === 'kpi-header') continue;
    const { id, ...config } = section;
    sectionsObj[id] = config;
  }

  const lines = [
    '// Auto-generated from aggregate-contract.json — DO NOT EDIT',
    '',
    `export const meta = ${JSON.stringify(meta, null, 2)};`,
    '',
    `export const kpisConfig = ${JSON.stringify(kpisConfig, null, 2)};`,
    '',
    `export const sections = ${JSON.stringify(sectionsObj, null, 2)};`,
    '',
    `export const layout = ${JSON.stringify(layout.areas, null, 2)};`,
    '',
    `export const actions = ${JSON.stringify(actions, null, 2)};`,
    '',
  ];

  return lines.join('\n');
}

/**
 * Generate the mockData.js file content.
 * One named export per section id (skip quick-actions).
 * kpi-header section exports as 'kpis'.
 */
function generateMockData(contract) {
  const { sections: sectionsList, mockData } = contract;

  const lines = [
    '// Auto-generated from aggregate-contract.json — DO NOT EDIT',
    '',
  ];

  // Group kpi-single sections into a combined 'kpis' object keyed by their `key` field
  const kpiSingleSections = sectionsList.filter(s => s.type === 'kpi-single');
  if (kpiSingleSections.length > 0) {
    const kpisObj = {};
    for (const s of kpiSingleSections) {
      if (s.key && mockData[s.id] !== undefined) {
        kpisObj[s.key] = mockData[s.id];
      }
    }
    if (Object.keys(kpisObj).length > 0) {
      lines.push(`export const kpis = ${JSON.stringify(kpisObj, null, 2)};`);
      lines.push('');
    }
  }

  for (const section of sectionsList) {
    if (section.type === 'quick-actions') continue;
    if (section.type === 'kpi-single') continue; // already handled above

    const data = mockData[section.id];
    if (data === undefined) continue;

    // kpi-header exports as 'kpis', others use camelCase of section id
    const exportName = section.id === 'kpi-header'
      ? 'kpis'
      : toCamelCase(section.id);

    lines.push(`export const ${exportName} = ${JSON.stringify(data, null, 2)};`);
    lines.push('');
  }

  return lines.join('\n');
}

// CLI entry point — only runs when executed directly
const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/.*\//, ''));
if (isDirectRun) {
  const args = process.argv.slice(2);

  if (args[0] === '--all') {
    // Find all aggregate-contract.json files in artifacts/
    const artifactsDir = resolve('artifacts');
    let count = 0;
    for (const moduleName of readdirSync(artifactsDir, { withFileTypes: true })) {
      if (!moduleName.isDirectory()) continue;
      const contractPath = resolve(artifactsDir, moduleName.name, 'aggregate-contract.json');
      try {
        const json = readFileSync(contractPath, 'utf-8');
        const contract = JSON.parse(json);
        writeGeneratedFiles(contract, moduleName.name);
        count++;
      } catch {
        // No aggregate-contract.json in this directory, skip
      }
    }
    console.log(`Generated files for ${count} modules`);
  } else if (args[0]) {
    const contractPath = resolve(args[0]);
    const json = readFileSync(contractPath, 'utf-8');
    const contract = JSON.parse(json);
    const moduleName = contract.meta?.module ?? dirname(contractPath).split('/').pop();
    writeGeneratedFiles(contract, moduleName);
  } else {
    console.error('Usage: node cli/src/generate-aggregate.js <aggregate-contract.json>');
    console.error('       node cli/src/generate-aggregate.js --all');
    process.exit(1);
  }
}

/**
 * Write generated config.js and mockData.js to the output directory.
 */
function writeGeneratedFiles(contract, moduleName) {
  const files = generateAggregateFiles(contract);
  const outDir = resolve(`artifacts/${moduleName}/generated`);
  mkdirSync(outDir, { recursive: true });

  for (const [filename, code] of Object.entries(files)) {
    const filePath = resolve(outDir, filename);
    writeFileSync(filePath, code, 'utf-8');
    console.log(`  wrote ${filePath}`);
  }

  console.log(`Generated ${Object.keys(files).length} files in ${outDir}`);
}
