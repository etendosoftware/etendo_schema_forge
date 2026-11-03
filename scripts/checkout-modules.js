#!/usr/bin/env node
// checkout-modules.js — move every base repo and every "fixed on epic" module to its base branch.
//
// Usage: node scripts/checkout-modules.js [--pull] [--no-fetch] [--base-mod=<branch>] [--epic-mod=<branch>]
//                                         [--only=<name>[,<name>]] [--root=<path>]
//                                         (or: make checkout-modules PULL=1 BASE_MOD=main EPIC_MOD=...)
//   --pull           after checkout, `git pull --ff-only origin <target>` (default: checkout only)
//   --no-fetch       skip `git fetch origin` before checking out
//   --base-mod=<branch>  target for base repos (default: develop; e.g. --base-mod=main)
//   --epic-mod=<branch>  target for fixed-on-epic repos (default: policy.epic, epic/ETP-3504)
//   --only=a,b       only these repos (by name from modules-policy.json)
//   --root=<path>    another Etendo checkout or local-env environment (default: the main checkout)
//
// Target branch (scripts/modules-policy.json, mirrored by the README tables):
//   base  — etendo_schema_forge, schema_forge_core, com.etendoerp.go: --base (develop)
//   epic  — etendo_core + the modules fixed on epic: --epic (epic/ETP-3504)
//   usual — not touched.
//
// Per repo: SKIP when optional and not cloned, or when there are uncommitted changes (never stashed or
// reset). Otherwise: fetch, checkout the target (created from origin/<target> when missing locally), and
// pull --ff-only when --pull is given. A failing repo does not stop the run: every repo is processed and
// all failures are listed at the end. Never creates feature/* or hotfix/* branches.
// Exit code 1 when at least one repo ERROR.
import { execFile as execFileCb } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { sanitizedGitEnv } from './lib/git-env.js';
import { readEtendoRoot, resolveDir } from './check-modules.js';

const execFile = promisify(execFileCb);
const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BASE = 'develop';

async function git(dir, args) {
  try {
    const { stdout } = await execFile('git', args, { cwd: dir, env: sanitizedGitEnv() });
    return { ok: true, out: stdout.trim() };
  } catch (e) {
    return { ok: false, out: String(e.stderr || e.message).trim() };
  }
}

function targetFor(spec, { base, epic }) {
  if (spec.kind === 'base') return base;
  if (spec.kind === 'epic') return epic;
  return null;
}

/** Returns { status: 'OK'|'SKIP'|'ERROR', step, msg }. `step` names where it stopped. */
export async function moveRepo(dir, spec, target, { fetchFirst, pull }) {
  if (!existsSync(join(dir, '.git'))) {
    return spec.optional
      ? { status: 'SKIP', step: 'clone', msg: `not cloned at ${dir}` }
      : { status: 'ERROR', step: 'clone', msg: `not cloned at ${dir}` };
  }
  const status = await git(dir, ['status', '--porcelain']);
  if (!status.ok) return { status: 'ERROR', step: 'status', msg: status.out };
  if (status.out) return { status: 'SKIP', step: 'status', msg: 'uncommitted changes; commit or stash them first' };

  if (fetchFirst) {
    const fetch = await git(dir, ['fetch', '-q', 'origin']);
    if (!fetch.ok) return { status: 'ERROR', step: 'fetch', msg: fetch.out };
  }

  const remoteRef = `origin/${target}`;
  const hasRemote = await git(dir, ['rev-parse', '-q', '--verify', `${remoteRef}^{commit}`]);
  if (!hasRemote.ok) return { status: 'ERROR', step: 'target', msg: `${remoteRef} does not exist` };

  const current = await git(dir, ['branch', '--show-current']);
  if (current.out !== target) {
    const hasLocal = await git(dir, ['rev-parse', '-q', '--verify', `refs/heads/${target}`]);
    const co = hasLocal.ok
      ? await git(dir, ['checkout', '-q', target])
      : await git(dir, ['checkout', '-q', '-b', target, remoteRef]);
    if (!co.ok) return { status: 'ERROR', step: 'checkout', msg: co.out };
  }

  if (pull) {
    const p = await git(dir, ['pull', '--ff-only', '-q', 'origin', target]);
    if (!p.ok) return { status: 'ERROR', step: 'pull', msg: p.out };
    return { status: 'OK', step: 'pull', msg: `on ${target}, pulled` };
  }
  return { status: 'OK', step: 'checkout', msg: `on ${target}` };
}

function flagValue(argv, flag) {
  const hit = argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : null;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const policy = JSON.parse(readFileSync(join(HERE, 'modules-policy.json'), 'utf8'));
  const fetchFirst = !argv.includes('--no-fetch');
  const pull = argv.includes('--pull');
  const base = flagValue(argv, '--base-mod') || DEFAULT_BASE;
  const epic = flagValue(argv, '--epic-mod') || policy.epic;
  const only = argv.filter((a) => a.startsWith('--only=')).flatMap((a) => a.slice('--only='.length).split(','));
  const mainRoot = readEtendoRoot(env);
  const rootArg = argv.find((a) => a.startsWith('--root='));
  const etendoRoot = rootArg ? resolve(process.cwd(), rootArg.slice('--root='.length)) : mainRoot;
  if (!existsSync(etendoRoot)) {
    console.log(`Etendo root: ${etendoRoot}\nERROR: directory does not exist`);
    return 1;
  }
  const explicitRoot = Boolean(rootArg) && etendoRoot !== mainRoot;

  console.log(`Etendo root: ${etendoRoot}${etendoRoot === mainRoot ? '  (main checkout)' : '  (environment)'}   base=${base} epic=${epic}   ${pull ? 'checkout + pull --ff-only' : 'checkout only'}\n`);
  const rows = [];
  for (const spec of policy.repos) {
    const target = targetFor(spec, { base, epic });
    if (!target) continue;
    if (only.length && !only.includes(spec.name)) continue;
    const dir = resolveDir(spec, { etendoRoot, env, explicitRoot });
    // A failing repo is recorded and the loop continues: one broken clone must not stop the others.
    const res = await moveRepo(dir, spec, target, { fetchFirst, pull });
    rows.push({ spec, target, dir, ...res });
    console.log(`${res.status.padEnd(5)} ${spec.name} -> ${target}  ${res.msg.split('\n')[0]}`);
  }

  const errors = rows.filter((r) => r.status === 'ERROR');
  const skips = rows.filter((r) => r.status === 'SKIP');
  console.log(`\n${rows.length} repos processed: ${rows.length - errors.length - skips.length} ok, ${skips.length} skipped, ${errors.length} with errors.`);

  if (errors.length) {
    const bar = '='.repeat(78);
    console.log(`\n${bar}\nFAILURES (${errors.length}): every repo below was NOT moved to its target branch\n${bar}`);
    for (const r of errors) {
      console.log(`\n[ERROR] ${r.spec.name}`);
      console.log(`  dir:    ${r.dir}`);
      console.log(`  target: ${r.target}`);
      console.log(`  step:   ${r.step}`);
      console.log(`  detail:\n${r.msg.split('\n').map((l) => `    ${l}`).join('\n')}`);
    }
    console.log(`\n${bar}\n`);
  }
  if (skips.length) {
    console.log(`SKIPPED (${skips.length}): not moved, no error:`);
    for (const r of skips) console.log(`  - ${r.spec.name} (${r.dir}): ${r.msg}`);
    console.log('');
  }
  return errors.length > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code));
}
