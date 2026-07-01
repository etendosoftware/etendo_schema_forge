import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { stripCommentsKeepStrings, findLeaksInSource, scan } from '../src/window-leak-budget.js';

const PATTERNS = [
  "(===|!==)\\s*['\"](contact|product|order|invoice|sif|internalConsumption|internal-consumption|asset|amortization|attachments)\\b",
  "['\"]custom:[a-zA-Z]+['\"]",
  "['\"]internal-consumption[a-z-]*['\"]",
];

describe('stripCommentsKeepStrings', () => {
  it('removes line comments but keeps strings', () => {
    const out = stripCommentsKeepStrings("const s = 'custom:sif'; // field === 'product'\n");
    assert.equal(out.includes('custom:sif'), true);
    assert.equal(out.includes('product'), false);
  });
  it('removes block comments', () => {
    const out = stripCommentsKeepStrings("/* field === 'product' */ const x = 1;");
    assert.equal(out.includes('product'), false);
  });
  it('preserves line numbers', () => {
    const out = stripCommentsKeepStrings('a\n// comment\nb');
    assert.equal(out.split('\n').length, 3);
  });
});

describe('findLeaksInSource', () => {
  it('finds === window literals', () => {
    const f = findLeaksInSource("if (field === 'product') {}", PATTERNS);
    assert.equal(f.length, 1);
    assert.equal(f[0].line, 1);
  });
  it('finds custom: keys', () => {
    const f = findLeaksInSource("const I = { 'custom:sif': X, 'custom:attachments': Y };", PATTERNS);
    assert.equal(f.length, 2);
  });
  it('ignores literals that appear only in comments', () => {
    const f = findLeaksInSource("// replaces `entity === 'internalConsumption'`\nconst ok = 1;", PATTERNS);
    assert.equal(f.length, 0);
  });
  it('does not flag clean generic code', () => {
    const f = findLeaksInSource('if (field === props.lineConfig.qtyField) {}', PATTERNS);
    assert.equal(f.length, 0);
  });
  it('is monotonic: adding a leak increases the count', () => {
    const before = findLeaksInSource("if (a === 'product') {}", PATTERNS).length;
    const after = findLeaksInSource("if (a === 'product' || b === 'contact') {}", PATTERNS).length;
    assert.equal(after, before + 1);
  });
});

describe('scan (config-driven)', () => {
  it('scans a temp dir and counts findings across files', async () => {
    const { mkdtempSync, writeFileSync, rmSync, mkdirSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const root = mkdtempSync(join(tmpdir(), 'wlb-'));
    mkdirSync(join(root, 'comp'), { recursive: true });
    writeFileSync(join(root, 'comp', 'A.jsx'), "if (f === 'product') {}\nconst i = 'custom:sif';");
    writeFileSync(join(root, 'comp', 'B.jsx'), "// f === 'contact' was removed\nconst clean = 1;");
    try {
      const findings = scan(
        { paths: ['comp'], extensions: ['.jsx'], patterns: PATTERNS },
        { root },
      );
      // 2 in A.jsx, 0 in B.jsx (comment ignored)
      assert.equal(findings.length, 2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('skips __tests__ directories', async () => {
    const { mkdtempSync, writeFileSync, rmSync, mkdirSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const root = mkdtempSync(join(tmpdir(), 'wlb-'));
    mkdirSync(join(root, 'comp', '__tests__'), { recursive: true });
    writeFileSync(join(root, 'comp', '__tests__', 'x.test.jsx'), "f === 'product'");
    try {
      const findings = scan({ paths: ['comp'], extensions: ['.jsx'], patterns: PATTERNS }, { root });
      assert.equal(findings.length, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
