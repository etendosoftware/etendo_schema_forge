import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  analyzeBoundary,
  classifyPath,
  loadBoundaryPolicy,
  renderBoundaryReport,
  verticalForWindows,
} from '../src/domain-boundary/classifier.js';
import { runDomainBoundaryCheckCli } from '../src/domain-boundary-check.js';

const WINDOWS = [
  'purchase-invoice',
  'purchase-order',
  'sales-invoice',
  'sales-order',
  'sales-quotation',
];

describe('domain boundary classification', () => {
  it('maps a complete window slice across artifacts, custom UI, docs, and e2e', () => {
    const report = analyzeBoundary({
      knownWindows: WINDOWS,
      changedFiles: [
        'artifacts/sales-order/contract.json',
        'tools/app-shell/src/windows/custom/sales-order/OrderConfirmModal.jsx',
        'docs/generated-custom-windows/sales-order.md',
        'e2e/tests/flows/sales-order-crud.spec.js',
      ],
    });

    assert.equal(report.decision, 'pass');
    assert.deepEqual(report.windows, ['sales-order']);
    assert.deepEqual(report.blockers, []);
    assert.deepEqual(report.scopes.map((entry) => entry.scope), ['window:sales-order']);
  });

  it('blocks unrelated windows without a vertical or cross-domain exception', () => {
    const report = analyzeBoundary({
      knownWindows: WINDOWS,
      changedFiles: [
        'artifacts/sales-order/contract.json',
        'artifacts/purchase-order/contract.json',
      ],
    });

    assert.equal(report.decision, 'fail');
    assert.ok(report.blockers.some((blocker) => blocker.code === 'MULTIPLE_WINDOWS'));
  });

  it('allows a declared vertical slice with checklist text', () => {
    const report = analyzeBoundary({
      knownWindows: WINDOWS,
      labels: ['scope:vertical-slice'],
      prBody: 'Vertical: sales\nVentanas: sales-order, sales-invoice\nTest plan: e2e sales flow',
      changedFiles: [
        'artifacts/sales-order/contract.json',
        'artifacts/sales-invoice/contract.json',
      ],
    });

    assert.equal(report.decision, 'pass');
    assert.equal(report.vertical, 'sales');
    assert.ok(report.warnings.some((warning) => warning.code === 'VERTICAL_SLICE'));
  });

  it('blocks generator changes mixed with manual custom window code', () => {
    const report = analyzeBoundary({
      knownWindows: WINDOWS,
      changedFiles: [
        'cli/src/generate-frontend.js',
        'tools/app-shell/src/windows/custom/sales-order/OrderConfirmModal.jsx',
      ],
    });

    assert.equal(report.decision, 'fail');
    assert.ok(report.blockers.some((blocker) => blocker.code === 'GENERATOR_WITH_MANUAL_CUSTOM'));
  });

  it('allows generator changes with generated outputs only', () => {
    const report = analyzeBoundary({
      knownWindows: WINDOWS,
      changedFiles: [
        'cli/src/generate-frontend.js',
        'artifacts/sales-order/generated/web/sales-order/HeaderPage.jsx',
        'artifacts/purchase-order/generated/web/purchase-order/HeaderPage.jsx',
      ],
    });

    assert.equal(report.decision, 'pass');
  });

  it('blocks platform changes mixed with a window unless explicitly scoped', () => {
    const report = analyzeBoundary({
      knownWindows: WINDOWS,
      changedFiles: [
        'tools/app-shell/src/components/contract-ui/DetailView.jsx',
        'artifacts/sales-order/contract.json',
      ],
    });

    assert.equal(report.decision, 'fail');
    assert.ok(report.blockers.some((blocker) => blocker.code === 'PLATFORM_WITH_WINDOW'));
  });

  it('classifies app-shell-core as its own scope', () => {
    assert.deepEqual(
      classifyPath('packages/app-shell-core/src/i18n/useLabel.js', { knownWindows: WINDOWS }),
      { kind: 'app-shell-core', scope: 'app-shell-core' },
    );
  });

  it('blocks app-shell-core changes mixed with consumer wiring unless explicitly scoped', () => {
    const report = analyzeBoundary({
      knownWindows: WINDOWS,
      changedFiles: [
        'packages/app-shell-core/src/i18n/useLabel.js',
        'tools/app-shell/src/i18n/useLabel.js',
      ],
    });

    assert.equal(report.decision, 'fail');
    assert.ok(report.blockers.some((blocker) => blocker.code === 'APP_SHELL_CORE_MIXED_SCOPE'));
  });

  it('allows app-shell-core wiring when platform scope is explicit', () => {
    const report = analyzeBoundary({
      knownWindows: WINDOWS,
      labels: ['scope:platform-change'],
      changedFiles: [
        'packages/app-shell-core/src/i18n/useLabel.js',
        'tools/app-shell/src/i18n/useLabel.js',
      ],
    });

    assert.equal(report.decision, 'pass');
  });

  it('allows locale-only app-shell-core changes paired with a single window (i18n key additions)', () => {
    const report = analyzeBoundary({
      knownWindows: WINDOWS,
      changedFiles: [
        'packages/app-shell-core/src/locales/en_US.json',
        'packages/app-shell-core/src/locales/es_ES.json',
        'tools/app-shell/src/windows/custom/sales-order/SalesOrderForm.jsx',
        'tools/app-shell/src/windows/custom/sales-order/__tests__/SalesOrderForm.test.js',
      ],
    });

    assert.equal(report.decision, 'pass');
    assert.deepEqual(report.blockers, []);
  });

  it('still blocks locale changes paired with multiple windows', () => {
    const report = analyzeBoundary({
      knownWindows: WINDOWS,
      changedFiles: [
        'packages/app-shell-core/src/locales/en_US.json',
        'tools/app-shell/src/windows/custom/sales-order/SalesOrderForm.jsx',
        'tools/app-shell/src/windows/custom/purchase-order/PurchaseOrderForm.jsx',
      ],
    });

    assert.equal(report.decision, 'fail');
  });

  it('still blocks locale changes paired with non-locale app-shell-core files', () => {
    const report = analyzeBoundary({
      knownWindows: WINDOWS,
      changedFiles: [
        'packages/app-shell-core/src/locales/en_US.json',
        'packages/app-shell-core/src/i18n/useLabel.js',
        'tools/app-shell/src/windows/custom/sales-order/SalesOrderForm.jsx',
      ],
    });

    assert.equal(report.decision, 'fail');
    assert.ok(report.blockers.some((b) => b.code === 'APP_SHELL_CORE_MIXED_SCOPE'));
  });

  it('classifies app-shell test harness files as platform', () => {
    assert.deepEqual(
      classifyPath('tools/app-shell/src/test/mockUseApiFetch.js', { knownWindows: WINDOWS }),
      { kind: 'platform-change', scope: 'platform-change' },
    );
    assert.deepEqual(
      classifyPath('tools/app-shell/test/PdfViewer.test.js', { knownWindows: WINDOWS }),
      { kind: 'platform-change', scope: 'platform-change' },
    );
  });

  it('classifies finance-feature shared components as platform', () => {
    assert.deepEqual(
      classifyPath('tools/app-shell/src/components/financial-accounts/AccountsToolbar.jsx', { knownWindows: WINDOWS }),
      { kind: 'platform-change', scope: 'platform-change' },
    );
    assert.deepEqual(
      classifyPath('tools/app-shell/src/components/payment/PaymentForm.jsx', { knownWindows: WINDOWS }),
      { kind: 'platform-change', scope: 'platform-change' },
    );
  });

  it('classifies CLI tests with the generator boundary', () => {
    assert.deepEqual(
      classifyPath('cli/test/i18n-integration.test.js', { knownWindows: WINDOWS }),
      { kind: 'generator-change', scope: 'generator-change' },
    );
  });

  it('classifies CLI test runners with the generator boundary', () => {
    assert.deepEqual(
      classifyPath('cli/src/run-aggregate-tests.js', { knownWindows: WINDOWS }),
      { kind: 'generator-change', scope: 'generator-change' },
    );
    assert.deepEqual(
      classifyPath('cli/src/run-contract-tests.js', { knownWindows: WINDOWS }),
      { kind: 'generator-change', scope: 'generator-change' },
    );
  });

  it('classifies CLI migration and validation tooling with the generator boundary', () => {
    for (const file of [
      'cli/src/migrate-api-keys.js',
      'cli/src/migrations/migrate-all.js',
      'cli/src/validate-field-names.js',
      'cli/src/validate-pipeline.js',
    ]) {
      assert.deepEqual(
        classifyPath(file, { knownWindows: WINDOWS }),
        { kind: 'generator-change', scope: 'generator-change' },
        `expected ${file} to classify as generator-change`,
      );
    }
  });

  it('classifies neo-writer and cli/src/lib helpers with the generator boundary', () => {
    assert.deepEqual(
      classifyPath('cli/src/neo-writer.js', { knownWindows: WINDOWS }),
      { kind: 'generator-change', scope: 'generator-change' },
    );
    assert.deepEqual(
      classifyPath('cli/src/lib/neo-delta.js', { knownWindows: WINDOWS }),
      { kind: 'generator-change', scope: 'generator-change' },
    );
  });

  it('classifies .claude agent/tooling config as repo infra', () => {
    assert.equal(
      classifyPath('.claude/agents/foo.md', { knownWindows: WINDOWS }).scope,
      'repo-infra',
    );
  });

  it('classifies agentic-validation docs as repo infra', () => {
    assert.equal(
      classifyPath('docs/agentic-validation/bar.md', { knownWindows: WINDOWS }).scope,
      'repo-infra',
    );
  });

  it('classifies npm registry config as repo infra', () => {
    assert.deepEqual(
      classifyPath('.npmrc', { knownWindows: WINDOWS }),
      { kind: 'repo-infra', scope: 'repo-infra' },
    );
  });

  it('classifies the Sonar wrapper script as repo infra', () => {
    assert.deepEqual(
      classifyPath('run-sonar.sh', { knownWindows: WINDOWS }),
      { kind: 'repo-infra', scope: 'repo-infra' },
    );
  });

  it('classifies stack publishing packages as repo infra', () => {
    assert.deepEqual(
      classifyPath('packages/schema-forge-stack/src/index.js', { knownWindows: WINDOWS }),
      { kind: 'schema-forge-stack-package', scope: 'repo-infra' },
    );
    assert.deepEqual(
      classifyPath('packages/schema-forge-agent-context/src/index.js', { knownWindows: WINDOWS }),
      { kind: 'schema-forge-stack-package', scope: 'repo-infra' },
    );
  });

  it('classifies domain boundary gate implementation as repo infra', () => {
    assert.deepEqual(
      classifyPath('packages/schema-forge-core/src/domain-boundary/classifier.js', { knownWindows: WINDOWS }),
      { kind: 'domain-boundary-gate', scope: 'repo-infra' },
    );
    assert.deepEqual(
      classifyPath('packages/schema-forge-core/test/domain-boundary-check.test.js', { knownWindows: WINDOWS }),
      { kind: 'domain-boundary-gate', scope: 'repo-infra' },
    );
  });

  it('allows registry registration with a single window slice', () => {
    const report = analyzeBoundary({
      knownWindows: WINDOWS,
      changedFiles: [
        'tools/app-shell/src/windows/registry.js',
        'artifacts/sales-order/contract.json',
      ],
    });

    assert.equal(report.decision, 'pass');
  });

  it('requires a plan in addition to cross-domain-approved label', () => {
    const report = analyzeBoundary({
      knownWindows: WINDOWS,
      labels: ['cross-domain-approved'],
      changedFiles: [
        'tools/app-shell/src/components/contract-ui/DetailView.jsx',
        'artifacts/sales-order/contract.json',
      ],
    });

    assert.equal(report.decision, 'fail');
    assert.ok(report.blockers.some((blocker) => blocker.code === 'CROSS_DOMAIN_PLAN_MISSING'));
  });

  it('accepts a cross-domain plan file with the exception label', () => {
    const report = analyzeBoundary({
      knownWindows: WINDOWS,
      labels: ['cross-domain-approved'],
      changedFiles: [
        'tools/app-shell/src/components/contract-ui/DetailView.jsx',
        'artifacts/sales-order/contract.json',
        'docs/plans/ETP-4100-cross-domain.md',
      ],
    });

    assert.equal(report.decision, 'pass');
    assert.ok(report.warnings.some((warning) => warning.code === 'CROSS_DOMAIN_APPROVED'));
  });

  it('passes merge-block PRs without a plan (aggregated cross-branch merge)', () => {
    const report = analyzeBoundary({
      knownWindows: WINDOWS,
      labels: ['merge-block'],
      changedFiles: [
        'tools/app-shell/src/components/contract-ui/DetailView.jsx',
        'cli/src/generate-frontend.js',
        'packages/app-shell-core/src/locales/es_ES.json',
        'artifacts/sales-order/contract.json',
        'artifacts/purchase-order/contract.json',
      ],
    });

    assert.equal(report.decision, 'pass');
    assert.ok(report.warnings.some((warning) => warning.code === 'MERGE_BLOCK'));
    assert.equal(report.blockers.length, 0);
  });

  it('does not require a cross-domain plan when merge-block is combined with cross-domain-approved', () => {
    const report = analyzeBoundary({
      knownWindows: WINDOWS,
      labels: ['merge-block', 'cross-domain-approved'],
      changedFiles: [
        'tools/app-shell/src/components/contract-ui/DetailView.jsx',
        'artifacts/sales-order/contract.json',
      ],
    });

    assert.equal(report.decision, 'pass');
    assert.ok(!report.blockers.some((blocker) => blocker.code === 'CROSS_DOMAIN_PLAN_MISSING'));
  });

  it('does not treat root lockfiles as neutral when multiple domains are changed', () => {
    const report = analyzeBoundary({
      knownWindows: WINDOWS,
      changedFiles: [
        'package-lock.json',
        'cli/package.json',
        'tools/app-shell/package.json',
      ],
    });

    assert.equal(report.decision, 'fail');
    assert.ok(report.blockers.some((blocker) => blocker.code === 'ROOT_SENSITIVE_FILES'));
  });

  it('allows a root lockfile with one mechanically related domain', () => {
    const report = analyzeBoundary({
      knownWindows: WINDOWS,
      changedFiles: [
        'package-lock.json',
        'cli/package.json',
      ],
    });

    assert.equal(report.decision, 'pass');
  });

  it('allows a root lockfile with app-shell-core package metadata', () => {
    const report = analyzeBoundary({
      knownWindows: WINDOWS,
      changedFiles: [
        'package-lock.json',
        'packages/app-shell-core/package.json',
      ],
    });

    assert.equal(report.decision, 'pass');
  });

  it('allows a root lockfile with stack package metadata', () => {
    const report = analyzeBoundary({
      knownWindows: WINDOWS,
      changedFiles: [
        'package-lock.json',
        'packages/schema-forge-stack/package.json',
        'packages/schema-forge-stack/src/index.js',
      ],
    });

    assert.equal(report.decision, 'pass');
  });
});

describe('domain boundary helpers', () => {
  it('classifies shared custom helpers as shared-custom-capability', () => {
    assert.deepEqual(
      classifyPath('tools/app-shell/src/windows/custom/shared/InvoicePaymentModal.jsx', { knownWindows: WINDOWS }),
      { kind: 'shared-custom-capability', scope: 'shared-custom-capability' },
    );
  });

  it('detects verticals from touched windows', () => {
    assert.equal(verticalForWindows([]), null);
    assert.equal(verticalForWindows(['sales-order', 'sales-invoice']), 'sales');
    assert.equal(verticalForWindows(['sales-order', 'purchase-order']), null);
  });

  it('allows repository policy to add vertical windows without code changes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-boundary-policy-'));
    const policyFile = join(dir, 'domain-boundary.config.json');
    writeFileSync(policyFile, JSON.stringify({
      verticalWindows: {
        aftermarket: ['warranty-claim', 'service-order'],
      },
      patternGroups: [{
        id: 'custom-generator-fixtures',
        kind: 'generator-change',
        scope: 'generator-change',
        patterns: ['^fixtures/generator/'],
      }],
    }));

    const policy = loadBoundaryPolicy(dir, policyFile);
    assert.equal(verticalForWindows(['warranty-claim', 'service-order'], policy), 'aftermarket');
    assert.deepEqual(
      classifyPath('fixtures/generator/sample.json', { knownWindows: WINDOWS, policy }),
      { kind: 'generator-change', scope: 'generator-change' },
    );
  });

  it('supports policy files from the CLI', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-boundary-cli-'));
    const policyFile = join(dir, 'domain-boundary.config.json');
    writeFileSync(policyFile, JSON.stringify({
      patternGroups: [{
        id: 'local-docs',
        kind: 'repo-infra',
        scope: 'repo-infra',
        patterns: ['^local-docs/'],
      }],
    }));

    const output = [];
    const exitCode = runDomainBoundaryCheckCli([
      '--policy-file',
      policyFile,
      '--changed-file',
      'local-docs/readme.md',
    ], {
      cwd: dir,
      stdout: (message) => output.push(message),
      stderr: (message) => output.push(message),
    });

    assert.equal(exitCode, 0);
    assert.match(output.join('\n'), /Decision: \*\*PASS\*\*/);
  });

  it('renders a markdown report with the marker used by the workflow comment', () => {
    const report = analyzeBoundary({
      knownWindows: WINDOWS,
      changedFiles: ['artifacts/sales-order/contract.json'],
    });

    assert.match(renderBoundaryReport(report), /<!-- domain-boundary-check -->/);
    assert.match(renderBoundaryReport(report), /Decision: \*\*PASS\*\*/);
  });
});
