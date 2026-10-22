#!/usr/bin/env node
// @covers scripts/modules-policy.json
// check-modules.js — verify every Etendo repo/module of the checkout is on the branch the team expects.
//
// Usage: node scripts/check-modules.js [--no-fetch] [--only=<name>[,<name>]]
//                                      [--root=<path>[,<path>]]... [--all-envs]      (or: make check-modules)
//   --root      check another Etendo checkout, e.g. a local-env environment (../.worktrees/ETP-1234);
//               repeatable and comma-separated: several environments in one run
//   --all-envs  the main checkout plus every environment under <main>/../.worktrees
//
// Policy (scripts/modules-policy.json, mirrored by the tables in README.md):
//   base  — etendo_schema_forge, schema_forge_core, com.etendoerp.go: develop or main;
//           feature/* cut from develop, hotfix/* cut from main.
//   epic  — etendo_core + the modules "fixed on epic": the epic branch, or a feature/hotfix cut from it.
//   usual — modules outside the epic: same as base.
//
// "Cut from X" is judged by content, not by name: X's own commits (commits of X that no other base
// branch has) must be in the branch. A hotfix must also NOT carry develop-only (unreleased) commits.
//
// Exit code 1 when at least one ERROR is found. WARN and INFO never fail the check.
import { execFile as execFileCb } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { sanitizedGitEnv } from './lib/git-env.js';

const execFile = promisify(execFileCb);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

const BRANCH_KIND = /^(feature|hotfix)\//;

async function git(dir, args) {
  try {
    const { stdout } = await execFile('git', ['-C', dir, ...args], { env: sanitizedGitEnv(), maxBuffer: 16 * 1024 * 1024 });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function refExists(dir, ref) {
  return (await git(dir, ['rev-parse', '-q', '--verify', `${ref}^{commit}`])) !== null;
}

// Commits reachable from `include` and from none of `exclude` (only refs that exist are used).
async function countOnly(dir, include, exclude = []) {
  const args = ['rev-list', '--count', include];
  for (const e of exclude.filter(Boolean)) args.push(`^${e}`);
  const out = await git(dir, args);
  return out === null ? 0 : Number(out);
}

export function normalizeRemote(url) {
  if (!url) return null;
  const m = url.trim().match(/[:/]([^:/]+\/[^:/]+?)(?:\.git)?\/?$/);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Evaluate one repo checkout. Returns { branch, findings: [{ level: 'ERROR'|'WARN'|'INFO', msg }] }.
 * `epic` is the epic branch name, `spec.kind` one of base | epic | usual.
 */
export async function evaluateRepo(dir, spec, epic) {
  const findings = [];
  const add = (level, msg) => findings.push({ level, msg });

  const branch = await git(dir, ['branch', '--show-current']);
  if (!branch) {
    add('ERROR', 'detached HEAD: check out the expected branch');
    return { branch: '(detached)', findings };
  }

  const have = async (ref) => ((await refExists(dir, `origin/${ref}`)) ? `origin/${ref}` : null);
  const originEpic = await have(epic);
  const originDevelop = await have('develop');
  const originMain = await have('main');

  const remote = normalizeRemote(await git(dir, ['remote', 'get-url', 'origin']));
  if (spec.remote && remote && remote !== spec.remote.toLowerCase()) {
    add('WARN', `origin is ${remote}, expected ${spec.remote}`);
  }

  const dirty = await git(dir, ['status', '--porcelain', '--untracked-files=no']);
  if (dirty) add('WARN', `uncommitted changes (${dirty.split('\n').length} files)`);

  // Pull-or-rebase hint for the branch the developer is on.
  const upstream = await git(dir, ['rev-parse', '--abbrev-ref', '@{u}']);
  const behindUpstream = upstream ? await countOnly(dir, upstream, ['HEAD']) : 0;

  const isPinned = spec.kind === 'epic';
  const pinnedRef = originEpic;

  const wrongBase = () => findings.some((f) => f.msg.startsWith('cut from the wrong base'));
  // Outdated-branch warning: tells a human or an agent which commits are missing and why it matters.
  const warnBehind = async (ref, label) => {
    if (!ref) return;
    const behind = await countOnly(dir, ref, ['HEAD']);
    if (behind > 0) add('WARN', `OUTDATED: ${behind} commits of ${ref} are not in this branch (${label}). Merge/rebase ${ref} before debugging: build, update.database or runtime problems may come from this module being out of date`);
  };

  if (isPinned) {
    if (!pinnedRef) {
      add('ERROR', `origin/${epic} does not exist in this repo`);
    } else if (branch === epic) {
      const behind = await countOnly(dir, pinnedRef, ['HEAD']);
      if (behind > 0) add('ERROR', `OUTDATED: behind origin/${epic} by ${behind} commits: git pull. A lagging fixed-on-epic module breaks update.database / smartbuild and makes dependent code fail`);
    } else if (BRANCH_KIND.test(branch)) {
      const others = [originDevelop, originMain].filter(Boolean);
      const unique = await countOnly(dir, pinnedRef, others);
      if (unique > 0) {
        const missing = await countOnly(dir, pinnedRef, ['HEAD', ...others]);
        if (missing === unique) add('ERROR', `cut from the wrong base: contains none of the ${unique} epic-only commits; branches of fixed-on-epic repos must be cut from ${epic}`);
      }
      if (!wrongBase()) await warnBehind(pinnedRef, 'the base of this branch');
    } else {
      add('ERROR', `fixed on epic: must be on ${epic} (or a feature/hotfix cut from it), found '${branch}'`);
    }
    if (pinnedRef && originDevelop && (branch === epic || BRANCH_KIND.test(branch))) {
      const developAhead = await countOnly(dir, originDevelop, ['HEAD']);
      if (developAhead > 0) add('INFO', `origin/develop has ${developAhead} commits this branch does not have (not yet absorbed by the epic)`);
    }
  } else {
    const onBase = branch === 'develop' || branch === 'main';
    const developOnly = originDevelop && originMain ? await countOnly(dir, originDevelop, [originMain]) : 0;
    if (onBase) {
      await warnBehind(branch === 'develop' ? originDevelop : originMain, `you are on ${branch}`);
    } else if (branch.startsWith('feature/')) {
      if (developOnly > 0) {
        const developOnlyMissing = await countOnly(dir, originDevelop, ['HEAD', originMain]);
        if (developOnlyMissing === developOnly) add('WARN', `OUTDATED or cut from main: contains none of the ${developOnly} develop-only commits (features must be cut from develop). Merge/rebase origin/develop before debugging: problems may come from this branch being out of date`);
      }
      if (originEpic) {
        const epicOnly = await countOnly(dir, originEpic, [originDevelop, originMain].filter(Boolean));
        const epicMissing = await countOnly(dir, originEpic, ['HEAD', originDevelop, originMain].filter(Boolean));
        if (epicOnly > 0 && epicMissing < epicOnly) add('ERROR', `contains epic-only commits (${epicOnly - epicMissing}): this repo is not fixed on epic, cut features from develop`);
      }
      if (!findings.some((f) => f.msg.startsWith('OUTDATED'))) await warnBehind(originDevelop || originMain, 'features are cut from develop');
    } else if (branch.startsWith('hotfix/')) {
      if (developOnly > 0) {
        const carried = developOnly - (await countOnly(dir, originDevelop, ['HEAD', originMain]));
        if (carried > 0) add('ERROR', `hotfix carries ${carried} develop-only (unreleased) commits: hotfixes must be cut from main`);
      }
      await warnBehind(originMain, 'hotfixes are cut from main');
    } else {
      add('WARN', `unexpected branch '${branch}': expected develop, main, feature/* or hotfix/*`);
    }
  }

  if (behindUpstream > 0 && upstream === `origin/${branch}` && branch !== epic && branch !== 'develop' && branch !== 'main') {
    add('WARN', `OUTDATED: behind its own remote ${upstream} by ${behindUpstream} commits: git pull`);
  }
  return { branch, findings };
}

export function resolveDir(spec, { etendoRoot, repoRoot = REPO_ROOT, env = process.env, explicitRoot = false }) {
  if (spec.location === 'self') {
    if (!explicitRoot) return repoRoot;
    // Another environment: the functional repo directory name differs between checkouts.
    return ['etendo_schema_forge', 'schema_forge'].map((n) => join(etendoRoot, n)).find((p) => existsSync(join(p, '.git'))) || join(etendoRoot, 'etendo_schema_forge');
  }
  if (spec.location === 'etendo-root') return etendoRoot;
  if (spec.location === 'modules') return join(etendoRoot, 'modules', spec.name);
  if (spec.envDir && env[spec.envDir] && !explicitRoot) return resolve(repoRoot, env[spec.envDir]);
  return join(etendoRoot, spec.name);
}

function readEtendoRoot(env) {
  if (env.ETENDO_ROOT) return resolve(REPO_ROOT, env.ETENDO_ROOT);
  const dotenv = join(REPO_ROOT, '.env');
  if (existsSync(dotenv)) {
    const m = readFileSync(dotenv, 'utf8').match(/^ETENDO_ROOT=(.+)$/m);
    if (m) return resolve(REPO_ROOT, m[1].trim());
  }
  return resolve(REPO_ROOT, '..');
}

function worst(findings) {
  if (findings.some((f) => f.level === 'ERROR')) return 'ERROR';
  if (findings.some((f) => f.level === 'WARN')) return 'WARN';
  return 'OK';
}

// Values of repeatable `--root=a,b` flags, in order, without duplicates.
function flagValues(argv, flag) {
  const out = [];
  for (const a of argv) if (a.startsWith(`${flag}=`)) out.push(...a.slice(flag.length + 1).split(',').filter(Boolean));
  return [...new Set(out)];
}

// Parse worktree.conf lines: `module <name> <branch> [adopt[=path]]`, `repo <dir> <branch> [...]`, `core - <branch>`.
export function parseWorktreeConf(text) {
  const conf = { module: new Map(), repo: new Map(), core: null };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [kind, name, branch, ...rest] = line.split(/\s+/);
    if (!branch) continue;
    const entry = { branch, adopt: rest.some((x) => x === 'adopt' || x.startsWith('adopt=')) };
    if (kind === 'core') conf.core = entry;
    else if (kind === 'module' || kind === 'repo') conf[kind].set(name, entry);
  }
  return conf;
}

function readWorktreeConf(etendoRoot) {
  const file = join(etendoRoot, 'worktree.conf');
  return existsSync(file) ? parseWorktreeConf(readFileSync(file, 'utf8')) : null;
}

// The worktree.conf entry that governs this policy repo, or null when it is an inherited copy.
export function declaredBranch(conf, spec, dir) {
  if (spec.location === 'etendo-root') return conf.core;
  if (spec.location === 'modules') return conf.module.get(spec.name) || null;
  const names = [spec.name, basename(dir), ...(spec.location === 'self' ? ['schema_forge', 'etendo_schema_forge'] : [])];
  for (const n of names) if (conf.repo.has(n)) return conf.repo.get(n);
  return null;
}

async function checkRoot(etendoRoot, { policy, fetchFirst, only, explicitRoot, mainRoot }) {
  const rows = [];
  for (const spec of policy.repos) {
    if (only.length && !only.includes(spec.name)) continue;
    const dir = resolveDir(spec, { etendoRoot, env: process.env, explicitRoot });
    rows.push({ spec, dir, present: existsSync(join(dir, '.git')) });
  }

  if (fetchFirst) {
    await Promise.all(rows.filter((r) => r.present).map((r) => git(r.dir, ['fetch', '-q', 'origin'])));
  }

  // worktree.conf lists only what differs from the main checkout (a patch): the repos named at
  // creation, checked out on the declared branch. Every other repo is a copy of the main checkout.
  const isEnv = etendoRoot !== mainRoot;
  const conf = isEnv ? readWorktreeConf(etendoRoot) : null;

  const results = [];
  for (const r of rows) {
    const declared = conf ? declaredBranch(conf, r.spec, r.dir) : null;
    if (!r.present) {
      const level = declared || !r.spec.optional ? 'ERROR' : 'INFO';
      const why = declared ? `declared in worktree.conf (${declared.branch}) but not present at ${r.dir}` : `not cloned at ${r.dir}`;
      results.push({ spec: r.spec, branch: '-', findings: [{ level, msg: why }] });
      continue;
    }
    const res = await evaluateRepo(r.dir, r.spec, policy.epic);
    // A local-env environment holds frozen APFS copies (own .git directory) of every repo it did not
    // name at creation; real worktrees have a .git file. An outdated copy is expected, not a mistake.
    if (isEnv && statSync(join(r.dir, '.git')).isDirectory() && res.findings.some((f) => f.msg.startsWith('OUTDATED'))) {
      res.findings.push({ level: 'INFO', msg: 'this is a frozen copy inside a local-env environment: it does not follow the main checkout. Recreate the environment or `git pull` inside it, naming the repo with --module/--repo if you need to commit' });
    }
    if (declared && res.branch !== declared.branch) {
      res.findings.push({ level: 'WARN', msg: `worktree.conf declares ${declared.branch}${declared.adopt ? ' (adopted)' : ''} but ${res.branch} is checked out: run \`local-env sync\` or fix the conf` });
    } else if (conf && !declared) {
      const mainBranch = await git(resolveDir(r.spec, { etendoRoot: mainRoot, env: process.env, explicitRoot: false }), ['branch', '--show-current']);
      if (mainBranch && mainBranch !== res.branch) {
        res.findings.push({ level: 'INFO', msg: `copy of the main checkout, which is on ${mainBranch} now; this copy stays on ${res.branch} (frozen at creation)` });
      }
    }
    results.push({ spec: r.spec, ...res });
  }

  // Unlisted module repos: a module added without updating the policy and the README tables.
  const known = new Set(policy.repos.filter((s) => s.location === 'modules').map((s) => s.name));
  const unlisted = [];
  const modulesDir = join(etendoRoot, 'modules');
  if (existsSync(modulesDir) && !only.length) {
    for (const d of readdirSync(modulesDir)) {
      if (!known.has(d) && existsSync(join(modulesDir, d, '.git'))) unlisted.push(d);
    }
  }

  const icon = { OK: 'OK   ', WARN: 'WARN ', ERROR: 'ERROR', INFO: 'INFO ' };
  console.log(`Etendo root: ${etendoRoot}${etendoRoot === mainRoot ? '  (main checkout)' : '  (environment)'}   epic: ${policy.epic}\n`);
  const nameW = Math.max(...results.map((r) => r.spec.name.length), 10);
  const branchW = Math.max(...results.map((r) => r.branch.length), 6);
  let errors = 0;
  let warns = 0;
  for (const r of results) {
    const status = worst(r.findings);
    if (status === 'ERROR') errors++;
    if (status === 'WARN') warns++;
    const label = !r.findings.length ? 'OK' : status === 'OK' ? 'INFO' : status;
    console.log(`${icon[label]} ${r.spec.name.padEnd(nameW)}  ${r.spec.kind.padEnd(5)}  ${r.branch.padEnd(branchW)}`);
    for (const f of r.findings) console.log(`        ${f.level}: ${f.msg}`);
  }
  if (unlisted.length) {
    console.log('\nINFO: module repos in modules/ that are not in scripts/modules-policy.json:');
    for (const d of unlisted) console.log(`        ${d}  (add it to the policy and to the README tables)`);
  }
  console.log(`\n${results.length} repos checked: ${errors} with errors, ${warns} with warnings.\n`);
  return errors;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const policy = JSON.parse(readFileSync(join(HERE, 'modules-policy.json'), 'utf8'));
  const fetchFirst = !argv.includes('--no-fetch');
  const only = flagValues(argv, '--only');
  const mainRoot = readEtendoRoot(env);

  // Roots to check: every --root=<path> (an Etendo checkout or a local-env environment such as
  // ../.worktrees/ETP-1234), plus the main checkout and every environment with --all-envs.
  const roots = flagValues(argv, '--root').map((p) => resolve(process.cwd(), p));
  if (argv.includes('--all-envs')) {
    roots.unshift(mainRoot);
    const envsDir = join(dirname(mainRoot), '.worktrees');
    if (existsSync(envsDir)) {
      for (const d of readdirSync(envsDir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort()) roots.push(join(envsDir, d));
    }
  }
  const targets = roots.length ? [...new Set(roots)] : [mainRoot];
  const explicitRoot = roots.length > 0;

  let errors = 0;
  for (const root of targets) {
    if (!existsSync(root)) {
      console.log(`Etendo root: ${root}\nERROR: directory does not exist\n`);
      errors++;
      continue;
    }
    errors += await checkRoot(root, { policy, fetchFirst, only, explicitRoot: explicitRoot && root !== mainRoot, mainRoot });
  }
  return errors > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code));
}
