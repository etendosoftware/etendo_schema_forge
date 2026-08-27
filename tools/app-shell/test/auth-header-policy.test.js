import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ETP-5022 guardrail — auth headers have exactly one home.
 *
 * A request that carries `Authorization` but not `Accept-Language` makes the backend
 * resolve reference data (*_Trl names: countries, UoMs, AD_Ref_List) in the user's AD
 * language instead of the UI locale. `NeoAuthenticator.applyRequestLanguage` is a SILENT
 * no-op when the header is missing, so the failure mode is "selectors are in English" with
 * no error anywhere — which is why it shipped three times (ETP-4685, then ETP-5022 across
 * País / UOM / UOM for Weight) before being caught.
 *
 * The fix is not per-field: it is that every call site uses the canonical builders from
 * `@/auth/api.js` — `authHeaders(token)` for reads, `buildHeaders(token)` for JSON writes.
 * This test fails when a new call site hand-rolls the header again, which is the only thing
 * that keeps the sweep from decaying as new components are written.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src');

// The one module allowed to spell the header out: it *defines* the policy.
const ALLOWED = new Set([join('auth', 'api.js')]);

// Two shapes, because the first sweep only caught the literal one and 8 real gaps hid behind
// the second (lib/menuTree.js, lib/neoWebhookClient.js, ...): an object literal spelling the
// header out, and an assignment onto a headers object built up field by field.
const HAND_ROLLED = [
  // headers: { Authorization: `Bearer ${token}` }
  /(?:'Authorization'|"Authorization"|Authorization)\s*:\s*`Bearer /,
  // headers['Authorization'] = `Bearer ${token}`  /  headers.Authorization = ...
  /\[\s*(?:'Authorization'|"Authorization")\s*\]\s*=\s*`Bearer /,
  /\.\s*Authorization\s*=\s*`Bearer /,
  // new Headers(...); h.set('Authorization', `Bearer ...`)
  /\.set\(\s*(?:'Authorization'|"Authorization")\s*,\s*`Bearer /,
];

function handRolls(source) {
  return HAND_ROLLED.some((rx) => rx.test(source));
}

function collectSourceFiles(dir, acc = []) {
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

describe('auth header policy (ETP-5022)', () => {
  it('no source file hand-rolls an Authorization header', () => {
    const offenders = collectSourceFiles(SRC)
      .filter((file) => !ALLOWED.has(relative(SRC, file)))
      .filter((file) => handRolls(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file).split(sep).join('/'));

    assert.deepEqual(
      offenders,
      [],
      'These files build an Authorization header by hand, which omits Accept-Language and\n'
      + 'makes the backend answer in the AD language instead of the UI locale:\n'
      + offenders.map((f) => `  - ${f}`).join('\n')
      + '\n\nUse the canonical builders instead:\n'
      + "  import { authHeaders, buildHeaders } from '@/auth/api.js';\n"
      + '  authHeaders(token)   // GET / reads — no Content-Type\n'
      + '  buildHeaders(token)  // POST/PUT/DELETE with a JSON body\n',
    );
  });

  it('every file that calls a builder actually has it in scope', () => {
    // Vite/rollup does NOT fail the build on an undefined identifier — it becomes a runtime
    // ReferenceError the first time the call executes. The sweep introduced exactly this in
    // ReportViewerPage.jsx (imported buildHeaders, called authHeaders) and only a component
    // test caught it. This check is cheaper than that test and covers every file.
    const offenders = [];
    for (const file of collectSourceFiles(SRC)) {
      const src = readFileSync(file, 'utf8');
      const importMatch = src.match(/import \{([^}]*)\} from '@\/auth\/api(?:\.js)?';/);
      const imported = importMatch
        ? new Set(importMatch[1].split(',').map((s) => s.trim()).filter(Boolean))
        : new Set();
      for (const fn of ['authHeaders', 'buildHeaders']) {
        const called = new RegExp(`(?<![\\w.])${fn}\\s*\\(`).test(src);
        // A file may legitimately define or re-import the name itself (e.g.
        // hooks/financialAccountHttp.js exports its own authHeaders alias).
        const declaredLocally = new RegExp(`(?:function|const|let)\\s+${fn}\\b`).test(src)
          || new RegExp(`\\{[^}]*\\b${fn}\\b[^}]*\\}\\s*from\\s*'(?!@/auth/api)`).test(src);
        if (called && !imported.has(fn) && !declaredLocally) {
          offenders.push(`${relative(SRC, file).split(sep).join('/')} calls ${fn}() without importing it`);
        }
      }
    }
    assert.deepEqual(offenders, [], 'Unresolved header-builder calls (runtime ReferenceError):\n'
      + offenders.map((o) => `  - ${o}`).join('\n'));
  });

  it('the canonical builders both send Accept-Language', () => {
    // Guards the policy itself: if authHeaders/buildHeaders ever stop sending the locale,
    // every migrated call site regresses at once and the test above would still pass.
    const api = readFileSync(join(SRC, 'auth', 'api.js'), 'utf8');
    assert.match(api, /export \* from '@etendosoftware\/app-shell-core\/auth'/,
      'src/auth/api.js is expected to re-export the core auth module');

    const core = readFileSync(
      join(__dirname, '..', '..', '..', 'node_modules', '@etendosoftware', 'app-shell-core',
        'src', 'auth', 'api.js'),
      'utf8',
    );
    for (const fn of ['authHeaders', 'buildHeaders']) {
      const start = core.indexOf(`export function ${fn}`);
      assert.ok(start !== -1, `${fn} must be exported from app-shell-core/auth`);
      const body = core.slice(start, core.indexOf('\n}', start));
      const sendsLocale = /Accept-Language/.test(body)
        || /\.\.\.authHeaders\(/.test(body); // buildHeaders composes authHeaders
      assert.ok(sendsLocale, `${fn} must send Accept-Language (directly or via authHeaders)`);
    }
  });
});
