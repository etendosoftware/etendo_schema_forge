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
    };
    records.set(sourceFile, record);
  }
  return record;
}

function parseRecord(records, text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const sourceLine = lines.find((line) => line.startsWith('SF:'));
  if (!sourceLine) {
    return;
  }

  const sourceFile = sourceLine.slice(3);
  const record = getRecord(records, sourceFile);

  for (const line of lines) {
    if (line.startsWith('TN:') || line.startsWith('SF:') || line === 'end_of_record') {
      continue;
    }

    if (line.startsWith('FN:')) {
      const payload = line.slice(3);
      const comma = payload.indexOf(',');
      if (comma >= 0) {
        record.functions.set(payload.slice(comma + 1), payload.slice(0, comma));
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
      continue;
    }

    if (line.startsWith('BRDA:')) {
      const parts = line.slice(5).split(',');
      if (parts.length >= 4) {
        const key = parts.slice(0, 3).join(',');
        record.branches.set(key, (record.branches.get(key) || 0) + toTaken(parts[3]));
      }
      continue;
    }

    if (/^(FNF|FNH|LF|LH|BRF|BRH):/.test(line)) {
      continue;
    }

    record.extras.add(line);
  }
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
    for (const record of content.split(/end_of_record\s*/)) {
      parseRecord(records, record);
    }
  }

  const output = [];
  for (const record of [...records.values()].sort((left, right) => left.sourceFile.localeCompare(right.sourceFile))) {
    output.push('TN:');
    output.push(`SF:${record.sourceFile}`);

    for (const [name, lineNumber] of [...record.functions.entries()].sort((left, right) => compareNumericKeys(left[1], right[1]))) {
      output.push(`FN:${lineNumber},${name}`);
    }
    for (const [name, hits] of [...record.functionHits.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
      output.push(`FNDA:${hits},${name}`);
    }
    output.push(`FNF:${record.functions.size}`);
    output.push(`FNH:${[...record.functionHits.values()].filter((hits) => hits > 0).length}`);

    for (const [key, hits] of [...record.branches.entries()].sort((left, right) => compareNumericKeys(left[0], right[0]))) {
      output.push(`BRDA:${key},${hits}`);
    }
    if (record.branches.size > 0) {
      output.push(`BRF:${record.branches.size}`);
      output.push(`BRH:${[...record.branches.values()].filter((hits) => hits > 0).length}`);
    }

    for (const [lineNumber, hits] of [...record.lines.entries()].sort((left, right) => Number(left[0]) - Number(right[0]))) {
      output.push(`DA:${lineNumber},${hits}`);
    }
    output.push(`LF:${record.lines.size}`);
    output.push(`LH:${[...record.lines.values()].filter((hits) => hits > 0).length}`);

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
