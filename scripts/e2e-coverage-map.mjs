#!/usr/bin/env node
// ETP-5891 spike: folds the per-test coverage files written by e2e/tests/helpers/test.js into a
// map "app source file → mocked specs that execute it", prints its size, and selects the specs a
// change would run.
//
//   node scripts/e2e-coverage-map.mjs build <coverage-dir> <map.json>
//   node scripts/e2e-coverage-map.mjs select <map.json> <changed-file>...
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

function select(mapFile, changed) {
  const { specs, files } = JSON.parse(readFileSync(mapFile, 'utf8'));
  const picked = new Set();
  const missing = [];
  for (const file of changed) {
    if (file.endsWith('.mocked.spec.js')) { picked.add(file); continue; }
    if (files[file]) files[file].forEach(s => picked.add(s));
    else missing.push(file);
  }
  if (missing.length) {
    console.log(`not in the map → whole suite (${specs.length} specs): ${missing.join(', ')}`);
    return;
  }
  console.log(`${picked.size} of ${specs.length} specs:`);
  for (const s of [...picked].sort()) console.log(`  ${s}`);
}

if (command === 'build') build(args[0], args[1]);
else if (command === 'select') select(args[0], args.slice(1));
else {
  console.error('usage: e2e-coverage-map.mjs build <coverage-dir> <map.json> | select <map.json> <changed-file>...');
  process.exit(2);
}
