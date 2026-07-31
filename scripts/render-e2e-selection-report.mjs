#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const value = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const input = resolve(value('--input', './tmp/e2e-selection-analysis.json'));
const output = resolve(value('--out', './tmp/e2e-selection-analysis.html'));
const data = JSON.parse(await readFile(input, 'utf8'));
const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const order = ['no-e2e', 'e2e-mocked', 'e2e-integration', 'e2e-full'];
const descriptions = {
  'no-e2e': 'Docs, dependencies, locales, unit tests and internal changes without observable interaction.',
  'e2e-mocked': 'Navigation, forms, modals, visibility and serialization from the UI.',
  'e2e-integration': 'Real persistence, NEO endpoints, defaults and backend rules.',
  'e2e-full': 'E2E infrastructure or high-impact transversal changes.',
};
const reviewed = data.rows.filter((row) => row.candidateFalseNegative);
const rows = data.rows.map((row) => `<tr><td>#${row.number}</td><td>${esc(row.title)}</td><td><span class="tag ${row.classification}">${row.classification}</span></td><td>${row.files.length}</td><td>${row.jenkins.runs}</td><td>${row.jenkins.failures}</td><td>${esc(row.reasons.join(' '))}</td></tr>`).join('');
const cards = order.map((decision) => `<article><strong>${data.counts[decision]}</strong><h2>${decision}</h2><p>${descriptions[decision]}</p></article>`).join('');
const reviewRows = reviewed.length ? reviewed.map((row) => `<tr><td>#${row.number}</td><td>${row.jenkins.failureBuilds.join(', ')}</td><td>${esc(row.review?.status ?? 'unresolved')}</td><td>${esc(row.review?.summary ?? 'Pending causal review.')}</td></tr>`).join('') : '<tr><td colspan="4">No raw candidates.</td></tr>';

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Schema Forge E2E selection analysis</title><style>
:root{font-family:Inter,ui-sans-serif,system-ui;color:#172033;background:#f4f6fa}body{margin:0}main{max-width:1180px;margin:auto;padding:40px 24px 72px}header{background:#15213a;color:white;padding:32px;border-radius:18px}h1{margin:0 0 8px;font-size:2rem}h2{margin:4px 0;font-size:1rem}.lead{font-size:1.1rem;max-width:850px}.verdict{margin-top:20px;padding:16px;border-left:5px solid #f2b84b;background:#fff8e8;color:#35290f}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin:22px 0}.grid article,.panel{background:white;border:1px solid #dfe5ef;border-radius:14px;padding:20px}.grid strong{font-size:2.2rem}.grid p{color:#536078}.metrics{display:flex;gap:24px;flex-wrap:wrap}.metrics b{font-size:1.7rem;display:block}table{width:100%;border-collapse:collapse;font-size:.86rem}th,td{text-align:left;padding:10px;border-bottom:1px solid #e4e8ef;vertical-align:top}th{position:sticky;top:0;background:#eef2f8}.scroll{max-height:620px;overflow:auto}.tag{display:inline-block;padding:4px 8px;border-radius:999px;white-space:nowrap;background:#e7ebf2}.no-e2e{background:#dff4e7}.e2e-mocked{background:#dcecff}.e2e-integration{background:#fff0c9}.e2e-full{background:#ffdede}.note{color:#5e687b;font-size:.9rem}section{margin-top:22px}</style></head><body><main>
<header><h1>When does Schema Forge need Playwright?</h1><p class="lead">Exploratory validation over the latest 100 merged PR branches, classified by the cost and depth of E2E evidence required.</p><div class="verdict"><strong>Result:</strong> 0 confirmed false negatives in retained Jenkins evidence, but the result is not conclusive. Only 11 of 100 PRs reached Playwright, and flaky or unrelated failures cannot be treated as causal evidence.</div></header>
<div class="grid">${cards}</div>
<section class="panel"><h2>Evidence coverage</h2><div class="metrics"><div><b>${data.jenkins.retainedBuilds}</b>retained builds</div><div><b>${data.jenkins.prsCovered}/100</b>PRs with Jenkins</div><div><b>${data.jenkins.prsReachedPlaywright}/100</b>PRs reaching Playwright</div><div><b>${data.jenkins.rawNoE2eFailureCandidates}</b>raw candidate</div><div><b>${data.jenkins.confirmedFalseNegatives}</b>confirmed false negatives</div></div><p class="note">A false negative requires a reproducible Playwright failure causally related to a PR classified as no-e2e. A red build alone is insufficient.</p></section>
<section class="panel"><h2>Candidate causal review</h2><table><thead><tr><th>PR</th><th>Build</th><th>Status</th><th>Review</th></tr></thead><tbody>${reviewRows}</tbody></table></section>
<section class="panel"><h2>PR-by-PR classification</h2><div class="scroll"><table><thead><tr><th>PR</th><th>Title</th><th>Decision</th><th>Files</th><th>Playwright runs</th><th>Failures</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table></div></section>
<p class="note">Generated ${esc(data.generatedAt)}. Source: branch-level diffs and retained Jenkins build metadata.</p></main></body></html>`;

await writeFile(output, html);
console.log(`Wrote ${output}`);
