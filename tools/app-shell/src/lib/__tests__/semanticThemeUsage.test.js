import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const SOURCE_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ARTIFACTS_ROOT = fileURLToPath(new URL('../../../../../artifacts', import.meta.url));

// These files intentionally encode data, a document contract, or a developer-only
// diagnostic palette. All application UI must use semantic theme roles instead.
const COLOR_LITERAL_EXCEPTIONS = new Map([
  ['components/contract-ui/CalendarView.jsx', 'event category identity'],
  ['components/contract-ui/productSelectorDrawerShared.jsx', 'deterministic product identity'],
  ['lib/sectionColors.js', 'application section identity'],
  ['windows/custom/fiscal-config/FiscalConfigDebugPanel.jsx', 'developer diagnostic palette'],
  ['windows/custom/fiscal-models/FmDebugPanel.jsx', 'developer diagnostic palette'],
  ['windows/custom/fiscal-models/models/349/use349Pdf.js', 'PDF document contract'],
  ['windows/custom/fiscal-monitor/FiscalMonitorDebugPanel.jsx', 'developer diagnostic palette'],
  ['windows/custom/product/ProductSidebar.jsx', 'warehouse data-series identity'],
  ['windows/custom/shared/documentPdf.js', 'PDF document contract'],
  ['windows/custom/shared/pdfUtils.js', 'PDF document contract'],
]);

// Files may retain a small, deterministic data palette without exempting their
// surrounding UI. Keep those literals narrowly scoped so new UI colors fail.
const DATA_COLOR_LITERALS = new Map([
  ['pages/quick-sales-order/ProductGrid.jsx', new Set([
    '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
    '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#06b6d4',
  ])],
]);

const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\brgba?\(\s*\d|\bhsl\(\s*\d|['"](?:white|black)['"]|\b(?:bg|text|border|ring|outline|fill|stroke)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-[0-9]{2,3})?\b/gi;

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory() && entry.name === '__tests__') return [];
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return /\.(?:js|jsx|css)$/.test(entry.name) ? [fullPath] : [];
  });
}

function artifactCustomFiles() {
  return readdirSync(ARTIFACTS_ROOT, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const customDirectory = join(ARTIFACTS_ROOT, entry.name, 'custom');
    try {
      return sourceFiles(customDirectory);
    } catch {
      return [];
    }
  });
}

function artifactGeneratedFiles() {
  return readdirSync(ARTIFACTS_ROOT, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const generatedDirectory = join(ARTIFACTS_ROOT, entry.name, 'generated');
    try {
      return sourceFiles(generatedDirectory).filter((filePath) => !filePath.endsWith('/mockData.js'));
    } catch {
      return [];
    }
  });
}

describe('semantic theme usage', () => {
  it('does not allow palette literals in application UI outside documented exceptions', () => {
    const sources = [
      ...sourceFiles(SOURCE_ROOT).map((filePath) => ({ filePath, sourcePath: relative(SOURCE_ROOT, filePath) })),
      ...artifactCustomFiles().map((filePath) => ({ filePath, sourcePath: `artifacts/${relative(ARTIFACTS_ROOT, filePath)}` })),
      ...artifactGeneratedFiles().map((filePath) => ({ filePath, sourcePath: `artifacts/${relative(ARTIFACTS_ROOT, filePath)}` })),
    ];
    const offenders = sources.flatMap(({ filePath, sourcePath }) => {
      const appSourcePath = sourcePath.replace(/^artifacts\//, '');
      if (COLOR_LITERAL_EXCEPTIONS.has(appSourcePath)) return [];
      const matches = readFileSync(filePath, 'utf8').match(COLOR_LITERAL);
      const allowedDataLiterals = DATA_COLOR_LITERALS.get(appSourcePath);
      const offenders = matches?.filter((match) => !allowedDataLiterals?.has(match.toLowerCase()));
      return offenders?.length ? [`${sourcePath}: ${offenders.join(', ')}`] : [];
    });

    assert.deepEqual(offenders, []);
  });
});
