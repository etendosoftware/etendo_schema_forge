#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHARED_DOC_FILES = new Set(['INDEX', 'app-shell-functional-flows']);
const NON_WINDOW_CUSTOM_DIRS = new Set(['shared']);
const TEST_PATH_SEGMENTS = new Set(['__tests__', 'test', 'tests']);
const TEST_FILE_PATTERN = /(?:^|[./-])(?:test|spec)\.[cm]?[jt]sx?$/;

function git(args, { cwd = ROOT, allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  } catch (error) {
    if (allowFailure) {
      return '';
    }
    throw error;
  }
}

export function toKebabCase(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export function isTestingPath(path) {
  const segments = path.split('/');
  if (segments.some((segment) => TEST_PATH_SEGMENTS.has(segment))) {
    return true;
  }

  const fileName = segments[segments.length - 1] || '';
  return TEST_FILE_PATTERN.test(fileName);
}

export function windowFromChangedPath(path) {
  if (isTestingPath(path)) {
    return null;
  }

  const artifactMatch = path.match(/^artifacts\/([^/]+)\//);
  if (artifactMatch) {
    return artifactMatch[1];
  }

  const customMatch = path.match(/^tools\/app-shell\/src\/windows\/custom\/([^/]+)\//);
  if (!customMatch) {
    return null;
  }

  const segment = customMatch[1];
  if (segment.includes('.') || NON_WINDOW_CUSTOM_DIRS.has(segment)) {
    return null;
  }

  return toKebabCase(segment);
}

export function windowDocFromPath(path) {
  const docMatch = path.match(/^docs\/generated-custom-windows\/([^/]+)\.md$/);
  if (!docMatch) {
    return null;
  }

  const name = docMatch[1];
  if (SHARED_DOC_FILES.has(name)) {
    return null;
  }

  return name;
}

function docPathFor(rootDir, windowName) {
  return join(rootDir, 'docs', 'generated-custom-windows', `${windowName}.md`);
}

export function analyzeWindowDocChanges(changedFiles, { rootDir = ROOT } = {}) {
  const affectedWindows = new Set();
  const updatedDocWindows = new Set();

  for (const path of changedFiles) {
    const affectedWindow = windowFromChangedPath(path);
    if (affectedWindow) {
      affectedWindows.add(affectedWindow);
    }

    const updatedDocWindow = windowDocFromPath(path);
    if (updatedDocWindow) {
      updatedDocWindows.add(updatedDocWindow);
    }
  }

  const missingWindows = [...affectedWindows]
    .sort((left, right) => left.localeCompare(right))
    .filter((windowName) => !updatedDocWindows.has(windowName))
    .map((windowName) => ({
      windowName,
      docPath: `docs/generated-custom-windows/${windowName}.md`,
      docExists: existsSync(docPathFor(rootDir, windowName)),
    }));

  return {
    affectedWindows: [...affectedWindows].sort((left, right) => left.localeCompare(right)),
    updatedDocWindows: [...updatedDocWindows].sort((left, right) => left.localeCompare(right)),
    missingWindows,
  };
}

export function formatWindowDocReport({ affectedWindows, updatedDocWindows, missingWindows }) {
  if (affectedWindows.length === 0) {
    return 'No window-specific changes detected.';
  }

  const lines = [
    `Affected windows: ${affectedWindows.join(', ')}`,
    `Updated window docs: ${updatedDocWindows.length ? updatedDocWindows.join(', ') : '(none)'}`,
  ];

  if (!missingWindows.length) {
    lines.push('Window doc freshness check passed.');
    return lines.join('\n');
  }

  lines.push('Missing window doc updates:');
  for (const entry of missingWindows) {
    const action = entry.docExists ? 'Update' : 'Create';
    lines.push(`- ${entry.windowName}: ${action} ${entry.docPath}`);
  }

  return lines.join('\n');
}

export function resolveDiffBase(baseSha, headSha, { cwd = ROOT } = {}) {
  if (!baseSha || !headSha) {
    throw new Error('Usage: node cli/src/check-window-docs.js --base <sha> --head <sha>');
  }

  if (/^0+$/.test(baseSha)) {
    return null;
  }

  return git(['merge-base', baseSha, headSha], { cwd, allowFailure: true }) || baseSha;
}

export function getChangedFiles(baseSha, headSha, { cwd = ROOT } = {}) {
  const diffBase = resolveDiffBase(baseSha, headSha, { cwd });
  if (!diffBase) {
    return { diffBase: null, changedFiles: [] };
  }

  const output = git(['diff', '--name-only', '--diff-filter=ACMR', diffBase, headSha], { cwd, allowFailure: false });
  return {
    diffBase,
    changedFiles: output ? output.split('\n').filter(Boolean) : [],
  };
}

function getArg(args, name) {
  const index = args.indexOf(`--${name}`);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : undefined;
}

const isCLI = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCLI) {
  const args = process.argv.slice(2);
  const baseSha = getArg(args, 'base');
  const headSha = getArg(args, 'head');

  try {
    const { diffBase, changedFiles } = getChangedFiles(baseSha, headSha);

    if (!diffBase) {
      console.log('Skipping window doc check because the push event has no usable base SHA yet.');
      process.exit(0);
    }

    const analysis = analyzeWindowDocChanges(changedFiles);
    const report = formatWindowDocReport(analysis);

    if (analysis.missingWindows.length) {
      console.error(report);
      process.exit(1);
    }

    console.log(report);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
