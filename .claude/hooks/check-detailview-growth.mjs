#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const toolInput = input.tool_input ?? {};
const filePath = path.resolve(process.cwd(), toolInput.file_path ?? toolInput.path ?? '');
const isDetailView = /(?:^|\/)DetailView\.(?:jsx|tsx)$/.test(filePath);

if (!isDetailView) process.exit(0);

// Resolved from the FILE's own directory, never from process.cwd() — a hook
// spawned while editing a file under a nested `git worktree add` checkout
// (e.g. .worktrees/feature-X/) must use THAT worktree's root and HEAD, not
// the main checkout's. Using cwd here silently produced a bogus relativePath
// (base lookups landed on paths that never existed at that ref) and a
// phantom "base has 0 lines" false-positive block.
function runGit(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function lineCount(source) {
  if (!source) return 0;
  return source.split(/\r?\n/).length - (source.endsWith('\n') ? 1 : 0);
}

function resolveBaseRef(repo) {
  const configured = process.env.DETAILVIEW_BASE_REF;
  const candidates = configured
    ? [configured]
    : ['origin/develop', 'develop', 'origin/main', 'main'];
  return candidates.find((ref) => {
    try {
      runGit(repo, ['rev-parse', '--verify', ref]);
      return true;
    } catch {
      return false;
    }
  });
}

function sourceAtBase(repo, base, relativePath) {
  try {
    return runGit(repo, ['show', `${base}:${relativePath}`]);
  } catch {
    return '';
  }
}

function projectedSource(current) {
  const toolName = input.tool_name ?? input.tool ?? '';
  if (toolName === 'Write' || toolInput.content !== undefined) return String(toolInput.content ?? '');
  if (toolInput.old_string === undefined || toolInput.new_string === undefined) return current;

  const oldString = String(toolInput.old_string);
  const newString = String(toolInput.new_string);
  if (!oldString) return current;
  if (!current.includes(oldString)) {
    throw new Error('old_string was not found in the current DetailView file');
  }
  if (toolInput.replace_all) return current.split(oldString).join(newString);
  return current.replace(oldString, newString);
}

try {
  const repo = execFileSync('git', ['-C', path.dirname(filePath), 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  const relativePath = path.relative(repo, filePath);
  const baseRef = resolveBaseRef(repo);
  if (!baseRef) {
    console.error('[detailview-growth] BLOCKED: no base ref found. Set DETAILVIEW_BASE_REF explicitly.');
    process.exit(2);
  }

  const mergeBase = runGit(repo, ['merge-base', 'HEAD', baseRef]);
  const baseSource = sourceAtBase(repo, mergeBase, relativePath);
  const currentSource = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  const before = lineCount(currentSource);
  const baseline = lineCount(baseSource);
  const after = lineCount(projectedSource(currentSource));

  if (after > baseline) {
    console.error(`[detailview-growth] BLOCKED: ${relativePath} would grow from ${before} to ${after} lines; base ${mergeBase.slice(0, 12)} has ${baseline}.`);
    console.error('[detailview-growth] Extract or remove lines first, or override the base with DETAILVIEW_BASE_REF.');
    process.exit(2);
  }

  console.error(`[detailview-growth] OK: ${relativePath} ${after} lines <= base ${baseline} (${mergeBase.slice(0, 12)}).`);
} catch (error) {
  console.error(`[detailview-growth] BLOCKED: could not verify proposed edit (${error.message}).`);
  process.exit(2);
}
