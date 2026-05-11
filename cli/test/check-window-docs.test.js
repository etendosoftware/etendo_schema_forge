import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  analyzeWindowDocChanges,
  formatWindowDocReport,
  getChangedFiles,
  isTestingPath,
  toKebabCase,
  windowDocFromPath,
  windowFromChangedPath,
} from '../src/check-window-docs.js';

describe('check-window-docs path mapping', () => {
  it('normalizes custom window directories to kebab-case slugs', () => {
    assert.equal(toKebabCase('businessPartner'), 'business-partner');
    assert.equal(windowFromChangedPath('tools/app-shell/src/windows/custom/businessPartner/BusinessPartnerSidebar.jsx'), 'business-partner');
    assert.equal(windowFromChangedPath('tools/app-shell/src/windows/custom/product/ProductGallery.jsx'), 'product');
  });

  it('detects artifact windows and ignores shared custom helpers', () => {
    assert.equal(windowFromChangedPath('artifacts/sales-order/decisions.json'), 'sales-order');
    assert.equal(windowFromChangedPath('tools/app-shell/src/windows/custom/shared/useInvoicePdf.js'), null);
    assert.equal(windowFromChangedPath('tools/app-shell/src/windows/custom/README.md'), null);
  });

  it('ignores test files under artifact and custom window directories', () => {
    assert.equal(isTestingPath('artifacts/sales-order/custom/__tests__/OrderDraftChips.test.js'), true);
    assert.equal(isTestingPath('tools/app-shell/src/windows/custom/warehouse/__tests__/WarehouseSummary.test.js'), true);
    assert.equal(isTestingPath('artifacts/purchase-order/generated/web/purchase-order/HeaderPage.spec.jsx'), true);
    assert.equal(windowFromChangedPath('artifacts/sales-order/custom/__tests__/OrderDraftChips.test.js'), null);
    assert.equal(windowFromChangedPath('tools/app-shell/src/windows/custom/warehouse/__tests__/WarehouseSummary.test.js'), null);
    assert.equal(windowFromChangedPath('artifacts/purchase-order/generated/web/purchase-order/HeaderPage.spec.jsx'), null);
  });

  it('only treats per-window generated-custom-windows docs as satisfying updates', () => {
    assert.equal(windowDocFromPath('docs/generated-custom-windows/sales-order.md'), 'sales-order');
    assert.equal(windowDocFromPath('docs/generated-custom-windows/app-shell-functional-flows.md'), null);
    assert.equal(windowDocFromPath('docs/generated-custom-windows/INDEX.md'), null);
  });
});

describe('analyzeWindowDocChanges', () => {
  it('passes when each affected window doc changes in the same diff', () => {
    const analysis = analyzeWindowDocChanges([
      'artifacts/sales-order/decisions.json',
      'tools/app-shell/src/windows/custom/businessPartner/BusinessPartnerSidebar.jsx',
      'docs/generated-custom-windows/sales-order.md',
      'docs/generated-custom-windows/business-partner.md',
      'docs/generated-custom-windows/app-shell-functional-flows.md',
    ]);

    assert.deepEqual(analysis.affectedWindows, ['business-partner', 'sales-order']);
    assert.deepEqual(analysis.updatedDocWindows, ['business-partner', 'sales-order']);
    assert.deepEqual(analysis.missingWindows, []);
  });

  it('fails when a window changes without its dedicated doc update', () => {
    const analysis = analyzeWindowDocChanges([
      'artifacts/goods-receipt/decisions.json',
      'docs/generated-custom-windows/app-shell-functional-flows.md',
    ]);

    assert.deepEqual(analysis.affectedWindows, ['goods-receipt']);
    assert.deepEqual(analysis.updatedDocWindows, []);
    assert.deepEqual(analysis.missingWindows, [{
      windowName: 'goods-receipt',
      docPath: 'docs/generated-custom-windows/goods-receipt.md',
      docExists: true,
    }]);
    assert.match(formatWindowDocReport(analysis), /Update docs\/generated-custom-windows\/goods-receipt\.md/);
  });

  it('reports create when the window doc does not exist yet', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'window-docs-'));

    try {
      mkdirSync(join(repoDir, 'artifacts', 'new-window'), { recursive: true });
      mkdirSync(join(repoDir, 'docs', 'generated-custom-windows'), { recursive: true });
      writeFileSync(join(repoDir, 'artifacts', 'new-window', 'decisions.json'), '{}');

      const analysis = analyzeWindowDocChanges([
        'artifacts/new-window/decisions.json',
      ], { rootDir: repoDir });

      assert.deepEqual(analysis.missingWindows, [{
        windowName: 'new-window',
        docPath: 'docs/generated-custom-windows/new-window.md',
        docExists: false,
      }]);
      assert.match(formatWindowDocReport(analysis), /Create docs\/generated-custom-windows\/new-window\.md/);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('does not require window docs when only window tests change', () => {
    const analysis = analyzeWindowDocChanges([
      'artifacts/sales-order/custom/__tests__/OrderDraftChips.test.js',
      'artifacts/purchase-order/generated/web/purchase-order/__tests__/RelatedDocuments.test.js',
      'tools/app-shell/src/windows/custom/warehouse/__tests__/WarehouseSummary.test.js',
    ]);

    assert.deepEqual(analysis.affectedWindows, []);
    assert.deepEqual(analysis.updatedDocWindows, []);
    assert.deepEqual(analysis.missingWindows, []);
  });
});

describe('getChangedFiles', () => {
  it('uses the merge base so only feature changes are checked', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'window-docs-git-'));

    try {
      execFileSync('git', ['init', '-b', 'develop'], { cwd: repoDir });
      execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });
      execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });

      writeFileSync(join(repoDir, 'shared.txt'), 'base\n');
      execFileSync('git', ['add', 'shared.txt'], { cwd: repoDir });
      execFileSync('git', ['commit', '-m', 'base'], { cwd: repoDir });

      execFileSync('git', ['checkout', '-b', 'epic/ETP-3504'], { cwd: repoDir });
      writeFileSync(join(repoDir, 'base-only.txt'), 'changed on epic\n');
      execFileSync('git', ['add', 'base-only.txt'], { cwd: repoDir });
      execFileSync('git', ['commit', '-m', 'epic change'], { cwd: repoDir });

      execFileSync('git', ['checkout', '-b', 'feature/ETP-4000'], { cwd: repoDir });
      writeFileSync(join(repoDir, 'artifacts-change.txt'), 'feature change\n');
      execFileSync('git', ['add', 'artifacts-change.txt'], { cwd: repoDir });
      execFileSync('git', ['commit', '-m', 'feature change'], { cwd: repoDir });

      execFileSync('git', ['checkout', 'epic/ETP-3504'], { cwd: repoDir });
      writeFileSync(join(repoDir, 'epic-after-branch.txt'), 'later epic change\n');
      execFileSync('git', ['add', 'epic-after-branch.txt'], { cwd: repoDir });
      execFileSync('git', ['commit', '-m', 'later epic change'], { cwd: repoDir });

      execFileSync('git', ['checkout', 'feature/ETP-4000'], { cwd: repoDir });

      const baseSha = execFileSync('git', ['rev-parse', 'epic/ETP-3504'], { cwd: repoDir, encoding: 'utf8' }).trim();
      const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf8' }).trim();
      const result = getChangedFiles(baseSha, headSha, { cwd: repoDir });

      assert.ok(result.diffBase);
      assert.deepEqual(result.changedFiles, ['artifacts-change.txt']);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});
