#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DUPLICATE_MIN_LINES = 6;
const LARGE_FILE_BYTES = 512000;
export const REVIEW_MARKER = '<!-- copilot-pr-review -->';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

function safeGit(args, fallback = '') {
  try {
    return git(args);
  } catch {
    return fallback;
  }
}

function safeGitShow(revision, path) {
  return safeGit(['show', `${revision}:${path}`], null);
}

function isSourceFile(path) {
  return /\.(js|jsx|ts|tsx)$/.test(path);
}

function isTestFile(path) {
  return /\.(test|spec|vitest)\.(js|jsx|ts|tsx)$/.test(path);
}

function isTestDirectory(path) {
  return /(test\/|tests\/|__tests__\/)/.test(path);
}

function isGeneratedDependencyManifest(path) {
  return /(^|\/)(package-lock|npm-shrinkwrap)\.json$/.test(path);
}

function normalizeDuplicateLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return '';
  if (/^(import|export)\s/.test(trimmed)) return '';
  if (/^['"]use (client|server|strict)['"];?$/.test(trimmed)) return '';
  if (/^[{}()[\],;]+$/.test(trimmed)) return '';
  return trimmed.replace(/\s+/g, ' ');
}

function stripStringLiterals(line) {
  return line.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '');
}

function stripComments(line) {
  // JSDoc / block-comment continuation lines (e.g. ` *   - E2E_PASSWORD=<password>`)
  // carry no code: the opening `/*` is on a previous line, so the `/* */` handling
  // below cannot see it. Treat any line whose first non-space char is `*` as a comment.
  if (/^\s*\*/.test(line)) return '';

  const lineCommentStart = line.indexOf('//');
  let cleaned = lineCommentStart === -1 ? line : line.slice(0, lineCommentStart);

  let blockStart = cleaned.indexOf('/*');
  while (blockStart !== -1) {
    const blockEnd = cleaned.indexOf('*/', blockStart + 2);
    if (blockEnd === -1) {
      cleaned = cleaned.slice(0, blockStart);
      break;
    }
    cleaned = cleaned.slice(0, blockStart) + cleaned.slice(blockEnd + 2);
    blockStart = cleaned.indexOf('/*', blockStart);
  }

  return cleaned;
}

function parseAddedRuns(diffText) {
  const runs = [];
  const sections = diffText.split(/^diff --git /m).filter(Boolean);

  for (const section of sections) {
    collectRunsFromSection(section, runs);
  }

  return runs;
}

function collectRunsFromSection(section, runs) {
  const lines = section.split('\n');
  let path = null;
  let newLine = 0;
  let currentRun = [];

  const flushRun = () => {
    if (path && currentRun.length) {
      runs.push({ path, lines: currentRun });
    }
    currentRun = [];
  };

  for (const line of lines) {
    if (line.startsWith('+++ b/')) {
      path = line.slice(6);
      continue;
    }

    if (line.startsWith('@@ ')) {
      flushRun();
      const match = line.match(/\+(\d+)(?:,\d+)?/);
      newLine = extractLineNumber(match);
      continue;
    }

    if (!path) {
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentRun.push({ line: newLine, text: line.slice(1) });
      newLine += 1;
      continue;
    }

    flushRun();

    if (line.startsWith('-') && !line.startsWith('---')) {
      continue;
    }

    if (!line.startsWith('\\')) {
      newLine += 1;
    }
  }

  flushRun();
}

function extractLineNumber(match) {
  return match ? Number(match[1]) : 0;
}

function collectAddedLineContents(diffText) {
  const addedLineContents = {};

  for (const run of parseAddedRuns(diffText)) {
    const bucket = addedLineContents[run.path] || [];
    bucket.push(...run.lines.map((entry) => entry.text));
    addedLineContents[run.path] = bucket;
  }

  return addedLineContents;
}

function getRelevantLines(path, addedLineContents, fileContents) {
  if (addedLineContents[path]?.length) {
    return addedLineContents[path];
  }

  return (fileContents[path] || '').split('\n');
}

export function detectDuplicatedBlocks(diffText, { minLines = DUPLICATE_MIN_LINES } = {}) {
  const runs = parseAddedRuns(diffText);
  const groups = new Map();

  for (const run of runs) {
    if (run.path.startsWith('artifacts/')) continue;
    // Generated AD metadata cache (offline-regen snapshot): a data dump where
    // standard columns/records legitimately repeat across entities — DRY/extract
    // rules do not apply, same as the artifacts/ skip above.
    if (run.path.startsWith('cli/cache/')) continue;
    if (isGeneratedDependencyManifest(run.path)) continue;
    const normalizedLines = run.lines
      .map((entry) => ({ ...entry, normalized: normalizeDuplicateLine(entry.text) }))
      .filter((entry) => entry.normalized);

    if (normalizedLines.length < minLines) {
      continue;
    }

    const key = normalizedLines.map((entry) => entry.normalized).join('\n');
    const locations = groups.get(key) || [];
    locations.push({
      path: run.path,
      startLine: normalizedLines[0].line,
      endLine: normalizedLines[normalizedLines.length - 1].line,
      snippet: normalizedLines.map((entry) => entry.text).join('\n'),
    });
    groups.set(key, locations);
  }

  return [...groups.entries()]
    .filter(([, locations]) => locations.length > 1)
    .map(([snippetKey, locations]) => ({
      code: 'DUPLICATED_BLOCK',
      severity: 'blocker',
      title: 'Duplicated added block',
      details: `The same normalized block of ${snippetKey.split('\n').length} added lines appears in multiple places. Extract shared logic or remove the copy-paste.`,
      locations,
    }));
}

function analyzeDirectoryViolations(changedFiles) {
  const findings = [];
  const wrongDirectoryEntries = [];

  for (const path of changedFiles) {
    if (isTestFile(path) && !isTestDirectory(path)) {
      wrongDirectoryEntries.push(`Test file outside test directory: \`${path}\``);
    }

    if (/(schema-raw|schema-curated|rules-raw|rules-curated|processes)\.json$/.test(path) && !path.startsWith('artifacts/')) {
      wrongDirectoryEntries.push(`Artifact file outside \`artifacts/\`: \`${path}\``);
    }
  }

  if (wrongDirectoryEntries.length) {
    findings.push({
      code: 'WRONG_DIRECTORY',
      severity: 'blocker',
      title: 'Files in the wrong directory',
      details: wrongDirectoryEntries.map((entry) => `- ${entry}`).join('\n'),
    });
  }

  return findings;
}

function analyzeCommonJsUsage(changedFiles, fileContents, addedLineContents) {
  const commonJsPattern = /\b(require\s*\(|module\.exports\b|exports\.)/;
  const offenders = changedFiles.filter((path) => {
    if (!isSourceFile(path)) return false;
    return getRelevantLines(path, addedLineContents, fileContents)
      .map((line) => stripStringLiterals(line))
      .map((line) => stripComments(line))
      .some((line) => commonJsPattern.test(line));
  });

  if (!offenders.length) {
    return [];
  }

  return [{
    code: 'COMMONJS_USAGE',
    severity: 'blocker',
    title: 'CommonJS usage in an ESM repository',
    details: offenders.map((path) => `- \`${path}\``).join('\n'),
  }];
}

function analyzeSecrets(changedFiles, fileContents, addedLineContents) {
  const findings = [];
  const envFiles = changedFiles.filter((path) => /(^|\/)\.env($|\.)/.test(path) && !path.endsWith('.example'));

  if (envFiles.length) {
    findings.push({
      code: 'ENV_FILE_COMMITTED',
      severity: 'blocker',
      title: 'Committed environment file',
      details: envFiles.map((path) => `- \`${path}\``).join('\n'),
    });
  }

  const secretPattern = /(API_KEY|SECRET_KEY|PRIVATE_KEY|PASSWORD|ACCESS_TOKEN|CLIENT_SECRET)\s*[=:]/;
  const secretMatches = [];
  for (const path of changedFiles) {
    const hasSecretMatch = getRelevantLines(path, addedLineContents, fileContents)
      .map((line) => stripComments(line))
      .map((line) => stripStringLiterals(line))
      .some((line) => secretPattern.test(line));

    if (hasSecretMatch) {
      secretMatches.push(`- \`${path}\``);
    }
  }

  if (secretMatches.length) {
    findings.push({
      code: 'POTENTIAL_SECRET',
      severity: 'blocker',
      title: 'Potential secret material detected',
      details: secretMatches.join('\n'),
    });
  }

  return findings;
}

function analyzeMissingTests(newSourceFiles, newTestFiles) {
  if (!newSourceFiles.length || newTestFiles.length) {
    return [];
  }

  const lines = newSourceFiles.slice(0, 10).map((path) => `- \`${path}\``);
  if (newSourceFiles.length > 10) {
    lines.push(`- ... and ${newSourceFiles.length - 10} more`);
  }

  return [{
    code: 'MISSING_TESTS',
    severity: 'blocker',
    title: 'New source files without new tests',
    details: lines.join('\n'),
  }];
}

function analyzeLargeFiles(changedFiles) {
  const offenders = [];

  for (const path of changedFiles) {
    // Locale JSON files grow predictably as the app is translated — skip them.
    if (/\/locales\/[^/]+\.json$/.test(path)) {
      continue;
    }
    // Generated contract snapshots are intentionally verbose and are checked
    // by schema/quality gates instead of the handwritten-source size gate.
    if (/^artifacts\/[^/]+\/(?:contract|contract\.prev|contract\.mcp|report-contract|aggregate-contract)\.json$/.test(path)) {
      continue;
    }
    // Generated AD metadata cache (offline-regen snapshot): intentionally large
    // and machine-generated — same rationale as the contract snapshots above.
    if (path.startsWith('cli/cache/')) {
      continue;
    }
    // Frozen, hand-authored data-fix migrations (chart of accounts, etc.):
    // intentionally large sampledata dumps, gated by the data-fixes review
    // criterion rather than the handwritten-source size gate.
    if (/^cli\/src\/data-fixes\/sql\/.*\.sql$/.test(path)) {
      continue;
    }
    if (!existsSync(path)) {
      continue;
    }
    const size = statSync(path).size;
    if (size > LARGE_FILE_BYTES) {
      offenders.push(`- \`${path}\` (${Math.floor(size / 1024)}KB)`);
    }
  }

  if (!offenders.length) {
    return [];
  }

  return [{
    code: 'LARGE_FILE',
    severity: 'blocker',
    title: 'Large files detected',
    details: offenders.join('\n'),
  }];
}

function formatNewDependency(dependency) {
  return `- ${dependency}`;
}

export function analyzeChangedFiles({
  changedFiles,
  newSourceFiles,
  newTestFiles,
  fileContents,
  packageJsonChanges,
  addedLineContents = {},
}) {
  return [
    ...analyzeMissingTests(newSourceFiles, newTestFiles),
    ...analyzeDirectoryViolations(changedFiles),
    ...analyzeSecrets(changedFiles, fileContents, addedLineContents),
    ...analyzeCommonJsUsage(changedFiles, fileContents, addedLineContents),
    ...analyzeLargeFiles(changedFiles),
    ...packageJsonChanges.flatMap((change) => change.dependencies.length
      ? [{
        code: 'NEW_DEPENDENCY',
        severity: 'warning',
        title: 'New npm dependency added',
        details: `\`${change.path}\` adds:\n${change.dependencies.map(formatNewDependency).join('\n')}\nJustify new dependencies in the PR description and prefer Node.js built-ins where possible.`,
      }]
      : []),
  ];
}

export function summarizeReview(findings) {
  const sortedFindings = [...findings].sort((left, right) => left.code.localeCompare(right.code));
  const blockers = sortedFindings.filter((finding) => finding.severity === 'blocker');
  const warnings = sortedFindings.filter((finding) => finding.severity === 'warning');

  return {
    decision: blockers.length ? 'request_changes' : warnings.length ? 'comment' : 'clean',
    blockers,
    warnings,
  };
}

function renderFindingSection(title, findings) {
  if (!findings.length) {
    return '';
  }

  const sections = findings.map((finding) => {
    const locationLines = finding.locations?.length
      ? `\n${finding.locations.map((location) => `- \`${location.path}:${location.startLine}-${location.endLine}\``).join('\n')}`
      : '';

    return `- **${finding.title}** (\`${finding.code}\`)\n${finding.details}${locationLines}`;
  });

  return `### ${title}\n\n${sections.join('\n\n')}\n`;
}

export function renderReviewBody(summary) {
  const outcome = summary.decision === 'request_changes'
    ? 'Request changes'
    : summary.decision === 'comment'
      ? 'Comment only'
      : 'Clean';

  return [
    REVIEW_MARKER,
    '## Copilot PR Review',
    '',
    `Outcome: **${outcome}**`,
    '',
    summary.blockers.length
      ? 'Blocking findings must be resolved before merge.'
      : summary.warnings.length
        ? 'No merge-blocking issues detected, but the warnings below should be reviewed.'
        : 'No duplicate blocks or architecture violations detected in this PR.',
    '',
    renderFindingSection('Blocking findings', summary.blockers),
    renderFindingSection('Warnings', summary.warnings),
  ].filter(Boolean).join('\n');
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function collectPackageJsonChanges(baseSha, headSha, changedFiles) {
  return changedFiles
    .filter((path) => path.endsWith('package.json'))
    .map((path) => {
      const baseJson = parseJson(safeGitShow(baseSha, path));
      const headJson = parseJson(safeGitShow(headSha, path));
      const added = [];
      for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
        const baseSection = baseJson?.[section] || {};
        const headSection = headJson?.[section] || {};
        for (const [name, version] of Object.entries(headSection)) {
          if (!(name in baseSection)) {
            added.push(`${name}@${version} (${section})`);
          }
        }
      }
      return { path, dependencies: added };
    });
}

function readChangedFiles(changedFiles) {
  const contents = {};
  for (const path of changedFiles) {
    if (!existsSync(path)) {
      continue;
    }
    try {
      const stats = statSync(path);
      if (stats.size > LARGE_FILE_BYTES * 2) {
        continue;
      }
      contents[path] = readFileSync(path, 'utf8');
    } catch {
      // Ignore unreadable files (binary or removed)
    }
  }
  return contents;
}

export function reviewPullRequest(baseSha, headSha) {
  const compareBase = safeGit(['merge-base', baseSha, headSha], '').trim() || baseSha;
  const diffText = safeGit(['diff', '--find-renames', '--unified=0', compareBase, headSha], '');
  const changedFiles = safeGit(['diff', '--name-only', compareBase, headSha], '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const addedFiles = new Set(
    safeGit(['diff', '--name-only', '--diff-filter=A', compareBase, headSha], '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  );

  const newSourceFiles = [...addedFiles].filter((path) => isSourceFile(path) && !isTestFile(path) && !isTestDirectory(path));
  const newTestFiles = [...addedFiles].filter((path) => isTestFile(path));
  const fileContents = readChangedFiles(changedFiles);
  const addedLineContents = collectAddedLineContents(diffText);
  const packageJsonChanges = collectPackageJsonChanges(compareBase, headSha, changedFiles);

  const findings = [
    ...detectDuplicatedBlocks(diffText),
    ...analyzeChangedFiles({
      changedFiles,
      newSourceFiles,
      newTestFiles,
      fileContents,
      packageJsonChanges,
      addedLineContents,
    }),
  ];

  const summary = summarizeReview(findings);
  return {
    baseSha: compareBase,
    headSha,
    changedFiles,
    findings,
    summary,
    body: renderReviewBody(summary),
  };
}

function getArg(args, name) {
  const index = args.indexOf(`--${name}`);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : null;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCli) {
  const args = process.argv.slice(2);
  const baseSha = getArg(args, 'base');
  const headSha = getArg(args, 'head');
  const outPath = getArg(args, 'out');

  if (!baseSha || !headSha) {
    console.error('Usage: node cli/src/pr-review.js --base <sha> --head <sha> [--out <path>]');
    process.exit(1);
  }

  const result = reviewPullRequest(baseSha, headSha);
  const payload = JSON.stringify(result, null, 2);

  if (outPath) {
    writeFileSync(outPath, payload);
  } else {
    console.log(payload);
  }
}
