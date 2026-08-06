#!/usr/bin/env node
/**
 * AST + git-churn hotspot analysis for a single source file.
 *
 * Emits a ranked table of function-like units (AST-derived) scored by
 * heat = lineCount * commitCount, plus a secondary table of JSX
 * comment-marker regions (NOT AST-derived, kept separate on purpose).
 *
 * Usage:
 *   node cli/src/ast-churn-hotspot.js --file tools/app-shell/src/components/contract-ui/DetailView.jsx
 *   node cli/src/ast-churn-hotspot.js --file <path> --out-md docs/reports/x.md --out-json docs/reports/x.json
 *   node cli/src/ast-churn-hotspot.js --file <path> --no-churn        # AST only, skip git (fast)
 *   node cli/src/ast-churn-hotspot.js --file <path> --since 2026-06-10 # recency column cutoff
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

const TICKET_RE = /\bETP-\d+\b/g;

function parseArgs(argv) {
  const args = { since: null, noChurn: false, summary: false, limit: 10, days: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--file') args.file = argv[++i];
    else if (a === '--repo') args.repo = argv[++i];
    else if (a === '--out-md') args.outMd = argv[++i];
    else if (a === '--out-json') args.outJson = argv[++i];
    else if (a === '--since') args.since = argv[++i];
    else if (a === '--days') args.days = Number(argv[++i]);
    else if (a === '--base-ref') args.baseRef = argv[++i];
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--summary') args.summary = true;
    else if (a === '--no-churn') args.noChurn = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function branchDelta(repo, relFile, baseRef) {
  if (!baseRef) return { available: false, reason: 'No base ref configured' };
  try {
    const mergeBase = gitQuiet(repo, ['merge-base', baseRef, 'HEAD']).trim();
    const numstat = gitQuiet(repo, ['diff', '--numstat', '--find-renames', `${mergeBase}...HEAD`, '--', relFile]).trim();
    const [added = '0', deleted = '0'] = numstat ? numstat.split(/\s+/) : [];
    const status = gitQuiet(repo, ['diff', '--name-status', '--find-renames', `${mergeBase}...HEAD`, '--', relFile]).trim();
    return {
      available: true,
      baseRef,
      mergeBase,
      addedLines: Number(added) || 0,
      deletedLines: Number(deleted) || 0,
      netLines: (Number(added) || 0) - (Number(deleted) || 0),
      status: status ? status.split('\t')[0] : 'unchanged',
    };
  } catch (err) {
    return { available: false, baseRef, reason: String(err.message || err).trim().split('\n')[0] };
  }
}

function git(repo, gitArgs) {
  return execFileSync('git', ['-C', repo, ...gitArgs], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

function gitQuiet(repo, gitArgs) {
  return execFileSync('git', ['-C', repo, ...gitArgs], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function countLines(str) {
  return str.split('\n').filter(Boolean).length;
}

/** Unwraps `export function f(){}` / `export const f = () => {}` to the inner node. */
function unwrapExport(node) {
  if (node.type === 'ExportNamedDeclaration' && node.declaration) {
    return { inner: node.declaration, exported: true };
  }
  if (node.type === 'ExportDefaultDeclaration' && node.declaration) {
    return { inner: node.declaration, exported: true };
  }
  return { inner: node, exported: false };
}

const FN_INITS = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

// Wrappers that keep a function a nameable, independently-editable unit.
const FN_WRAPPERS = new Set(['useCallback', 'useMemo', 'memo', 'forwardRef']);

function calleeName(callee) {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') return callee.property.name;
  return null;
}

/** `useCallback(fn, deps)` / `memo(fn)` → wrapper name, else null. */
function wrappedFunctionKind(init) {
  if (init.type !== 'CallExpression') return null;
  const name = calleeName(init.callee);
  if (!name || !FN_WRAPPERS.has(name)) return null;
  if (!init.arguments.some((arg) => FN_INITS.has(arg.type))) return null;
  return name;
}

/**
 * Collects function-like units from a list of statements.
 * Returns [{ name, kind, node }]. Anonymous / non-function declarations are skipped.
 */
function collectUnits(statements) {
  const units = [];
  for (const stmt of statements) {
    const { inner, exported } = unwrapExport(stmt);
    if (inner.type === 'FunctionDeclaration' && inner.id) {
      units.push({ name: inner.id.name, kind: 'function', exported, node: inner });
      continue;
    }
    if (inner.type === 'VariableDeclaration') {
      for (const decl of inner.declarations) {
        if (!decl.init || decl.id.type !== 'Identifier') continue;
        if (FN_INITS.has(decl.init.type)) {
          const kind = decl.init.type === 'ArrowFunctionExpression' ? 'const-arrow' : 'const-function';
          units.push({ name: decl.id.name, kind, exported, node: decl });
          continue;
        }
        const wrapper = wrappedFunctionKind(decl.init);
        if (wrapper) units.push({ name: decl.id.name, kind: `const-${wrapper}`, exported, node: decl });
      }
    }
  }
  return units;
}

function bodyStatements(node) {
  const fn = node.type === 'VariableDeclarator' ? node.init : node;
  if (!fn || !fn.body || fn.body.type !== 'BlockStatement') return [];
  return fn.body.body;
}

function toUnitRecord(u, depth, parent) {
  const startLine = u.node.loc.start.line;
  const endLine = u.node.loc.end.line;
  return {
    name: u.name,
    kind: u.kind,
    depth,
    parent,
    exported: u.exported,
    startLine,
    endLine,
    lineCount: endLine - startLine + 1,
  };
}

/**
 * Extracts standalone `{/* text *\/}` JSX comment markers with their line numbers.
 * Handles the multi-line form, which is common once a marker grows into a rationale note.
 */
function extractJsxMarkers(source, maxLabelLength = 160) {
  const markers = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*\{\s*\/\*/.test(lines[i])) continue;
    let end = i;
    while (end < lines.length && !/\*\/\s*\}\s*$/.test(lines[end])) end += 1;
    if (end >= lines.length) continue;
    const raw = lines
      .slice(i, end + 1)
      .join(' ')
      .replace(/^\s*\{\s*\/\*/, '')
      .replace(/\*\/\s*\}\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (raw) {
      const label = raw.length > maxLabelLength ? `${raw.slice(0, maxLabelLength - 1)}…` : raw;
      markers.push({ label, line: i + 1, endOfComment: end + 1, multiline: end > i });
    }
    i = end;
  }
  return markers;
}

/** Raw `git log -L` for one range. Throws if git aborts (see rangeCommits). */
function rawRangeCommits(repo, relFile, startLine, endLine) {
  const out = git(repo, [
    'log',
    `-L${startLine},${endLine}:${relFile}`,
    '--format=C\t%H\t%ad\t%s',
    '--date=short',
    '-s',
  ]);
  const commits = new Map();
  for (const line of out.split('\n')) {
    if (!line.startsWith('C\t')) continue;
    const [, hash, date, subject = ''] = line.split('\t');
    commits.set(hash, { date, subject });
  }
  return commits;
}

/**
 * Commit set touching a line range, as a Map<hash, {date, subject}>.
 *
 * git 2.50.1 (Apple Git-155) aborts on some ranges with an assertion in
 * line-log.c (`range_set_append`) *after* streaming partial output, so a failed
 * run cannot be salvaged from stdout. Bisecting and unioning the halves recovers
 * most of it, but some individual lines abort at every width — those are counted
 * in `unmeasurableLines` and make the range's commit count a LOWER BOUND.
 */
function rangeCommits(repo, relFile, startLine, endLine) {
  try {
    return { commits: rawRangeCommits(repo, relFile, startLine, endLine), bisected: false, unmeasurableLines: 0 };
  } catch (err) {
    if (endLine <= startLine) {
      return { commits: new Map(), bisected: true, unmeasurableLines: 1, error: String(err.message || err).trim() };
    }
    const mid = Math.floor((startLine + endLine) / 2);
    const left = rangeCommits(repo, relFile, startLine, mid);
    const right = rangeCommits(repo, relFile, mid + 1, endLine);
    return {
      commits: new Map([...left.commits, ...right.commits]),
      bisected: true,
      unmeasurableLines: left.unmeasurableLines + right.unmeasurableLines,
      error: left.error || right.error,
    };
  }
}

function churnForRange(repo, relFile, startLine, endLine, since) {
  const { commits, bisected, unmeasurableLines, error } = rangeCommits(repo, relFile, startLine, endLine);
  const tickets = new Set();
  let recentCommitCount = 0;
  for (const { date, subject } of commits.values()) {
    if (since && date >= since) recentCommitCount += 1;
    for (const t of subject.match(TICKET_RE) || []) tickets.add(t);
  }
  return {
    commitCount: commits.size,
    recentCommitCount,
    tickets: [...tickets].sort(),
    bisected,
    unmeasurableLines,
    lowerBound: unmeasurableLines > 0,
    error: error ?? null,
  };
}

function fileLevelStats(repo, relFile, since) {
  const safe = (fn, fallback = null) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  return {
    commitsPlain: safe(() => countLines(git(repo, ['log', '--format=%H', '--', relFile]))),
    commitsNoMerges: safe(() => countLines(git(repo, ['log', '--no-merges', '--format=%H', '--', relFile]))),
    commitsFollow: safe(() => countLines(git(repo, ['log', '--follow', '--format=%H', '--', relFile]))),
    commitsSince: since
      ? safe(() => countLines(git(repo, ['log', `--since=${since}`, '--format=%H', '--', relFile])))
      : null,
    tickets: safe(() => {
      const subjects = git(repo, ['log', '--format=%s', '--', relFile]);
      return [...new Set(subjects.match(TICKET_RE) || [])].sort();
    }, []),
  };
}

const num = (v, lowerBound) => (v === null || v === undefined ? '—' : `${lowerBound ? '≥' : ''}${v}`);

function mdTable(headers, rows) {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `|${headers.map(() => '---').join('|')}|`;
  return [head, sep, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

function buildMarkdown(result) {
  const { file, fileStats, units, markerRegions, totalLines, since, generatedAt } = result;
  const lines = [];
  lines.push(`# AST + git-churn hotspot analysis — \`${path.basename(file)}\``);
  lines.push('');
  lines.push(`**Generated:** ${generatedAt}`);
  lines.push(`**File:** \`${file}\` (${totalLines} lines)`);
  lines.push(`**Heat score:** \`lineCount x commitCount\``);
  lines.push('');
  lines.push('## File-level churn');
  lines.push('');
  lines.push(
    mdTable(
      ['Metric', 'Value'],
      [
        ['Current lines', String(totalLines)],
        ['Commits (`git log`, incl. merges)', String(fileStats.commitsPlain)],
        ['Commits (`--no-merges`)', String(fileStats.commitsNoMerges)],
        ['Commits (`--follow`)', String(fileStats.commitsFollow)],
        ...(since ? [[`Commits since ${since}`, String(fileStats.commitsSince)]] : []),
        ['Distinct ETP tickets', String(fileStats.tickets.length)],
      ],
    ),
  );
  lines.push('');
  lines.push('## Primary metric — AST-derived function-like units (ranked by heat)');
  lines.push('');
  lines.push(
    mdTable(
      ['#', 'Unit', 'Kind', 'Depth', 'Lines', 'Range', 'Commits', since ? `Since ${since}` : 'Recent', 'Tickets', 'Heat'],
      units.map((u, i) => [
        String(i + 1),
        `\`${u.name}\``,
        u.exported ? `${u.kind} (exported)` : u.kind,
        String(u.depth),
        String(u.lineCount),
        `${u.startLine}–${u.endLine}`,
        num(u.commitCount, u.lowerBound),
        num(u.recentCommitCount, u.lowerBound),
        String(u.tickets.length),
        num(u.heatScore, u.lowerBound),
      ]),
    ),
  );
  lines.push('');
  lines.push('## Secondary — comment-marker regions (NOT AST-derived)');
  lines.push('');
  lines.push(
    'Line ranges between consecutive `{/* ... */}` JSX comment markers. Included because manual',
    'extraction maps are usually drawn from these labels; they are heuristic, not structural.',
  );
  lines.push('');
  lines.push(
    mdTable(
      ['#', 'Marker', 'Lines', 'Range', 'Commits', 'Heat'],
      markerRegions.map((r, i) => [
        String(i + 1),
        r.label,
        String(r.lineCount),
        `${r.startLine}–${r.endLine}`,
        num(r.commitCount, r.lowerBound),
        num(r.heatScore, r.lowerBound),
      ]),
    ),
  );
  lines.push('');
  return lines.join('\n');
}

function buildSummary(result, limit) {
  const rows = result.units
    .filter((u) => u.recentCommitCount !== null)
    .slice()
    .sort((a, b) => (b.recentHeatScore ?? 0) - (a.recentHeatScore ?? 0) || b.lineCount - a.lineCount)
    .slice(0, limit);
  const lines = [
    `AST churn hotspot ranking — ${result.file}`,
    `Window: last ${result.windowDays ?? 'custom'} days (since ${result.since ?? 'not set'})`,
    '',
    `| # | Unit | Lines | Commits (${result.windowDays ?? 'recent'}d) | Recent heat | Range |`,
    '|---|---|---:|---:|---:|---|',
    ...rows.map((u, i) => `| ${i + 1} | ${u.name} | ${u.lineCount} | ${num(u.recentCommitCount, u.lowerBound)} | ${num(u.recentHeatScore, u.lowerBound)} | ${u.startLine}–${u.endLine} |`),
    '',
    'Branch delta:',
  ];
  if (result.branchDelta.available) {
    const d = result.branchDelta;
    lines.push(`- base: ${d.baseRef} (merge-base ${d.mergeBase.slice(0, 12)})`);
    lines.push(`- ${d.status}: +${d.addedLines} / -${d.deletedLines} lines (net ${d.netLines >= 0 ? '+' : ''}${d.netLines})`);
  } else {
    lines.push(`- unavailable${result.branchDelta.baseRef ? ` for ${result.branchDelta.baseRef}` : ''}: ${result.branchDelta.reason}`);
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.file) {
    process.stdout.write(
        'Usage: node cli/src/ast-churn-hotspot.js --file <path> [--repo <dir>] [--since YYYY-MM-DD]\n' +
        '                                        [--days N] [--base-ref <ref>] [--limit N] [--summary]\n' +
        '                                        [--out-md <path>] [--out-json <path>] [--no-churn]\n',
    );
    process.exit(args.help ? 0 : 1);
  }

  const repo = path.resolve(args.repo || git(process.cwd(), ['rev-parse', '--show-toplevel']).trim());
  const abs = path.isAbsolute(args.file) ? args.file : path.join(repo, args.file);
  if (!existsSync(abs)) throw new Error(`File not found: ${abs}`);
  const relFile = path.relative(repo, abs);

  const source = readFileSync(abs, 'utf8');
  const totalLines = source.split('\n').length;
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['jsx', 'classProperties', 'classPrivateProperties', 'decorators-legacy'],
  });

  const topUnits = collectUnits(ast.program.body);
  const records = [];
  for (const u of topUnits) {
    const rec = toUnitRecord(u, 0, null);
    const children = collectUnits(bodyStatements(u.node));
    const childRecords = children.map((c) => toUnitRecord(c, 1, u.name));
    rec.childCount = childRecords.length;
    rec.residualLines = rec.lineCount - childRecords.reduce((s, c) => s + c.lineCount, 0);
    records.push(rec, ...childRecords);
  }

  const topLevel = records.filter((r) => r.depth === 0);
  const enclosingEnd = (line) => {
    const owner = topLevel.find((r) => line >= r.startLine && line <= r.endLine);
    return owner ? owner.endLine : totalLines;
  };
  const markers = extractJsxMarkers(source);
  const markerRegions = markers.map((m, i) => {
    const startLine = m.line;
    const next = i + 1 < markers.length ? markers[i + 1].line - 1 : totalLines;
    const endLine = Math.min(next, enclosingEnd(startLine));
    return { label: m.label, startLine, endLine, lineCount: endLine - startLine + 1 };
  });

  const fileStats = args.noChurn
    ? { commitsPlain: null, commitsNoMerges: null, commitsFollow: null, commitsSince: null, tickets: [] }
    : fileLevelStats(repo, relFile, args.since);

  const targets = [...records, ...markerRegions];
  let done = 0;
  for (const t of targets) {
    if (args.noChurn) {
      t.commitCount = null;
      t.recentCommitCount = null;
      t.tickets = [];
      t.heatScore = null;
      continue;
    }
    const churn = churnForRange(repo, relFile, t.startLine, t.endLine, args.since);
    Object.assign(t, churn);
    t.heatScore = t.lineCount * churn.commitCount;
    t.recentHeatScore = t.lineCount * churn.recentCommitCount;
    done += 1;
    if (done % 10 === 0) process.stderr.write(`  churn ${done}/${targets.length}\n`);
  }

  records.sort((a, b) => (b.heatScore ?? 0) - (a.heatScore ?? 0) || b.lineCount - a.lineCount);
  markerRegions.sort((a, b) => (b.heatScore ?? 0) - (a.heatScore ?? 0) || b.lineCount - a.lineCount);

  const result = {
    generatedAt: new Date().toISOString(),
    file: relFile,
    repo,
    totalLines,
    since: args.since,
    heatFormula: 'lineCount * commitCount',
    churnCommand: `git log -L<start>,<end>:${relFile} --format=... -s`,
    notes: [
      '--follow cannot be combined with -L (git: "--follow requires exactly one pathspec"), so range churn is measured without --follow.',
      'Nested (depth 1) units are contained inside their depth-0 parent, so their lines are counted twice across rows.',
      'Rows with lowerBound=true contain lines git 2.50.1 cannot trace (line-log.c assertion); their commitCount/heatScore are lower bounds.',
    ],
    fileStats,
    units: records,
    markerRegions,
    branchDelta: branchDelta(repo, relFile, args.baseRef),
    windowDays: args.days,
  };

  if (args.outJson) {
    const p = path.isAbsolute(args.outJson) ? args.outJson : path.join(repo, args.outJson);
    writeFileSync(p, `${JSON.stringify(result, null, 2)}\n`);
    process.stderr.write(`wrote ${p}\n`);
  }
  if (args.outMd) {
    const p = path.isAbsolute(args.outMd) ? args.outMd : path.join(repo, args.outMd);
    writeFileSync(p, buildMarkdown(result));
    process.stderr.write(`wrote ${p}\n`);
  }
  if (args.summary) process.stdout.write(buildSummary(result, Number.isFinite(args.limit) ? args.limit : 10));
  else if (!args.outJson && !args.outMd) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
