#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function usage() {
  console.error('Usage: node scripts/merge-lcov.js <input-glob> <output-file>');
  process.exit(1);
}

function expandSimpleGlob(pattern) {
  const slash = pattern.lastIndexOf('/');
  const dir = slash >= 0 ? pattern.slice(0, slash) : '.';
  const namePattern = slash >= 0 ? pattern.slice(slash + 1) : pattern;
  const star = namePattern.indexOf('*');

  if (star < 0) {
    return existsSync(pattern) ? [pattern] : [];
  }

  const prefix = namePattern.slice(0, star);
  const suffix = namePattern.slice(star + 1);
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(suffix))
    .map((name) => join(dir, name))
    .sort((left, right) => left.localeCompare(right));
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toTaken(value) {
  return value === '-' ? 0 : toNumber(value);
}

// Reports from `node --test --experimental-test-coverage` emit a DA:/FN:/BRDA: entry for
// every line/function/branch in the file, including comments and blank lines — they are not
// executable and were never "coverable" to begin with. vitest's v8-based coverage only emits
// entries for lines/functions/branches that are actually instrumentable, so it's the more
// precise source. When both report on the same file, trust vitest's set as ground truth and
// only fold in hit counts from the other reports; entries that exist ONLY in a non-vitest
// report are phantom and must be dropped, or they inflate the coverage denominator. Files
// vitest never touches keep the old union behavior — there's no more precise source to defer to.
function isTrustedSource(filePath) {
  return /vitest/i.test(filePath);
}

function getRecord(records, sourceFile) {
  let record = records.get(sourceFile);
  if (!record) {
    record = {
      sourceFile,
      functions: new Map(),
      functionHits: new Map(),
      lines: new Map(),
      branches: new Map(),
      extras: new Set(),
      trustedFunctions: new Set(),
      trustedLines: new Set(),
      trustedBranches: new Set(),
      hasTrustedSource: false,
    };
    records.set(sourceFile, record);
  }
  return record;
}

function parseRecord(records, text, trusted) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const sourceLine = lines.find((line) => line.startsWith('SF:'));
  if (!sourceLine) {
    return;
  }

  const sourceFile = sourceLine.slice(3);
  const record = getRecord(records, sourceFile);
  if (trusted) {
    record.hasTrustedSource = true;
  }

  for (const line of lines) {
    if (line.startsWith('TN:') || line.startsWith('SF:') || line === 'end_of_record') {
      continue;
    }

    if (line.startsWith('FN:')) {
      const payload = line.slice(3);
      const comma = payload.indexOf(',');
      if (comma >= 0) {
        const name = payload.slice(comma + 1);
        record.functions.set(name, payload.slice(0, comma));
        if (trusted) {
          record.trustedFunctions.add(name);
        }
      }
      continue;
    }

    if (line.startsWith('FNDA:')) {
      const payload = line.slice(5);
      const comma = payload.indexOf(',');
      if (comma >= 0) {
        const hits = toNumber(payload.slice(0, comma));
        const name = payload.slice(comma + 1);
        record.functionHits.set(name, (record.functionHits.get(name) || 0) + hits);
      }
      continue;
    }

    if (line.startsWith('DA:')) {
      const [lineNumber, hits] = line.slice(3).split(',', 2);
      record.lines.set(lineNumber, (record.lines.get(lineNumber) || 0) + toNumber(hits));
      if (trusted) {
        record.trustedLines.add(lineNumber);
      }
      continue;
    }

    if (line.startsWith('BRDA:')) {
      const parts = line.slice(5).split(',');
      if (parts.length >= 4) {
        const key = parts.slice(0, 3).join(',');
        record.branches.set(key, (record.branches.get(key) || 0) + toTaken(parts[3]));
        if (trusted) {
          record.trustedBranches.add(key);
        }
      }
      continue;
    }

    if (/^(FNF|FNH|LF|LH|BRF|BRH):/.test(line)) {
      continue;
    }

    record.extras.add(line);
  }
}

// Returns the [key, value] entries a record should actually report for one of its
// functions/lines/branches maps: the full map when no trusted (vitest) source touched this
// file, or only the entries vitest also reported when one did — dropping node-only phantoms.
function trustedEntries(map, trustedKeys, hasTrustedSource) {
  const entries = [...map.entries()];
  return hasTrustedSource ? entries.filter(([key]) => trustedKeys.has(key)) : entries;
}

function compareNumericKeys(left, right) {
  const leftNum = Number(left.split(',')[0]);
  const rightNum = Number(right.split(',')[0]);
  if (Number.isFinite(leftNum) && Number.isFinite(rightNum) && leftNum !== rightNum) {
    return leftNum - rightNum;
  }
  return left.localeCompare(right);
}

export function mergeLcovFiles(inputFiles) {
  const records = new Map();
  for (const file of inputFiles) {
    const content = readFileSync(file, 'utf8');
    const trusted = isTrustedSource(file);
    for (const record of content.split(/end_of_record\s*/)) {
      parseRecord(records, record, trusted);
    }
  }

  const output = [];
  for (const record of [...records.values()].sort((left, right) => left.sourceFile.localeCompare(right.sourceFile))) {
    output.push('TN:');
    output.push(`SF:${record.sourceFile}`);

    const functionEntries = trustedEntries(record.functions, record.trustedFunctions, record.hasTrustedSource);
    for (const [name, lineNumber] of functionEntries.sort((left, right) => compareNumericKeys(left[1], right[1]))) {
      output.push(`FN:${lineNumber},${name}`);
    }
    const functionHitEntries = trustedEntries(record.functionHits, record.trustedFunctions, record.hasTrustedSource);
    for (const [name, hits] of functionHitEntries.sort((left, right) => left[0].localeCompare(right[0]))) {
      output.push(`FNDA:${hits},${name}`);
    }
    output.push(`FNF:${functionEntries.length}`);
    output.push(`FNH:${functionHitEntries.filter(([, hits]) => hits > 0).length}`);

    const branchEntries = trustedEntries(record.branches, record.trustedBranches, record.hasTrustedSource);
    for (const [key, hits] of branchEntries.sort((left, right) => compareNumericKeys(left[0], right[0]))) {
      output.push(`BRDA:${key},${hits}`);
    }
    if (branchEntries.length > 0) {
      output.push(`BRF:${branchEntries.length}`);
      output.push(`BRH:${branchEntries.filter(([, hits]) => hits > 0).length}`);
    }

    const lineEntries = trustedEntries(record.lines, record.trustedLines, record.hasTrustedSource);
    for (const [lineNumber, hits] of lineEntries.sort((left, right) => Number(left[0]) - Number(right[0]))) {
      output.push(`DA:${lineNumber},${hits}`);
    }
    output.push(`LF:${lineEntries.length}`);
    output.push(`LH:${lineEntries.filter(([, hits]) => hits > 0).length}`);

    for (const extra of [...record.extras].sort((left, right) => left.localeCompare(right))) {
      output.push(extra);
    }
    output.push('end_of_record');
  }

  return `${output.join('\n')}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , inputPattern, outputFile] = process.argv;
  if (!inputPattern || !outputFile) {
    usage();
  }

  const inputFiles = expandSimpleGlob(inputPattern).filter((file) => file !== outputFile);
  if (inputFiles.length === 0) {
    console.error(`No LCOV input files matched: ${inputPattern}`);
    process.exit(1);
  }

  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, mergeLcovFiles(inputFiles));
}
