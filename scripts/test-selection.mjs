#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyE2E } from './e2e-selection-rules.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEST_RE = /(?:^|\/)(?:__tests__\/.*|[^/]+\.(?:test|spec))\.(?:js|jsx|mjs|cjs)$/;
const E2E_RE = /^e2e\/.*\.(?:spec|test)\.(?:js|jsx|mjs|cjs)$/;
const MERGE_BLOCK_TITLE_RE = /merge[ -]?block|merge epic to develop/i;

function unique(values) {
  return [...new Set(values)].sort();
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function testsUnder(path) {
  return walk(resolve(REPO_ROOT, path))
    .map((file) => relative(REPO_ROOT, file).replaceAll('\\', '/'))
    .filter((file) => TEST_RE.test(file));
}

function adjacentTests(file) {
  const directory = dirname(file);
  const stem = basename(file, extname(file)).replace(/\.(?:test|spec)$/, '');
  return testsUnder(directory).filter((candidate) => {
    const candidateStem = basename(candidate).replace(/\.(?:test|spec)\.(?:js|jsx|mjs|cjs)$/, '');
    return candidate.includes('/__tests__/') && (candidateStem === stem || candidateStem.startsWith(`${stem}.`));
  });
}

export function isMergeBlock(pr) {
  const labels = (pr.labels ?? []).map((label) => typeof label === 'string' ? label : label.name);
  return labels.includes('merge-block') || MERGE_BLOCK_TITLE_RE.test(pr.title ?? '');
}

export function selectTests(files, options = {}) {
  const changedFiles = unique(files.map((file) => file.trim()).filter(Boolean));
  const level = options.level ?? 'affected';
  const sections = new Set();
  const reasons = [];
  const nodeTests = new Set();
  const vitestTests = new Set();
  const e2eTests = new Set();
  const regenSpecs = new Set();
  const e2e = classifyE2E({ files: changedFiles, base: options.base, title: options.title });
  let full = level === 'full';
  let functionalRoots = new Set();

  if (changedFiles.length === 0) {
    return { level, profile: 'none', e2e: 'no-e2e', files: [], sections: [], reasons: ['No changed files.'], commands: [] };
  }

  for (const file of changedFiles) {
    if (/^(?:docs\/|.*\.md$|.*\.mdx$)/.test(file)) {
      sections.add('docs');
      reasons.push(`${file}: documentation-only validation.`);
      continue;
    }
    if (/^(?:package(?:-lock)?\.json|tools\/app-shell\/package(?:-lock)?\.json|e2e\/package(?:-lock)?\.json)$/.test(file)) {
      sections.add('dependencies');
      sections.add('build');
      functionalRoots.add('dependencies');
      reasons.push(`${file}: dependency smoke tests and build.`);
      continue;
    }
    if (/^tools\/app-shell\/src\/locales\/.*\.json$/.test(file)) {
      sections.add('locales');
      sections.add('build');
      functionalRoots.add('locales');
      reasons.push(`${file}: locale contract tests and build.`);
      continue;
    }
    if (E2E_RE.test(file)) {
      sections.add(file.includes('.integration.') ? 'e2e-integration' : 'e2e-mocked');
      e2eTests.add(file);
      functionalRoots.add('e2e');
      reasons.push(`${file}: execute the modified Playwright spec.`);
      continue;
    }
    if (TEST_RE.test(file)) {
      if (file.includes('.vitest.') || file.endsWith('.vitest.js') || file.endsWith('.vitest.jsx')) {
        sections.add('app-shell-vitest');
        vitestTests.add(file);
      } else {
        sections.add('direct-node-tests');
        nodeTests.add(file);
      }
      functionalRoots.add('tests');
      reasons.push(`${file}: execute the modified test with its native runner.`);
      continue;
    }
    const windowMatch = file.match(/^tools\/app-shell\/src\/windows\/custom\/([^/]+)\//);
    if (windowMatch) {
      const window = windowMatch[1];
      sections.add('app-shell-vitest');
      sections.add('build');
      functionalRoots.add('windows');
      adjacentTests(file).forEach((test) => test.includes('.vitest.') ? vitestTests.add(test) : nodeTests.add(test));
      for (const test of testsUnder(`tools/app-shell/src/windows/custom/${window}`)) {
        if (test.includes('.vitest.')) vitestTests.add(test);
        else nodeTests.add(test);
      }
      reasons.push(`${file}: focused tests for window ${window} plus app-shell build.`);
      continue;
    }
    if (/^tools\/app-shell\/src\//.test(file)) {
      sections.add('app-shell-node');
      sections.add('app-shell-vitest');
      sections.add('build');
      functionalRoots.add('app-shell-shared');
      adjacentTests(file).forEach((test) => test.includes('.vitest.') ? vitestTests.add(test) : nodeTests.add(test));
      reasons.push(`${file}: shared app-shell change requires affected Node/Vitest coverage and build.`);
      continue;
    }
    const artifactMatch = file.match(/^artifacts\/([^/]+)\//);
    if (artifactMatch) {
      const spec = artifactMatch[1];
      sections.add('artifact-contract');
      sections.add('regen');
      sections.add('build');
      functionalRoots.add('artifacts');
      regenSpecs.add(spec);
      testsUnder(`artifacts/${spec}`).forEach((test) => nodeTests.add(test));
      reasons.push(`${file}: artifact ${spec} tests, scoped regeneration and build.`);
      continue;
    }
    if (/^cli\/(?:src|config)\//.test(file)) {
      sections.add('cli');
      sections.add('regen');
      functionalRoots.add('cli');
      reasons.push(`${file}: CLI/generator changes require CLI tests and regeneration.`);
      continue;
    }
    if (/^cli\/(?:cache|test\/fixtures|method-budget\.json)/.test(file) || /^core-maps\//.test(file)) {
      sections.add('cli');
      sections.add('regen');
      functionalRoots.add('cli');
      reasons.push(`${file}: pipeline input/fixture change requires CLI tests and regeneration.`);
      continue;
    }
    if (/^packages\/app-shell-core\//.test(file)) {
      sections.add('app-shell-node');
      sections.add('app-shell-vitest');
      sections.add('build');
      functionalRoots.add('app-shell-shared');
      reasons.push(`${file}: shared app-shell package coverage and build.`);
      continue;
    }
    if (/^packages\/(?:schema-forge-core|schema-forge-agent-context|schema-forge-stack)\//.test(file)) {
      sections.add('cli');
      functionalRoots.add('cli');
      reasons.push(`${file}: Schema Forge package coverage.`);
      continue;
    }
    if (/^e2e\//.test(file)) {
      sections.add('e2e-mocked');
      functionalRoots.add('e2e');
      reasons.push(`${file}: shared Playwright support change.`);
      continue;
    }
    if (/^tools\/app-shell\/(?:vite|vitest|tailwind)|^tools\/app-shell\/public\//.test(file)) {
      sections.add('app-shell-vitest');
      sections.add('build');
      functionalRoots.add('app-shell-shared');
      reasons.push(`${file}: app-shell tooling/assets require Vitest and build.`);
      continue;
    }
    if (/^(?:templates\/reports|packages\/apps-sdk)/.test(file)) {
      sections.add('artifact-contract');
      sections.add('build');
      functionalRoots.add('artifacts');
      reasons.push(`${file}: report/SDK contract validation and build.`);
      continue;
    }
    if (/^scripts\//.test(file)) {
      sections.add('direct-node-tests');
      functionalRoots.add('tooling');
      testsUnder('scripts/__tests__').forEach((test) => nodeTests.add(test));
      reasons.push(`${file}: repository tool tests.`);
      continue;
    }
    if (/^(?:\.githooks\/|\.github\/workflows\/|Makefile$|run-sonar\.sh$|sonar-project\.properties$)/.test(file)) {
      full = true;
      reasons.push(`${file}: CI or repository infrastructure change uses the full fallback.`);
      continue;
    }
    if (/^(?:\.gitignore|\.npmrc|tools\/app-shell\/\.npmrc)$/.test(file)) {
      sections.add('dependencies');
      functionalRoots.add('dependencies');
      reasons.push(`${file}: repository/dependency configuration smoke.`);
      continue;
    }
    full = true;
    reasons.push(`${file}: unknown change surface uses the full fallback.`);
  }

  if (functionalRoots.size >= 4) {
    full = true;
    reasons.push(`Change spans ${functionalRoots.size} functional roots; using the full fallback.`);
  }

  if (full) {
    return {
      level,
      profile: 'full',
      e2e: 'e2e-full',
      files: changedFiles,
      sections: ['full'],
      reasons: unique(reasons),
      commands: [{ label: 'Full unit, coverage and Sonar gate', argv: ['./run-sonar.sh', '--coverage', '--fail-on-gate', '--compare-coverage'] }],
    };
  }

  const commands = [];
  if (sections.has('dependencies')) {
    commands.push({ label: 'Dependency smoke tests', cwd: 'tools/app-shell', argv: ['npx', 'vitest', 'run', 'src/__tests__/core-package-reexports.vitest.jsx', 'src/__tests__/runtime-routes.vitest.js', 'src/__tests__/runtime-routes-integration.vitest.jsx'] });
  }
  if (sections.has('locales')) {
    commands.push({ label: 'Locale tests', argv: ['node', '--test', ...testsUnder('tools/app-shell/src/locales')] });
  }
  if (sections.has('cli')) {
    commands.push({ label: 'CLI tests', argv: ['node', '--test', ...testsUnder('cli/test')] });
  }
  if (nodeTests.size) commands.push({ label: 'Affected Node tests', argv: ['node', '--test', ...unique(nodeTests)] });
  if (vitestTests.size) commands.push({ label: 'Affected Vitest tests', cwd: 'tools/app-shell', argv: ['npx', 'vitest', 'run', ...unique(vitestTests).map((file) => file.replace(/^tools\/app-shell\//, ''))] });
  if (sections.has('app-shell-node') && nodeTests.size === 0) {
    commands.push({ label: 'App-shell Node tests', argv: ['node', '--test', ...testsUnder('tools/app-shell/src').filter((file) => file.endsWith('.test.js'))] });
  }
  if (sections.has('app-shell-vitest') && vitestTests.size === 0) {
    commands.push({ label: 'App-shell Vitest suite', cwd: 'tools/app-shell', argv: ['npx', 'vitest', 'run'] });
  }
  if (sections.has('build')) commands.push({ label: 'App-shell build', argv: ['npm', 'run', 'build', '--workspace=tools/app-shell'] });
  if (sections.has('regen')) {
    const only = regenSpecs.size ? [`ONLY=${unique(regenSpecs).join(',')}`] : [];
    commands.push({ label: 'Offline regeneration', argv: ['make', 'regen', ...only, 'FROM_CACHE=1'] });
  }
  const functional = sections.size > 0 && !([...sections].every((section) => section === 'docs'));
  return {
    level,
    profile: functional ? (level === 'focused' ? 'focused' : 'affected') : 'none',
    e2e: e2e.classification,
    files: changedFiles,
    sections: unique(sections),
    reasons: unique(reasons),
    commands,
  };
}

function changedFiles(base, head) {
  const output = execFileSync('git', ['diff', '--name-only', `${base}...${head}`], { cwd: REPO_ROOT, encoding: 'utf8' });
  return output.split(/\r?\n/).filter(Boolean);
}

export function runPlan(plan) {
  for (const command of plan.commands) {
    console.log(`RUN: ${command.label}`);
    const result = spawnSync(command.argv[0], command.argv.slice(1), {
      cwd: resolve(REPO_ROOT, command.cwd ?? '.'),
      stdio: 'inherit',
      env: process.env,
    });
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}

function parseArgs(argv) {
  const args = { base: 'origin/epic/ETP-3504', head: 'HEAD', level: 'affected', format: 'text', run: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') args.base = argv[++i];
    else if (argv[i] === '--head') args.head = argv[++i];
    else if (argv[i] === '--level') args.level = argv[++i];
    else if (argv[i] === '--format') args.format = argv[++i];
    else if (argv[i] === '--run') args.run = true;
  }
  return args;
}

function formatText(plan) {
  return [
    `Test selection: ${plan.profile}`,
    `E2E selection: ${plan.e2e}`,
    `Sections: ${plan.sections.join(', ') || 'none'}`,
    ...plan.reasons.map((reason) => `- ${reason}`),
    ...plan.commands.map((command) => `RUN ${command.label}: ${command.argv.join(' ')}`),
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const plan = selectTests(changedFiles(args.base, args.head), { level: args.level });
  console.log(args.format === 'json' ? JSON.stringify(plan, null, 2) : formatText(plan));
  if (args.run) process.exit(runPlan(plan));
}
