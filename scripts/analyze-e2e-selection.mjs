#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { classifyE2E as classifyE2ERule } from './e2e-selection-rules.mjs';

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};
const prsInput = resolve(value('--prs', './tmp/test-selection-branches.json'));
const jenkinsInput = resolve(value('--jenkins', '/private/tmp/schema-forge-jenkins-e2e/pipeline-failures.json'));
const output = resolve(value('--out', './tmp/e2e-selection-analysis.json'));
const reviewsInput = resolve(value('--reviews', './scripts/e2e-selection-reviews.json'));
const prs = JSON.parse(readFileSync(prsInput, 'utf8')).rows;
const jenkins = JSON.parse(readFileSync(jenkinsInput, 'utf8'));
const reviews = existsSync(reviewsInput) ? JSON.parse(readFileSync(reviewsInput, 'utf8')) : {};

const E2E_FILE = /^e2e\/.*\.(?:spec|test)\.(?:js|jsx|mjs|cjs)$/;
const INTEGRATION_FILE = /\.integration\.(?:spec|test)\./;
const UI_FILE = /^(?:tools\/app-shell\/src\/(?:components|pages|windows|hooks|lib)|packages\/app-shell-core\/src)\//;
const BACKEND_CONTRACT = /^(?:artifacts\/|cli\/src\/(?:generate|resolve|push|extract)|core-maps\/)/;
const E2E_INFRA = /^(?:e2e\/(?:playwright\.config|tests\/helpers|package)|\.github\/workflows\/|\.githooks\/)/;
const LOW_RISK = /^(?:docs\/|.*\.md$|.*package(?:-lock)?\.json$|tools\/app-shell\/src\/locales\/|.*\.(?:test|vitest)\.(?:js|jsx|mjs|cjs)$)/;

export function classifyE2E(pr) {
  const files = pr.files;
  const title = pr.title ?? '';
  const reasons = [];
  const e2eFiles = files.filter((file) => E2E_FILE.test(file));
  if (pr.base === 'develop' || files.length >= 100 || files.some((file) => E2E_INFRA.test(file) && !E2E_FILE.test(file))) {
    reasons.push(pr.base === 'develop' ? 'Epic/develop integration boundary.' : files.length >= 100 ? `Broad ${files.length}-file change.` : 'E2E/CI infrastructure changed.');
    return { classification: 'e2e-full', reasons, e2eFiles };
  }
  if (e2eFiles.some((file) => INTEGRATION_FILE.test(file))) {
    reasons.push('An integration Playwright spec changed.');
    return { classification: 'e2e-integration', reasons, e2eFiles };
  }
  if (e2eFiles.length) {
    reasons.push('A mocked Playwright spec changed.');
    return { classification: 'e2e-mocked', reasons, e2eFiles };
  }
  const interaction = /navigat|modal|form|visibility|visible|drawer|filter|button|screen|layout|sidebar|grid|toast|dialog|selector|login|logout|ux|ui\b/i.test(title);
  const backend = /persist|backend|endpoint|\bneo\b|default|save|delete|create|import|process|post|unpost|confirm|batch|database|handler/i.test(title);
  const hasUI = files.some((file) => UI_FILE.test(file));
  const hasContract = files.some((file) => BACKEND_CONTRACT.test(file));
  if (backend && (hasUI || hasContract)) {
    reasons.push('Observable behavior depends on persistence, defaults, backend or a NEO contract.');
    return { classification: 'e2e-integration', reasons, e2eFiles };
  }
  if (interaction && hasUI) {
    reasons.push('Observable navigation/form/modal/visibility behavior changed.');
    return { classification: 'e2e-mocked', reasons, e2eFiles };
  }
  if (files.every((file) => LOW_RISK.test(file)) || !hasUI) {
    reasons.push('Only docs, dependencies, locales, unit tests or non-interactive internals changed.');
    return { classification: 'no-e2e', reasons, e2eFiles };
  }
  reasons.push('UI code changed without a clear observable interaction signal; conservative mocked E2E.');
  return { classification: 'e2e-mocked', reasons, e2eFiles };
}

const buildsByPr = new Map();
for (const build of jenkins.builds.filter((build) => build.pr != null)) {
  const number = Number(build.pr);
  if (!buildsByPr.has(number)) buildsByPr.set(number, []);
  buildsByPr.get(number).push(build);
}

function playwrightEvidence(builds) {
  const runs = builds.filter((build) => build.stages.some((stage) => /playwright/i.test(stage.name)));
  const failures = runs.filter((build) => /playwright/i.test(build.failedStage ?? ''));
  const successes = runs.filter((build) => build.result === 'SUCCESS' && build.stages.some((stage) => /playwright/i.test(stage.name) && stage.status === 'SUCCESS'));
  const bySha = new Map();
  for (const build of runs.filter((build) => build.sha)) {
    if (!bySha.has(build.sha)) bySha.set(build.sha, []);
    bySha.get(build.sha).push(build);
  }
  const flakyShas = [...bySha.entries()].filter(([, sameSha]) => {
    const hasFailure = sameSha.some((build) => /playwright/i.test(build.failedStage ?? ''));
    const hasSuccess = sameSha.some((build) => build.result === 'SUCCESS');
    return hasFailure && hasSuccess;
  }).map(([sha]) => sha);
  return { runs: runs.length, failures: failures.length, successes: successes.length, flakyShas, failureBuilds: failures.map((build) => build.number) };
}

const rows = prs.map((pr) => {
  const decision = classifyE2ERule(pr);
  const builds = buildsByPr.get(pr.number) ?? [];
  const evidence = playwrightEvidence(builds);
  const exactShaBuilds = builds.filter((build) => build.sha === pr.head_sha).length;
  const candidateFalseNegative = decision.classification === 'no-e2e' && evidence.failures > 0;
  return { number: pr.number, title: pr.title, head: pr.head, head_sha: pr.head_sha, files: pr.files, ...decision, jenkins: { builds: builds.length, exactShaBuilds, ...evidence }, candidateFalseNegative, review: reviews[String(pr.number)] ?? null };
});

const counts = Object.fromEntries(['no-e2e', 'e2e-mocked', 'e2e-integration', 'e2e-full'].map((classification) => [classification, rows.filter((row) => row.classification === classification).length]));
const covered = rows.filter((row) => row.jenkins.builds > 0);
const reached = rows.filter((row) => row.jenkins.runs > 0);
const candidates = rows.filter((row) => row.candidateFalseNegative);
const unresolvedCandidates = candidates.filter((row) => !row.review);
const confirmedFalseNegatives = candidates.filter((row) => row.review?.status === 'confirmed-false-negative');
const flaky = rows.filter((row) => row.jenkins.flakyShas.length > 0);
const result = {
  generatedAt: new Date().toISOString(),
  methodology: {
    falseNegativeDefinition: 'no-e2e + reproducible Playwright failure causally related to the PR diff',
    warning: 'A Jenkins red build alone is not a false negative. Flakes, infrastructure and unrelated failures require exclusion.',
  },
  counts,
  jenkins: { retainedBuilds: jenkins.builds.length, prsCovered: covered.length, prsReachedPlaywright: reached.length, flakyPrs: flaky.length, rawNoE2eFailureCandidates: candidates.length, unresolvedCandidates: unresolvedCandidates.length, confirmedFalseNegatives: confirmedFalseNegatives.length },
  rows,
};
writeFileSync(output, JSON.stringify(result, null, 2));

const mdOutput = output.replace(/\.json$/, '.md');
const md = [
  '# E2E selection analysis', '',
  `Generated: ${result.generatedAt}`, '',
  '## Classification', '', '| Decision | PRs |', '| --- | ---: |',
  ...Object.entries(counts).map(([name, count]) => `| ${name} | ${count} |`), '',
  '## Jenkins evidence', '',
  `- Retained builds: ${result.jenkins.retainedBuilds}`,
  `- Sample PRs with any Jenkins build: ${result.jenkins.prsCovered}/100`,
  `- Sample PRs that reached Playwright: ${result.jenkins.prsReachedPlaywright}/100`,
  `- PRs with same-SHA mixed Playwright outcomes: ${result.jenkins.flakyPrs}`,
  `- Raw no-e2e + Playwright-failure candidates: ${result.jenkins.rawNoE2eFailureCandidates}`, '',
  `- Unresolved candidates after causal review: ${result.jenkins.unresolvedCandidates}`,
  `- Confirmed false negatives: ${result.jenkins.confirmedFalseNegatives}`, '',
  'A raw candidate is not a confirmed false negative. It needs same-SHA reproducibility and causal review against the diff.', '',
  '## Candidate review queue', '', '| PR | Decision | Jenkins builds | Playwright runs | Failures | Flaky SHA | Reason |', '| ---: | --- | ---: | ---: | ---: | --- | --- |',
  ...candidates.map((row) => `| #${row.number} | ${row.classification} | ${row.jenkins.builds} | ${row.jenkins.runs} | ${row.jenkins.failures} | ${row.jenkins.flakyShas.length ? 'yes' : 'no'} | ${row.review ? `${row.review.status}: ${row.review.summary}` : row.reasons.join(' ')} |`), '',
  '## All PRs', '', '| PR | Decision | Files | Jenkins | Playwright | Failures |', '| ---: | --- | ---: | ---: | ---: | ---: |',
  ...rows.map((row) => `| #${row.number} | ${row.classification} | ${row.files.length} | ${row.jenkins.builds} | ${row.jenkins.runs} | ${row.jenkins.failures} |`), '',
];
writeFileSync(mdOutput, md.join('\n'));
console.log(`Wrote ${output} and ${mdOutput}`);
