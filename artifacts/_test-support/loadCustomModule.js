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
 * slice the module body at that boundary, drop the `import` lines, and evaluate
 * the remainder, returning the top-level `const` bindings.
 *
 * IMPORTS ARE NOT FREE VARIABLES (the contract this file promises)
 * ---------------------------------------------------------------
 * Dropping an `import` line also drops the binding it introduced. If a helper
 * uses that binding, the evaluated prelude would reference an identifier that
 * does not exist, and `new Function` does not complain until the helper RUNS —
 * at which point a `try { } catch { }` in the production code can swallow the
 * `ReferenceError` and the test only sees a wrong call count. That is exactly
 * what happened when ETP-4576 migrated these modals from a bare `fetch` to
 * `import { apiFetch as moduleApiFetch } from '@/auth/api.js'`.
 *
 * So the loader now parses the local names introduced by every stripped import,
 * checks which of them the prelude actually references, and:
 *   - injects the ones the caller supplied through `bindings`, as real function
 *     parameters (so they behave like the imported bindings did), and
 *   - THROWS at load time, naming the file and the identifier, for any it
 *     references but the caller did not supply.
 * A missing import is therefore a loud failure at load, never a silent
 * `undefined` discovered at call time.
 *
 * Globals such as `fetch` are still resolved dynamically at call time, so a test
 * can swap `globalThis.fetch` for a mock AFTER loading the module. The supplied
 * bindings should preserve that property — see `apiFetchToGlobalFetch` below.
 *
 * If a future refactor moves JSX above the default export, this loader also
 * throws loudly instead of silently drifting.
 *
 * KNOWN LIMITS (deliberate, and loud when hit)
 * --------------------------------------------
 * - Only single-line `import ... ;` statements are recognised. A multi-line or
 *   semicolon-less import survives into the prelude and is rejected explicitly.
 * - Reference detection ignores comments and quoted strings, but does not parse
 *   regex literals; none of the current preludes contain one.
 */
import { readFileSync } from 'node:fs';

const DEFAULT_EXPORT_RE = /^export default /m;
const IMPORT_LINE_RE = /^import\s.*?;[ \t]*$/gm;
const TOP_LEVEL_CONST_RE = /^(?:const|let|function|async function)\s+([A-Za-z_$][\w$]*)/gm;
const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/;

/**
 * Test double for the production `apiFetch` from `@/auth/api.js`.
 *
 * NOT a faithful reimplementation: production `apiFetch(url, options)` also
 * resolves the base URL and adds the credential / CSRF headers. This stub only
 * forwards both arguments to `globalThis.fetch`, which is what the modal tests
 * need — they mock `globalThis.fetch` and assert on the recorded `url`,
 * `method` and `body`, so the helpers under test stay the real production ones.
 * Header/credential behaviour is covered elsewhere (`no-raw-fetch.test.js`,
 * `auth-header-policy.test.js`, `sessionContractInvariants.test.js`).
 *
 * `globalThis.fetch` is read at CALL time, so a test may install its mock after
 * the module has been loaded.
 */
export function apiFetchToGlobalFetch(url, options) {
  return globalThis.fetch(url, options);
}

/**
 * Local binding names introduced by one `import` statement.
 * Handles `import d from`, `import * as ns from`, `import { a, b as c } from`,
 * their combinations, and side-effect-only `import 'x';` (which binds nothing).
 */
function importedNames(statement) {
  const fromMatch = /^import\s+([\s\S]*?)\s+from\s+/.exec(statement);
  if (!fromMatch) return [];

  const names = [];
  let clause = fromMatch[1].trim();

  const braces = /\{([\s\S]*)\}/.exec(clause);
  if (braces) {
    for (const specifier of braces[1].split(',')) {
      const parts = specifier.trim().split(/\s+as\s+/);
      const local = parts[parts.length - 1].trim();
      if (local) names.push(local);
    }
    clause = clause.replace(braces[0], '');
  }

  for (const specifier of clause.split(',')) {
    const trimmed = specifier.trim();
    if (!trimmed) continue;
    const namespace = /^\*\s+as\s+(.+)$/.exec(trimmed);
    names.push(namespace ? namespace[1].trim() : trimmed);
  }

  return names.filter(name => IDENTIFIER_RE.test(name));
}

/**
 * Blank out comments and quoted strings so identifier detection cannot be
 * fooled by a name that only appears in prose. Template literals are copied
 * verbatim: their `${...}` interpolations are real code and must stay visible.
 */
function stripCommentsAndStrings(code) {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];

    if (ch === '/' && next === '/') {
      while (i < code.length && code[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      i += 1;
      while (i < code.length && code[i] !== ch) {
        i += code[i] === '\\' ? 2 : 1;
      }
      i += 1;
      out += ' ';
      continue;
    }
    if (ch === '`') {
      out += ch;
      i += 1;
      while (i < code.length && code[i] !== '`') {
        if (code[i] === '\\') {
          i += 2;
          continue;
        }
        out += code[i];
        i += 1;
      }
      i += 1;
      out += '`';
      continue;
    }

    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Read an artifact custom `.jsx` and evaluate its non-JSX module body.
 *
 * @param {string} jsxPath Absolute path to the `.jsx` file.
 * @param {Record<string, unknown>} [bindings] Replacements for the bindings the
 *        stripped `import` lines provided, keyed by the LOCAL name used in the
 *        file (e.g. `{ moduleApiFetch: apiFetchToGlobalFetch }`). Every imported
 *        name the prelude references must appear here or the loader throws.
 * @returns {{ helpers: Record<string, unknown>, source: string, body: string }}
 *          `helpers` holds every top-level binding declared above the default
 *          export, `source` is the raw file text (for structural assertions)
 *          and `body` is the evaluated slice.
 */
export function loadCustomModule(jsxPath, bindings = {}) {
  const source = readFileSync(jsxPath, 'utf8');

  const match = DEFAULT_EXPORT_RE.exec(source);
  if (!match) {
    throw new Error(`loadCustomModule: no default export found in ${jsxPath}`);
  }

  const prelude = source.slice(0, match.index);
  const importStatements = prelude.match(IMPORT_LINE_RE) ?? [];
  const body = prelude.replace(IMPORT_LINE_RE, '');

  if (/^\s*import\s/m.test(body)) {
    throw new Error(
      `loadCustomModule: an import statement in ${jsxPath} could not be stripped; `
      + 'this loader only recognises single-line `import ... ;` statements.',
    );
  }

  if (/^\s*</m.test(body) || /=>\s*\(\s*</.test(body)) {
    throw new Error(
      `loadCustomModule: JSX found above the default export in ${jsxPath}; `
      + 'this loader can only evaluate the plain-JavaScript prelude.',
    );
  }

  const code = stripCommentsAndStrings(body);
  const referencedImports = importStatements
    .flatMap(importedNames)
    .filter(name => new RegExp(`\\b${name}\\b`).test(code));

  const missing = referencedImports.filter(
    name => !Object.prototype.hasOwnProperty.call(bindings, name),
  );
  if (missing.length > 0) {
    throw new Error(
      `loadCustomModule: ${jsxPath} references ${missing.join(', ')}, which came `
      + 'from an import this loader strips. Pass a replacement in the `bindings` '
      + 'argument, e.g. loadCustomModule(path, { '
      + `${missing[0]}: apiFetchToGlobalFetch });`,
    );
  }

  const names = [...body.matchAll(TOP_LEVEL_CONST_RE)].map(m => m[1]);
  if (names.length === 0) {
    throw new Error(`loadCustomModule: no top-level helpers found in ${jsxPath}`);
  }

  // eslint-disable-next-line no-new-func -- test-only: evaluates the real
  // production prelude so the tests cannot drift from it. See file header.
  const factory = new Function(
    ...referencedImports,
    `${body}\nreturn { ${names.join(', ')} };`,
  );
  return {
    helpers: factory(...referencedImports.map(name => bindings[name])),
    source,
    body,
  };
}
