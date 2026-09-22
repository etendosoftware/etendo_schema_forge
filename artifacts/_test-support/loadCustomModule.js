/**
 * Test-support loader for artifact custom components.
 *
 * WHY THIS EXISTS
 * ---------------
 * The `artifacts/<window>/custom/*.jsx` import modals only `export default` a
 * React wrapper; the interesting logic (`fetchDocuments`, `buildLineBody`, ...)
 * lives in module-scope `const`s that are never exported. Plain `node --test`
 * cannot `import` those files anyway: they are JSX and they resolve the `@/`
 * alias that only the bundler provides.
 *
 * The historical workaround was to COPY those helpers into the test file and
 * assert against the copy. That is how ETP-5381 stayed green while production
 * was broken: the copy carried the same wrong API key as the source, so the
 * suite was only ever testing itself. This loader removes the copy — the tests
 * exercise the REAL production code.
 *
 * HOW IT WORKS
 * ------------
 * Everything above `export default function <Component>(props)` in these files
 * is plain JavaScript (no JSX — JSX appears only inside the component). So we
 * slice the module body at that boundary, drop the `import` lines (nothing in
 * the helpers references them), and evaluate the remainder, returning the
 * top-level `const` bindings.
 *
 * Globals such as `fetch` are resolved dynamically at call time, so a test can
 * still swap `globalThis.fetch` for a mock before invoking a helper.
 *
 * If a future refactor moves JSX above the default export, or makes a helper
 * depend on an import, this loader throws loudly instead of silently drifting.
 */
import { readFileSync } from 'node:fs';

const DEFAULT_EXPORT_RE = /^export default /m;
const IMPORT_LINE_RE = /^import\s.*?;[ \t]*$/gm;
const TOP_LEVEL_CONST_RE = /^(?:const|let|function|async function)\s+([A-Za-z_$][\w$]*)/gm;

/**
 * Read an artifact custom `.jsx` and evaluate its non-JSX module body.
 *
 * @param {string} jsxPath Absolute path to the `.jsx` file.
 * @returns {{ helpers: Record<string, unknown>, source: string, body: string }}
 *          `helpers` holds every top-level binding declared above the default
 *          export, `source` is the raw file text (for structural assertions)
 *          and `body` is the evaluated slice.
 */
export function loadCustomModule(jsxPath) {
  const source = readFileSync(jsxPath, 'utf8');

  const match = DEFAULT_EXPORT_RE.exec(source);
  if (!match) {
    throw new Error(`loadCustomModule: no default export found in ${jsxPath}`);
  }

  const body = source.slice(0, match.index).replace(IMPORT_LINE_RE, '');

  if (/^\s*</m.test(body) || /=>\s*\(\s*</.test(body)) {
    throw new Error(
      `loadCustomModule: JSX found above the default export in ${jsxPath}; `
      + 'this loader can only evaluate the plain-JavaScript prelude.',
    );
  }

  const names = [...body.matchAll(TOP_LEVEL_CONST_RE)].map(m => m[1]);
  if (names.length === 0) {
    throw new Error(`loadCustomModule: no top-level helpers found in ${jsxPath}`);
  }

  // eslint-disable-next-line no-new-func -- test-only: evaluates the real
  // production prelude so the tests cannot drift from it. See file header.
  const factory = new Function(`${body}\nreturn { ${names.join(', ')} };`);
  return { helpers: factory(), source, body };
}
