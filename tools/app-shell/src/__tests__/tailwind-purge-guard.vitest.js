/**
 * Tailwind purge regression guard (ETP-4083).
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * Tailwind's JIT engine only emits CSS for utility classes it actually finds
 * while scanning the files listed in the `content` globs of
 * `tools/app-shell/tailwind.config.js`. Any utility class that appears ONLY in
 * files outside those globs is silently PURGED from the final CSS — the build
 * does NOT fail, the rule just vanishes and the UI loses styling.
 *
 * This bit us in ETP-4083: the UI components were moved into the
 * `app-shell-core` workspace package source, but the `content` globs only
 * scanned the app's own source and the artifacts generated output. The semantic
 * popover-surface background utility (used by PopoverContent / DateField in the
 * core package, and by NOTHING in this app's own source) was purged, so the
 * date-picker calendar popover rendered with a TRANSPARENT background.
 *
 * The fix added the workspace-packages source glob to the `content` array so
 * every package source is scanned. This test reproduces the REAL build pipeline
 * (the actual tailwind.config.js resolved through postcss + the tailwindcss
 * plugin, with the same base/components/utilities layers the app ships via the
 * app-shell-core styles entry) and asserts that the critical semantic utilities
 * — used ONLY inside the app-shell-core package source — survive the purge.
 *
 * IMPORTANT — why the guarded class names are assembled from fragments and why
 * this comment never spells them out literally:
 * the production `content` globs include the app's own source tree, which means
 * THIS TEST FILE is itself scanned by Tailwind. If the literal guarded class
 * names appeared anywhere in this file (even in a comment), Tailwind would find
 * them here and keep the utilities alive even if the package glob were removed
 * — the guard would silently stop guarding. So the class tokens are assembled
 * at runtime from pieces that never form the literal class string in source.
 * DO NOT inline them, and do not mention them literally in comments.
 *
 * IF THIS TEST FAILS: a critical semantic utility was purged from the built
 * CSS. Almost certainly the `content` globs in
 * `tools/app-shell/tailwind.config.js` no longer cover the package source files
 * that use the class (most likely the workspace-packages source glob was
 * removed or narrowed). Restore that glob so Tailwind scans the package sources
 * again. The expected glob value is logged in each assertion's failure message.
 * See ETP-4083.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../../tailwind.config.js';

const here = dirname(fileURLToPath(import.meta.url));
// tools/app-shell/ — owns tailwind.config.js, postcss.config.js and the CSS
// entry (src/index.css, which imports the app-shell-core styles entry).
const appShellRoot = resolve(here, '../..');

// Assembled at runtime so the literal class tokens never appear in this source
// file (see header). The package-source glob string is also assembled to avoid
// writing the `* / s` sequence that would prematurely close this JSDoc-style
// region in some tooling.
//
// After the core/functional repo split, app-shell-core is an installed npm
// dependency rather than a local workspace package — the glob now points at
// node_modules instead of the (now-deleted) local packages/ directory. Same
// purpose, same regression class: whatever this glob is, it must still scan
// wherever app-shell-core's source actually lives.
const EXPECTED_PACKAGE_GLOB = ['..', '..', 'node_modules', '@etendosoftware', 'app-shell-core', 'src', '**', '*.{js,jsx}'].join('/');

/**
 * The semantic utilities under guard. These are the EXACT classes that broke in
 * ETP-4083 and are the only Tailwind semantic utilities used solely inside the
 * app-shell-core package source with ZERO occurrences in the app's own source
 * (verified: every other candidate — card / muted / accent backgrounds, etc. —
 * is also used in the app source and so cannot detect a package-glob
 * regression). Class names and CSS variables are split into fragments so no
 * literal token appears in this file.
 */
const POPOVER = 'pop' + 'over';
const GUARDED_UTILITIES = [
  {
    // background color of the popover / calendar surface
    className: ['bg', POPOVER].join('-'),
    property: 'background-color',
    cssVar: '--' + POPOVER,
  },
  {
    // text color inside the popover surface
    className: ['text', POPOVER, 'foreground'].join('-'),
    property: 'color',
    cssVar: ['--' + POPOVER, 'foreground'].join('-'),
  },
];

/**
 * Build a regex matching the REAL generated rule for a utility. Tailwind emits
 * non-minified output here, e.g. a selector followed by a `property: value`
 * block where the value resolves the semantic CSS variable via `hsl(var(...))`.
 * We anchor on the class selector, the property, and the resolved CSS variable
 * (not a bare substring) so a stray mention of the class name elsewhere in the
 * stylesheet cannot make the assertion pass.
 */
function ruleRegexFor({ className, property, cssVar }) {
  const escapedClass = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedVar = cssVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `\\.${escapedClass}\\s*\\{[^}]*${property}\\s*:[^}]*var\\(\\s*${escapedVar}\\b[^}]*\\}`,
  );
}

let css = '';

beforeAll(async () => {
  // The real app entry (src/main.jsx -> src/index.css -> app-shell-core styles
  // entry) carries these three Tailwind directives plus a Google-Fonts import
  // and scrollbar resets. We feed the bare directives directly so the output is
  // pure Tailwind: the font import only adds noise and can interfere with
  // directive expansion, while the three layers below are exactly what the app
  // compiles.
  const entryCss = '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n';

  // CRITICAL: pass `tailwindConfig.content` UNCHANGED. The globs are written
  // relative to tools/app-shell/ and Tailwind resolves relative `content` globs
  // against `process.cwd()`. Vitest runs with cwd = tools/app-shell (the
  // workspace package root, where vitest.config.js lives), so the globs —
  // including the guarded workspace-packages source glob — resolve to the same
  // files the production build scans. Rewriting them to absolute paths or
  // wrapping them in `{ files: ... }` changes glob-base resolution and was
  // observed to make Tailwind scan nothing; avoid both.
  const result = await postcss([
    tailwindcss({
      ...tailwindConfig,
      content: tailwindConfig.content,
    }),
  ]).process(entryCss, { from: resolve(appShellRoot, 'src/index.css') });

  css = result.css;
}, 60_000);

describe('Tailwind purge guard (ETP-4083)', () => {
  it('scans the guarded workspace-packages source glob in the live config', () => {
    // Sanity: the config we exercised must actually contain the package glob.
    // If this fails, the regression already happened — the glob was dropped.
    expect(
      tailwindConfig.content,
      `tailwind.config.js \`content\` must include the workspace-packages ` +
        `source glob "${EXPECTED_PACKAGE_GLOB}" so Tailwind scans the ` +
        `app-shell-core package sources. See ETP-4083.`,
    ).toContain(EXPECTED_PACKAGE_GLOB);
  });

  it('produces a full stylesheet from the real Tailwind config', () => {
    // A healthy build is ~100KB+. A near-empty result means the content scan
    // found nothing (glob/cwd problem) and every assertion below is meaningless.
    expect(css.length).toBeGreaterThan(10_000);
    // Base reset is always present when the directives expanded correctly.
    expect(css).toMatch(/\*,\s*::before/);
  });

  it.each(GUARDED_UTILITIES)(
    'keeps the `$className` utility (used only in the app-shell-core package source)',
    (util) => {
      const re = ruleRegexFor(util);
      expect(
        re.test(css),
        `\n\n>>> Tailwind PURGE REGRESSION (ETP-4083) <<<\n` +
          `Expected a generated rule for ".${util.className}" resolving ` +
          `var(${util.cssVar}), but it was PURGED from the built CSS.\n` +
          `This class is used ONLY inside the app-shell-core package source and ` +
          `NOWHERE in this app's own source, so Tailwind silently drops it ` +
          `unless those package sources are scanned.\n` +
          `FIX: ensure the \`content\` globs in ` +
          `tools/app-shell/tailwind.config.js still include the ` +
          `workspace-packages source glob "${EXPECTED_PACKAGE_GLOB}". If that ` +
          `glob was removed or narrowed, restore it. See ETP-4083 and this ` +
          `file's header.\n`,
      ).toBe(true);
    },
  );
});
