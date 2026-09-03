import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * FundsTransferModal guardrail — the completion callback has exactly one name.
 *
 * `FundsTransferModal` signals a finished transfer by calling its `onSuccess` prop, and
 * nothing else. React silently ignores a prop the component does not read, so a mount site
 * that wires the refresh to `onDone` compiles, renders, transfers, and then does nothing:
 * the transfer itself goes through perfectly while the grid that launched it keeps showing
 * stale balances. No crash, no console warning, no failing render test — which is exactly
 * how `artifacts/financial-account/custom/AccountsHeaderTable.jsx` shipped `onDone={reload}`
 * while `MovementsTab.jsx`, twelve directories away, had it right all along.
 *
 * That distance is the point. A behavioural test at one mount site proves nothing about the
 * other, and the two live in DIFFERENT TREES — `tools/app-shell/src/` and `artifacts/` — so
 * a search that only covers the component's own neighbourhood misses half of them. This test
 * sweeps both trees, so a third mount site added anywhere is covered the day it is written.
 *
 * Deliberately narrow: it checks one component's one callback, not JSX props in general.
 * If `FundsTransferModal` ever grows a second required callback, add it to REQUIRED_PROPS;
 * if a prop name is retired, add it to FORBIDDEN_PROPS with the reason it was retired.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_SHELL = join(__dirname, '..');
const REPO_ROOT = join(APP_SHELL, '..', '..');

const COMPONENT = 'FundsTransferModal';

// Both trees that may mount the component. The split is the whole reason the bug survived.
const ROOTS = [
  join(APP_SHELL, 'src'),
  join(REPO_ROOT, 'artifacts'),
];

// The component's own definition file — it declares the props, it does not mount itself.
const DEFINITION = join(APP_SHELL, 'src', 'windows', 'custom', 'financial-account', `${COMPONENT}.jsx`);

const REQUIRED_PROPS = [
  { name: 'onSuccess', why: 'the only callback the modal fires when the transfer completes' },
];

const FORBIDDEN_PROPS = [
  { name: 'onDone', why: 'never read by the modal; silently skipped the caller\'s refresh' },
];

function collectSourceFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      collectSourceFiles(full, acc);
      continue;
    }
    if (!/\.jsx?$/.test(entry)) continue;
    if (/\.(test|vitest)\.jsx?$/.test(entry)) continue;
    acc.push(full);
  }
  return acc;
}

/**
 * Blanks out comments while preserving offsets, so prose that names the component or the
 * retired prop does not read as code. Needed here in particular: the fixed mount site left
 * an explanatory comment that spells out "onSuccess, not onDone" right above the tag.
 */
function blankComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

/**
 * Returns the text of the opening tag starting at `open` — everything from the tag name up
 * to the `>` that closes it. Brace depth is tracked so that a prop whose value is an inline
 * arrow (`onClose={() => setX(null)}`) does not end the tag at the `>` of its own arrow.
 */
function readOpeningTag(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    const c = code[i];
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return code.slice(open, i + 1);
  }
  return code.slice(open); // Unterminated tag; hand back what there is rather than crash.
}

/** Every `<FundsTransferModal …>` opening tag across both trees, with file + line. */
function findMountSites() {
  const sites = [];
  // `(?![A-Za-z0-9_])` stops `<FundsTransferModalFooter` from matching.
  const tag = new RegExp(`<${COMPONENT}(?![A-Za-z0-9_])`, 'g');
  for (const root of ROOTS) {
    for (const file of collectSourceFiles(root)) {
      if (file === DEFINITION) continue;
      const code = blankComments(readFileSync(file, 'utf8'));
      tag.lastIndex = 0;
      let m;
      while ((m = tag.exec(code)) !== null) {
        sites.push({
          file: relative(REPO_ROOT, file).split(sep).join('/'),
          line: code.slice(0, m.index).split('\n').length,
          tag: readOpeningTag(code, m.index),
        });
      }
    }
  }
  return sites;
}

const SITES = findMountSites();

/** Matches `name={…}` / `name=…` / bare `name` as a prop of the tag, not a substring. */
function hasProp(tagText, prop) {
  return new RegExp(`(?<![A-Za-z0-9_$])${prop}\\s*=`).test(tagText);
}

const at = (s) => `${s.file}:${s.line}`;

describe(`${COMPONENT} callback wiring`, () => {
  it('finds at least one mount site in each tree it sweeps', () => {
    // Without this the whole file degrades into a no-op the moment the component is
    // renamed or moved: zero mount sites trivially satisfy every assertion below.
    assert.ok(
      SITES.length > 0,
      `No <${COMPONENT} …> mount site found under:\n`
      + ROOTS.map((r) => `  - ${relative(REPO_ROOT, r).split(sep).join('/')}`).join('\n')
      + `\n\nIf the component was renamed or moved, update COMPONENT/ROOTS in this test.\n`
      + 'A guard that finds nothing passes for the wrong reason.',
    );
  });

  for (const { name, why } of REQUIRED_PROPS) {
    it(`every mount site passes ${name}`, () => {
      const offenders = SITES.filter((s) => !hasProp(s.tag, name)).map(at);

      assert.deepEqual(
        offenders,
        [],
        `These <${COMPONENT} …> mount sites never receive ${name}, so nothing happens when\n`
        + 'the transfer completes — the transfer succeeds and the caller never refreshes:\n'
        + offenders.map((o) => `  - ${o}`).join('\n')
        + `\n\nPass ${name} (${why}):\n`
        + `  <${COMPONENT} sourceAccountId={…} onClose={…} ${name}={reload} />\n`,
      );
    });
  }

  for (const { name, why } of FORBIDDEN_PROPS) {
    it(`no mount site passes ${name} (the historical regression)`, () => {
      const offenders = SITES.filter((s) => hasProp(s.tag, name)).map(at);

      assert.deepEqual(
        offenders,
        [],
        `These <${COMPONENT} …> mount sites pass ${name}, which the modal does not read —\n`
        + `${why}. React ignores an unknown prop without a warning, so this fails silently:\n`
        + offenders.map((o) => `  - ${o}`).join('\n')
        + `\n\nRename it to onSuccess:\n`
        + `  -  ${name}={reload}\n`
        + `  +  onSuccess={reload}\n`,
      );
    });
  }

  it('onSuccess is still the prop the component actually reads', () => {
    // The assertions above are only meaningful while the modal's own signature agrees.
    // If someone renames the callback in the component, this is what says so out loud.
    const src = readFileSync(DEFINITION, 'utf8');
    const signature = src.slice(src.indexOf(`export function ${COMPONENT}`));
    const params = signature.slice(0, signature.indexOf(')') + 1);

    assert.match(
      params,
      /(?<![A-Za-z0-9_$])onSuccess(?![A-Za-z0-9_$])/,
      `${COMPONENT} no longer destructures onSuccess. If the callback was renamed, update\n`
      + 'REQUIRED_PROPS here and every mount site — otherwise the rename is silent at runtime.',
    );

    for (const { name } of FORBIDDEN_PROPS) {
      assert.doesNotMatch(
        params,
        new RegExp(`(?<![A-Za-z0-9_$])${name}(?![A-Za-z0-9_$])`),
        `${COMPONENT} now accepts ${name}; it is listed as forbidden at mount sites.\n`
        + 'Reconcile FORBIDDEN_PROPS with the component signature.',
      );
    }
  });
});
