#!/usr/bin/env node
/**
 * validate-pipeline.js
 *
 * Pipeline completeness validator. Detects incomplete pipeline runs by checking
 * git-tracked artifact files for consistency across the pipeline stages.
 *
 * Failure modes are defined in docs/pipeline-validator-reference.md.
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
const ROOT = process.env.SF_ROOT || process.cwd();

// Artifact dirs that are intentionally custom-only: they have decisions.json
// but no contract pipeline (no contract.json, report-contract.json, etc.).
// These are fully hand-written custom windows — skipping them is correct.
const CUSTOM_ONLY_ARTIFACTS = new Set([
  'fiscal-config',
  'fiscal-monitor',
  'financial-account',
  'not-posted-documents',
]);

// Backend-only artifacts: they run the contract + push-to-neo pipeline (so they have a
// contract.json) to expose a NEO W spec for selectors / inline create, but they have NO
// frontend window — no AD menu, no route, no registry entry, no generated/ output. The
// registry checks (F3, F10) must not fire for these.
const BACKEND_ONLY_ARTIFACTS = new Set([
  'transaction-type',
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

async function readJSONIfExists(p) {
  if (!(await fileExists(p))) return null;
  return readJSON(p);
}

async function readWindowContractBundle(artifactDir) {
  const contract = await readJSON(join(artifactDir, 'contract.json'));
  const mcp = await readJSONIfExists(join(artifactDir, 'contract.mcp.json'));
  if (!mcp) return contract;
  return {
    ...contract,
    apiPrediction: mcp.apiPrediction ?? contract.apiPrediction,
    formState: mcp.formState,
    agentProfile: mcp.agentProfile,
  };
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
  if (BACKEND_ONLY_ARTIFACTS.has(artifactName)) {
    return skipped('F3', artifactName, 'backend-only artifact (NEO spec, no frontend window) — F3 not applicable');
  }
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

function contractVersionAtLeast(contract, version) {
  return compareSemver(contract?.version ?? '0.0.0', version) >= 0;
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

/**
 * Canonical row-quick-action keys that never need to be validated against the menu/process
 * list — they always have built-in handlers (Edit/Duplicate/Email/Delete).
 */
const ROW_QUICK_ACTION_CANONICAL_KEYS = new Set(['edit', 'duplicate', 'email', 'delete']);

/**
 * F11: `window.rowQuickActions.actions.<key>` references a process key that does NOT exist
 * in the window's `menuActions` / `processOverrides` declaration.
 *
 * Canonical keys (edit/duplicate/email/delete) are always valid and never reported.
 * Detection runs on the raw `decisions.json` (no contract needed) so it works even before
 * the contract has been regenerated.
 *
 * @param {string} artifactDir
 * @param {string} artifactName
 * @returns {Promise<object|null>}
 */
function collectAllowedActionKeys(win) {
  const allowed = new Set();
  for (const a of (Array.isArray(win.menuActions) ? win.menuActions : [])) {
    if (a && typeof a.key === 'string') allowed.add(a.key);
  }
  if (win.processOverrides && typeof win.processOverrides === 'object') {
    for (const k of Object.keys(win.processOverrides)) allowed.add(k);
  }
  return allowed;
}

async function ruleF11(artifactDir, artifactName) {
  const decisionsPath = join(artifactDir, 'decisions.json');
  if (!(await fileExists(decisionsPath))) return null;

  const decisions = await readJSON(decisionsPath);
  const win = decisions.window;
  const rqa = win?.rowQuickActions;
  if (!rqa || typeof rqa !== 'object') return null;
  const actions = rqa.actions;
  if (!actions || typeof actions !== 'object') return null;

  const allowed = collectAllowedActionKeys(win);

  // A `show: false` entry is also pointless if the key doesn't exist, so we still flag it —
  // the user almost certainly meant a real process and made a typo.
  const offenders = Object.keys(actions).filter(
    key => !ROW_QUICK_ACTION_CANONICAL_KEYS.has(key) && !allowed.has(key),
  );

  if (offenders.length === 0) return null;

  return violation(
    'F11', artifactName, 'BLOCK',
    `rowQuickActions.actions references unknown process key(s): ${offenders.join(', ')}. Allowed: canonical (edit, duplicate, email, delete) or any key declared in window.menuActions / window.processOverrides`,
    `Remove the unknown key(s) from rowQuickActions.actions, or add the corresponding entry to window.menuActions / window.processOverrides in decisions.json`,
  );
}

const VALID_LINES_LAYOUTS = ['classic', 'inlineEditable'];

/**
 * F12: window.linesLayout in decisions.json must be one of the supported values.
 * @param {string} artifactDir - absolute path to the artifact directory
 * @param {string} artifactName
 */
async function ruleF12(artifactDir, artifactName) {
  const decisionsPath = join(artifactDir, 'decisions.json');
  if (!(await fileExists(decisionsPath))) return null;
  let decisions;
  try {
    decisions = JSON.parse(await readFile(decisionsPath, 'utf8'));
  } catch {
    return skipped('F12', artifactName, 'decisions.json could not be parsed — F12 check skipped');
  }
  const value = decisions?.window?.linesLayout;
  if (value === undefined || value === null) return null;
  if (!VALID_LINES_LAYOUTS.includes(value)) {
    return violation(
      'F12', artifactName, 'BLOCK',
      `window.linesLayout = '${value}' is not a supported value`,
      `Set decisions.json window.linesLayout to one of: ${VALID_LINES_LAYOUTS.join(', ')}`,
    );
  }
  return null;
}

/**
 * F13: Window contract is missing apiPrediction.actions with edge cases (ETP-3956).
 * Every action in apiPrediction must have at least 3 edge cases.
 */
async function ruleF13(artifactDir, artifactName) {
  const contractPath = join(artifactDir, 'contract.json');
  if (!(await fileExists(contractPath))) return null;
  let contract;
  try {
    contract = await readWindowContractBundle(artifactDir);
  } catch {
    return skipped('F13', artifactName, 'contract.json or contract.mcp.json could not be parsed');
  }

  // Only enforce on contracts generated with action classification (v0.7.0+)
  if (!contractVersionAtLeast(contract, '0.7.0')) return null;

  const actions = contract?.apiPrediction?.actions ?? [];
  for (const action of actions) {
    if (!Array.isArray(action.edgeCases) || action.edgeCases.length < 3) {
      return violation(
        'F13', artifactName, 'BLOCK',
        `Action '${action.name || action.field}' has fewer than 3 edge cases (${action.edgeCases?.length ?? 0})`,
        `Every process/action must declare at least 3 edge cases. Update the action classification in generate-contract.js or add curated overrides.`,
      );
    }
  }
  return null;
}

/**
 * F14: Window contract is missing formState section (ETP-3957).
 * Contracts for windows with editable fields must include formState metadata.
 */
async function ruleF14(artifactDir, artifactName) {
  const contractPath = join(artifactDir, 'contract.json');
  if (!(await fileExists(contractPath))) return null;
  let contract;
  try {
    contract = await readWindowContractBundle(artifactDir);
  } catch {
    return skipped('F14', artifactName, 'contract.json or contract.mcp.json could not be parsed');
  }

  if (!contractVersionAtLeast(contract, '0.7.0')) return null;

  if (!contract.formState) {
    return violation(
      'F14', artifactName, 'BLOCK',
      `MCP contract is missing formState section`,
      `Re-run the contract generator to include formState metadata in contract.mcp.json for agent form fidelity.`,
    );
  }
  return null;
}

/**
 * F15: Window contract is missing agentProfile section (ETP-3958).
 * Contracts must include agentProfile for agent planning.
 */
async function ruleF15(artifactDir, artifactName) {
  const contractPath = join(artifactDir, 'contract.json');
  if (!(await fileExists(contractPath))) return null;
  let contract;
  try {
    contract = await readWindowContractBundle(artifactDir);
  } catch {
    return skipped('F15', artifactName, 'contract.json or contract.mcp.json could not be parsed');
  }

  if (!contractVersionAtLeast(contract, '0.7.0')) return null;

  if (!contract.agentProfile) {
    return violation(
      'F15', artifactName, 'BLOCK',
      `MCP contract is missing agentProfile section`,
      `Re-run the contract generator to include agentProfile metadata in contract.mcp.json for agent planning.`,
    );
  }

  const profile = contract.agentProfile;
  const formStateFields = collectFormStateFieldsByScope(contract);
  const missingHeaderField = findMissingReference(
    profile.minimumCreate?.headerFields ?? [],
    formStateFields.header,
  );
  if (missingHeaderField) return agentProfileFieldViolation(artifactName, missingHeaderField, 'headerFields');

  const missingLineField = findMissingReference(
    profile.minimumCreate?.lineFields ?? [],
    formStateFields.line,
  );
  if (missingLineField) return agentProfileFieldViolation(artifactName, missingLineField, 'lineFields');

  const missingSelector = findMissingReference(
    (profile.selectorContexts ?? []).map(selectorContextReference).filter(Boolean),
    collectSelectorReferences(contract),
  );
  if (missingSelector) return agentProfileSelectorViolation(artifactName, missingSelector);

  const missingAction = findMissingReference(
    profile.actions ?? [],
    new Set((contract.apiPrediction?.actions ?? []).map(action => action.name)),
  );
  if (missingAction) return agentProfileActionViolation(artifactName, missingAction);

  return null;
}

function collectFormStateFieldsByScope(contract) {
  const header = new Set();
  const line = new Set();
  for (const [entityName, entity] of Object.entries(contract.formState?.entities ?? {})) {
    const target = isHeaderEntity(contract, entityName) ? header : line;
    for (const field of Object.keys(entity.fields ?? {})) {
      target.add(field);
    }
  }
  return { header, line };
}

function isHeaderEntity(contract, entityName) {
  if (entityName === 'header') return true;
  const frontendEntity = contract.frontendContract?.entities?.[entityName];
  if (frontendEntity?.level) return frontendEntity.level === 'header';
  return contract.frontendContract?.window?.primaryEntity === entityName;
}

function findMissingReference(references, knownReferences) {
  return references.find(reference => !knownReferences.has(reference));
}

function collectSelectorReferences(contract) {
  return new Set((contract.apiPrediction?.selectors ?? [])
    .map(selectorContextReference)
    .filter(Boolean));
}

function selectorContextReference(selector) {
  if (typeof selector === 'string') return selector;
  if (!selector?.field) return null;
  return selector.entity ? `${selector.entity}.${selector.field}` : selector.field;
}

function agentProfileFieldViolation(artifactName, field, scope) {
  return violation(
    'F15', artifactName, 'BLOCK',
    `agentProfile.minimumCreate.${scope} references non-existent field '${field}' in that scope`,
    `Fix the agentProfile generator or curated profile to reference only existing formState fields for the same header/line scope.`,
  );
}

function agentProfileSelectorViolation(artifactName, selector) {
  return violation(
    'F15', artifactName, 'BLOCK',
    `agentProfile.selectorContexts references non-existent selector '${selector}'`,
    `Fix the agentProfile generator or curated profile to reference only existing selectors with the same entity and field.`,
  );
}

function agentProfileActionViolation(artifactName, action) {
  return violation(
    'F15', artifactName, 'BLOCK',
    `agentProfile.actions references non-existent action '${action}'`,
    `Fix the agentProfile generator or curated profile to reference only existing actions.`,
  );
}

/**
 * F16: No manual edits detected under generated directories (ETP-3959).
 * Checks that generated files still match the deterministic frontend generator
 * output for the committed contract bundle.
 */
async function ruleF16(artifactDir, artifactName) {
  const contractPath = join(artifactDir, 'contract.json');
  const generatedDir = join(artifactDir, 'generated');

  if (!(await fileExists(contractPath))) return null;
  if (!(await dirExists(generatedDir))) return null;

  let expectedFiles;
  try {
    const contract = await readJSON(contractPath);
    if (!contract.frontendContract) return null;
    const { generateAll } = await import('./generate-frontend.js');
    expectedFiles = generateAll(contract);
  } catch {
    return skipped('F16', artifactName, 'generated frontend output could not be reproduced');
  }

  const webDir = join(generatedDir, 'web', artifactName);
  for (const [filename, expectedContent] of Object.entries(expectedFiles)) {
    const filePath = join(webDir, filename);
    if (!(await fileExists(filePath))) continue;
    const actualContent = await readFile(filePath, 'utf-8');
    if (actualContent !== expectedContent) {
      return violation(
        'F16', artifactName, 'BLOCK',
        `Generated file ${filePath.replace(artifactDir, '')} differs from generator output`,
        `Never manually edit artifacts/*/generated/. Fix the generator (generate-frontend.js, resolve-curated.js) and regenerate instead.`,
      );
    }
  }
  return null;
}

/**
 * F17: window.balanceFooter must reference real amount fields on the lines entity.
 * Guards the double-entry balance footer wiring (ETP-4244).
 */
async function ruleF17(artifactDir, artifactName) {
  const decisionsPath = join(artifactDir, 'decisions.json');
  if (!(await fileExists(decisionsPath))) return null;
  let decisions;
  try {
    decisions = JSON.parse(await readFile(decisionsPath, 'utf8'));
  } catch {
    return skipped('F17', artifactName, 'decisions.json could not be parsed — F17 check skipped');
  }
  const bf = decisions?.window?.balanceFooter;
  if (!bf) return null;
  if (!bf.debitField || !bf.creditField) {
    return violation('F17', artifactName, 'BLOCK',
      'window.balanceFooter requires both debitField and creditField',
      'Set decisions.json window.balanceFooter to { debitField, creditField }.');
  }
  const contractPath = join(artifactDir, 'contract.json');
  if (!(await fileExists(contractPath))) return skipped('F17', artifactName, 'contract.json not found — F17 check skipped');
  let contract;
  try {
    contract = JSON.parse(await readFile(contractPath, 'utf8'));
  } catch {
    return skipped('F17', artifactName, 'contract.json could not be parsed — F17 check skipped');
  }
  const lineFields = collectFrontendLineFields(contract);
  for (const field of [bf.debitField, bf.creditField]) {
    if (!lineFields.has(field)) {
      return violation('F17', artifactName, 'BLOCK',
        `window.balanceFooter references line field '${field}' which does not exist on the lines entity`,
        `Use line-entity field names that exist in the contract for window.balanceFooter (check frontendContract.entities.<lineEntity>.fields[].name).`);
    }
  }
  return null;
}

/**
 * Collect the field names declared on the line (non-header / detail) entity of
 * the frontend contract. Real generated contracts populate
 * frontendContract.entities.<entity>.fields[].name — contract.formState is
 * never emitted, so balanceFooter validation must read from here.
 */
function collectFrontendLineFields(contract) {
  const entities = contract.frontendContract?.entities ?? {};
  const win = contract.frontendContract?.window ?? {};
  const primaryEntity = win.primaryEntity;
  const entityNames = Object.keys(entities);
  const detailEntity = 'detailEntity' in win
    ? win.detailEntity
    : entityNames.find(name => name !== primaryEntity);
  if (!detailEntity) return new Set();
  const fields = new Set();
  for (const field of entities[detailEntity]?.fields ?? []) {
    if (field?.name) fields.add(field.name);
  }
  return fields;
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

async function loadRegistryContent(registryPath) {
  try {
    return await readFile(registryPath, 'utf-8');
  } catch {
    // Registry file not found or unreadable — F3/F10 checks will emit skipped entries.
    return null;
  }
}

async function resolveArtifactNames(scope, root, artifactsRoot) {
  if (scope === 'staged') {
    const staged = await getStagedArtifacts(root);
    return staged ?? [];
  }
  if (Array.isArray(scope)) return scope;
  return discoverArtifacts(artifactsRoot);
}

async function runEnabledChecks(checks, skipSet) {
  const pendingChecks = checks.map(check => (skipSet.has(check.rule) ? null : check.run()));
  return (await Promise.all(pendingChecks)).filter(Boolean);
}

async function runWindowChecks(artifactDir, artifactName, registryContent, root, skipSet) {
  return runEnabledChecks([
    { rule: 'F1', run: () => ruleF1(artifactDir, artifactName) },
    { rule: 'F2', run: () => ruleF2(artifactDir, artifactName) },
    { rule: 'F3', run: () => ruleF3(artifactDir, artifactName, registryContent) },
    { rule: 'F4', run: () => ruleF4(artifactDir, artifactName) },
    { rule: 'F5', run: () => ruleF5(artifactDir, artifactName) },
    { rule: 'F6', run: () => ruleF6(artifactDir, artifactName) },
    { rule: 'F7', run: () => ruleF7(artifactDir, artifactName) },
    { rule: 'F10', run: () => ruleF10(artifactDir, artifactName, registryContent, root) },
    { rule: 'F11', run: () => ruleF11(artifactDir, artifactName) },
    { rule: 'F12', run: () => ruleF12(artifactDir, artifactName) },
    { rule: 'F13', run: () => ruleF13(artifactDir, artifactName) },
    { rule: 'F14', run: () => ruleF14(artifactDir, artifactName) },
    { rule: 'F15', run: () => ruleF15(artifactDir, artifactName) },
    { rule: 'F16', run: () => ruleF16(artifactDir, artifactName) },
    { rule: 'F17', run: () => ruleF17(artifactDir, artifactName) },
  ], skipSet);
}

async function runSingleCheck(rule, callback, skipSet) {
  if (skipSet.has(rule)) return [];
  const result = await callback();
  return result ? [result] : [];
}

function tagArtifactKind(results, artifactKind) {
  return results.map(result => ({ ...result, artifactKind }));
}

async function runAggregateSectionChecks(artifactDir, artifactName, skipSet) {
  const f9Results = await runSingleCheck('F9', () => ruleF9(artifactDir, artifactName), skipSet);
  const f4Results = await runSingleCheck('F4', () => ruleF4(artifactDir, artifactName), skipSet);
  return [...f9Results, ...f4Results];
}

async function runChecksForArtifact({ kind, artifactDir, artifactName, registryContent, root, skipSet, strict }) {
  if (kind === 'window') {
    return tagArtifactKind(
      await runWindowChecks(artifactDir, artifactName, registryContent, root, skipSet),
      'window',
    );
  }
  if (kind === 'report') {
    return tagArtifactKind(
      await runSingleCheck('F8', () => ruleF8(artifactDir, artifactName), skipSet),
      'report',
    );
  }
  if (kind === 'aggregate') {
    return tagArtifactKind(
      await runSingleCheck('F9', () => ruleF9(artifactDir, artifactName), skipSet),
      'aggregate',
    );
  }
  if (kind === 'aggregate-section') {
    return tagArtifactKind(
      await runAggregateSectionChecks(artifactDir, artifactName, skipSet),
      'aggregate-section',
    );
  }
  if (CUSTOM_ONLY_ARTIFACTS.has(artifactName)) {
    return [skipped('CUSTOM-ONLY', artifactName, 'Intentional custom-only artifact — no contract pipeline')];
  }
  return [violation(
    'UNKNOWN', artifactName, strict ? 'BLOCK' : 'WARN',
    `Artifact directory '${artifactName}' has no recognizable pipeline files`,
    `Investigate the directory contents and run the appropriate pipeline`,
    { artifactKind: 'unknown' },
  )];
}

function applyStrictMode(results, strict) {
  return results.map(result => {
    if (strict && result.severity === 'WARN') {
      return { ...result, severity: 'BLOCK', strictPromoted: true };
    }
    return result;
  });
}

function summarizeResults(processedResults, artifactNames) {
  const violations = processedResults.filter(r => r.kind !== 'skipped' && r.severity !== 'SKIP');
  const skippedEntries = processedResults.filter(r => r.kind === 'skipped' || r.severity === 'SKIP');
  const blocking = violations.filter(v => v.severity === 'BLOCK').length;
  const warnings = violations.filter(v => v.severity === 'WARN').length;
  const artifactStatus = new Map(artifactNames.map(name => [name, 'ok']));

  for (const entry of violations) artifactStatus.set(entry.artifact, 'violation');
  for (const entry of skippedEntries) {
    if (artifactStatus.get(entry.artifact) !== 'violation') artifactStatus.set(entry.artifact, 'skipped');
  }

  return {
    violations,
    skipped: skippedEntries,
    summary: {
      total: violations.length,
      blocking,
      warnings,
      skipped: skippedEntries.length,
      /** ok = number of artifacts with no violations and no skipped checks */
      ok: [...artifactStatus.values()].filter(status => status === 'ok').length,
    },
  };
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
  const registryContent = await loadRegistryContent(resolvedRegistryPath);
  const artifactNames = await resolveArtifactNames(scope, root, artifactsRoot);
  const skipSet = new Set(skip.map(s => s.toUpperCase()));
  const allResults = []; // mix of violations and skipped entries

  for (const name of artifactNames) {
    const artifactDir = join(artifactsRoot, name);
    if (!(await dirExists(artifactDir))) continue;

    const kind = await classifyArtifact(artifactDir);
    allResults.push(...await runChecksForArtifact({
      kind,
      artifactDir,
      artifactName: name,
      registryContent,
      root,
      skipSet,
      strict,
    }));
  }

  return summarizeResults(applyStrictMode(allResults, strict), artifactNames);
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
