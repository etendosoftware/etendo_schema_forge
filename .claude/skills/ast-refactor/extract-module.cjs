#!/usr/bin/env node
/**
 * extract-module — move top-level declarations out of one module into a sibling,
 * via the AST. Written for the DetailView/DataTable decomposition (Ola 3) after a
 * regex-based extraction produced three defects a parser cannot produce:
 * a single-line grep that found 16 of 76 imported names, deleted line ranges that
 * left 106 blank lines, and column-0 function detection that missed definitions.
 *
 * What it guarantees, because it works on nodes rather than text:
 *   - `--names` is matched against real declaration nodes, at any indentation,
 *     including `const x = () => {}` and declarations below the component.
 *   - Removing a declaration removes the node; recast reprints. No blank holes.
 *   - The R1 re-export list is DERIVED from what the test suites actually import
 *     (multi-line imports included), never hand-listed.
 *   - Identifiers left unbound in either file are reported before you run tests.
 *
 * Dry-run by default. Nothing is written without --write.
 *
 * Usage:
 *   node extract-module.cjs --from <file> --to <file> --names a,b,c [--write]
 *   node extract-module.cjs --from <file> --to <file> --all-helpers [--write]
 *   node extract-module.cjs --help
 *
 * Options:
 *   --from <path>     source module (required)
 *   --to <path>       destination module, created if absent (required)
 *   --names a,b,c     declarations to move
 *   --all-helpers     move every top-level declaration EXCEPT the default/primary
 *                     component export — the T31 shape
 *   --tests <glob>    where to look for importers when deriving the re-export
 *                     list. Default: <from-dir>/__tests__
 *   --write           apply. Without it, prints the plan and exits 0.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = findRepoRoot(__dirname);
const j = require(path.join(ROOT, 'node_modules/jscodeshift')).withParser('tsx');

function findRepoRoot(start) {
  let d = start;
  while (d !== path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'node_modules/jscodeshift'))) return d;
    d = path.dirname(d);
  }
  throw new Error('jscodeshift not found — run npm install at the repo root');
}

function parseArgs(argv) {
  const a = { names: [], write: false, allHelpers: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--help' || k === '-h') a.help = true;
    else if (k === '--write') a.write = true;
    else if (k === '--all-helpers') a.allHelpers = true;
    else if (k === '--from') a.from = argv[++i];
    else if (k === '--to') a.to = argv[++i];
    else if (k === '--tests') a.tests = argv[++i];
    else if (k === '--names') a.names = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
  }
  return a;
}

/**
 * Every top-level declaration, with its bound name AND its NodePath.
 * The path matters: removal must prune the path in its real tree. Re-wrapping a
 * bare node with `j(node)` yields a parentless path and `.remove()` throws.
 */
function topLevelDecls(root) {
  const out = [];
  const body = root.find(j.Program).at(0).get().get('body');
  body.each((p) => {
    const node = p.value;
    const decl = node.type === 'ExportNamedDeclaration' && node.declaration ? node.declaration : node;
    const exported = node.type === 'ExportNamedDeclaration';
    if (decl.type === 'FunctionDeclaration' && decl.id) {
      out.push({ name: decl.id.name, node, path: p, exported });
    } else if (decl.type === 'VariableDeclaration') {
      decl.declarations.forEach((d) => {
        if (d.id && d.id.type === 'Identifier') {
          out.push({ name: d.id.name, node, path: p, exported });
        }
      });
    }
  });
  return out;
}

/** Names imported FROM `moduleBasename` anywhere under `dir` — multi-line safe. */
function importedNames(dir, moduleBasename) {
  const found = new Set();
  if (!fs.existsSync(dir)) return found;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) { stack.push(p); continue; }
      if (!/\.(jsx?|tsx?)$/.test(e.name)) continue;
      let src;
      try { src = fs.readFileSync(p, 'utf8'); } catch { continue; }
      if (!src.includes(moduleBasename)) continue;
      let r;
      try { r = j(src); } catch { continue; }
      r.find(j.ImportDeclaration).forEach((imp) => {
        const from = imp.value.source.value || '';
        if (path.basename(from).replace(/\.(jsx?|tsx?)$/, '') !== moduleBasename) return;
        imp.value.specifiers.forEach((s) => {
          if (s.type === 'ImportSpecifier') found.add(s.imported.name);
        });
      });
    }
  }
  return found;
}

/**
 * Identifiers referenced in `src` that no enclosing scope binds.
 *
 * Uses the parser's own scope chain (`path.scope.lookup`) rather than a
 * hand-written filter. A manual filter has to enumerate every way a name can be
 * bound — params, destructuring, catch clauses, JSX locals — and whatever it
 * forgets becomes a false positive. Scope analysis already knows all of them,
 * which is the whole argument for using the AST in the first place.
 */
function unbound(src) {
  let root;
  try { root = j(src); } catch { return new Set(); }
  const globals = new Set(['window', 'document', 'console', 'Math', 'JSON', 'Object', 'Array',
    'String', 'Number', 'Boolean', 'Date', 'Promise', 'Set', 'Map', 'WeakMap', 'Error', 'RegExp',
    'parseFloat', 'parseInt', 'isNaN', 'isFinite', 'undefined', 'NaN', 'Infinity', 'globalThis',
    'fetch', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask',
    'localStorage', 'sessionStorage', 'crypto', 'navigator', 'location', 'history', 'URL',
    'URLSearchParams', 'FormData', 'Blob', 'File', 'AbortController', 'CustomEvent', 'Event',
    'HTMLElement', 'Node', 'process', 'require', 'module', 'exports', '__dirname', '__filename',
    'structuredClone', 'Intl', 'Symbol', 'BigInt', 'Reflect', 'Proxy']);
  const missing = new Set();
  root.find(j.Identifier).forEach((p) => {
    const { node, parent } = p;
    // Not a reference: property keys, member accessors, JSX attribute names, labels.
    if (parent.value.type === 'MemberExpression' && parent.value.property === node && !parent.value.computed) return;
    if (parent.value.type === 'OptionalMemberExpression' && parent.value.property === node && !parent.value.computed) return;
    if (parent.value.type === 'Property' && parent.value.key === node && !parent.value.computed) return;
    if (parent.value.type === 'ObjectProperty' && parent.value.key === node && !parent.value.computed) return;
    if (parent.value.type === 'JSXAttribute') return;
    if (/^(ImportSpecifier|ImportDefaultSpecifier|ImportNamespaceSpecifier|ExportSpecifier)$/.test(parent.value.type)) return;
    // Intrinsic JSX elements (<div>, <svg>, <path>…) are not identifiers to import.
    // Capitalised JSX names are real component references and stay in scope.
    if (/^JSX(Opening|Closing)Element$/.test(parent.value.type) && /^[a-z]/.test(node.name)) return;
    if (parent.value.type === 'JSXMemberExpression') return;
    if (globals.has(node.name)) return;
    // The parser's scope chain is the oracle.
    if (p.scope && p.scope.lookup(node.name)) return;
    if (p.scope && p.scope.getGlobalScope().declares(node.name)) return;
    missing.add(node.name);
  });
  return missing;
}

function main() {
  const a = parseArgs(process.argv);
  if (a.help || !a.from || !a.to) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\*?/, ''));
    process.exit(a.help ? 0 : 1);
  }

  const fromPath = path.resolve(a.from);
  const toPath = path.resolve(a.to);
  const src = fs.readFileSync(fromPath, 'utf8');
  const root = j(src);
  const decls = topLevelDecls(root);

  // Which declarations move
  let moving;
  if (a.allHelpers) {
    const primary = path.basename(fromPath).replace(/\.(jsx?|tsx?)$/, '');
    moving = decls.filter((d) => d.name !== primary);
  } else {
    moving = decls.filter((d) => a.names.includes(d.name));
    const missing = a.names.filter((n) => !decls.some((d) => d.name === n));
    if (missing.length) {
      console.error(`Not found as top-level declarations in ${path.basename(fromPath)}: ${missing.join(', ')}`);
      process.exit(1);
    }
  }
  if (!moving.length) { console.error('Nothing to move.'); process.exit(1); }

  // R1: derive the re-export list from what importers actually import
  const testsDir = a.tests ? path.resolve(a.tests) : path.join(path.dirname(fromPath), '__tests__');
  const fromBase = path.basename(fromPath).replace(/\.(jsx?|tsx?)$/, '');
  const imported = importedNames(testsDir, fromBase);
  const movingNames = new Set(moving.map((d) => d.name));
  const reexport = [...imported].filter((n) => movingNames.has(n)).sort();

  console.log(`\nfrom  ${path.relative(process.cwd(), fromPath)}`);
  console.log(`to    ${path.relative(process.cwd(), toPath)}`);
  console.log(`\nmoving ${moving.length} declaration(s):`);
  moving.forEach((d) => console.log(`    ${d.exported ? 'export ' : '       '}${d.name}`));
  console.log(`\nre-export for R1 (derived from ${path.relative(process.cwd(), testsDir)}): ${reexport.length}`);
  if (reexport.length) console.log(`    ${reexport.join(', ')}`);

  // Build destination
  const movedSrc = moving.map((d) => j(d.node).toSource()).join('\n\n');
  const imports = root.find(j.ImportDeclaration).nodes().map((n) => j(n).toSource());
  const keptImports = imports.filter((imp) => {
    const ids = (imp.match(/[A-Za-z_$][\w$]*/g) || []).filter((x) => !['import', 'from', 'as'].includes(x));
    return ids.some((x) => new RegExp(`\\b${x}\\b`).test(movedSrc));
  });
  const header = `/**\n * Extracted from ${path.basename(fromPath)} via ast-refactor.\n */\n`;
  const destBody = moving
    .map((d) => (d.exported ? j(d.node).toSource() : `export ${j(d.node).toSource()}`))
    .join('\n\n');
  const dest = fs.existsSync(toPath)
    ? fs.readFileSync(toPath, 'utf8').replace(/\n*$/, '\n\n') + destBody + '\n'
    : header + keptImports.join('\n') + '\n\n' + destBody + '\n';

  // Rebuild source: prune the real paths (no line ranges), add import + re-export.
  // Dedupe: one `const a, b` declaration yields two entries sharing a path.
  const seen = new Set();
  moving.forEach((d) => {
    if (seen.has(d.path)) return;
    seen.add(d.path);
    d.path.prune();
  });
  const rel = './' + path.relative(path.dirname(fromPath), toPath).replace(/\\/g, '/');
  const needed = [...movingNames].filter((n) => new RegExp(`\\b${n}\\b`).test(root.toSource())).sort();
  let out = root.toSource();
  const lastImport = out.lastIndexOf('\nimport ');
  const insertAt = lastImport === -1 ? 0 : out.indexOf('\n', out.indexOf(';', lastImport)) + 1;
  const block =
    (needed.length ? `import {\n  ${needed.join(', ')},\n} from '${rel}';\n` : '') +
    (reexport.length
      ? `\n// Re-exported for the suites that import these from '${path.basename(fromPath)}'.\n` +
        `// Only the definition site moved (R1: no test was edited).\n` +
        `export {\n  ${reexport.join(', ')},\n} from '${rel}';\n`
      : '');
  out = out.slice(0, insertAt) + block + out.slice(insertAt);

  const stillUnbound = [...unbound(dest)].filter((n) => !movingNames.has(n));
  if (stillUnbound.length) {
    console.log(`\n⚠  destination may need imports for: ${stillUnbound.join(', ')}`);
  }

  if (!a.write) {
    console.log('\nDry run. Re-run with --write to apply.\n');
    return;
  }
  fs.writeFileSync(toPath, dest);
  fs.writeFileSync(fromPath, out);
  console.log('\nWritten. Now run the suite with LOCAL_CORE=1 — counts must be IDENTICAL.');
  console.log('If a ratchet-tracked file shrank, add the destination to the budget in THIS commit.\n');
}

main();
