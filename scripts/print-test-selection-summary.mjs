#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ACTIONS = {
  'no-e2e': ['Skip Playwright', 'No browser environment required'],
  'e2e-mocked': ['Run Playwright project: mocked', 'Mock server on BASE_URL (started automatically when local)'],
  'e2e-integration': ['Run Playwright project: integration', 'Prepared Etendo environment required at BASE_URL'],
  'e2e-full': ['Run every Playwright project', 'Prepared full E2E environment required at BASE_URL'],
};

export function formatSelectionSummary(plan, { base = 'unavailable', head = 'HEAD' } = {}) {
  const classification = plan.e2e ?? 'e2e-full';
  const [action, environment] = ACTIONS[classification] ?? ACTIONS['e2e-full'];
  const reasons = plan.reasons.length
    ? plan.reasons.map((reason) => `  - ${reason}`).join('\n')
    : '  - No additional reason recorded.';
  const merges = plan.mergeAnalysis ?? { count: 0, targetMerges: [], foreignMerges: [] };
  const mergeDecision = merges.count === 0
    ? 'No merges detected'
    : merges.foreignMerges.length > 0
      ? `${merges.foreignMerges.length} foreign/unknown parent(s) -> e2e-full`
      : `${merges.targetMerges.length} target synchronization parent(s) -> normal diff classification`;

  return [
    '',
    '========================================================================',
    ' PRE-PUSH TEST CLASSIFICATION',
    '========================================================================',
    ` Diff:             ${base}...${head}`,
    ` Changed files:    ${plan.files?.length ?? 0}`,
    ` Merge analysis:   ${mergeDecision}`,
    ` Test profile:     ${plan.profile}`,
    ` E2E classification: ${classification}`,
    ` Playwright action:  ${action}`,
    ` Environment:        ${environment}`,
    ` Selected sections:  ${plan.sections.join(', ') || 'none'}`,
    ' Reasons:',
    reasons,
    '========================================================================',
    '',
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: print-test-selection-summary.mjs <plan.json> [base] [head]');
  const plan = JSON.parse(readFileSync(resolve(input), 'utf8'));
  console.log(formatSelectionSummary(plan, { base: process.argv[3], head: process.argv[4] }));
}
