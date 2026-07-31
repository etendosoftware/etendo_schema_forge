#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { isMergeBlock, selectTests } from './test-selection.mjs';

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};
const repo = value('--repo', 'etendosoftware/etendo_schema_forge');
const limit = Number(value('--limit', '100'));
const output = resolve(value('--out', './tmp/test-selection-history.md'));
const jsonOutput = output.replace(/\.md$/, '.json');
const source = value('--source', 'auto');
const gitRef = value('--git-ref', 'origin/epic/ETP-3504');

function gh(...ghArgs) {
  return JSON.parse(execFileSync('gh', ghArgs, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }));
}

function git(...gitArgs) {
  return execFileSync('git', gitArgs, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
}

function collectFromGit() {
  const records = git('log', gitRef, '--first-parent', '--merges', '--format=%H%x1f%cI%x1f%B%x1e')
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, mergedAt, ...bodyParts] = record.split('\x1f');
      const body = bodyParts.join('\x1f').trim();
      const number = Number(body.match(/^Merge pull request #(\d+)/)?.[1]);
      const title = body.split(/\n\s*\n/).slice(1).join(' ').trim() || body.split('\n')[0];
      return { sha, mergedAt, body, number, title, labels: [] };
    })
    .filter((pr) => Number.isInteger(pr.number));
  return records.filter((pr) => !isMergeBlock(pr)).slice(0, limit).map((pr) => ({
    ...pr,
    files: git('diff', '--name-only', `${pr.sha}^1`, pr.sha).split(/\r?\n/).filter(Boolean),
  }));
}

function collectFromGitHub() {
  const candidates = gh('pr', 'list', '--repo', repo, '--state', 'merged', '--limit', String(Math.max(limit * 2, 200)), '--json', 'number,title,labels,mergedAt');
  const eligible = candidates.filter((pr) => !isMergeBlock(pr)).slice(0, limit);
  return eligible.map((pr, index) => {
    const detail = gh('pr', 'view', String(pr.number), '--repo', repo, '--json', 'files,headRefOid,statusCheckRollup');
    process.stderr.write(`\r${index + 1}/${limit}`);
    return { ...pr, sha: detail.headRefOid, files: (detail.files ?? []).map((file) => file.path), statusCheckRollup: detail.statusCheckRollup ?? [] };
  });
}

let selectedSource = source;
let eligible;
if (source === 'git') {
  eligible = collectFromGit();
} else {
  try {
    eligible = collectFromGitHub();
    selectedSource = 'github';
  } catch (error) {
    if (source === 'github') throw error;
    console.error(`GitHub collection unavailable (${error.message.split('\n')[0]}); falling back to ${gitRef}.`);
    eligible = collectFromGit();
    selectedSource = 'git';
  }
}
if (eligible.length < limit) throw new Error(`Only ${eligible.length} eligible merged PRs were returned; requested ${limit}.`);

const rows = [];
for (const [index, pr] of eligible.entries()) {
  const plan = selectTests(pr.files, { level: 'affected' });
  const testJob = (pr.statusCheckRollup ?? []).find((check) => check.workflowName === 'Tests' && check.name === 'test');
  const githubMinutes = testJob?.startedAt && testJob?.completedAt
    ? (new Date(testJob.completedAt) - new Date(testJob.startedAt)) / 60000
    : null;
  rows.push({ number: pr.number, title: pr.title, mergedAt: pr.mergedAt, sha: pr.sha, files: pr.files, plan, githubMinutes });
  process.stderr.write(`\r${index + 1}/${limit}`);
}
process.stderr.write('\n');

const counts = Object.fromEntries([...new Set(rows.map((row) => row.plan.profile))].sort().map((profile) => [profile, rows.filter((row) => row.plan.profile === profile).length]));
const sectionCounts = {};
for (const row of rows) for (const section of row.plan.sections) sectionCounts[section] = (sectionCounts[section] ?? 0) + 1;
const observedMinutes = rows.reduce((sum, row) => sum + (row.githubMinutes ?? 0), 0);

mkdirSync(dirname(output), { recursive: true });
writeFileSync(jsonOutput, JSON.stringify({ generatedAt: new Date().toISOString(), repo, source: selectedSource, gitRef: selectedSource === 'git' ? gitRef : null, limit, counts, sectionCounts, observedMinutes, rows }, null, 2));

const markdown = [
  '# Test-selection validation against merged PRs', '',
  `Generated: ${new Date().toISOString()}`, `Repository: \`${repo}\``, `Source: **${selectedSource}**${selectedSource === 'git' ? ` (\`${gitRef}\`)` : ''}`, `Eligible merged PRs: **${rows.length}**`, '',
  `Merge blocks are excluded ${selectedSource === 'github' ? 'by label and defensively ' : ''}by title.`, '',
  '## Profiles', '', '| Profile | PRs |', '| --- | ---: |',
  ...Object.entries(counts).map(([profile, count]) => `| ${profile} | ${count} |`), '',
  '## Selected sections', '', '| Section | PRs |', '| --- | ---: |',
  ...Object.entries(sectionCounts).sort((a, b) => b[1] - a[1]).map(([section, count]) => `| ${section} | ${count} |`), '',
  selectedSource === 'github' ? `Observed GitHub Tests/test time: **${(observedMinutes / 60).toFixed(2)} hours**. This is not predicted savings.` : 'GitHub job duration is unavailable from the local Git fallback; this run validates classification only.', '',
  '## Per PR', '', '| PR | Files | Profile | Sections | GitHub test min |', '| ---: | ---: | --- | --- | ---: |',
  ...rows.map((row) => `| #${row.number} | ${row.files.length} | ${row.plan.profile} | ${row.plan.sections.join(', ')} | ${row.githubMinutes?.toFixed(2) ?? '—'} |`), '',
  `Machine-readable evidence: \`${jsonOutput}\`.`, '',
];
writeFileSync(output, markdown.join('\n'));
console.log(`Wrote ${output} and ${jsonOutput}`);
