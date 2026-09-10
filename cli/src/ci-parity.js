#!/usr/bin/env node
/**
 * CI parity for the LOCAL Etendo checkout.
 *
 * Brings a developer's local `etendo_core` into the same shape a CI build
 * installs (same source modules, same branches), then optionally drops an
 * isolated database and runs the same four gradle commands CI runs.
 *
 * Authoritative CI behavior lives in `pipelines/Jenkinsfile`; every rule this
 * file mirrors is cited by line in `docs/ci-parity-install.md`.
 *
 * DRY RUN IS THE DEFAULT. Nothing executes unless DRY_RUN=0 is passed
 * explicitly. Nothing is ever pushed, deleted, or `git clean`ed.
 *
 * Usage:
 *   node cli/src/ci-parity.js                                  # dry run, all phases, union profile
 *   node cli/src/ci-parity.js --phases verify --json           # machine-readable verify report
 *   node cli/src/ci-parity.js --profile schema-forge-ci        # reproduce this repo's CI footprint
 *   node cli/src/ci-parity.js --phases align --dry-run 0       # actually align modules
 *   node cli/src/ci-parity.js --bbdd-sid etendo_ci --dry-run 0 # full run against an isolated DB
 *
 * Prefer the Makefile wrapper: `make ci-parity`, `make ci-parity-help`.
 */

import { execFileSync } from 'node:child_process';
import {
  existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, unlinkSync, readdirSync, statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

export const PHASES = ['verify', 'align', 'db', 'install'];
export const DEFAULT_PROFILE = 'union';
export const DEFAULT_BBDD_SID = 'etendo_ci';

/** Freshness of the checked-out branch relative to its configured upstream. */
export const FRESHNESS = ['CURRENT', 'AHEAD', 'STALE', 'DIVERGED', 'NO-UPSTREAM', 'UNKNOWN'];

/** Any gradle.properties / env key whose VALUE must never reach an output stream. */
export const SECRET_KEY_RE = /password|token|secret|key/i;
export const REDACTED = '***';

/** The four gradle commands CI runs, in order (pipelines/Jenkinsfile:454-457). */
export const CI_GRADLE_COMMANDS = [
  './gradlew prepareConfig --info --stacktrace',
  './gradlew setup --info --stacktrace',
  './gradlew expandModules --info --stacktrace',
  './gradlew install -PignoreConsistency=true --info --stacktrace',
];

/**
 * Keys CI sets in its generated gradle.properties that a local file may lack
 * (pipelines/Jenkinsfile:437-450). Added by the parity file; everything else
 * in the local file is preserved verbatim.
 */
export const CI_ADDED_PROPERTIES = {
  'allow.root': 'true',
  'org.gradle.jvmargs': '-Dfile.encoding=UTF-8',
  'org.gradle.daemon': 'false',
};

/** Branches this tool refuses to check out, even when CI would. */
export const PROTECTED_BRANCHES = ['develop', 'main', 'master'];

/** Accepted values for a profile's `unpinnedPolicy`. */
export const UNPINNED_POLICIES = ['report-only', 'develop-then-branch'];
export const DEFAULT_UNPINNED_POLICY = 'report-only';

// ---------------------------------------------------------------------------
// PURE: redaction
// ---------------------------------------------------------------------------

/**
 * Redact the value of a single key/value pair when the key looks secret.
 * @returns {string} the value, or `***`.
 */
export function redactValue(key, value) {
  return SECRET_KEY_RE.test(String(key)) ? REDACTED : String(value);
}

/**
 * Redact every `key=value` line in a properties-shaped blob whose key looks
 * secret. Also blanks bare `PGPASSWORD=...` assignments. Comments untouched.
 */
export function redactProperties(text) {
  return String(text)
    .split('\n')
    .map((line) => {
      const m = /^(\s*)([A-Za-z0-9_.\-]+)(\s*=\s*)(.*)$/.exec(line);
      if (!m) return line;
      const [, indent, key, eq, value] = m;
      return `${indent}${key}${eq}${redactValue(key, value)}`;
    })
    .join('\n');
}

/** Deep-redact an object for `--json` output: any secret-looking key becomes `***`. */
export function redactObject(input) {
  if (Array.isArray(input)) return input.map(redactObject);
  if (input && typeof input === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(input)) {
      out[k] = SECRET_KEY_RE.test(k) && typeof v !== 'object' ? REDACTED : redactObject(v);
    }
    return out;
  }
  return input;
}

// ---------------------------------------------------------------------------
// PURE: module list parsing
// ---------------------------------------------------------------------------

/**
 * Parse a comma-separated module list (com.etendoerp.go's
 * jenkinsExtraModules.txt: one line, 15 SSH URLs, commas, no comments).
 * @returns {string[]} SSH URLs, in file order, de-duplicated.
 */
export function parseCommaModuleList(text) {
  return dedupe(
    String(text)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Parse a newline-separated module list (pipelines/extra-modules.txt).
 * Mirrors pipelines/Jenkinsfile:225-228: strip `#` to end of line, trim,
 * drop empties.
 * @returns {string[]} SSH URLs, in file order, de-duplicated.
 */
export function parseNewlineModuleList(text) {
  return dedupe(
    String(text)
      // Split on /\r?\n/, NOT '\n'. With a plain '\n' split a CRLF file leaves a
      // trailing '\r' on every line, and `#.*$` then cannot fire at all: `.`
      // does not match `\r` (a line terminator), so `$` is unreachable after
      // `#.*` and the comment regex silently no-ops. On a CRLF checkout of
      // pipelines/extra-modules.txt that turns all 6 comment lines into
      // "module URLs", yielding phantom MISSING rows and `git clone <comment>`
      // steps in the align plan.
      .split(/\r?\n/)
      .map((s) => s.replace(/#.*$/, '').trim())
      .filter(Boolean),
  );
}

/** Dispatch to the right list parser by declared format. */
export function parseModuleList(text, format) {
  if (format === 'comma') return parseCommaModuleList(text);
  if (format === 'newline') return parseNewlineModuleList(text);
  throw new Error(`Unknown module list format: ${format}`);
}

/**
 * Module directory name from a git URL.
 *
 * Mirrors pipelines/Jenkinsfile:242 (`tokenize('/').last()` minus `.git`), and
 * additionally handles the slash-less scp-style form `git@host:module.git`,
 * which `split('/').pop()` alone would return with the `git@host:` prefix
 * still attached. Every URL in both real module lists contains a `/`, so that
 * branch is defensive rather than load-bearing — but it now actually works,
 * instead of being a claim made by a `.replace()` that could never fire (the
 * `split('/')` had already removed every slash the pattern needed).
 */
export function moduleNameFromUrl(url) {
  const tail = String(url).trim().split('/').pop() || '';
  // Strip a leading `user@host:` / `host:` only when it is a real SSH prefix,
  // i.e. the segment before the colon has no whitespace.
  return tail.replace(/^[^\s:/]+:/, '').replace(/\.git$/, '');
}

function dedupe(list) {
  return [...new Set(list)];
}

// ---------------------------------------------------------------------------
// PURE: dirty-worktree classification
// ---------------------------------------------------------------------------

/**
 * Extract the working-tree paths from `git status --porcelain` output.
 * Handles the rename/copy form (`R  old -> new`) by taking the destination.
 * @returns {string[]}
 */
export function parsePorcelainPaths(porcelain) {
  return String(porcelain || '')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      // Documented format: exactly 2 status chars, a space, then the path.
      // The regex (rather than slice(3)) also survives output whose leading
      // space was trimmed — ' D path' arriving as 'D path' would otherwise
      // lose the first character of the path.
      const m = /^([ MADRCU?!]{2}) (.*)$/.exec(line);
      return (m ? m[2] : line.replace(/^\s*[MADRCU?!]{1,2}\s+/, '')).trim();
    })
    .filter(Boolean)
    .map((p) => {
      const arrow = p.indexOf(' -> ');
      return arrow === -1 ? p : p.slice(arrow + 4).trim();
    })
    .map((p) => p.replace(/^"(.*)"$/, '$1'));
}

/**
 * Is this path gradle's compiled output rather than a source file?
 *
 * STRICTLY a `build/` prefix relative to the module root, which is where gradle
 * writes (`<module>/build/classes/...`). A deeper `build/` segment (say
 * `src/main/build/x`) is NOT treated as disposable — being generous here would
 * weaken the guarantee that real work is never overwritten.
 */
export function isBuildOutputPath(p) {
  return /^build\//.test(String(p));
}

/**
 * Split a dirty worktree into disposable build output and real source dirt.
 *
 * Several third-party modules (com.etendoerp.sif.general, com.etendoerp.verifactu,
 * com.smf.ticketbai) TRACK their compiled `.class` files, so a plain build leaves
 * them permanently "dirty" with deleted tracked artifacts under `build/classes/`.
 * A checkout simply restores those — there is no human work to lose — so that
 * case must not block alignment forever.
 *
 * The guarantee: if even ONE dirty path lies outside `build/`, `buildOnly` is
 * false and the module stays a hard blocker.
 *
 * @param {string[]} paths from parsePorcelainPaths()
 * @returns {{buildPaths: string[], sourcePaths: string[], buildOnly: boolean, dirty: boolean}}
 */
export function classifyDirtyPaths(paths) {
  const list = paths || [];
  const buildPaths = list.filter(isBuildOutputPath);
  const sourcePaths = list.filter((p) => !isBuildOutputPath(p));
  return {
    buildPaths,
    sourcePaths,
    dirty: list.length > 0,
    buildOnly: list.length > 0 && sourcePaths.length === 0,
  };
}

/**
 * Compact `"3 path(s): a, b, +1 more"` summary for a reason line.
 * The surrounding wording ("under build/", "source changes") belongs to the
 * caller — this helper is neutral about what the paths mean.
 */
export function summarizePaths(paths, max = 4) {
  const shown = paths.slice(0, max).join(', ');
  const rest = paths.length > max ? `, +${paths.length - max} more` : '';
  return `${paths.length} path(s): ${shown}${rest}`;
}

// ---------------------------------------------------------------------------
// PURE: layout resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the Etendo core directory, which sits on either side of this repo
 * depending on the layout:
 *   - CI:    core is the PARENT (schema-forge lives at etendo_core/etendo_schema_forge)
 *   - local: core is a SUBDIR   (schema-forge/etendo_core)
 *
 * Probes for `<candidate>/modules`.
 * @param {string} repoRoot absolute path to the schema-forge repo root
 * @param {(p: string) => boolean} exists filesystem predicate (injected for tests)
 * @returns {{coreDir: string, layout: 'core-as-subdir'|'core-as-parent'}}
 * @throws {Error} with a resolution trace when neither candidate has modules/
 */
export function resolveCoreDir(repoRoot, exists = existsSync) {
  const candidates = [
    { coreDir: path.join(repoRoot, 'etendo_core'), layout: 'core-as-subdir' },
    { coreDir: path.dirname(repoRoot), layout: 'core-as-parent' },
  ];
  for (const c of candidates) {
    if (exists(path.join(c.coreDir, 'modules'))) return c;
  }
  throw new Error(
    'Cannot locate the Etendo core directory. Probed for a modules/ dir at:\n'
    + candidates.map((c) => `  - ${path.join(c.coreDir, 'modules')}  (${c.layout})`).join('\n')
    + '\nExpected either etendo_core/ inside this repo (local layout) or this repo'
    + ' checked out inside etendo_core/ (CI layout).',
  );
}

/** Absolute path of a declared module-list file, honoring its `relativeTo`. */
export function resolveListPath({ path: rel, relativeTo }, { repoRoot, coreDir }) {
  return path.join(relativeTo === 'core' ? coreDir : repoRoot, rel);
}

// ---------------------------------------------------------------------------
// PURE: profile building
// ---------------------------------------------------------------------------

/**
 * Decide what GROUNDS a module's expected branch — i.e. whether a Jenkinsfile
 * this repo can actually read says which branch that module ends up on.
 *
 *   'jenkinsfile-hardcoded' pinned to the epic branch (Jenkinsfile:230-239 + :248-251)
 *   'jenkinsfile-chain'     cloned by this repo's CI, generic checkoutChain()
 *   'ungrounded'            reachable only through com.etendoerp.go's own
 *                           jenkinsExtraModules.txt (or through neither list).
 *                           That job's branch logic lives in the Go repo, which
 *                           is not readable from here, so NO expected branch is
 *                           asserted and no checkout is ever planned.
 *
 * @returns {'jenkinsfile-hardcoded'|'jenkinsfile-chain'|'ungrounded'}
 */
export function branchPolicySourceFor(module, config) {
  if ((config.branchPolicy?.hardcodedBranchModules || []).includes(module.name)) {
    return 'jenkinsfile-hardcoded';
  }
  if (module.source === 'schemaForgeCi') return 'jenkinsfile-chain';
  if (module.name === 'com.etendoerp.go') return 'jenkinsfile-chain';
  return 'ungrounded';
}

/**
 * Build the effective module profile: which modules must exist from source,
 * which are deliberately excluded, and which would be published JARs in the
 * CI job named by `warnPublishedJarAgainst`.
 *
 * @param {object} args
 * @param {string} args.profileName
 * @param {object} args.config parsed ci-parity-profiles.json
 * @param {Record<string,string>} args.listContents listId -> raw file text
 * @returns {{
 *   name: string, description: string, reason: string,
 *   required: Array<{name: string, url: string, reason: string, source: string}>,
 *   excluded: Array<{name: string, reason: string}>,
 *   publishedJarWarn: Array<{name: string, reason: string}>
 * }}
 */
export function buildProfile({ profileName, config, listContents }) {
  const profile = config.profiles?.[profileName];
  if (!profile) {
    throw new Error(
      `Unknown profile "${profileName}". Available: ${Object.keys(config.profiles || {}).join(', ')}`,
    );
  }

  const required = [];
  const seen = new Set();
  const add = (entry) => {
    if (seen.has(entry.name)) return;
    seen.add(entry.name);
    required.push(entry);
  };

  for (const entry of profile.alwaysSource || []) {
    add({ ...entry, source: 'alwaysSource' });
  }

  const perList = {};
  for (const listId of profile.sourceLists || []) {
    const spec = config.moduleListFiles?.[listId];
    if (!spec) throw new Error(`Profile "${profileName}" references unknown list "${listId}"`);
    const urls = parseModuleList(listContents[listId] ?? '', spec.format);
    perList[listId] = new Set(urls.map(moduleNameFromUrl));
    for (const url of urls) {
      add({ name: moduleNameFromUrl(url), url, reason: spec.reason, source: listId });
    }
  }

  for (const m of required) m.branchPolicySource = branchPolicySourceFor(m, config);

  const unpinnedPolicy = profile.unpinnedPolicy ?? DEFAULT_UNPINNED_POLICY;
  if (!UNPINNED_POLICIES.includes(unpinnedPolicy)) {
    throw new Error(
      `Profile "${profileName}" declares unpinnedPolicy "${unpinnedPolicy}", which is not a`
      + ` recognized value. Accepted: ${UNPINNED_POLICIES.join(', ')}.`
      + '\nFix pipelines/ci-parity-profiles.json — an unknown policy is refused rather than'
      + ' silently falling back, because the fallback would decide whether 8 modules get aligned.',
    );
  }

  const warnAgainst = profile.warnPublishedJarAgainst;
  const publishedJarWarn = warnAgainst
    ? required
      .filter((m) => m.source !== 'alwaysSource' && !perList[warnAgainst]?.has(m.name))
      .map((m) => ({
        name: m.name,
        reason: `Required from source by this profile, but absent from ${config.moduleListFiles[warnAgainst].path}`
          + ` — the ${warnAgainst} CI job resolves it as a PUBLISHED JAR, so local source changes to it are not exercised there.`,
      }))
    : [];

  return {
    name: profileName,
    description: profile.description || '',
    reason: profile.reason || '',
    unpinnedPolicy,
    required,
    excluded: (profile.excluded || []).map((e) => ({ ...e })),
    publishedJarWarn,
  };
}

// ---------------------------------------------------------------------------
// PURE: checkout chain
// ---------------------------------------------------------------------------

export function isHotfixBranch(branch) {
  return String(branch).startsWith('hotfix/');
}

export function isFeatureBranch(branch) {
  return String(branch).startsWith('feature/');
}

/**
 * Compute the checkout chain CI would run for one repo.
 *
 * Mirrors `checkoutChain()` at pipelines/Jenkinsfile:173-185 plus the two
 * hardcoded overrides:
 *   - etendo_core is pinned to epic/ETP-3504 on non-hotfix builds (:188-196)
 *   - the 8 hardcodedBranchModules are pinned to epic/ETP-3504 with NO
 *     $GIT_BRANCH override (:230-252)
 *
 * @param {object} args
 * @param {'core'|'module'|'schema-forge'} args.repoKind
 * @param {string} [args.moduleName] required when repoKind === 'module'
 * @param {string} args.gitBranch the driving branch ($GIT_BRANCH), i.e. the
 *   schema-forge branch currently checked out
 * @param {object} args.branchPolicy config.branchPolicy
 * @returns {{candidates: string[], commands: string[], pinned: boolean}}
 *   `candidates` are in chain order — the LAST one that exists wins, exactly
 *   like CI's `git checkout X || git checkout Y` sequencing.
 */
export function expectedCheckoutChain({ repoKind, moduleName, gitBranch, branchPolicy }) {
  const {
    developBranch = 'develop', mainBranch = 'main', epicBranch, coreHardcodedBranch,
  } = branchPolicy || {};
  const hotfix = isHotfixBranch(gitBranch);

  if (repoKind === 'module' && (branchPolicy?.hardcodedBranchModules || []).includes(moduleName)) {
    return {
      candidates: [epicBranch],
      commands: [`git checkout ${epicBranch}`],
      pinned: true,
    };
  }

  if (repoKind === 'core' && !hotfix) {
    return {
      candidates: [coreHardcodedBranch, gitBranch],
      commands: [
        `git checkout ${coreHardcodedBranch}`,
        `git checkout ${gitBranch} || echo 'Branch ${gitBranch} not found in etendo_core, keeping ${coreHardcodedBranch}'`,
      ],
      pinned: true,
    };
  }

  const candidates = [];
  const commands = [];
  if (hotfix) {
    candidates.push(mainBranch);
    commands.push(`git checkout ${mainBranch}`);
  } else if (isFeatureBranch(gitBranch) && epicBranch) {
    candidates.push(developBranch, epicBranch);
    commands.push(`git checkout ${epicBranch} || git checkout ${developBranch}`);
  } else {
    candidates.push(developBranch);
    commands.push(`git checkout ${developBranch}`);
  }
  candidates.push(gitBranch);
  commands.push(
    `git checkout ${gitBranch} || echo 'Branch ${gitBranch} not found, keeping previous checkout'`,
  );
  return { candidates: dedupe(candidates), commands, pinned: false };
}

/**
 * The chain applied to an `ungrounded` module when a profile opts into
 * `unpinnedPolicy: "develop-then-branch"`.
 *
 * This is deliberately the ELSE branch of checkoutChain()
 * (pipelines/Jenkinsfile:179-181) — the one a non-feature driving branch gets:
 * `develop`, then `$GIT_BRANCH` if it exists. It does NOT consult the epic
 * branch, because nothing grounds an epic for these modules; picking one would
 * be the invented policy this field exists to avoid.
 *
 * @returns {{candidates: string[], commands: string[], pinned: boolean}}
 */
export function unpinnedCheckoutChain({ gitBranch, branchPolicy }) {
  const developBranch = branchPolicy?.developBranch || 'develop';
  return {
    candidates: dedupe([developBranch, gitBranch]),
    commands: [
      `git checkout ${developBranch}`,
      `git checkout ${gitBranch} || echo 'Branch ${gitBranch} not found, keeping previous checkout'`,
    ],
    pinned: false,
  };
}

/**
 * Resolve the single branch CI would end up on: the LAST candidate that
 * actually exists in that repo.
 * @param {string[]} candidates chain order (later wins)
 * @param {string[]} existingBranches branches present in the repo
 * @returns {string|null} null when no candidate exists
 */
export function resolveExpectedBranch(candidates, existingBranches) {
  const present = new Set(existingBranches);
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    if (present.has(candidates[i])) return candidates[i];
  }
  return null;
}

/** True when checking this branch out is forbidden by PROTECTED_BRANCHES. */
export function isProtectedBranch(branch) {
  return PROTECTED_BRANCHES.includes(String(branch));
}

/**
 * The commands `align` actually RUNS to put a module on its resolved branch.
 *
 * Deliberately NOT `chain.commands`. That chain faithfully mirrors CI and
 * therefore contains an intermediate literal `git checkout develop`, plus a
 * trailing `git checkout $BRANCH || echo …` that swallows EVERY failure — so a
 * checkout failing for any reason other than "branch not found" would silently
 * leave the module sitting on `develop`, exactly the state this tool promises
 * is impossible.
 *
 * Align instead performs a single checkout of the already-resolved target and
 * lets a failure propagate. `resolveExpectedBranch()` has already done the
 * "last candidate that exists wins" work that the `||` chain expresses in CI.
 *
 * @param {string} target the resolved branch
 * @returns {string[]}
 * @throws {Error} if asked to check out a protected branch — a caller bug.
 */
export function buildAlignCheckoutCommands(target) {
  if (isProtectedBranch(target)) {
    throw new Error(`Refusing to build a checkout of the protected branch "${target}".`);
  }
  return ['git fetch --all --prune', `git checkout ${target}`];
}

/**
 * Flag a checkout that would move a module OFF a branch carrying commits
 * `origin/develop` does not have.
 *
 * The checkout itself is non-destructive to the repository — those commits stay
 * on their branch and nothing is lost from git. But the module that gets
 * INSTALLED is the working tree, so every one of those commits silently drops
 * out of the install. `com.etendoerp.psd2.bank.integration` sits 162 commits
 * ahead of develop, and `com.etendoerp.db.extended` carries the ETP-5077
 * pgvector work 11 commits ahead; moving either to `develop` produces an
 * install that looks aligned and quietly lacks that work.
 *
 * This is why `unpinnedPolicy` defaults to `report-only` — it is the safe
 * default, not merely the honest one.
 *
 * @returns {{name: string, branch: string, ahead: number, target: string, message: string}|null}
 *   null when there is nothing to warn about.
 */
export function aheadRiskFor({ name, branch, ahead, target }) {
  if (!ahead || ahead <= 0) return null;
  if (!target || target === branch) return null;
  return {
    name,
    branch,
    ahead,
    target,
    message: `WARNING: ${branch} is ${ahead} commit(s) AHEAD of origin/develop.`
      + ` Moving to ${target} keeps those commits on the branch but DROPS them from the`
      + ' INSTALLED module — the install would look aligned and silently lack that work.',
  };
}

// ---------------------------------------------------------------------------
// PURE: classification
// ---------------------------------------------------------------------------

/**
 * Classify every directory under <core>/modules against the profile.
 *
 * Statuses:
 *   OK       required, present, on the expected branch, clean
 *   DRIFT    required, present, clean, on a DIFFERENT branch (align fixes)
 *   DIRTY    required, present, but the worktree is dirty (BLOCKER — align
 *            must never check out over uncommitted work)
 *   MISSING  required, absent (align clones)
 *   STRAY    present but has neither .git nor AD_MODULE.xml, so it is not a
 *            module at all (BLOCKER — identity unknown)
 *   EXTRA    present, a real module, but not in the profile (align parks it)
 *   EXCLUDED present, deliberately out of scope, never touched
 *
 * @param {object} args
 * @param {{required: Array, excluded: Array}} args.profile from buildProfile()
 * @param {string[]} args.dirEntries directory names under <core>/modules
 * @param {Record<string, {hasGit: boolean, hasAdModule: boolean, branch: string|null,
 *   expectedBranch: string|null, dirty: boolean, ahead: number|null, behind: number|null,
 *   upstream: string|null, upstreamAhead: number|null, upstreamBehind: number|null,
 *   freshness: string}>} args.probes
 * @returns {{rows: Array, blockers: Array, counts: Record<string, number>}}
 */
export function classifyModules({ profile, dirEntries, probes, unpinnedPolicy }) {
  const policy = unpinnedPolicy ?? profile.unpinnedPolicy ?? DEFAULT_UNPINNED_POLICY;
  const requiredByName = new Map(profile.required.map((m) => [m.name, m]));
  const excludedByName = new Map(profile.excluded.map((m) => [m.name, m]));
  const rows = [];

  for (const name of [...dirEntries].sort()) {
    const probe = probes[name] || {};
    const excluded = excludedByName.get(name);
    const required = requiredByName.get(name);

    if (excluded) {
      rows.push({
        name, status: 'EXCLUDED', branch: probe.branch ?? null, expectedBranch: null,
        reason: excluded.reason, dirty: !!probe.dirty, ahead: probe.ahead ?? null, behind: probe.behind ?? null,
        upstream: probe.upstream ?? null, upstreamAhead: probe.upstreamAhead ?? null,
        upstreamBehind: probe.upstreamBehind ?? null, freshness: probe.freshness ?? 'NO-UPSTREAM',
      });
      continue;
    }

    if (!probe.hasGit && !probe.hasAdModule) {
      rows.push({
        name, status: 'STRAY', branch: null, expectedBranch: null, dirty: false, ahead: null, behind: null,
        upstream: null, upstreamAhead: null, upstreamBehind: null, freshness: 'NO-UPSTREAM',
        reason: 'Neither .git nor src-db/database/sourcedata/AD_MODULE.xml — not a module checkout.',
      });
      continue;
    }

    if (!required) {
      rows.push({
        name, status: 'EXTRA', branch: probe.branch ?? null, expectedBranch: null,
        dirty: !!probe.dirty, ahead: probe.ahead ?? null, behind: probe.behind ?? null,
        upstream: probe.upstream ?? null, upstreamAhead: probe.upstreamAhead ?? null,
        upstreamBehind: probe.upstreamBehind ?? null, freshness: probe.freshness ?? 'NO-UPSTREAM',
        reason: `Not required by profile "${profile.name}".`,
      });
      continue;
    }

    const base = {
      name,
      branch: probe.branch ?? null,
      expectedBranch: probe.expectedBranch ?? null,
      dirty: !!probe.dirty,
      ahead: probe.ahead ?? null,
      behind: probe.behind ?? null,
      upstream: probe.upstream ?? null,
      upstreamAhead: probe.upstreamAhead ?? null,
      upstreamBehind: probe.upstreamBehind ?? null,
      freshness: probe.freshness ?? 'NO-UPSTREAM',
    };

    if (!probe.hasGit) {
      rows.push({
        ...base,
        status: 'STRAY',
        reason: 'Required by the profile but has no .git — cannot be aligned to a branch.',
      });
      continue;
    }
    const dirt = classifyDirtyPaths(probe.dirtyPaths || []);
    if (dirt.dirty && !dirt.buildOnly) {
      rows.push({
        ...base,
        status: 'DIRTY',
        reason: `Uncommitted source changes — refusing to check out over them. ${summarizePaths(dirt.sourcePaths)}`,
      });
      continue;
    }
    if (dirt.buildOnly) {
      // Tracked gradle output only. A checkout restores it; no human work is lost.
      base.dirtyBuildOnly = true;
      base.reason = `Dirt confined to tracked gradle output — a checkout restores it. ${summarizePaths(dirt.buildPaths)}`;
    }
    if (required.branchPolicySource === 'ungrounded' && policy === 'report-only') {
      rows.push({
        ...base,
        status: 'UNPINNED',
        expectedBranch: null,
        reason: "Present from source, as the profile requires. Branch NOT asserted and NOT aligned:"
          + " this repo's Jenkinsfile never clones it (published JAR), so nothing here grounds an"
          + ' expected branch. Set unpinnedPolicy: "develop-then-branch" on the profile to align it.',
      });
      continue;
    }
    if (probe.expectedBranch && probe.branch !== probe.expectedBranch) {
      rows.push({
        ...base,
        status: 'DRIFT',
        reason: `On ${probe.branch}, CI would resolve ${probe.expectedBranch}.`
          + (base.dirtyBuildOnly ? ` (${base.reason})` : ''),
      });
      continue;
    }
    if (base.dirtyBuildOnly) {
      rows.push({ ...base, status: 'DIRTY-BUILD' });
      continue;
    }
    rows.push({ ...base, status: 'OK', reason: '' });
  }

  for (const m of profile.required) {
    if (dirEntries.includes(m.name)) continue;
    rows.push({
      name: m.name, status: 'MISSING', branch: null, expectedBranch: null, dirty: false,
      ahead: null, behind: null, url: m.url,
      upstream: null, upstreamAhead: null, upstreamBehind: null, freshness: 'NO-UPSTREAM',
      reason: `Required by profile "${profile.name}" but not present under modules/.`,
    });
  }

  const counts = {};
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;

  return {
    rows,
    // Only statuses `align` cannot resolve on its own are blockers.
    blockers: rows.filter((r) => r.status === 'DIRTY' || r.status === 'STRAY'),
    counts,
  };
}

// ---------------------------------------------------------------------------
// PURE: gradle.properties handling
// ---------------------------------------------------------------------------

/**
 * Parse a .properties blob into an ordered key/value map.
 * @returns {Map<string,string>}
 */
export function parseGradleProperties(text) {
  const out = new Map();
  for (const line of String(text).split('\n')) {
    const m = /^\s*([A-Za-z0-9_.\-]+)\s*=\s*(.*)$/.exec(line);
    if (m && !line.trimStart().startsWith('#')) out.set(m[1], m[2]);
  }
  return out;
}

/**
 * Build the parity gradle.properties as a MINIMAL diff of the local file.
 *
 * Deliberately NOT a rewrite: CI generates the file from scratch
 * (pipelines/Jenkinsfile:437-450) because its postgres is a clean sidecar,
 * but locally the DB is served by the pgvector container configured through
 * the `docker_*` / `etendo.db.*` keys, and gradle needs `org.gradle.java.home`
 * plus the nexus/github credentials. Dropping any of those breaks the build,
 * so everything in the local file is preserved verbatim and only the target
 * sid is overridden.
 *
 * @param {string} originalText local gradle.properties contents
 * @param {{sid: string}} args
 * @returns {{text: string, changes: Array<{key: string, from: string|null, to: string, kind: 'override'|'add'}>}}
 */
export function buildParityGradleProperties(originalText, { sid }) {
  const existing = parseGradleProperties(originalText);
  const changes = [];
  const lines = String(originalText).split('\n');

  const overrides = new Map([['bbdd.sid', sid]]);
  for (const [key, value] of Object.entries(CI_ADDED_PROPERTIES)) {
    if (!existing.has(key)) overrides.set(key, value);
  }

  const applied = new Set();
  const out = lines.map((line) => {
    const m = /^(\s*)([A-Za-z0-9_.\-]+)(\s*=\s*)(.*)$/.exec(line);
    if (!m || line.trimStart().startsWith('#')) return line;
    const [, indent, key, eq, value] = m;
    if (!overrides.has(key)) return line;
    const next = overrides.get(key);
    applied.add(key);
    if (value === next) return line;
    changes.push({ key, from: value, to: next, kind: 'override' });
    return `${indent}${key}${eq}${next}`;
  });

  const additions = [];
  for (const [key, value] of overrides) {
    if (applied.has(key)) continue;
    changes.push({ key, from: null, to: value, kind: 'add' });
    additions.push(`${key}=${value}`);
  }
  if (additions.length) {
    if (out.length && out[out.length - 1].trim() !== '') out.push('');
    out.push('# --- added by cli/src/ci-parity.js (CI parity) ---', ...additions, '');
  }

  return { text: out.join('\n'), changes };
}

/**
 * Render the parity changes as a redacted, human-readable diff.
 * Secret-looking keys never show a value, in either direction.
 */
export function renderPropertiesDiff(changes) {
  if (!changes.length) return '  (no changes — local gradle.properties already matches)';
  return changes
    .map(({ key, from, to, kind }) => (kind === 'add'
      ? `  + ${key}=${redactValue(key, to)}`
      : `  ~ ${key}: ${redactValue(key, from)} -> ${redactValue(key, to)}`))
    .join('\n');
}

/**
 * A database identifier PostgreSQL will accept unquoted and interpret literally.
 * Unquoted identifiers are folded to lower case by the server, so `Etendo2` and
 * `etendo2` are THE SAME DATABASE. Normalizing here — once, before the value
 * reaches the guard or any SQL — is what stops `BBDD_SID=Etendo2` from slipping
 * past a case-sensitive guard and dropping the developer's `etendo2`.
 */
export const SID_RE = /^[a-z_][a-z0-9_]*$/;

/**
 * Normalize and validate a target sid.
 *
 * Lower-cases first (matching PostgreSQL's own folding of unquoted identifiers),
 * then requires the result to be a plain identifier. Anything else — a quote, a
 * semicolon, a space, a hyphen — is refused rather than escaped, which also
 * closes the injection surface, since the sid is interpolated into a SQL string.
 *
 * @param {string} raw
 * @returns {{ok: true, sid: string, normalized: boolean} | {ok: false, message: string}}
 */
export function normalizeSid(raw) {
  const input = String(raw ?? '').trim();
  if (!input) {
    return { ok: false, message: 'Empty database sid. Pass BBDD_SID=<name>.' };
  }
  const sid = input.toLowerCase();
  if (!SID_RE.test(sid)) {
    return {
      ok: false,
      message: `Refusing the database sid "${input}": not a plain PostgreSQL identifier.`
        + `\n  Allowed: ${SID_RE} — a letter or underscore, then letters, digits or underscores.`
        + '\n  The sid is interpolated into SQL, so anything else is refused rather than escaped.',
    };
  }
  return { ok: true, sid, normalized: sid !== input };
}

/**
 * Guard the destructive phases against the developer's own dev database.
 *
 * Both sids are compared AFTER normalization, so `Etendo2` cannot slip past a
 * guard watching for `etendo2` — PostgreSQL folds unquoted identifiers, and an
 * unquoted `DROP DATABASE Etendo2` destroys `etendo2`.
 *
 * FAILS CLOSED: when the local sid cannot be read (missing or unreadable
 * gradle.properties) there is nothing to compare against, so the destructive
 * phases are refused rather than allowed through.
 *
 * @param {{targetSid: string, localSid: string|undefined, allowLocalSid: boolean}} args
 * @returns {{ok: boolean, warn: string|null, message: string|null}}
 */
export function assertSidGuard({ targetSid, localSid, allowLocalSid }) {
  if (!localSid) {
    return {
      ok: false,
      warn: null,
      message: 'Refusing to run: could not read bbdd.sid from etendo_core/gradle.properties,'
        + ' so there is no way to tell whether the target sid is your local dev database.'
        + '\n  The db/install phases DROP the target database, so this fails CLOSED.'
        + '\n  Fix: make sure etendo_core/gradle.properties exists and defines bbdd.sid.',
    };
  }
  const target = String(targetSid).toLowerCase();
  const local = String(localSid).trim().toLowerCase();
  if (target !== local) return { ok: true, warn: null, message: null };
  if (allowLocalSid) {
    return {
      ok: true,
      warn: `ALLOW_LOCAL_SID=1 — target sid "${targetSid}" IS your local dev database from`
        + ' gradle.properties. It will be DROPPED and rebuilt from scratch. All local data is lost.',
      message: null,
    };
  }
  return {
    ok: false,
    warn: null,
    message: `Refusing to run: target sid "${targetSid}" is the sid currently configured in`
      + ' etendo_core/gradle.properties, i.e. your local dev database. The db/install phases DROP'
      + ' that database.'
      + (String(targetSid) !== target
        ? `\n  (Matched after case-folding: PostgreSQL folds unquoted identifiers, so "${targetSid}"`
          + ` and "${local}" are the same database.)`
        : '')
      + '\n  Fix: pass an isolated sid, e.g. BBDD_SID=' + DEFAULT_BBDD_SID
      + '\n  Override (destroys local data): ALLOW_LOCAL_SID=1',
  };
}

// ---------------------------------------------------------------------------
// PURE: plan building
// ---------------------------------------------------------------------------

/**
 * Build the ordered step plan for the `align` phase.
 * Never deletes: EXTRA/STRAY dirs are MOVED to <core>/.modules-disabled/.
 * Never checks out over a dirty worktree, and never checks out a protected
 * branch (develop/main) — both are reported as manual instead.
 *
 * @returns {Array<{kind: string, description: string, commands: string[], cwd: string,
 *   blocked?: boolean, reason?: string}>}
 */
export function buildAlignPlan({
  rows, profile, coreDir, gitBranch, branchPolicy, timestamp,
}) {
  const steps = [];
  const modulesDir = path.join(coreDir, 'modules');
  const parkDir = path.join(coreDir, '.modules-disabled');
  const requiredByName = new Map(profile.required.map((m) => [m.name, m]));

  for (const row of rows) {
    // DIRTY-BUILD needs no step of its own when the branch already matches: the
    // dirt is tracked gradle output, restored by any later checkout.
    if (row.status === 'OK' || row.status === 'UNPINNED' || row.status === 'DIRTY-BUILD') continue;

    if (row.status === 'EXCLUDED') {
      steps.push({
        kind: 'skip', description: `SKIPPED ${row.name} — excluded by profile`, commands: [],
        cwd: modulesDir, reason: row.reason,
      });
      continue;
    }

    if (row.status === 'DIRTY') {
      steps.push({
        kind: 'blocked', description: `BLOCKED ${row.name} — dirty worktree`, commands: [],
        cwd: path.join(modulesDir, row.name), blocked: true,
        reason: `${row.reason} Commit or stash inside ${row.name}, then re-run.`,
      });
      continue;
    }

    // A module the profile REQUIRES must never be parked, whatever else is
    // wrong with it. Today a required dir with AD_MODULE.xml but no .git
    // classifies as STRAY, and parking it would move a required module into
    // .modules-disabled/. That is unreachable right now only because STRAY is
    // also a blocker and main() refuses to execute with blockers present — a
    // trap primed for whoever adds --force. Refuse it here, at the point of
    // decision, rather than relying on a guard two layers away.
    if (requiredByName.has(row.name) && (row.status === 'STRAY' || row.status === 'EXTRA')) {
      steps.push({
        kind: 'blocked',
        description: `BLOCKED ${row.name} — required by the profile but not a usable checkout`,
        commands: [], cwd: path.join(modulesDir, row.name), blocked: true,
        reason: `${row.reason} Refusing to park a REQUIRED module: re-clone it or restore its .git`
          + ' by hand. (Parking would move a module the profile requires into .modules-disabled/.)',
      });
      continue;
    }

    if (row.status === 'STRAY') {
      steps.push({
        kind: 'park', description: `PARK ${row.name} — stray directory (moved, never deleted)`,
        commands: [
          `mkdir -p ${parkDir}`,
          `mv ${path.join(modulesDir, row.name)} ${path.join(parkDir, `${row.name}.${timestamp}`)}`,
        ],
        cwd: coreDir,
        reason: row.reason,
      });
      continue;
    }

    if (row.status === 'EXTRA') {
      steps.push({
        kind: 'park', description: `PARK ${row.name} — not in profile (moved, never deleted)`,
        commands: [
          `mkdir -p ${parkDir}`,
          `mv ${path.join(modulesDir, row.name)} ${path.join(parkDir, `${row.name}.${timestamp}`)}`,
        ],
        cwd: coreDir,
        reason: row.reason,
      });
      continue;
    }

    const mod0 = requiredByName.get(row.name);
    const chain = mod0?.branchPolicySource === 'ungrounded'
      ? unpinnedCheckoutChain({ gitBranch, branchPolicy })
      : expectedCheckoutChain({ repoKind: 'module', moduleName: row.name, gitBranch, branchPolicy });
    const target = row.expectedBranch || chain.candidates[chain.candidates.length - 1];

    const aheadRisk = aheadRiskFor({
      name: row.name, branch: row.branch, ahead: row.ahead, target,
    });

    if (isProtectedBranch(target)) {
      steps.push({
        kind: 'blocked',
        description: `MANUAL ${row.name} — CI resolves the protected branch "${target}"`
          + (aheadRisk ? `  [+${aheadRisk.ahead} ahead of develop]` : ''),
        commands: [], cwd: path.join(modulesDir, row.name), blocked: true,
        aheadRisk,
        reason: `This tool never checks out ${PROTECTED_BRANCHES.join('/')}. Do it yourself if you want it.`
          + (aheadRisk ? ` ${aheadRisk.message}` : ''),
      });
      continue;
    }

    if (row.status === 'MISSING') {
      const mod = requiredByName.get(row.name);
      const ungrounded = mod.branchPolicySource === 'ungrounded';
      steps.push({
        kind: 'clone',
        description: ungrounded
          ? `CLONE ${row.name} -> remote default branch (no branch asserted)`
          : `CLONE ${row.name} -> ${target}`,
        commands: [
          `git clone ${mod.url} ${row.name}`,
          ...(ungrounded ? [] : [`git -C ${row.name} checkout ${target}`]),
        ],
        cwd: modulesDir,
        reason: ungrounded
          ? `${mod.reason} No checkout follows: this repo's Jenkinsfile does not clone it, so no expected branch is grounded.`
          : mod.reason,
      });
      continue;
    }

    steps.push({
      kind: 'checkout',
      description: `CHECKOUT ${row.name}: ${row.branch} -> ${target}`
        + (aheadRisk ? `  [+${aheadRisk.ahead} ahead of develop]` : ''),
      commands: buildAlignCheckoutCommands(target),
      cwd: path.join(modulesDir, row.name),
      aheadRisk,
      reason: aheadRisk ? `${row.reason} ${aheadRisk.message}`.trim() : row.reason,
    });
  }

  return steps;
}

/**
 * Build the ordered step plan for the `db` phase.
 *
 * The ONLY database action is to make sure the target database does not
 * exist, so `./gradlew install` creates it fresh — mirroring CI's empty
 * postgres sidecar. There is deliberately no createdb/create.database step:
 * `install` owns creation.
 */
export function buildDbPlan({ dbConfig, sid }) {
  const { host, port, systemUser } = dbConfig;
  const baseArgs = ['-h', host, '-p', String(port), '-U', systemUser, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  const display = `PGPASSWORD=${REDACTED} psql ${baseArgs.join(' ')}`;

  // `sid` has already passed normalizeSid(), so it is a plain lower-case
  // identifier: safe to interpolate, and it cannot fold onto a different
  // database than the guard compared against.
  const terminateSql = 'SELECT pg_terminate_backend(pid) FROM pg_stat_activity'
    + ` WHERE datname = '${sid}' AND pid <> pg_backend_pid();`;
  const dropSql = `DROP DATABASE IF EXISTS ${sid};`;

  // Each step carries BOTH a printable form and an executable form. The
  // executable form is argv (no shell) with the password delivered through the
  // process environment, so the secret is never part of a string that gets
  // printed, logged, or word-split. `commands` is display-only.
  return [
    {
      kind: 'db-terminate',
      description: `Terminate open backends on "${sid}" (a live connection blocks DROP DATABASE)`,
      commands: [`${display} -c "${terminateSql}"`],
      exec: [{ file: 'psql', args: [...baseArgs, '-c', terminateSql], secretEnv: ['PGPASSWORD'] }],
      cwd: null,
    },
    {
      kind: 'db-drop',
      description: `DROP DATABASE IF EXISTS "${sid}" — install recreates it, exactly like CI's empty postgres sidecar`,
      commands: [`${display} -c "${dropSql}"`],
      exec: [{ file: 'psql', args: [...baseArgs, '-c', dropSql], secretEnv: ['PGPASSWORD'] }],
      cwd: null,
      reason: 'No createdb step follows on purpose: ./gradlew install owns database creation.',
    },
  ];
}

/**
 * Build the ordered step plan for the `install` phase.
 * The gradle.properties swap is always restored, including on failure and on
 * SIGINT — see runInstall().
 */
export function buildInstallPlan({ coreDir, logDir }) {
  const props = path.join(coreDir, 'gradle.properties');
  const backup = path.join(logDir, 'gradle.properties.backup');
  return [
    {
      kind: 'props-backup',
      description: 'Back up gradle.properties into the run log dir (NOT beside the original —'
        + " etendo_core/.gitignore would not cover a suffixed sibling, and it holds every secret)",
      commands: [`cp ${props} ${backup}`],
      cwd: coreDir,
    },
    {
      kind: 'props-write',
      description: 'Write the parity gradle.properties (minimal diff, secrets preserved in place)',
      commands: [`write ${props}`],
      cwd: coreDir,
    },
    ...CI_GRADLE_COMMANDS.map((cmd) => ({
      kind: 'gradle', description: cmd, commands: [cmd], cwd: coreDir,
    })),
    {
      kind: 'props-restore',
      description: 'ALWAYS restore the original gradle.properties, then DELETE the backup'
        + ' (finally + SIGINT/SIGTERM trap)',
      commands: [`cp ${backup} ${props}`, `rm ${backup}`],
      cwd: coreDir,
    },
  ];
}

// ---------------------------------------------------------------------------
// IMPURE: probes
// ---------------------------------------------------------------------------

const GIT_CONTEXT_VARS = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX',
  'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES',
];

function isolatedGitEnv() {
  const env = { ...process.env };
  for (const key of GIT_CONTEXT_VARS) delete env[key];
  return env;
}

function git(cwd, args, { trim = true } = {}) {
  try {
    const out = execFileSync('git', args, {
      cwd, env: isolatedGitEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    // trim:false matters for `status --porcelain`, whose status field is two
    // columns wide and often starts with a significant SPACE (' D' = deleted,
    // not staged). Trimming that away shifts the first path by one character.
    return trim ? out.trim() : out;
  } catch {
    return null;
  }
}

/**
 * Turn the two rev-list counts against a branch's OWN upstream into a verdict.
 *
 * This deliberately does not use the CI/develop delta. A feature branch can be
 * many commits ahead of develop and still be perfectly current with its own
 * remote branch; conversely, a develop checkout can be stale while its
 * develop delta looks zero because origin has not been fetched yet.
 */
export function upstreamFreshness({ upstream, upstreamAhead, upstreamBehind }) {
  if (!upstream) return 'NO-UPSTREAM';
  if (upstreamAhead === null || upstreamBehind === null) return 'UNKNOWN';
  if (upstreamBehind > 0 && upstreamAhead > 0) return 'DIVERGED';
  if (upstreamBehind > 0) return 'STALE';
  if (upstreamAhead > 0) return 'AHEAD';
  return 'CURRENT';
}

/** Fetch one checkout's remote refs, returning an explicit result for the report. */
export function fetchRepo(dir, { gitRun = git, exists = existsSync } = {}) {
  if (!exists(path.join(dir, '.git'))) return { attempted: false, ok: null };
  return { attempted: true, ok: gitRun(dir, ['fetch', '--all', '--prune']) !== null };
}

/** Probe one git repo: branch, dirtiness, CI delta, and own-upstream freshness. */
export function probeRepo(dir, { gitRun = git, exists = existsSync } = {}) {
  const hasGit = exists(path.join(dir, '.git'));
  const hasAdModule = exists(path.join(dir, 'src-db', 'database', 'sourcedata', 'AD_MODULE.xml'));
  if (!hasGit) {
    return {
      hasGit, hasAdModule, branch: null, dirty: false, dirtyPaths: [], branches: [], ahead: null, behind: null,
      upstream: null, upstreamAhead: null, upstreamBehind: null, freshness: 'NO-UPSTREAM',
    };
  }

  const branch = gitRun(dir, ['branch', '--show-current']) || '(detached)';
  const status = gitRun(dir, ['status', '--porcelain'], { trim: false });
  const branches = (gitRun(dir, ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes/origin']) || '')
    .split('\n').map((s) => s.replace(/^origin\//, '').trim()).filter(Boolean);
  const behind = Number(gitRun(dir, ['rev-list', '--count', 'HEAD..origin/develop']) ?? NaN);
  const ahead = Number(gitRun(dir, ['rev-list', '--count', 'origin/develop..HEAD']) ?? NaN);
  const upstream = gitRun(dir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']) || null;
  const upstreamBehind = upstream === null ? null : Number(gitRun(dir, ['rev-list', '--count', `HEAD..${upstream}`]) ?? NaN);
  const upstreamAhead = upstream === null ? null : Number(gitRun(dir, ['rev-list', '--count', `${upstream}..HEAD`]) ?? NaN);
  const normalizedUpstreamBehind = Number.isFinite(upstreamBehind) ? upstreamBehind : null;
  const normalizedUpstreamAhead = Number.isFinite(upstreamAhead) ? upstreamAhead : null;

  const dirtyPaths = parsePorcelainPaths(status);
  return {
    hasGit,
    hasAdModule,
    branch,
    dirty: dirtyPaths.length > 0,
    dirtyPaths,
    branches: dedupe(branches),
    ahead: Number.isFinite(ahead) ? ahead : null,
    behind: Number.isFinite(behind) ? behind : null,
    upstream,
    upstreamAhead: normalizedUpstreamAhead,
    upstreamBehind: normalizedUpstreamBehind,
    freshness: upstreamFreshness({
      upstream, upstreamAhead: normalizedUpstreamAhead, upstreamBehind: normalizedUpstreamBehind,
    }),
  };
}

// ---------------------------------------------------------------------------
// IMPURE: rendering
// ---------------------------------------------------------------------------

const LIGHT = {
  OK: 'green', DRIFT: 'yellow', EXTRA: 'yellow', EXCLUDED: 'grey',
  MISSING: 'yellow', DIRTY: 'RED', STRAY: 'RED', UNPINNED: 'grey',
  'DIRTY-BUILD': 'yellow',
};
const MARK = {
  green: '[ OK ]', yellow: '[WARN]', RED: '[FAIL]', grey: '[ -- ]',
};

function statusMark(status) {
  return MARK[LIGHT[status]] || '[ ?? ]';
}

function pad(s, n) {
  const v = String(s ?? '');
  return v.length >= n ? v : v + ' '.repeat(n - v.length);
}

function renderTable(rows) {
  const out = [];
  out.push(`  ${pad('', 6)} ${pad('MODULE', 42)} ${pad('STATUS', 12)} ${pad('BRANCH', 22)} ${pad('EXPECTED', 22)} ${pad('CI Δ', 13)} ${pad('UPSTREAM Δ', 15)} FRESHNESS`);
  out.push(`  ${'-'.repeat(150)}`);
  for (const r of rows) {
    const ciDelta = r.ahead === null && r.behind === null ? '-' : `+${r.ahead ?? '?'}/-${r.behind ?? '?'}`;
    const upstreamDelta = r.upstreamAhead === null && r.upstreamBehind === null
      ? '-' : `+${r.upstreamAhead ?? '?'}/-${r.upstreamBehind ?? '?'}`;
    out.push(
      `  ${pad(statusMark(r.status), 6)} ${pad(r.name, 42)} ${pad(r.status, 12)} `
      + `${pad(r.branch ?? '-', 22)} ${pad(r.expectedBranch ?? '-', 22)} ${pad(ciDelta, 13)} `
      + `${pad(upstreamDelta, 15)} ${r.freshness ?? 'NO-UPSTREAM'}`,
    );
  }
  return out.join('\n');
}

function renderSteps(steps) {
  if (!steps.length) return '  (nothing to do)';
  const out = [];
  for (const [i, s] of steps.entries()) {
    const tag = s.blocked ? 'BLOCKED' : s.kind.toUpperCase();
    out.push(`  ${String(i + 1).padStart(2)}. [${tag}] ${s.description}`);
    if (s.reason) out.push(`      why: ${s.reason}`);
    if (s.cwd) out.push(`      cwd: ${s.cwd}`);
    for (const c of s.commands) out.push(`      $ ${c}`);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// IMPURE: execution
// ---------------------------------------------------------------------------

/**
 * Collect the secret values a step asked for, by env var name.
 *
 * Kept in one place, and exported, so the complete set of things that can carry
 * a secret into a child process is both auditable and directly testable. A step
 * names an env var; only this function knows how to resolve it to a value.
 *
 * @param {string[]} names env var names a step declared in `secretEnv`
 * @param {Map<string,string>} props parsed gradle.properties
 * @returns {Record<string,string>} env fragment (empty when nothing was asked for)
 */
export function secretEnvValues(names, props) {
  const env = {};
  for (const name of names || []) {
    if (name === 'PGPASSWORD') env.PGPASSWORD = props?.get('bbdd.systemPassword') ?? '';
  }
  return env;
}

/**
 * Run one child process, STREAMING its output straight to this terminal.
 *
 * `stdio: inherit` is deliberate and load-bearing:
 *   - it removes the 1 MB `maxBuffer` ceiling by construction. `./gradlew
 *     install --info --stacktrace` emits far more than that, and a buffered
 *     child is killed with ENOBUFS mid-migration, leaving a half-built database.
 *   - it makes a 20-minute gradle run watchable instead of silent until the end.
 *
 * Because the child writes directly to the terminal, its output never passes
 * through this process and is therefore never written to the run log. That is
 * intentional: gradle `--info` can echo property values, and a log file this
 * code cannot redact is a worse outcome than a log that records only what was
 * run. The log keeps the command line and the exit status.
 *
 * Exported, with `execFile` and `write` injectable, purely so the executable
 * path is testable. Without a seam here the only way to reach this code is to
 * run the real CLI against the real etendo_core — real gradle.properties, real
 * git — which would put live credentials into test output. The two invariants
 * worth pinning are exactly where the original leak lived: that `secretEnv`
 * resolves into the CHILD ENV, and that what gets echoed and logged is
 * `display`, never a resolved command string. Defaults preserve behavior
 * exactly; this is a testability change, not a behavioral one.
 *
 * @param {{file?: string, args?: string[], shell?: string, secretEnv?: string[]}} step
 * @param {{cwd?: string, logPath?: string, display: string,
 *          props?: Map<string,string>, execFile?: Function, write?: Function}} options
 */
export function runChild({
  file, args, shell, secretEnv,
}, {
  cwd, logPath, display, props, execFile = execFileSync, write = writeStdout,
}) {
  // `display` never contains a secret: db steps hand us argv plus an env name,
  // so the password exists only inside `env` below.
  write(`  $ ${display}\n`);
  const env = { ...isolatedGitEnv(), ...secretEnvValues(secretEnv, props) };
  const spawnFile = shell ? '/bin/sh' : file;
  const spawnArgs = shell ? ['-c', shell] : args;
  try {
    execFile(spawnFile, spawnArgs, {
      cwd: cwd || process.cwd(),
      env,
      stdio: ['ignore', 'inherit', 'inherit'],
      maxBuffer: Infinity,
    });
    appendLog(logPath, `$ ${display}\n  -> ok\n`);
  } catch (e) {
    appendLog(logPath, `$ ${display}\n  -> FAILED (status ${e.status ?? '?'})\n`);
    throw e;
  }
}

function writeStdout(s) {
  process.stdout.write(s);
}

/** Convenience wrapper for a plain shell command with no secrets. */
function runShell(command, cwd, logPath, props) {
  return runChild({ shell: command }, {
    cwd, logPath, display: command, props,
  });
}

function appendLog(logPath, text) {
  if (!logPath) return;
  try {
    writeFileSync(logPath, redactProperties(text), { flag: 'a' });
  } catch { /* logging must never break a run */ }
}

/**
 * Execute the install phase with a guaranteed gradle.properties restore.
 * Registers a SIGINT/SIGTERM handler so Ctrl-C also restores.
 */
function runInstall({
  coreDir, parityText, logDir, logPath, propsMap,
}) {
  const props = path.join(coreDir, 'gradle.properties');
  // The backup lives in the run's log dir, NOT beside gradle.properties.
  // etendo_core/.gitignore ignores `gradle.properties` but not a suffixed
  // sibling, so a backup left there shows up as untracked and is one
  // `git add .` away from committing all 10 secret-bearing keys.
  const backup = path.join(logDir, 'gradle.properties.backup');
  let swapped = false;

  const restore = () => {
    if (!swapped) return;
    try {
      copyFileSync(backup, props);
      swapped = false;
      // Consume the backup once the original is safely back: it holds every
      // secret in gradle.properties and has no reason to outlive the run.
      try {
        unlinkSync(backup);
      } catch { /* best effort — the restore already succeeded */ }
      process.stdout.write(`  restored ${props} and removed the backup copy\n`);
    } catch (e) {
      process.stderr.write(`  !! FAILED to restore gradle.properties: ${e.message}\n`
        + `  !! Your original is at ${backup} — restore it by hand.\n`
        + '  !! It contains secrets: delete it once restored.\n');
    }
  };
  const onSignal = (sig) => {
    process.stderr.write(`\n  received ${sig} — restoring gradle.properties before exit\n`);
    restore();
    process.exit(130);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    copyFileSync(props, backup);
    writeFileSync(props, parityText);
    swapped = true;
    process.stdout.write(`  wrote parity gradle.properties (backup: ${backup})\n`);
    for (const cmd of CI_GRADLE_COMMANDS) runShell(cmd, coreDir, logPath, propsMap);
  } finally {
    restore();
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const args = {
    phases: [...PHASES],
    profile: process.env.PROFILE || DEFAULT_PROFILE,
    sid: process.env.BBDD_SID || DEFAULT_BBDD_SID,
    // DRY RUN IS THE DEFAULT: only the exact string '0' turns it off.
    dryRun: process.env.DRY_RUN !== '0',
    allowLocalSid: process.env.ALLOW_LOCAL_SID === '1',
    noFetch: process.env.NO_FETCH === '1',
    json: process.env.JSON === '1',
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--phases') args.phases = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--profile') args.profile = argv[++i];
    else if (a === '--bbdd-sid') args.sid = argv[++i];
    else if (a === '--dry-run') args.dryRun = argv[++i] !== '0';
    else if (a === '--allow-local-sid') args.allowLocalSid = true;
    else if (a === '--no-fetch') args.noFetch = true;
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  for (const p of args.phases) {
    if (!PHASES.includes(p)) throw new Error(`Unknown phase "${p}". Valid: ${PHASES.join(', ')}`);
  }
  // Normalize and validate the sid ONCE, here, before it can reach the guard,
  // a SQL string, or the gradle.properties override. PostgreSQL folds unquoted
  // identifiers, so `Etendo2` and `etendo2` name the same database; comparing
  // the raw strings let `BBDD_SID=Etendo2` walk past a guard watching for
  // `etendo2` and drop the developer's dev database.
  const sid = normalizeSid(args.sid);
  if (!sid.ok) throw new Error(sid.message);
  args.sidRaw = args.sid;
  args.sid = sid.sid;
  args.sidNormalized = sid.normalized;
  return args;
}

const HELP = `Usage: node cli/src/ci-parity.js [options]

Brings the LOCAL Etendo checkout into parity with what CI installs, then
optionally drops an isolated database and runs CI's four gradle commands.

Options:
  --phases <list>     Comma-separated subset of: ${PHASES.join(',')}  (default: all)
  --profile <name>    Module profile: union | schema-forge-ci | go  (default: ${DEFAULT_PROFILE})
  --bbdd-sid <sid>    Target database (default: ${DEFAULT_BBDD_SID})
  --dry-run 0         ACTUALLY EXECUTE. Dry run is the default.
  --allow-local-sid   Permit a target sid equal to your local dev sid (destroys it)
  --no-fetch          Use cached remote refs; freshness may be stale (NO_FETCH=1)
  --json              Machine-readable report (secrets redacted)
  -h, --help          This text

Docs: docs/ci-parity-install.md
`;

function loadConfig() {
  const configPath = path.join(REPO_ROOT, 'pipelines', 'ci-parity-profiles.json');
  if (!existsSync(configPath)) throw new Error(`Missing profile config: ${configPath}`);
  return { config: JSON.parse(readFileSync(configPath, 'utf8')), configPath };
}

function listModuleDirs(modulesDir) {
  return readdirSync(modulesDir)
    .filter((n) => !n.startsWith('.') && statSync(path.join(modulesDir, n)).isDirectory());
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const { config, configPath } = loadConfig();
  const { coreDir, layout } = resolveCoreDir(REPO_ROOT);
  const modulesDir = path.join(coreDir, 'modules');
  const branchPolicy = config.branchPolicy;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logDir = path.join(REPO_ROOT, 'tmp', 'ci-parity', timestamp);
  const logPath = path.join(logDir, 'run.log');

  // --- load the two module lists ------------------------------------------
  const listContents = {};
  for (const [id, spec] of Object.entries(config.moduleListFiles)) {
    const p = resolveListPath(spec, { repoRoot: REPO_ROOT, coreDir });
    listContents[id] = existsSync(p) ? readFileSync(p, 'utf8') : '';
    if (!existsSync(p)) process.stderr.write(`  warning: module list not found: ${p}\n`);
  }
  const profile = buildProfile({ profileName: args.profile, config, listContents });

  // --- refresh refs, then probe every repo --------------------------------
  // Fetching is intentionally ahead of every rev-list measurement: a cached
  // origin ref cannot answer whether the local checkout is current. It does
  // not alter a worktree, index, branch, or commit; NO_FETCH=1 is the explicit
  // offline escape hatch and is disclosed in both human and JSON output.
  const dirEntries = listModuleDirs(modulesDir);
  const refreshResults = [];
  if (!args.noFetch) {
    for (const [name, dir] of [
      ['etendo_core', coreDir],
      ['etendo_schema_forge', REPO_ROOT],
      ...dirEntries.map((name) => [name, path.join(modulesDir, name)]),
    ]) {
      const result = fetchRepo(dir);
      if (result.attempted) refreshResults.push({ name, ...result });
    }
  }
  const refresh = {
    mode: args.noFetch
      ? 'cached (NO_FETCH=1)'
      : (refreshResults.some((r) => !r.ok) ? 'fetch failed (cached refs)' : 'fetched'),
    fetched: refreshResults.filter((r) => r.ok).map((r) => r.name),
    failed: refreshResults.filter((r) => !r.ok).map((r) => r.name),
  };
  const gitBranch = git(REPO_ROOT, ['branch', '--show-current']) || '(detached)';
  const probes = {};
  for (const name of dirEntries) {
    const p = probeRepo(path.join(modulesDir, name));
    const req = profile.required.find((m) => m.name === name);
    const ungrounded = req && req.branchPolicySource === 'ungrounded';
    // Only assert an expected branch when a readable Jenkinsfile grounds it, or
    // when the profile explicitly opts ungrounded modules into a policy.
    const chain = ungrounded
      ? unpinnedCheckoutChain({ gitBranch, branchPolicy })
      : expectedCheckoutChain({ repoKind: 'module', moduleName: name, gitBranch, branchPolicy });
    const asserts = req && (!ungrounded || profile.unpinnedPolicy === 'develop-then-branch');
    p.expectedBranch = asserts ? resolveExpectedBranch(chain.candidates, p.branches) : null;
    probes[name] = p;
  }

  const classification = classifyModules({
    profile, dirEntries, probes, unpinnedPolicy: profile.unpinnedPolicy,
  });

  // --- the two host repos themselves --------------------------------------
  const coreProbe = probeRepo(coreDir);
  const coreChain = expectedCheckoutChain({ repoKind: 'core', gitBranch, branchPolicy });
  const sfProbe = probeRepo(REPO_ROOT);
  const sfChain = expectedCheckoutChain({ repoKind: 'schema-forge', gitBranch, branchPolicy });
  const hostRepos = [
    {
      name: 'etendo_core',
      branch: coreProbe.branch,
      expectedBranch: resolveExpectedBranch(coreChain.candidates, coreProbe.branches),
      dirty: coreProbe.dirty,
      ahead: coreProbe.ahead,
      behind: coreProbe.behind,
      upstream: coreProbe.upstream,
      upstreamAhead: coreProbe.upstreamAhead,
      upstreamBehind: coreProbe.upstreamBehind,
      freshness: coreProbe.freshness,
      chain: coreChain.commands,
    },
    {
      name: 'etendo_schema_forge',
      branch: sfProbe.branch,
      expectedBranch: resolveExpectedBranch(sfChain.candidates, sfProbe.branches),
      dirty: sfProbe.dirty,
      ahead: sfProbe.ahead,
      behind: sfProbe.behind,
      upstream: sfProbe.upstream,
      upstreamAhead: sfProbe.upstreamAhead,
      upstreamBehind: sfProbe.upstreamBehind,
      freshness: sfProbe.freshness,
      chain: sfChain.commands,
    },
  ].map((r) => ({
    ...r,
    status: r.dirty ? 'DIRTY' : (r.expectedBranch && r.branch !== r.expectedBranch ? 'DRIFT' : 'OK'),
  }));

  // --- db config -----------------------------------------------------------
  const propsPath = path.join(coreDir, 'gradle.properties');
  const propsText = existsSync(propsPath) ? readFileSync(propsPath, 'utf8') : '';
  const props = parseGradleProperties(propsText);
  const dbConfig = {
    // No bbdd.host key exists in the local file; CI does not set one either.
    host: props.get('bbdd.host') || 'localhost',
    port: props.get('bbdd.port') || '5432',
    systemUser: props.get('bbdd.systemUser') || 'postgres',
  };
  const localSid = props.get('bbdd.sid');
  const guard = assertSidGuard({ targetSid: args.sid, localSid, allowLocalSid: args.allowLocalSid });

  // --- plans ---------------------------------------------------------------
  const wants = (p) => args.phases.includes(p);
  const alignPlan = wants('align')
    ? buildAlignPlan({
      rows: classification.rows, profile, coreDir, gitBranch, branchPolicy, timestamp,
    })
    : [];
  const parity = buildParityGradleProperties(propsText, { sid: args.sid });
  const dbPlan = wants('db') && guard.ok ? buildDbPlan({ dbConfig, sid: args.sid }) : [];
  const installPlan = wants('install') && guard.ok ? buildInstallPlan({ coreDir, logDir }) : [];

  const needsGuard = wants('db') || wants('install');
  const exitCode = (classification.blockers.length ? 1 : 0) || (needsGuard && !guard.ok ? 1 : 0);

  // --- JSON output ---------------------------------------------------------
  if (args.json) {
    process.stdout.write(`${JSON.stringify(redactObject({
      generatedAt: new Date().toISOString(),
      dryRun: args.dryRun,
      refresh,
      layout,
      coreDir,
      gitBranch,
      profile: {
        name: profile.name,
        description: profile.description,
        reason: profile.reason,
        unpinnedPolicy: profile.unpinnedPolicy,
        required: profile.required.map((m) => m.name),
        excluded: profile.excluded,
        publishedJarWarn: profile.publishedJarWarn,
      },
      hostRepos,
      modules: classification.rows,
      counts: classification.counts,
      blockers: classification.blockers.map((b) => ({ name: b.name, status: b.status, reason: b.reason })),
      database: { target: args.sid, ...dbConfig, guard },
      phases: args.phases,
      plan: {
        align: alignPlan,
        db: dbPlan,
        install: installPlan,
        gradlePropertiesChanges: parity.changes.map((c) => ({
          key: c.key, kind: c.kind, from: redactValue(c.key, c.from), to: redactValue(c.key, c.to),
        })),
      },
      exitCode,
    }), null, 2)}\n`);
    return exitCode;
  }

  // --- human output --------------------------------------------------------
  const W = (s) => process.stdout.write(`${s}\n`);
  W('=========================================================================');
  W(`  CI PARITY  ${args.dryRun ? '(DRY RUN — nothing will be executed)' : '*** LIVE RUN ***'}`);
  W('=========================================================================');
  W(`  profile     : ${profile.name} — ${profile.description}`);
  W(`  layout      : ${layout}`);
  W(`  core dir    : ${coreDir}`);
  W(`  driving br. : ${gitBranch}  (schema-forge, plays $GIT_BRANCH)`);
  W(`  phases      : ${args.phases.join(', ')}`);
  W(`  unpinned    : ${profile.unpinnedPolicy}${profile.unpinnedPolicy === 'report-only' ? '  (ungrounded modules reported, NOT aligned)' : '  (ungrounded modules aligned to develop-then-branch)'}`);
  W(`  refs        : ${refresh.mode}${args.noFetch || refresh.failed.length
    ? ' — freshness is based on cached remote refs'
    : ` (${refresh.fetched.length} fetched)`}`);
  if (refresh.failed.length) W(`  !! fetch failed: ${refresh.failed.join(', ')} — those freshness results may be stale`);
  W(`  target sid  : ${args.sid}`
    + (args.sidNormalized ? `  (normalized from "${args.sidRaw}" — PostgreSQL folds unquoted identifiers)` : '')
    + (String(localSid).toLowerCase() === args.sid ? '  <-- SAME AS LOCAL DEV SID' : ''));
  W(`  config      : ${path.relative(REPO_ROOT, configPath)}`);
  W('');

  W('-- HOST REPOS -----------------------------------------------------------');
  W(renderTable(hostRepos));
  W('');

  W('-- MODULES --------------------------------------------------------------');
  W(renderTable(classification.rows));
  W('');
  W(`  totals: ${Object.entries(classification.counts).map(([k, v]) => `${k}=${v}`).join('  ')}`);
  W('');

  if (profile.publishedJarWarn.length) {
    W('-- WARN: PUBLISHED-JAR MODULES -----------------------------------------');
    W(`  ${profile.publishedJarWarn.length} module(s) are required from SOURCE by this profile but are`);
    W("  absent from pipelines/extra-modules.txt, so THIS repo's CI resolves them");
    W('  as published JARs. Local source changes to them are NOT exercised there:');
    for (const m of profile.publishedJarWarn) W(`    - ${m.name}`);
    const dbx = profile.publishedJarWarn.find((m) => m.name === 'com.etendoerp.db.extended');
    if (dbx) {
      W('');
      W('  !! com.etendoerp.db.extended as a published JAR would NOT carry the');
      W('     ETP-5077 pgvector work that only exists on its local source branch.');
    }
    W('');
  }

  if (classification.blockers.length) {
    W('-- BLOCKERS (align cannot resolve these) -------------------------------');
    for (const b of classification.blockers) W(`  [FAIL] ${b.name} (${b.status}): ${b.reason}`);
    W('');
  }

  if (wants('align')) {
    W('-- PHASE: align ---------------------------------------------------------');
    W('  Never deletes. EXTRA/STRAY dirs are MOVED to <core>/.modules-disabled/.');
    const risky = alignPlan.filter((s) => s.aheadRisk);
    if (risky.length) {
      W('');
      W('  !! WORK-LOSS RISK: this plan moves module(s) OFF a branch that carries');
      W('     commits origin/develop does not have. The commits stay on the branch,');
      W('     but they DROP OUT of the INSTALLED module:');
      for (const s of risky) {
        W(`       - ${pad(s.aheadRisk.name, 38)} ${s.aheadRisk.branch} -> ${s.aheadRisk.target}`
          + `  (+${s.aheadRisk.ahead} ahead)  [${s.blocked ? 'not moved: MANUAL' : 'WOULD MOVE'}]`);
      }
      if (profile.unpinnedPolicy === 'develop-then-branch') {
        W('     This is a consequence of unpinnedPolicy: "develop-then-branch".');
        W('     Revert to "report-only" to leave these modules where they are.');
      }
    }
    W(renderSteps(alignPlan));
    W('');
  }

  if (needsGuard && !guard.ok) {
    W('-- PHASES db + install: REFUSED -----------------------------------------');
    W(`  ${guard.message.split('\n').join('\n  ')}`);
    W('');
  } else {
    if (guard.warn) {
      W('-- !!! WARNING !!! ------------------------------------------------------');
      W(`  ${guard.warn}`);
      W('');
    }
    if (wants('db')) {
      W('-- PHASE: db ------------------------------------------------------------');
      W(`  Makes sure "${args.sid}" does NOT exist so ./gradlew install creates it`);
      W("  fresh, mirroring CI's empty postgres sidecar. There is no createdb step");
      W('  on purpose — install owns creation.');
      W(renderSteps(dbPlan));
      W('');
    }
    if (wants('install')) {
      W('-- PHASE: install -------------------------------------------------------');
      W('  gradle.properties is a MINIMAL diff of your local file (CI rewrites it');
      W('  wholesale; locally the docker_*/etendo.db.* keys serve postgres and the');
      W('  nexus/github credentials are needed, so they are preserved verbatim).');
      W('  Planned changes:');
      W(renderPropertiesDiff(parity.changes));
      W(renderSteps(installPlan));
      W('');
    }
  }

  if (args.dryRun) {
    W('=========================================================================');
    W('  DRY RUN — nothing above was executed.');
    W('  To execute:  make ci-parity DRY_RUN=0 PHASES=<phase>');
    W('=========================================================================');
    W('');
    return exitCode;
  }

  // --- live execution ------------------------------------------------------
  if (classification.blockers.length) {
    process.stderr.write('Refusing to execute: unresolved blockers listed above.\n');
    return 1;
  }
  if (needsGuard && !guard.ok) {
    process.stderr.write('Refusing to execute: database guard rejected the target sid.\n');
    return 1;
  }

  mkdirSync(logDir, { recursive: true });
  appendLog(logPath, `ci-parity live run ${timestamp}\nprofile=${profile.name} sid=${args.sid} phases=${args.phases.join(',')}\n\n`);
  W(`  log: ${logPath}`);

  for (const step of [...alignPlan, ...dbPlan]) {
    if (step.blocked) continue;
    if (!step.exec && !step.commands.length) continue;
    W(`  [${step.kind}] ${step.description}`);
    if (step.exec) {
      // Steps that need a secret carry argv + the NAME of the env var to fill.
      // The secret is injected into the child environment inside runChild and
      // never appears in `display`, so it cannot reach stdout or the log.
      for (const [i, e] of step.exec.entries()) {
        runChild(e, {
          cwd: step.cwd, logPath, display: step.commands[i] ?? `${e.file} …`, props,
        });
      }
    } else {
      for (const cmd of step.commands) runShell(cmd, step.cwd, logPath, props);
    }
  }

  if (wants('install')) {
    W('  [install] running CI gradle sequence');
    runInstall({
      coreDir, parityText: parity.text, logDir, logPath, propsMap: props,
    });
  }

  W('');
  W('  done.');
  W('');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exit(main());
  } catch (e) {
    process.stderr.write(`\nci-parity: ${e.message}\n\n`);
    process.exit(2);
  }
}
