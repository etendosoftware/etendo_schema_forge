#!/usr/bin/env node
// Folds the per-test coverage files written by e2e/tests/helpers/test.js into a map "app source
// file → mocked specs that execute it" (ETP-5891), and prints its size. scripts/select-mocked-specs.js
// reads the map to pick the specs a change can affect.
//
//   node scripts/e2e-coverage-map.mjs build <coverage-dir> <map.json>
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , command, ...args] = process.argv;

function build(coverageDir, out) {
  const byFile = new Map();
  const specs = new Set();
  let tests = 0;
  for (const name of readdirSync(coverageDir)) {
    if (!name.endsWith('.json')) continue;
    const { spec, files } = JSON.parse(readFileSync(join(coverageDir, name), 'utf8'));
    tests++;
    specs.add(spec);
    for (const file of files) {
      if (file.includes('node_modules/') && !file.includes('node_modules/@etendosoftware/')) continue;
      if (!byFile.has(file)) byFile.set(file, new Set());
      byFile.get(file).add(spec);
    }
  }
  const map = Object.fromEntries([...byFile].sort(([a], [b]) => a.localeCompare(b))
    .map(([file, s]) => [file, [...s].sort()]));
  writeFileSync(out, JSON.stringify({ specs: [...specs].sort(), files: map }));
  console.log(`tests: ${tests} · specs: ${specs.size} · files in map: ${byFile.size} · map: ${statSync(out).size} bytes`);
}

if (command === 'build') build(args[0], args[1]);
else {
  console.error('usage: e2e-coverage-map.mjs build <coverage-dir> <map.json>');
  process.exit(2);
}
