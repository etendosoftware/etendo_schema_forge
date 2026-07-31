#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { selectTests } from './test-selection.mjs';

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};
const input = resolve(value('--input', '/private/tmp/schema-forge-100-pr-branches.json'));
const checkout = resolve(value('--checkout', '/private/tmp/schema-forge-test-selection-validation'));
const output = resolve(value('--out', './tmp/test-selection-branches.md'));
const jsonOutput = output.replace(/\.md$/, '.json');
const repository = value('--repo', 'git@github.com:etendosoftware/etendo_schema_forge.git');

function git(...gitArgs) {
  return execFileSync('git', ['-C', checkout, ...gitArgs], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
}

if (!existsSync(resolve(checkout, '.git'))) {
  execFileSync('git', ['clone', '--no-checkout', repository, checkout], { stdio: 'inherit' });
}

const prs = JSON.parse(readFileSync(input, 'utf8')).rows;
const rows = [];
for (const [index, pr] of prs.entries()) {
  const localRef = `refs/test-selection/pr-${pr.number}`;
  let cachedSha = null;
  try { cachedSha = git('rev-parse', '--verify', localRef).trim(); } catch { /* fetch below */ }
  if (cachedSha !== pr.head_sha) {
    git('fetch', '--quiet', '--force', 'origin', `refs/pull/${pr.number}/head:${localRef}`);
  }
  git('checkout', '--quiet', '--detach', localRef);
  const checkedOutSha = git('rev-parse', 'HEAD').trim();
  if (checkedOutSha !== pr.head_sha) {
    throw new Error(`PR #${pr.number}: fetched ${checkedOutSha}, expected ${pr.head_sha}`);
  }
  try {
    git('cat-file', '-e', `${pr.base_sha}^{commit}`);
  } catch {
    git('fetch', '--quiet', 'origin', pr.base_sha);
  }
  const files = git('diff', '--name-only', `${pr.base_sha}...${checkedOutSha}`).split(/\r?\n/).filter(Boolean);
  const plan = selectTests(files, { level: 'affected' });
  rows.push({ ...pr, checkedOutSha, files, plan });
  process.stderr.write(`\r${index + 1}/${prs.length} PR #${pr.number} ${pr.head}`);
}
process.stderr.write('\n');

const counts = Object.fromEntries(['none', 'focused', 'affected', 'full'].map((profile) => [profile, rows.filter((row) => row.plan.profile === profile).length]));
const sectionCounts = {};
for (const row of rows) for (const section of row.plan.sections) sectionCounts[section] = (sectionCounts[section] ?? 0) + 1;
mkdirSync(dirname(output), { recursive: true });
writeFileSync(jsonOutput, JSON.stringify({ generatedAt: new Date().toISOString(), input, checkout, counts, sectionCounts, rows }, null, 2));

const markdown = [
  '# Branch-by-branch test-selection validation', '',
  `Generated: ${new Date().toISOString()}`,
  `Temporary checkout: \`${checkout}\``,
  `Pull requests checked out: **${rows.length}**`, '',
  'Every row was fetched from `refs/pull/<number>/head`, checked out detached, SHA-verified, and diffed against the PR base SHA.', '',
  '## Profiles', '', '| Profile | PRs |', '| --- | ---: |',
  ...Object.entries(counts).map(([profile, count]) => `| ${profile} | ${count} |`), '',
  '## Sections', '', '| Section | PRs |', '| --- | ---: |',
  ...Object.entries(sectionCounts).sort((a, b) => b[1] - a[1]).map(([section, count]) => `| ${section} | ${count} |`), '',
  '## Pull requests', '', '| PR | Head branch | Base branch | Files | Profile | Sections |', '| ---: | --- | --- | ---: | --- | --- |',
  ...rows.map((row) => `| #${row.number} | \`${row.head}\` | \`${row.base}\` | ${row.files.length} | ${row.plan.profile} | ${row.plan.sections.join(', ')} |`), '',
  `Machine-readable evidence: \`${jsonOutput}\`.`, '',
];
writeFileSync(output, markdown.join('\n'));
console.log(`Wrote ${output} and ${jsonOutput}`);
