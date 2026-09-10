/**
 * ETP-5108 — no application component may put itself on a system-font stack.
 *
 * The design system declares its typeface in exactly ONE place: the `body` rule
 * in the core's `styles.css` (`font-family: 'Inter', -apple-system, ...`), which
 * every component inherits. There is no `--font-sans` token in the app and the
 * core's `tailwind-preset.js` does not extend `theme.fontFamily`, so inheritance
 * is the whole mechanism — nothing else re-establishes Inter further down the tree.
 *
 * That makes a single inline `fontFamily` enough to take a whole subtree off the
 * design system, silently: no error, no visual clue beyond slightly different
 * letterforms. It happened in both document-confirmation modals, which declared
 *
 *     fontFamily: 'system-ui, -apple-system, sans-serif'
 *
 * on their shell, so the title, the subtitle, the generated-document card and the
 * buttons all rendered in whatever sans the visitor's OS ships instead of Inter.
 * The reported symptom was the document number inside the card looking like a
 * different, monospace-ish typeface — its digit widths simply are not Inter's.
 *
 * The ban is deliberately narrow, so it catches that bug and nothing else:
 *
 *  - Only the FIRST family of a stack is judged. `'Inter', -apple-system, ...` is
 *    the design system's own stack — the system families are its fallbacks and
 *    must stay allowed. A stack that LEADS with a system family is the bug.
 *  - Monospace is not banned. `JetBrains Mono` for document identifiers and
 *    `font-mono` in the developer tools are deliberate typeface choices, not
 *    accidental losses of Inter.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const SOURCE_ROOT = fileURLToPath(new URL('../src', import.meta.url));
const ARTIFACTS_ROOT = fileURLToPath(new URL('../../../artifacts', import.meta.url));

/**
 * Files that lead with a system font, with the reason. Kept to the two that
 * actually do: both render OUTSIDE the app's `body`, so neither can inherit the
 * design system. Note the PDF stacks (`documentPdf.js`, `pdfUtils.js`,
 * `use349Pdf.js`) need NO exception — they already lead with Inter and name the
 * system families only as fallbacks, so they stay covered by the rule.
 *
 * `ReportDrawer.jsx` is a follow-up candidate rather than a permanent carve-out:
 * its document could name Inter first, the way the PDF stacks do. Out of scope
 * for ETP-5108, whose subject is the confirmation modals.
 */
const SYSTEM_FONT_EXCEPTIONS = new Map([
  ['components/contract-ui/ReportDrawer.jsx', 'CSS for a window.open() document, outside the app body'],
  ['windows/PlaceholderWindow.jsx', 'development placeholder screen'],
]);

/** Families that mean "whatever the OS ships" — never a design-system choice. */
const SYSTEM_FAMILIES = new Set([
  'system-ui',
  'ui-sans-serif',
  '-apple-system',
  'blinkmacsystemfont',
  'segoe ui',
  'sans-serif',
  'roboto',
  'helvetica',
  'helvetica neue',
  'arial',
]);

/**
 * Strips comments so the explanatory notes the fix left behind — which spell out
 * the banned value verbatim — are not read as declarations.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Every font-family value declared in comment-free source, in both spellings the
 * codebase uses: the JSX inline-style `fontFamily: '...'` and the CSS-in-JS /
 * stylesheet `font-family: ...`.
 */
function fontFamilyValues(source) {
  const values = [];
  const patterns = [
    /fontFamily\s*:\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)/g,
    /font-family\s*:\s*([^;}"'`\n]*)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const value = match[1] ?? match[2] ?? match[3] ?? match[4];
      if (value) values.push(value.trim());
    }
  }
  return values;
}

/** The leading family of a stack, unquoted and lowercased; '' when unreadable. */
function leadingFamily(value) {
  const first = value.split(',')[0].trim();
  return first.replace(/^['"]|['"]$/g, '').toLowerCase();
}

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
    try {
      return sourceFiles(join(ARTIFACTS_ROOT, entry.name, 'custom'));
    } catch {
      return [];
    }
  });
}

/** `{ sourcePath, filePath }` for every scanned file, app paths first. */
function scannedSources() {
  return [
    ...sourceFiles(SOURCE_ROOT).map((filePath) => ({
      filePath,
      sourcePath: relative(SOURCE_ROOT, filePath),
    })),
    ...artifactCustomFiles().map((filePath) => ({
      filePath,
      sourcePath: `artifacts/${relative(ARTIFACTS_ROOT, filePath)}`,
    })),
  ];
}

/** Every `path: value` that leads with a system family, exceptions removed. */
function systemFontOffenders(sources) {
  return sources.flatMap(({ filePath, sourcePath }) => {
    const appSourcePath = sourcePath.replace(/^artifacts\//, '');
    if (SYSTEM_FONT_EXCEPTIONS.has(appSourcePath)) return [];
    const values = fontFamilyValues(stripComments(readFileSync(filePath, 'utf8')));
    return values
      .filter((value) => SYSTEM_FAMILIES.has(leadingFamily(value)))
      .map((value) => `${sourcePath}: font-family: ${value}`);
  });
}

describe('no system-font stack in application UI (ETP-5108)', () => {
  it('scans a meaningful number of files (the walker still resolves both roots)', () => {
    assert.ok(
      scannedSources().length > 100,
      'expected the source walk to find the app tree and the artifact custom components'
    );
  });

  it('no component leads its font-family with a system family', () => {
    assert.deepEqual(
      systemFontOffenders(scannedSources()),
      [],
      'a font-family that LEADS with a system family takes its subtree off the ' +
        "design system's Inter. Inherit from `body` instead of declaring a family, " +
        'or, if the code renders outside the app body (a PDF or a window.open() ' +
        'document), add it to SYSTEM_FONT_EXCEPTIONS with a reason.'
    );
  });

  it('the two document-confirmation modals declare no font-family at all', () => {
    const modals = [
      'components/contract-ui/ConfirmResultModal.jsx',
      'components/contract-ui/ConfirmInOutModal.jsx',
    ];
    for (const sourcePath of modals) {
      const source = stripComments(readFileSync(join(SOURCE_ROOT, sourcePath), 'utf8'));
      assert.deepEqual(
        fontFamilyValues(source),
        [],
        `[${sourcePath}] the modal shell must inherit its typeface from body — ` +
          'declaring one here is what mixed typefaces inside the document card (ETP-5108)'
      );
    }
  });

  it('recognises the design system stack itself as allowed', () => {
    // Guards the rule's precision: the core's own body stack names system
    // families as FALLBACKS after Inter, and must never be flagged.
    const designSystemStack = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    assert.equal(leadingFamily(designSystemStack), 'inter');
    assert.ok(!SYSTEM_FAMILIES.has(leadingFamily(designSystemStack)));
  });

  it('flags a stack that leads with a system family', () => {
    // The exact declaration this ticket removed from both modals.
    assert.ok(SYSTEM_FAMILIES.has(leadingFamily('system-ui, -apple-system, sans-serif')));
  });

  it('leaves deliberate monospace choices alone', () => {
    assert.ok(!SYSTEM_FAMILIES.has(leadingFamily('JetBrains Mono, monospace')));
    assert.ok(!SYSTEM_FAMILIES.has(leadingFamily('var(--font-mono, monospace)')));
  });

  it('reads a family out of both spellings used in the codebase', () => {
    assert.deepEqual(fontFamilyValues("style={{ fontFamily: 'Inter, sans-serif' }}"), ['Inter, sans-serif']);
    assert.deepEqual(fontFamilyValues('body { font-family: Inter, sans-serif; }'), ['Inter, sans-serif']);
  });

  it('ignores a banned value that only appears inside a comment', () => {
    const commented = [
      '// fontFamily: \'system-ui, -apple-system, sans-serif\' was removed here',
      '/* font-family: system-ui; */',
    ].join('\n');
    assert.deepEqual(fontFamilyValues(stripComments(commented)), []);
  });
});
