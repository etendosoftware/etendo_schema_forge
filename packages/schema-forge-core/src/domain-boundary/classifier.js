import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_BOUNDARY_POLICY } from './default-policy.js';

export { DEFAULT_BOUNDARY_POLICY } from './default-policy.js';

export const VERTICAL_WINDOWS = DEFAULT_BOUNDARY_POLICY.verticalWindows;

const POLICY_FILENAMES = [
  'domain-boundary.config.json',
  '.schema-forge/domain-boundary.config.json',
];

function compilePattern(pattern) {
  return new RegExp(pattern);
}

function compilePolicy(policy = DEFAULT_BOUNDARY_POLICY) {
  return {
    ...policy,
    windowDocPattern: compilePattern(policy.windowDocPattern),
    e2eFlowPattern: compilePattern(policy.e2eFlowPattern),
    crossDomainPlanPattern: compilePattern(policy.crossDomainPlanPattern),
    repoDocPatterns: policy.repoDocPatterns.map(compilePattern),
    patternGroups: policy.patternGroups.map((group) => ({
      ...group,
      patterns: group.patterns.map(compilePattern),
    })),
  };
}

function mergePolicy(basePolicy, overridePolicy = {}) {
  const overrideGroupsById = new Map((overridePolicy.patternGroups ?? []).map((group) => [group.id, group]));
  const mergedGroups = basePolicy.patternGroups.map((group) => {
    const override = overrideGroupsById.get(group.id);
    if (!override) {
      return group;
    }
    overrideGroupsById.delete(group.id);
    return {
      ...group,
      ...override,
      patterns: override.replacePatterns ? override.patterns : [
        ...group.patterns,
        ...(override.patterns ?? []),
      ],
    };
  });

  return {
    ...basePolicy,
    ...overridePolicy,
    verticalWindows: {
      ...basePolicy.verticalWindows,
      ...(overridePolicy.verticalWindows ?? {}),
    },
    repoDocPatterns: [
      ...basePolicy.repoDocPatterns,
      ...(overridePolicy.repoDocPatterns ?? []),
    ],
    patternGroups: [
      ...mergedGroups,
      ...overrideGroupsById.values(),
    ],
  };
}

function readPolicyFile(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadBoundaryPolicy(rootDir, policyFile) {
  if (policyFile) {
    return mergePolicy(DEFAULT_BOUNDARY_POLICY, readPolicyFile(policyFile));
  }

  const found = POLICY_FILENAMES
    .map((filename) => join(rootDir, filename))
    .find((candidate) => existsSync(candidate));
  if (!found) {
    return DEFAULT_BOUNDARY_POLICY;
  }
  return mergePolicy(DEFAULT_BOUNDARY_POLICY, readPolicyFile(found));
}

function matchesAny(path, patterns) {
  return patterns.some((pattern) => pattern.test(path));
}

function addMapSet(map, key, value) {
  if (!map.has(key)) {
    map.set(key, new Set());
  }
  map.get(key).add(value);
}

function sortedSet(set) {
  return [...set].sort((left, right) => left.localeCompare(right));
}

function normalizePath(path) {
  return path.replaceAll('\\', '/').replace(/^\.?\//, '');
}

function toKebabCase(text) {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function collectArtifactWindows(rootDir) {
  const artifactsDir = join(rootDir, 'artifacts');
  if (!existsSync(artifactsDir)) {
    return [];
  }

  return readdirSync(artifactsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export function getChangedFiles({ rootDir, baseRef, headRef = 'HEAD' }) {
  const mergeBase = execFileSync('git', ['merge-base', baseRef, headRef], {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim();
  const output = execFileSync('git', ['diff', '--name-only', mergeBase, headRef], {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim();

  return {
    mergeBase,
    changedFiles: output.split('\n').map((line) => line.trim()).filter(Boolean),
  };
}

export function classifyPath(path, { knownWindows = [], policy = DEFAULT_BOUNDARY_POLICY } = {}) {
  const normalized = normalizePath(path);
  const known = new Set(knownWindows);
  const compiledPolicy = compilePolicy(policy);

  const artifactMatch = normalized.match(/^artifacts\/([^/]+)\//);
  if (artifactMatch) {
    const window = artifactMatch[1];
    if (/^artifacts\/[^/]+\/custom\//.test(normalized)) {
      return { kind: 'window-custom', scope: `window:${window}`, window };
    }
    if (/^artifacts\/[^/]+\/generated\//.test(normalized)) {
      return { kind: 'window-generated', scope: `window:${window}`, window };
    }
    if (/^artifacts\/[^/]+\/(?:contract|contract\.prev|schema|rules|decisions|mockData|generation-log|contract-changelog)/.test(normalized)) {
      return { kind: 'window-artifact', scope: `window:${window}`, window };
    }
    return { kind: 'window-artifact', scope: `window:${window}`, window };
  }

  const customMatch = normalized.match(/^tools\/app-shell\/src\/windows\/custom\/([^/]+)\//);
  if (customMatch) {
    const customDir = customMatch[1];
    if (customDir === 'shared') {
      return { kind: 'shared-custom-capability', scope: 'shared-custom-capability' };
    }
    const window = known.has(customDir) ? customDir : toKebabCase(customDir);
    return { kind: 'window-custom', scope: `window:${window}`, window };
  }

  if (normalized === 'tools/app-shell/src/windows/registry.js') {
    return { kind: 'registry', scope: 'platform-change' };
  }

  const docMatch = normalized.match(compiledPolicy.windowDocPattern);
  if (docMatch) {
    return { kind: 'window-doc', scope: `window:${docMatch[1]}`, window: docMatch[1] };
  }

  const e2eMatch = normalized.match(compiledPolicy.e2eFlowPattern);
  if (e2eMatch) {
    const specName = e2eMatch[1];
    const window = knownWindows
      .filter((candidate) => specName === candidate || specName.startsWith(`${candidate}-`))
      .sort((left, right) => right.length - left.length)[0];
    if (window) {
      return { kind: 'window-e2e', scope: `window:${window}`, window };
    }
    return { kind: 'e2e', scope: 'e2e' };
  }

  if (/^e2e\//.test(normalized)) {
    return { kind: 'e2e', scope: 'e2e' };
  }

  const matchedGroup = compiledPolicy.patternGroups.find((group) => matchesAny(normalized, group.patterns));
  if (matchedGroup) {
    return { kind: matchedGroup.kind, scope: matchedGroup.scope };
  }

  if (compiledPolicy.crossDomainPlanPattern.test(normalized)) {
    return { kind: 'cross-domain-plan', scope: 'repo-infra' };
  }

  if (matchesAny(normalized, compiledPolicy.repoDocPatterns)) {
    return { kind: 'repo-doc', scope: 'repo-infra' };
  }

  return { kind: 'unknown', scope: 'unknown' };
}

export function verticalForWindows(windows, policy = DEFAULT_BOUNDARY_POLICY) {
  const uniqueWindows = [...new Set(windows)].sort((left, right) => left.localeCompare(right));
  if (uniqueWindows.length === 0) {
    return null;
  }
  const matches = Object.entries(policy.verticalWindows)
    .filter(([, members]) => uniqueWindows.every((window) => members.includes(window)))
    .map(([vertical]) => vertical);
  return matches[0] ?? null;
}

function hasLabel(labels, name) {
  return labels.some((label) => label.toLowerCase() === name.toLowerCase());
}

function hasCrossDomainPlan({ changedFiles, prBody, policy }) {
  const compiledPolicy = compilePolicy(policy);
  if (changedFiles.some((path) => compiledPolicy.crossDomainPlanPattern.test(path))) {
    return true;
  }
  const body = prBody.toLowerCase();
  return body.includes('cross-domain')
    && body.includes('dominios')
    && body.includes('rollback')
    && body.includes('tests');
}

function hasVerticalChecklist(prBody) {
  const body = prBody.toLowerCase();
  return body.includes('vertical')
    && body.includes('ventanas')
    && body.includes('test');
}

function isRootSensitiveAllowedWithSingleScope({ rootSensitiveFiles, nonRootScopes, changedFiles }) {
  if (rootSensitiveFiles.length === 0) {
    return true;
  }
  if (nonRootScopes.length !== 1) {
    return false;
  }

  const [scope] = nonRootScopes;
  if (rootSensitiveFiles.every((path) => path === 'package-lock.json')) {
    if (scope === 'app-shell-core') {
      return changedFiles.some((path) => path === 'packages/app-shell-core/package.json');
    }
    if (scope === 'sdk-or-external-app') {
      return changedFiles.some((path) => /^packages\/apps-sdk[^/]*\/package\.json$/.test(path)
        || /^tools\/(?:quick-order-app|spike-hello-app)\/package\.json$/.test(path));
    }
    if (scope === 'platform-change' || scope.startsWith('window:')) {
      return changedFiles.some((path) => path === 'tools/app-shell/package.json');
    }
    if (scope === 'generator-change') {
      return changedFiles.some((path) => path === 'cli/package.json');
    }
    if (scope === 'repo-infra') {
      return changedFiles.some((path) => /^packages\/(?:schema-forge-agent-context|schema-forge-stack)\/package\.json$/.test(path));
    }
  }

  return false;
}

export function analyzeBoundary({
  changedFiles,
  knownWindows = [],
  labels = [],
  prBody = '',
  policy = DEFAULT_BOUNDARY_POLICY,
} = {}) {
  const normalizedFiles = changedFiles.map(normalizePath).sort((left, right) => left.localeCompare(right));
  const entries = normalizedFiles.map((path) => ({
    path,
    ...classifyPath(path, { knownWindows, policy }),
  }));

  const filesByScope = new Map();
  const kinds = new Set();
  const windows = new Set();
  for (const entry of entries) {
    addMapSet(filesByScope, entry.scope, entry.path);
    kinds.add(entry.kind);
    if (entry.window) {
      windows.add(entry.window);
    }
  }

  const allScopes = [...filesByScope.keys()].sort((left, right) => left.localeCompare(right));
  const rootSensitiveFiles = entries
    .filter((entry) => entry.kind === 'root-global-sensitive')
    .map((entry) => entry.path);
  const nonRootScopes = allScopes.filter((scope) => scope !== 'root-global-sensitive');
  const windowScopes = allScopes.filter((scope) => scope.startsWith('window:'));
  const nonSupportScopes = nonRootScopes.filter((scope) => !['repo-infra', 'e2e'].includes(scope));

  const blockers = [];
  const warnings = [];
  const crossDomainApproved = hasLabel(labels, 'cross-domain-approved');
  // A merge-block PR aggregates several already-reviewed feature branches into the epic.
  // It is cross-domain by construction, so domain-boundary blockers are skipped by design —
  // and, unlike cross-domain-approved, it does NOT require a plan (there is no single feature
  // to plan; the constituent branches carry their own review).
  const mergeBlock = hasLabel(labels, 'merge-block');
  const approvedBypass = crossDomainApproved || mergeBlock;
  const hasPlan = hasCrossDomainPlan({ changedFiles: normalizedFiles, prBody, policy });
  const vertical = verticalForWindows([...windows], policy);
  const verticalRequested = hasLabel(labels, 'scope:vertical-slice');
  const platformRequested = hasLabel(labels, 'scope:platform-change');
  const generatorRequested = hasLabel(labels, 'scope:generator-change');

  if (crossDomainApproved && !mergeBlock && !hasPlan) {
    blockers.push({
      code: 'CROSS_DOMAIN_PLAN_MISSING',
      message: 'cross-domain-approved requires docs/plans/<ticket>-cross-domain.md or a PR body plan with domains, tests, and rollback.',
    });
  }

  if (!approvedBypass) {
    const generatorCascade = nonSupportScopes.includes('generator-change')
      && nonSupportScopes.every((scope) => scope === 'generator-change' || scope.startsWith('window:'))
      && !entries.some((entry) => entry.kind === 'window-custom');

    if (windowScopes.length > 1 && !generatorCascade) {
      if (vertical && verticalRequested && hasVerticalChecklist(prBody)) {
        warnings.push({
          code: 'VERTICAL_SLICE',
          message: `Multiple windows are allowed as vertical:${vertical} because scope:vertical-slice and checklist are present.`,
        });
      } else {
        blockers.push({
          code: 'MULTIPLE_WINDOWS',
          message: `PR touches multiple windows (${sortedSet(windows).join(', ')}). Use separate PRs, scope:vertical-slice with checklist, or cross-domain-approved with plan.`,
        });
      }
    }

    if (nonSupportScopes.includes('generator-change')) {
      const hasManualCustom = entries.some((entry) => entry.kind === 'window-custom');
      if (hasManualCustom) {
        blockers.push({
          code: 'GENERATOR_WITH_MANUAL_CUSTOM',
          message: 'Generator changes cannot be mixed with manual custom window code without a cross-domain plan.',
        });
      }
      const mixedGenerator = nonSupportScopes.some((scope) => !['generator-change'].includes(scope) && !scope.startsWith('window:'));
      if (mixedGenerator && !generatorRequested) {
        blockers.push({
          code: 'GENERATOR_MIXED_SCOPE',
          message: 'Generator changes mixed with another platform/sdk scope require scope:generator-change or cross-domain-approved.',
        });
      }
    }

    const appShellCoreFiles = entries.filter((e) => e.scope === 'app-shell-core').map((e) => e.path);
    const appShellCoreOnlyLocales = appShellCoreFiles.length > 0
      && appShellCoreFiles.every((f) => /^packages\/app-shell-core\/src\/locales\//.test(f));
    const appShellCoreMixedScope = nonSupportScopes.includes('app-shell-core')
      && nonSupportScopes.some((scope) => !['app-shell-core'].includes(scope))
      && !(appShellCoreOnlyLocales && windowScopes.length === 1);
    if (appShellCoreMixedScope && !platformRequested) {
      blockers.push({
        code: 'APP_SHELL_CORE_MIXED_SCOPE',
        message: 'App shell core package changes should stay isolated or declare scope:platform-change/cross-domain-approved for consumer wiring.',
      });
    }

    const platformKinds = entries.filter((entry) => entry.scope === 'platform-change').map((entry) => entry.kind);
    const onlyRegistryPlatform = platformKinds.length > 0 && platformKinds.every((kind) => kind === 'registry');
    const platformWithWindow = nonSupportScopes.includes('platform-change') && windowScopes.length > 0;
    if (platformWithWindow && !(onlyRegistryPlatform && windowScopes.length === 1) && !platformRequested) {
      blockers.push({
        code: 'PLATFORM_WITH_WINDOW',
        message: 'Platform/shared app-shell changes cannot be mixed with window feature code without scope:platform-change or cross-domain-approved.',
      });
    }

    if (nonSupportScopes.includes('shared-custom-capability') && nonSupportScopes.length > 1) {
      blockers.push({
        code: 'SHARED_CUSTOM_WITH_FEATURE',
        message: 'Shared custom capability changes affect multiple windows and need their own PR or cross-domain plan.',
      });
    }

    if (nonSupportScopes.includes('sdk-or-external-app') && nonSupportScopes.length > 1) {
      blockers.push({
        code: 'SDK_MIXED_SCOPE',
        message: 'SDK/external app changes should not be mixed with other domains without a cross-domain plan.',
      });
    }

    if (nonSupportScopes.includes('unknown') && nonSupportScopes.length > 1) {
      blockers.push({
        code: 'UNKNOWN_WITH_FEATURE',
        message: 'Unclassified files mixed with feature code need classification or a cross-domain plan.',
      });
    }

    const repoInfraWithFeature = nonSupportScopes.includes('repo-infra') && nonSupportScopes.length > 1;
    if (repoInfraWithFeature) {
      blockers.push({
        code: 'REPO_INFRA_WITH_FEATURE',
        message: 'Repo infrastructure/docs process changes should not be mixed with feature code without a cross-domain plan.',
      });
    }

    if (!isRootSensitiveAllowedWithSingleScope({ rootSensitiveFiles, nonRootScopes, changedFiles: normalizedFiles })) {
      blockers.push({
        code: 'ROOT_SENSITIVE_FILES',
        message: 'Root sensitive files are not neutral; keep them isolated or pair them only with one mechanically related domain.',
      });
    }
  } else if (mergeBlock) {
    warnings.push({
      code: 'MERGE_BLOCK',
      message: 'merge-block label present: aggregated cross-branch merge into the epic. Domain boundary checks are skipped by design; CODEOWNER review is still required by branch protection.',
    });
  } else if (hasPlan) {
    warnings.push({
      code: 'CROSS_DOMAIN_APPROVED',
      message: 'Cross-domain approval and plan detected. CODEOWNER review is still required by branch protection.',
    });
  }

  if (normalizedFiles.length === 0) {
    warnings.push({ code: 'NO_CHANGED_FILES', message: 'No changed files detected.' });
  }

  const decision = blockers.length > 0 ? 'fail' : 'pass';
  return {
    decision,
    scopes: allScopes.map((scope) => ({
      scope,
      files: sortedSet(filesByScope.get(scope)),
    })),
    windows: sortedSet(windows),
    vertical,
    labels: [...labels].sort((left, right) => left.localeCompare(right)),
    blockers,
    warnings,
    files: entries,
  };
}

export function renderBoundaryReport(report) {
  const lines = [];
  lines.push('<!-- domain-boundary-check -->');
  lines.push('# Domain Boundary Check');
  lines.push('');
  lines.push(`Decision: **${report.decision.toUpperCase()}**`);
  lines.push('');

  if (report.blockers.length > 0) {
    lines.push('## Blocking Findings');
    lines.push('');
    for (const blocker of report.blockers) {
      lines.push(`- **${blocker.code}**: ${blocker.message}`);
    }
    lines.push('');
  }

  if (report.warnings.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    for (const warning of report.warnings) {
      lines.push(`- **${warning.code}**: ${warning.message}`);
    }
    lines.push('');
  }

  lines.push('## Detected Scopes');
  lines.push('');
  for (const entry of report.scopes) {
    lines.push(`- \`${entry.scope}\` (${entry.files.length} file${entry.files.length === 1 ? '' : 's'})`);
  }
  if (report.scopes.length === 0) {
    lines.push('- None');
  }
  lines.push('');

  if (report.windows.length > 0) {
    lines.push(`Windows: ${report.windows.map((window) => `\`${window}\``).join(', ')}`);
    lines.push('');
  }
  if (report.vertical) {
    lines.push(`Detected vertical: \`${report.vertical}\``);
    lines.push('');
  }

  lines.push('<details><summary>Changed files by scope</summary>');
  lines.push('');
  for (const entry of report.scopes) {
    lines.push(`### ${entry.scope}`);
    lines.push('');
    for (const file of entry.files) {
      lines.push(`- \`${file}\``);
    }
    lines.push('');
  }
  lines.push('</details>');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

export function loadPrBody(path) {
  if (!path || !existsSync(path)) {
    return '';
  }
  return readFileSync(path, 'utf8');
}
