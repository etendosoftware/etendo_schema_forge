#!/usr/bin/env node
/**
 * validate-pipeline.js
 *
 * Pipeline completeness validator. Detects incomplete pipeline runs by checking
 * git-tracked artifact files for consistency across the pipeline stages.
 *
 * Failure modes (F1–F10) are defined in docs/plans/2026-04-16-pipeline-completeness-validator.md
 *
 * Usage:
 *   node cli/src/validate-pipeline.js [--scope=name1,name2] [--staged] [--changed-since=<ref>] [--strict] [--format=text|json] [--skip=F4,F7]
 *
 * Exit codes:
 *   0 = clean (no violations, or only warnings)
 *   1 = blocking violations present
 */

import { readFile, readdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { needsMigration } from './migrations/index.js';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

// Artifact dirs that are intentionally custom-only: they have decisions.json
// but no contract pipeline (no contract.json, report-contract.json, etc.).
// These are fully hand-written custom windows — skipping them is correct.
const CUSTOM_ONLY_ARTIFACTS = new Set([
  'fiscal-config',
  'fiscal-monitor',
]);

// ---------------------------------------------------------------------------
// Artifact classifier
// ---------------------------------------------------------------------------

/**
 * Classify an artifact directory into one of four kinds:
 *   'window'            - has contract.json (and optionally decisions.json + generated/)
 *   'report'            - has report-contract.json
 *   'aggregate'         - has aggregate-contract.json (full aggregate with contract)
 *   'aggregate-section' - has generated/ only (section folder, no contract — whitelisted)
 *   'unknown'           - none of the above signals present
 *
 * @param {string} artifactDir - absolute path to the artifact directory
 * @returns {Promise<'window'|'report'|'aggregate'|'aggregate-section'|'unknown'>}
 */
export async function classifyArtifact(artifactDir) {
  const [hasAggregate, hasReport, hasContract, hasGenerated] = await Promise.all([
    fileExists(join(artifactDir, 'aggregate-contract.json')),
    fileExists(join(artifactDir, 'report-contract.json')),
    fileExists(join(artifactDir, 'contract.json')),
    dirExists(join(artifactDir, 'generated')),
  ]);

  if (hasAggregate) return 'aggregate';
  if (hasReport) return 'report';
  if (hasContract) return 'window';
  if (hasGenerated) return 'aggregate-section';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

async function fileExists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function dirExists(p) {
  try {
    const s = await readdir(p);
    return true;
  } catch { return false; }
}

async function readJSON(p) {
  const raw = await readFile(p, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Compute SHA-256 hash of a file's raw bytes, returned as a hex string.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function sha256File(filePath) {
  const raw = await readFile(filePath);
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Build a violation entry.
 */
function violation(rule, artifact, severity, message, fix, extra = {}) {
  return { rule, artifact, kind: extra.kind ?? 'violation', severity, message, fix, ...extra };
}

/**
 * Build a skipped entry (rule cannot be evaluated — expected in P1).
 */
function skipped(rule, artifact, message) {
  return { rule, artifact, kind: 'skipped', severity: 'SKIP', message, fix: null };
}

// ---------------------------------------------------------------------------
// Rule implementations
// ---------------------------------------------------------------------------

/**
 * F1: decisions.json modified but contract.json not re-generated.
 * Detection: hash(decisions.json) !== contract.sourceHashes.decisions
 * Skipped if contract.sourceHashes is absent (P1 — not yet embedded by generator).
 */
async function ruleF1(artifactDir, artifactName) {
  const contractPath = join(artifactDir, 'contract.json');
  const decisionsPath = join(artifactDir, 'decisions.json');

  const [hasDecisions, hasContract] = await Promise.all([
    fileExists(decisionsPath),
    fileExists(contractPath),
  ]);

  if (!hasDecisions || !hasContract) return null; // nothing to check

  const contract = await readJSON(contractPath);

  if (!contract.sourceHashes || !contract.sourceHashes.decisions) {
    return skipped('F1', artifactName, 'contract.sourceHashes.decisions not present — will be enforced after P2 generator patch');
  }

  const actualHash = await sha256File(decisionsPath);
  if (actualHash !== contract.sourceHashes.decisions) {
    return violation(
      'F1', artifactName, 'BLOCK',
      `decisions.json has changed but contract.json was not regenerated (hash mismatch)`,
      'Re-run the pipeline to regenerate contract.json from the current decisions.json',
    );
  }
  return null;
}

/**
 * F2: contract.json modified but generated/ not regenerated.
 * Detection: contract.checksum !== generated/.manifest.json.contractChecksum
 * Skipped if generated/.manifest.json is absent (P1 — not yet emitted by generator).
 */
async function ruleF2(artifactDir, artifactName) {
  const contractPath = join(artifactDir, 'contract.json');
  const manifestPath = join(artifactDir, 'generated', '.manifest.json');

  const [hasContract, hasManifest] = await Promise.all([
    fileExists(contractPath),
    fileExists(manifestPath),
  ]);

  if (!hasContract) return null;

  if (!hasManifest) {
    // Only emit skipped if generated/ exists (otherwise there's nothing to check)
    const hasGenerated = await dirExists(join(artifactDir, 'generated'));
    if (!hasGenerated) return null;
    return skipped('F2', artifactName, 'generated/.manifest.json not present — will be enforced after P2 generator patch');
  }

  const [contract, manifest] = await Promise.all([
    readJSON(contractPath),
    readJSON(manifestPath),
  ]);

  if (contract.checksum && manifest.contractChecksum && contract.checksum !== manifest.contractChecksum) {
    return violation(
      'F2', artifactName, 'BLOCK',
      `contract.json has changed but generated/ was not regenerated (checksum mismatch: contract=${contract.checksum}, manifest=${manifest.contractChecksum})`,
      'Re-run the pipeline to regenerate the frontend from the current contract.json',
    );
  }
  return null;
}

/**
 * F3: New window has contract.json but no entry in registry.js.
 * The caller passes registryContent (raw text of registry.js), or null if unreadable.
 */
async function ruleF3(artifactDir, artifactName, registryContent) {
  if (registryContent === null) {
    return skipped('F3', artifactName, 'registry.js could not be read — F3 check skipped');
  }

  const contractPath = join(artifactDir, 'contract.json');
  if (!(await fileExists(contractPath))) return null;

  // Check both windowLoaders and customLoaders sections
  const isInRegistry = registryContent.includes(`'${artifactName}'`);
  if (!isInRegistry) {
    return violation(
      'F3', artifactName, 'BLOCK',
      `Window has contract.json but '${artifactName}' is not registered in registry.js`,
      `Add an entry for '${artifactName}' to windowLoaders or customLoaders in tools/app-shell/src/windows/registry.js`,
    );
  }
  return null;
}

/**
 * F4: generated/ exists but contract.json is missing (orphaned output).
 */
async function ruleF4(artifactDir, artifactName) {
  const contractPath = join(artifactDir, 'contract.json');
  const generatedDir = join(artifactDir, 'generated');

  const [hasContract, hasGenerated] = await Promise.all([
    fileExists(contractPath),
    dirExists(generatedDir),
  ]);

  if (hasGenerated && !hasContract) {
    return violation(
      'F4', artifactName, 'WARN',
      `generated/ folder exists but contract.json is missing (orphaned output)`,
      `Either delete the generated/ folder or regenerate the full pipeline for '${artifactName}'`,
    );
  }
  return null;
}

/**
 * F5: decisions.json schema/version is stale (auto-migration would change it).
 */
async function ruleF5(artifactDir, artifactName) {
  const decisionsPath = join(artifactDir, 'decisions.json');
  if (!(await fileExists(decisionsPath))) return null;

  const decisions = await readJSON(decisionsPath);

  if (needsMigration(decisions)) {
    return violation(
      'F5', artifactName, 'BLOCK',
      `decisions.json schema version is stale and needs migration`,
      `Run: node cli/src/pipeline.js --menu-name "${artifactName}" to auto-migrate decisions.json`,
    );
  }
  return null;
}

/**
 * F6: contract.version in repo is below contract.prev.json version (downgrade).
 */
async function ruleF6(artifactDir, artifactName) {
  const contractPath = join(artifactDir, 'contract.json');
  const prevPath = join(artifactDir, 'contract.prev.json');

  const [hasCurrent, hasPrev] = await Promise.all([
    fileExists(contractPath),
    fileExists(prevPath),
  ]);

  if (!hasCurrent || !hasPrev) return null;

  const [current, prev] = await Promise.all([
    readJSON(contractPath),
    readJSON(prevPath),
  ]);

  const currentVersion = current.version;
  const prevVersion = prev.version;

  if (!currentVersion || !prevVersion) return null;

  if (compareSemver(currentVersion, prevVersion) < 0) {
    return violation(
      'F6', artifactName, 'BLOCK',
      `contract.json version ${currentVersion} is lower than previous version ${prevVersion} (downgrade detected)`,
      `Investigate why the version went backwards. Re-run the pipeline from a correct state, then delete contract.prev.json if needed.`,
    );
  }
  return null;
}

/**
 * Simple semver comparison. Returns -1, 0, or 1.
 */
function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

/**
 * F7: Window has decisions.json but the artifact name is listed in excludedEntities.
 */
async function ruleF7(artifactDir, artifactName) {
  const decisionsPath = join(artifactDir, 'decisions.json');
  if (!(await fileExists(decisionsPath))) return null;

  const decisions = await readJSON(decisionsPath);
  const excluded = decisions.excludedEntities;

  if (Array.isArray(excluded) && excluded.includes(artifactName)) {
    return violation(
      'F7', artifactName, 'WARN',
      `decisions.json lists '${artifactName}' in excludedEntities (window excludes itself — likely a copy-paste typo)`,
      `Remove '${artifactName}' from excludedEntities in decisions.json`,
    );
  }
  return null;
}

/**
 * F8: Report artifact missing required files.
 * Required: report-contract.json, template.hbs, helpers.js, mock-data.json
 * Triggered only if at least one of the four files is present.
 */
async function ruleF8(artifactDir, artifactName) {
  const required = ['report-contract.json', 'template.hbs', 'helpers.js', 'mock-data.json'];
  const presence = await Promise.all(required.map(f => fileExists(join(artifactDir, f))));
  const presentFiles = required.filter((_, i) => presence[i]);
  const missingFiles = required.filter((_, i) => !presence[i]);

  // Only check if at least one is present (indicates intent to be a report artifact)
  if (presentFiles.length === 0) return null;
  if (missingFiles.length === 0) return null;

  return violation(
    'F8', artifactName, 'BLOCK',
    `Report artifact is incomplete. Missing: ${missingFiles.join(', ')}`,
    `Add the missing report files: ${missingFiles.join(', ')}`,
  );
}

/**
 * F9: Aggregate artifact has generated/ but is missing aggregate-contract.json.
 * Only fires when there is no decisions.json (which would indicate a window artifact
 * that lost its contract.json — that case is handled by F4).
 */
async function ruleF9(artifactDir, artifactName) {
  const aggregatePath = join(artifactDir, 'aggregate-contract.json');
  const generatedDir = join(artifactDir, 'generated');
  const decisionsPath = join(artifactDir, 'decisions.json');

  const [hasAggregate, hasGenerated, hasDecisions] = await Promise.all([
    fileExists(aggregatePath),
    dirExists(generatedDir),
    fileExists(decisionsPath),
  ]);

  // If decisions.json is present, this looks like a window artifact (handled by F4)
  if (hasDecisions) return null;

  if (hasGenerated && !hasAggregate) {
    return violation(
      'F9', artifactName, 'BLOCK',
      `Aggregate artifact has generated/ but is missing aggregate-contract.json`,
      `Run the aggregate pipeline to generate aggregate-contract.json for '${artifactName}'`,
    );
  }
  return null;
}

/**
 * F10: registry.js has loader for a window but artifacts/<window>/generated/web/<window>/index.jsx is missing.
 * @param {string} artifactDir - absolute path to the artifact directory
 * @param {string} artifactName
 * @param {string|null} registryContent - raw text of registry.js, or null if unreadable
 * @param {string} repoRoot - repo root (for resolving custom window paths)
 */
async function ruleF10(artifactDir, artifactName, registryContent, repoRoot = ROOT) {
  if (registryContent === null) {
    return skipped('F10', artifactName, 'registry.js could not be read — F10 check skipped');
  }
  if (!registryContent.includes(`'${artifactName}'`)) return null; // not in registry, skip

  const indexPath = join(artifactDir, 'generated', 'web', artifactName, 'index.jsx');
  // Also check the custom path (custom loaders)
  const customIndexPath = join(repoRoot, 'tools', 'app-shell', 'src', 'windows', 'custom', artifactName, 'index.jsx');

  const [hasIndex, hasCustomIndex] = await Promise.all([
    fileExists(indexPath),
    fileExists(customIndexPath),
  ]);

  if (!hasIndex && !hasCustomIndex) {
    return violation(
      'F10', artifactName, 'BLOCK',
      `registry.js has loader for '${artifactName}' but generated/web/${artifactName}/index.jsx is missing`,
      `Re-run the frontend generator for '${artifactName}' or remove the registry entry if the window is deprecated`,
    );
  }
  return null;
}

const VALID_LINES_LAYOUTS = ['classic', 'inlineEditable'];

/**
 * F11: window.linesLayout in decisions.json must be one of the supported values.
 * @param {string} artifactDir - absolute path to the artifact directory
 * @param {string} artifactName
 */
async function ruleF11(artifactDir, artifactName) {
  const decisionsPath = join(artifactDir, 'decisions.json');
  if (!(await fileExists(decisionsPath))) return null;
  let decisions;
  try {
    decisions = JSON.parse(await readFile(decisionsPath, 'utf8'));
  } catch {
    return skipped('F11', artifactName, 'decisions.json could not be parsed — F11 check skipped');
  }
  const value = decisions?.window?.linesLayout;
  if (value === undefined || value === null) return null;
  if (!VALID_LINES_LAYOUTS.includes(value)) {
    return violation(
      'F11', artifactName, 'BLOCK',
      `window.linesLayout = '${value}' is not a supported value`,
      `Set decisions.json window.linesLayout to one of: ${VALID_LINES_LAYOUTS.join(', ')}`,
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Artifact discovery
// ---------------------------------------------------------------------------

/**
 * Discover all artifact directory names under the artifacts/ root.
 * Returns only subdirectories (skips files).
 */
async function discoverArtifacts(artifactsRoot) {
  const entries = await readdir(artifactsRoot, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => e.name);
}

/**
 * Get list of artifact names changed in the git staging area.
 * Returns null if git is unavailable.
 */
async function getStagedArtifacts(root) {
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--cached', '--name-only'], { cwd: root });
    const names = new Set();
    for (const line of stdout.split('\n')) {
      const m = line.match(/^artifacts\/([^/]+)\//);
      if (m) names.add(m[1]);
    }
    return Array.from(names);
  } catch {
    return null;
  }
}

/**
 * Get list of artifact names changed since a given git ref (e.g. 'origin/main').
 * Uses `git diff --name-only <ref>...HEAD` (three-dot diff — changes since branch point).
 * Returns null if git is unavailable or the ref cannot be resolved.
 *
 * @param {string} root - repo root path
 * @param {string} ref  - git ref to compare against (e.g. 'origin/main', 'HEAD~1')
 * @returns {Promise<string[]|null>}
 */
export async function getChangedArtifactsSince(root, ref) {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['diff', '--name-only', `${ref}...HEAD`],
      { cwd: root },
    );
    const names = new Set();
    for (const line of stdout.split('\n')) {
      const m = line.match(/^artifacts\/([^/]+)\//);
      if (m) names.add(m[1]);
    }
    return Array.from(names);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Core validator
// ---------------------------------------------------------------------------

/**
 * Validate pipeline completeness.
 *
 * @param {object} options
 * @param {'all'|'staged'|string[]} [options.scope='all'] - scope of validation
 * @param {boolean} [options.strict=false] - treat warnings as blocking
 * @param {string[]} [options.skip=[]] - list of rule IDs to skip (e.g. ['F4', 'F7'])
 * @param {string} [options.root=ROOT] - repo root (override for testing)
 * @param {string} [options.registryPath] - override path to registry.js (for testing)
 * @returns {Promise<{violations: Array, skipped: Array, summary: object}>}
 */
export async function validatePipeline({
  scope = 'all',
  strict = false,
  skip = [],
  root = ROOT,
  registryPath,
  _artifactsRoot,
} = {}) {
  const artifactsRoot = _artifactsRoot ?? join(root, 'artifacts');
  const resolvedRegistryPath = registryPath ?? join(root, 'tools', 'app-shell', 'src', 'windows', 'registry.js');

  // Load registry content for F3 and F10
  // null = unreadable (F3/F10 will emit skipped entries instead of false BLOCKs)
  let registryContent = null;
  try {
    registryContent = await readFile(resolvedRegistryPath, 'utf-8');
  } catch {
    // Registry file not found or unreadable — F3/F10 checks will emit skipped entries
    registryContent = null;
  }

  // Determine which artifacts to check
  let artifactNames;
  if (scope === 'staged') {
    const staged = await getStagedArtifacts(root);
    if (staged === null || staged.length === 0) {
      // No staged artifacts — nothing to check
      return {
        violations: [],
        skipped: [],
        summary: { total: 0, blocking: 0, warnings: 0, skipped: 0, ok: 0 },
      };
    }
    artifactNames = staged;
  } else if (Array.isArray(scope)) {
    artifactNames = scope;
  } else {
    artifactNames = await discoverArtifacts(artifactsRoot);
  }

  const skipSet = new Set(skip.map(s => s.toUpperCase()));

  const allResults = []; // mix of violations and skipped entries

  for (const name of artifactNames) {
    const artifactDir = join(artifactsRoot, name);

    // Verify directory exists (in staged mode the entry may have been deleted)
    if (!(await dirExists(artifactDir))) continue;

    const kind = await classifyArtifact(artifactDir);

    switch (kind) {
      case 'window': {
        const checks = [
          skipSet.has('F1') ? null : ruleF1(artifactDir, name),
          skipSet.has('F2') ? null : ruleF2(artifactDir, name),
          skipSet.has('F3') ? null : ruleF3(artifactDir, name, registryContent),
          skipSet.has('F4') ? null : ruleF4(artifactDir, name),
          skipSet.has('F5') ? null : ruleF5(artifactDir, name),
          skipSet.has('F6') ? null : ruleF6(artifactDir, name),
          skipSet.has('F7') ? null : ruleF7(artifactDir, name),
          skipSet.has('F10') ? null : ruleF10(artifactDir, name, registryContent, root),
          skipSet.has('F11') ? null : ruleF11(artifactDir, name),
        ];
        const results = await Promise.all(checks);
        for (const r of results) {
          if (r) allResults.push({ ...r, artifactKind: 'window' });
        }
        break;
      }
      case 'report': {
        if (!skipSet.has('F8')) {
          const r = await ruleF8(artifactDir, name);
          if (r) allResults.push({ ...r, artifactKind: 'report' });
        }
        break;
      }
      case 'aggregate': {
        // aggregate has both aggregate-contract.json and generated/ → no F9 violation
        // But still run F9 as a sanity check (should return null)
        if (!skipSet.has('F9')) {
          const r = await ruleF9(artifactDir, name);
          if (r) allResults.push({ ...r, artifactKind: 'aggregate' });
        }
        break;
      }
      case 'aggregate-section': {
        // F9: check if it has generated/ but no aggregate-contract.json
        // NOTE: real aggregate sections (sales/, crm/) are intentional — they have generated/
        // but have aggregate-contract.json in the actual repo, so F9 doesn't fire there.
        // "pure" sections like sales/ that never had a contract are whitelisted by design
        // because they don't trigger F9 (they have no contract files at all).
        if (!skipSet.has('F9')) {
          const r = await ruleF9(artifactDir, name);
          if (r) allResults.push({ ...r, artifactKind: 'aggregate-section' });
        }
        // F4: also run here — a window artifact that lost its contract.json would land here
        // if it still has decisions.json. We detect via decisions.json presence.
        if (!skipSet.has('F4')) {
          const r = await ruleF4(artifactDir, name);
          if (r) allResults.push({ ...r, artifactKind: 'aggregate-section' });
        }
        break;
      }
      case 'unknown':
        if (CUSTOM_ONLY_ARTIFACTS.has(name)) {
          allResults.push(skipped('CUSTOM-ONLY', name, 'Intentional custom-only artifact — no contract pipeline'));
          break;
        }
        // Unknown artifacts: emit as warning (or block with --strict)
        allResults.push(violation(
          'UNKNOWN', name, strict ? 'BLOCK' : 'WARN',
          `Artifact directory '${name}' has no recognizable pipeline files`,
          `Investigate the directory contents and run the appropriate pipeline`,
          { artifactKind: 'unknown' },
        ));
        break;
    }
  }

  // If --strict, promote WARN violations to BLOCK
  const processedResults = allResults.map(r => {
    if (strict && r.severity === 'WARN') {
      return { ...r, severity: 'BLOCK', strictPromoted: true };
    }
    return r;
  });

  // Separate by kind
  const violations = processedResults.filter(r => r.kind !== 'skipped' && r.severity !== 'SKIP');
  const skippedEntries = processedResults.filter(r => r.kind === 'skipped' || r.severity === 'SKIP');

  const blocking = violations.filter(v => v.severity === 'BLOCK').length;
  const warnings = violations.filter(v => v.severity === 'WARN').length;

  // Compute ok count per-artifact (worst-case wins: violation > skipped > ok).
  // This prevents ok from going negative when an artifact emits multiple violations.
  /** @type {Map<string, 'violation'|'skipped'|'ok'>} */
  const artifactStatus = new Map(artifactNames.map(n => [n, 'ok']));
  for (const entry of violations) {
    artifactStatus.set(entry.artifact, 'violation');
  }
  for (const entry of skippedEntries) {
    if (artifactStatus.get(entry.artifact) !== 'violation') {
      artifactStatus.set(entry.artifact, 'skipped');
    }
  }
  const okCount = [...artifactStatus.values()].filter(s => s === 'ok').length;

  return {
    violations,
    skipped: skippedEntries,
    summary: {
      total: violations.length,
      blocking,
      warnings,
      skipped: skippedEntries.length,
      /** ok = number of artifacts with no violations and no skipped checks */
      ok: okCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Reporters
// ---------------------------------------------------------------------------

/**
 * Format the result as a human-readable text report.
 */
function formatText(result) {
  const { violations, skipped, summary } = result;
  const lines = [];

  if (violations.length === 0 && skipped.length === 0) {
    lines.push('Pipeline validation: OK');
    return lines.join('\n');
  }

  if (violations.length > 0) {
    lines.push('Pipeline validation: VIOLATIONS FOUND\n');
    for (const v of violations) {
      const badge = v.severity === 'BLOCK' ? '[BLOCK]' : '[WARN] ';
      lines.push(`  ${badge} [${v.rule}] ${v.artifact}`);
      lines.push(`         ${v.message}`);
      lines.push(`         Fix: ${v.fix}`);
    }
    lines.push('');
  }

  if (skipped.length > 0) {
    lines.push(`Skipped checks (${skipped.length}):`);
    for (const s of skipped) {
      lines.push(`  [SKIP]  [${s.rule}] ${s.artifact}: ${s.message}`);
    }
    lines.push('');
  }

  lines.push(
    `Summary: ${summary.total} violation(s) — ${summary.blocking} blocking, ` +
    `${summary.warnings} warning(s), ${summary.skipped} skipped`,
  );

  return lines.join('\n');
}

/**
 * Format the result as a JSON string.
 */
function formatJSON(result) {
  return JSON.stringify(result, null, 2);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

/**
 * Parse CLI arguments for the validator.
 */
export function parseCLIArgs(argv) {
  const args = argv.slice(2);
  const options = {
    scope: null,
    staged: false,
    strict: false,
    format: 'text',
    skip: [],
    changedSince: null,
  };

  for (const arg of args) {
    if (arg.startsWith('--scope=')) {
      options.scope = arg.split('=').slice(1).join('=').split(',').map(s => s.trim()).filter(Boolean);
    } else if (arg === '--staged') {
      options.staged = true;
    } else if (arg === '--strict') {
      options.strict = true;
    } else if (arg.startsWith('--format=')) {
      options.format = arg.split('=')[1];
    } else if (arg.startsWith('--skip=')) {
      options.skip = arg.split('=')[1].split(',').map(s => s.trim()).filter(Boolean);
    } else if (arg.startsWith('--changed-since=')) {
      options.changedSince = arg.split('=').slice(1).join('=');
    }
  }

  return options;
}

async function main() {
  const options = parseCLIArgs(process.argv);

  // Determine scope — precedence: --scope > --changed-since > --staged > all
  let scope;
  if (options.scope && options.scope.length > 0) {
    scope = options.scope;
  } else if (options.changedSince) {
    const changed = await getChangedArtifactsSince(ROOT, options.changedSince);
    if (changed === null) {
      process.stderr.write(`validate-pipeline: could not resolve ref '${options.changedSince}'\n`);
      process.exit(1);
    }
    scope = changed; // may be empty array → validator returns early with empty result
  } else if (options.staged) {
    scope = 'staged';
  } else {
    scope = 'all';
  }

  let result;
  try {
    result = await validatePipeline({
      scope,
      strict: options.strict,
      skip: options.skip,
    });
  } catch (err) {
    process.stderr.write(`validate-pipeline: fatal error: ${err.message}\n`);
    process.exit(1);
  }

  // Attach scope info to summary for JSON consumers (e.g. CI workflow)
  if (options.changedSince) {
    result.summary.scope = Array.isArray(scope) ? scope : [];
    result.summary.empty = result.summary.scope.length === 0;
  }

  if (options.format === 'json') {
    process.stdout.write(formatJSON(result) + '\n');
  } else {
    process.stdout.write(formatText(result) + '\n');
  }

  const hasBlocking = result.violations.some(v => v.severity === 'BLOCK');
  process.exit(hasBlocking ? 1 : 0);
}

// Only run main when executed directly
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('validate-pipeline.js') ||
  process.argv[1].endsWith('validate-pipeline')
);
if (isMainModule) {
  main().catch(err => { process.stderr.write(`${err.stack}\n`); process.exit(1); });
}
