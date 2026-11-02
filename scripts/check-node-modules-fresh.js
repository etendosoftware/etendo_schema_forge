#!/usr/bin/env node
// Exit 0 when the installed node_modules matches package-lock.json, 1 otherwise.
//
// npm writes node_modules/.package-lock.json (the "hidden lockfile") on every
// install, recording what is actually on disk. Comparing it with the committed
// lockfile is a pure read of two JSON files (no npm, no network), so the
// pre-push can ask it on every push. Stale means any of: no node_modules or no
// hidden lockfile; an installed package whose version differs from the lock; a
// required (non-optional, non-peer) locked package that is not installed.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function staleReason(lockPath, hiddenPath) {
  let lock;
  let hidden;
  try {
    lock = JSON.parse(readFileSync(lockPath, 'utf8')).packages || {};
  } catch {
    return 'package-lock.json unreadable';
  }
  try {
    hidden = JSON.parse(readFileSync(hiddenPath, 'utf8')).packages || {};
  } catch {
    return 'node_modules missing or has no hidden lockfile';
  }
  for (const [key, installed] of Object.entries(hidden)) {
    const wanted = lock[key];
    if (key && wanted?.version && installed.version && wanted.version !== installed.version) {
      return `${key}: installed ${installed.version}, lockfile ${wanted.version}`;
    }
  }
  for (const [key, wanted] of Object.entries(lock)) {
    if (key && !hidden[key] && !wanted.optional && !wanted.peer && !wanted.inBundle) {
      return `${key}: in lockfile but not installed`;
    }
  }
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = resolve(process.argv[2] || '.');
  const reason = staleReason(join(root, 'package-lock.json'), join(root, 'node_modules', '.package-lock.json'));
  if (reason) {
    console.log(reason);
    process.exit(1);
  }
}
