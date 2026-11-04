import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ETP-5948 guardrail — a picker opens on the value the field already holds.
 *
 * Reopening a selector, drawer or popup marks the committed value (check + `aria-selected`),
 * centres it, and starts the arrows from it (ETP-5846/5903/5948). The behaviour lives in shared
 * pieces — `contract-ui/selectorSelection.js` and `useLocateCommittedValue` — that each picker
 * has to wire in, and each caller has to feed with `value`. Leaving either out fails silently:
 * the picker just opens at the top again. Both live gaps found during ETP-5948 were exactly that.
 *
 * Rule A — a source file that renders `role="option"` imports `selectorSelection` (directly or
 * through `useLocateCommittedValue`), so its marker comes from the committed value and not from
 * the keyboard highlight.
 * Rule B — every JSX use of a shared picker (SearchPopup, AccountLookupPopup, the product
 * drawers, and any drawer taken from the `lookupDrawers.js` registry) passes `value=`.
 *
 * Way out, deliberately visible in a diff: a `committed-selection-ok: <reason>` comment —
 * anywhere in the file for rule A, on the tag or up to two lines above it for rule B.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..', '..');
const ROOTS = [join(REPO, 'tools', 'app-shell', 'src'), join(REPO, 'artifacts')];

const OPT_OUT = 'committed-selection-ok';
const PICKERS = ['SearchPopup', 'AccountLookupPopup', 'ProductSearchDrawer', 'ProductStockSearchDrawer', 'ProductDrawerShell'];

const ROLE_OPTION = /role\s*[=:]\s*\{?\s*(['"`])option\1/;
const USES_SELECTION = /from\s+['"][^'"]*(selectorSelection|useLocateCommittedValue)(\.js)?['"]/;
// A component taken from the lookup-drawer registry is a picker under a local name.
const REGISTRY_ALIAS = /\bconst\s+([A-Z]\w*)\s*=\s*(?:LOOKUP_DRAWERS\b|resolveLookupDrawer\s*\()/g;

function collectSourceFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (['__tests__', 'node_modules', 'generated', 'dist', '_test-support'].includes(entry)) continue;
      collectSourceFiles(full, acc);
      continue;
    }
    if (!/\.jsx?$/.test(entry) || /\.(test|vitest|spec)\.jsx?$/.test(entry)) continue;
    acc.push(full);
  }
  return acc;
}

/** Blanks comments, keeping offsets, so prose that quotes a pattern does not count as code. */
function blankComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));
}

/** Rule A: true when the file renders options without the committed-value helpers. */
export function rendersOptionsWithoutSelection(source) {
  if (source.includes(OPT_OUT)) return false;
  const code = blankComments(source);
  return ROLE_OPTION.test(code) && !USES_SELECTION.test(code);
}

/** The opening tag starting at `start` (`<Name …>`), skipping `>` inside `{…}` expressions. */
function openingTag(code, start) {
  let depth = 0;
  for (let i = start + 1; i < code.length; i += 1) {
    const ch = code[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return code.slice(start, i + 1);
  }
  return code.slice(start);
}

/** Rule B: 1-based lines of picker tags that pass no `value=`. */
export function pickerTagsWithoutValue(source) {
  const code = blankComments(source);
  const lines = source.split('\n');
  const names = new Set(PICKERS);
  for (const m of code.matchAll(REGISTRY_ALIAS)) names.add(m[1]);
  const tagRe = new RegExp(`<(${[...names].join('|')})(?=[\\s/>])`, 'g');
  const hits = [];
  for (const m of code.matchAll(tagRe)) {
    const tag = openingTag(code, m.index);
    if (/\svalue\s*=/.test(tag)) continue;
    const line = code.slice(0, m.index).split('\n').length;
    const nearby = lines.slice(Math.max(0, line - 3), line - 1 + tag.split('\n').length).join('\n');
    if (nearby.includes(OPT_OUT)) continue;
    hits.push(line);
  }
  return hits;
}

const rel = (file) => relative(REPO, file).split(sep).join('/');
const files = ROOTS.flatMap((root) => collectSourceFiles(root));

const HOW = '\n\nA picker must open on the value the field already holds: marked (check + aria-selected),\n'
  + 'centred, arrows starting from it. Use the shared pieces in contract-ui/selectorSelection.js\n'
  + '(resolveSelectedIndex, nextActiveIndex, …) and useLocateCommittedValue, and pass the field\'s\n'
  + '`value` / `valueLabel` (and `committedItem` for the stock drawer). See docs/ui-customization.md.\n'
  + `If this one genuinely has no committed value, add a "${OPT_OUT}: <reason>" comment.\n`;

describe('committed-selection policy (ETP-5948)', () => {
  it('every component rendering role="option" marks the committed value through selectorSelection', () => {
    const offenders = files.filter((f) => rendersOptionsWithoutSelection(readFileSync(f, 'utf8'))).map(rel);
    assert.deepEqual(offenders, [], 'These files render options without the committed-value helpers:\n'
      + offenders.map((o) => `  - ${o}`).join('\n') + HOW);
  });

  it('every shared picker call site passes the committed value', () => {
    const offenders = files.flatMap((f) => pickerTagsWithoutValue(readFileSync(f, 'utf8')).map((l) => `${rel(f)}:${l}`));
    assert.deepEqual(offenders, [], 'These picker call sites pass no `value`:\n'
      + offenders.map((o) => `  - ${o}`).join('\n') + HOW);
  });

  it('detects both anti-patterns and honors the opt-out comment', () => {
    // Self-check: an always-empty matcher would make the tests above pass forever.
    assert.equal(rendersOptionsWithoutSelection('<li role="option" aria-selected={i === active} />'), true);
    assert.equal(rendersOptionsWithoutSelection("const p = { role: 'option' };"), true);
    assert.equal(rendersOptionsWithoutSelection(
      "import { resolveSelectedIndex } from './selectorSelection.js';\n<li role=\"option\" />"), false);
    assert.equal(rendersOptionsWithoutSelection(
      "import useLocateCommittedValue from './useLocateCommittedValue.js';\n<li role=\"option\" />"), false);
    assert.equal(rendersOptionsWithoutSelection(`// ${OPT_OUT}: static list\n<li role="option" />`), false);
    assert.equal(rendersOptionsWithoutSelection('// a role="option" in prose only'), false);

    assert.deepEqual(pickerTagsWithoutValue('<SearchPopup\n  open={o}\n  onSelect={(x) => x > 1}\n/>'), [1]);
    assert.deepEqual(pickerTagsWithoutValue('<SearchPopup open={o} value={v} />'), []);
    assert.deepEqual(pickerTagsWithoutValue(
      "const Drawer = LOOKUP_DRAWERS[key];\nreturn <Drawer open={o} />;"), [2]);
    assert.deepEqual(pickerTagsWithoutValue(
      `{/* ${OPT_OUT}: nothing committed yet */}\n<ProductSearchDrawer open={o} />`), []);
    assert.deepEqual(pickerTagsWithoutValue('<SearchPopupHeader title="x" />'), []);
  });
});
