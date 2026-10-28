#!/usr/bin/env node
// Folds the per-test coverage files written by e2e/tests/helpers/test.js into a map "app source
// file → mocked specs that execute it" (ETP-5891), and prints its size. CI builds it on every push
// to develop (.github/workflows/e2e-coverage-map.yml); scripts/select-mocked-specs.js reads it to
// pick the specs a change can affect.
//
//   node scripts/e2e-coverage-map.mjs build <coverage-dir> <map.json> [--commit <sha>]
//
// It fails when the directory holds no coverage file: an empty map would make every change look
// unrelated to every spec.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isEntryPoint } from './find-tests.js';

/** The map from per-test results ({ spec, files }): { commit, specs, files: { file: [spec] } }. */
export function buildMap(results, { commit = null } = {}) {
  const byFile = new Map();
  const specs = new Set();
  for (const { spec, files } of results) {
    specs.add(spec);
    for (const file of files) {
      // Third-party code cannot change in a commit of this repo; the core package can, by a bump.
      if (file.includes('node_modules/') && !file.includes('node_modules/@etendosoftware/')) continue;
      if (!byFile.has(file)) byFile.set(file, new Set());
      byFile.get(file).add(spec);
    }
  }
  const files = Object.fromEntries([...byFile].sort(([a], [b]) => a.localeCompare(b))
    .map(([file, s]) => [file, [...s].sort()]));
  return { commit, specs: [...specs].sort(), files };
}

export function main(argv) {
  const [command, coverageDir, out] = argv;
  const i = argv.indexOf('--commit');
  const commit = i >= 0 ? argv[i + 1] : null;
  if (command !== 'build' || !coverageDir || !out) {
    console.error('usage: e2e-coverage-map.mjs build <coverage-dir> <map.json> [--commit <sha>]');
    return 2;
  }
  let names = [];
  try {
    names = readdirSync(coverageDir).filter((name) => name.endsWith('.json'));
  } catch {
    // reported below as an empty directory
  }
  if (!names.length) {
    console.error(`e2e-coverage-map: no coverage file in ${coverageDir}; did the suite run with E2E_COVERAGE_DIR set?`);
    return 1;
  }
  const results = names.map((name) => JSON.parse(readFileSync(join(coverageDir, name), 'utf8')));
  const map = buildMap(results, { commit });
  writeFileSync(out, JSON.stringify(map));
  console.log(`tests: ${results.length} · specs: ${map.specs.length} · files in map: ${Object.keys(map.files).length} · map: ${statSync(out).size} bytes`);
  return 0;
}

if (isEntryPoint(import.meta.url)) process.exit(main(process.argv.slice(2)));
