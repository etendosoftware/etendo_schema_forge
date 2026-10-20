#!/usr/bin/env node
/**
 * Runs the E2E specs of one product cell (ETP-5790).
 *
 * Cells are the product teams (Compras, Almacenes, Contabilidad, Financiero, Ventas, Localización,
 * plus Plataforma); each owns one or more folders under tests/flows. Specs shared by two cells
 * live in their own folder and are listed under both (sales-purchases: Ventas and Compras). Cell
 * names match the com.etendoerp.go Java cells (src-test/cells) so both suites are run the same way.
 *
 *   npm run test:cell -- ventas                  # mocked + integration
 *   npm run test:cell -- compras mock            # mocked only (projects mocked + mocked-serial)
 *   npm run test:cell -- almacenes integration   # integration only
 *   npm run test:cell -- ventas mock --list      # anything after the kind goes to Playwright
 *   npm run test:cell -- --check                 # fails on a loose spec or a folder with no cell
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const FLOWS_DIR = join(E2E_DIR, 'tests', 'flows');

export const CELLS = {
  ventas: ['sales', 'contacts', 'sales-purchases'],
  compras: ['purchases', 'sales-purchases'],
  almacenes: ['inventory', 'products'],
  contabilidad: ['accounting'],
  financiero: ['finance'],
  localizacion: ['fiscal'],
  plataforma: ['platform', 'system', 'dashboard', 'onboarding'],
};

const PROJECTS = {
  mock: ['mocked', 'mocked-serial'],
  integration: ['integration'],
};
PROJECTS.all = [...PROJECTS.mock, ...PROJECTS.integration];

/** Problems that leave a spec outside every cell: loose spec files and folders no cell owns. */
export function cellProblems(flowsDir = FLOWS_DIR, cells = CELLS) {
  const owned = new Set(Object.values(cells).flat());
  const problems = [];
  for (const entry of readdirSync(flowsDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.spec.js')) {
      problems.push(`tests/flows/${entry.name} is not inside a cell folder`);
    } else if (entry.isDirectory() && !owned.has(entry.name)) {
      problems.push(`tests/flows/${entry.name}/ does not belong to any cell (see CELLS in support/test-cell.mjs)`);
    }
  }
  return problems;
}

/** The Playwright arguments for one cell and kind. */
export function playwrightArgs(cell, kind = 'all', extra = []) {
  const folders = cell === 'all' ? [] : CELLS[cell];
  if (!folders) {
    throw new Error(`Unknown cell "${cell}". Cells: ${Object.keys(CELLS).join(', ')}, all`);
  }
  const projects = PROJECTS[kind];
  if (!projects) {
    throw new Error(`Unknown kind "${kind}". Use mock, integration or all`);
  }
  return [
    'playwright', 'test',
    ...folders.map((folder) => `tests/flows/${folder}/`),
    ...projects.map((project) => `--project=${project}`),
    ...extra,
  ];
}

function main(argv) {
  if (argv[0] === '--check') {
    const problems = cellProblems();
    problems.forEach((problem) => console.error(`✗ ${problem}`));
    if (problems.length) {
      return 1;
    }
    console.log(`✓ Every spec under tests/flows belongs to a cell (${Object.keys(CELLS).join(', ')}).`);
    return 0;
  }
  if (!argv[0] || argv[0] === '--help') {
    console.log('Usage: npm run test:cell -- <cell|all> [mock|integration|all] [playwright args]');
    Object.entries(CELLS).forEach(([cell, folders]) => console.log(`  ${cell.padEnd(13)} ${folders.join(', ')}`));
    return argv[0] ? 0 : 1;
  }
  const [cell, maybeKind, ...rest] = argv;
  const hasKind = maybeKind in PROJECTS;
  const kind = hasKind ? maybeKind : 'all';
  const extra = hasKind ? rest : [maybeKind, ...rest].filter((arg) => arg !== undefined);

  let args;
  try {
    args = playwrightArgs(cell, kind, extra);
  } catch (error) {
    console.error(error.message);
    return 1;
  }
  console.log(`> npx ${args.join(' ')}`);
  const result = spawnSync('npx', args, { cwd: E2E_DIR, stdio: 'inherit' });
  return result.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
