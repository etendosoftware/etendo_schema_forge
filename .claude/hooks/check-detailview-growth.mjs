#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const repo = process.cwd();
const input = JSON.parse(readFileSync(0, 'utf8'));
const toolInput = input.tool_input ?? {};
const filePath = path.resolve(repo, toolInput.file_path ?? toolInput.path ?? '');
const isDetailView = /(?:^|\/)DetailView\.(?:jsx|tsx)$/.test(filePath);

if (!isDetailView) process.exit(0);

function runGit(args) {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function lineCount(source) {
  if (!source) return 0;
  return source.split(/\r?\n/).length - (source.endsWith('\n') ? 1 : 0);
}

function resolveBaseRef() {
  const configured = process.env.DETAILVIEW_BASE_REF;
  const candidates = configured
    ? [configured]
    : ['origin/epic/ETP-3504', 'epic/ETP-3504', 'origin/main', 'main', 'origin/develop', 'develop'];
  return candidates.find((ref) => {
    try {
      runGit(['rev-parse', '--verify', ref]);
      return true;
    } catch {
      return false;
    }
  });
}

function sourceAtBase(base, relativePath) {
  try {
    return runGit(['show', `${base}:${relativePath}`]);
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
  const relativePath = path.relative(repo, filePath);
  const baseRef = resolveBaseRef();
  if (!baseRef) {
    console.error('[detailview-growth] BLOCKED: no base ref found. Set DETAILVIEW_BASE_REF explicitly.');
    process.exit(2);
  }

  const mergeBase = runGit(['merge-base', 'HEAD', baseRef]);
  const baseSource = sourceAtBase(mergeBase, relativePath);
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
