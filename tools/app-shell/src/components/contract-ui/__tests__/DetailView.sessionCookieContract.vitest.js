/**
 * ETP-4576 — module-wide request contract for DetailView.jsx.
 *
 * The session is a server-side `__Host-go_session` cookie. Every request the
 * module issues must therefore:
 *   - send `credentials: 'include'` so the cookie travels;
 *   - send NO `Authorization` header, on any code path;
 *   - carry the CSRF proof `X-Go-CSRF` if and only if the method is unsafe
 *     (POST/PUT/PATCH/DELETE). A safe GET must not carry it.
 *
 * Why this suite is structural rather than behavioural: the module has 21 fetch
 * sites. Six live in exported helper factories and are asserted behaviourally in
 * their own suites (`DetailView.secondaryTabs`, `.secondaryLineHandlers`,
 * `.inlineRowUpdate`, `.deleteRow`, `.detailProcesses`); one more — the line
 * callout POST — is asserted behaviourally in `DetailView.lineCalloutFlow`. The
 * remaining 14 are inline arrow handlers buried in JSX props of a 5000-line
 * component; driving each one through the mounted component would need long,
 * brittle interaction flows. This suite covers all 21 uniformly at the source
 * level instead, so no site can be missed — and unlike the behavioural suites it
 * also catches an unexercised branch that still builds a bearer header.
 *
 * IMPORTANT — comments are stripped before any matching. The module is being
 * migrated with explanatory comments that mention "bearer token" and
 * "Authorization"; a comment must never decide whether these tests pass. Both
 * block and line comments are removed, and nothing here asserts on comment text.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSRF_HEADER = 'X-Go-CSRF';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const RAW_SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'DetailView.jsx'),
  'utf8',
);

/** Comment-stripped source. Every assertion below runs against this. */
const codeOnly = RAW_SRC
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/**
 * Extracts every `fetch(...)` call from the source with its full argument list,
 * by walking parenthesis depth from the opening paren. `refetch(`/`prefetch(`
 * are excluded (the char before `fetch` must not be a word char), while
 * `globalThis.fetch(` is kept.
 */
function extractFetchCalls(src) {
  const calls = [];
  let idx = 0;
  while ((idx = src.indexOf('fetch(', idx)) !== -1) {
    const before = idx > 0 ? src[idx - 1] : ' ';
    if (/[A-Za-z0-9_$]/.test(before)) { idx += 'fetch('.length; continue; }
    let depth = 0;
    let i = idx + 'fetch'.length;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (depth === 0) break; }
    }
    calls.push({
      line: src.slice(0, idx).split('\n').length,
      text: src.slice(idx, i + 1),
    });
    idx = i + 1;
  }
  return calls;
}

const fetchCalls = extractFetchCalls(codeOnly);

/** A fetch init with no explicit `method` is a GET. */
function methodOf(call) {
  const m = call.text.match(/method:\s*['"](\w+)['"]/);
  return m ? m[1].toUpperCase() : 'GET';
}

const unsafeCalls = fetchCalls.filter((c) => UNSAFE_METHODS.has(methodOf(c)));
const safeCalls = fetchCalls.filter((c) => !UNSAFE_METHODS.has(methodOf(c)));

/** Label used in failure messages so a red points at the offending line. */
const at = (call) => `${methodOf(call)} at DetailView.jsx line ~${call.line}`;

describe('DetailView.jsx — fetch site inventory', () => {
  it('finds all 21 fetch sites', () => {
    // Guards the parser itself: if this count drifts, the partitioning below is
    // no longer covering the whole module and every other test here is suspect.
    expect(fetchCalls.length).toBe(21);
  });

  it('splits into 16 unsafe requests and 5 safe GETs', () => {
    expect(unsafeCalls.length).toBe(16);
    expect(safeCalls.length).toBe(5);
    expect(safeCalls.every((c) => methodOf(c) === 'GET')).toBe(true);
  });
});

describe('DetailView.jsx — no bearer credential survives', () => {
  it('builds no Authorization header anywhere in the module', () => {
    expect(codeOnly).not.toMatch(/Authorization/);
  });

  it('never mentions Bearer in code', () => {
    expect(codeOnly).not.toMatch(/Bearer/);
  });

  for (const call of fetchCalls) {
    it(`sends no Authorization header — ${at(call)}`, () => {
      expect(call.text).not.toMatch(/Authorization/);
      expect(call.text).not.toMatch(/Bearer/);
    });
  }
});

describe('DetailView.jsx — every request carries the session cookie', () => {
  for (const call of fetchCalls) {
    it(`sends credentials: 'include' — ${at(call)}`, () => {
      expect(call.text).toMatch(/credentials:\s*['"]include['"]/);
    });
  }
});

// The header literals are NOT built at the call sites: `lib/sessionHeaders.js`
// owns the single definition of both builders, so what each site must prove is
// that it reaches for the RIGHT one. `writeHeaders(csrfToken)` emits the guarded
// proof, `jsonHeaders()` never does — the omit-when-falsy behaviour itself is
// covered where it lives, in `hooks/__tests__/financialAccountHttp.vitest.js`,
// which exercises the same re-exported functions.
const WRITE_BUILDER = /headers:\s*writeHeaders\(\s*csrfToken\s*\)/;
const READ_BUILDER = /headers:\s*jsonHeaders\(\s*\)/;

describe('DetailView.jsx — CSRF proof only on unsafe methods', () => {
  for (const call of unsafeCalls) {
    it(`is handed the write builder — ${at(call)}`, () => {
      expect(call.text).toMatch(WRITE_BUILDER);
    });
  }

  for (const call of safeCalls) {
    it(`is handed the read builder and no proof — ${at(call)}`, () => {
      // A safe method must not present the proof: an implementation that
      // blanket-applies the write builder to all 21 sites has to fail here.
      expect(call.text).toMatch(READ_BUILDER);
      expect(call.text).not.toMatch(/writeHeaders/);
      expect(call.text).not.toContain(CSRF_HEADER);
    });
  }

  it('asserts the asymmetry in one place: an unsafe site takes the write builder, a GET site does not', () => {
    // Requirement (3): the two halves of the branch, side by side, so neither a
    // blanket "always send it" nor a blanket "never send it" implementation can pass.
    const oneUnsafe = unsafeCalls[0];
    const oneSafe = safeCalls[0];
    expect(oneUnsafe.text).toMatch(WRITE_BUILDER);
    expect(oneSafe.text).toMatch(READ_BUILDER);
    expect(oneSafe.text).not.toMatch(/writeHeaders/);
    // Both still send the cookie and neither sends a bearer token.
    expect(oneUnsafe.text).toMatch(/credentials:\s*['"]include['"]/);
    expect(oneSafe.text).toMatch(/credentials:\s*['"]include['"]/);
    expect(oneUnsafe.text).not.toMatch(/Authorization/);
    expect(oneSafe.text).not.toMatch(/Authorization/);
  });

  it('imports both builders from the shared module', () => {
    expect(codeOnly).toMatch(
      /import\s*\{[^}]*\bjsonHeaders\b[^}]*\bwriteHeaders\b[^}]*\}\s*from\s*['"]@\/lib\/sessionHeaders(\.js)?['"]/,
    );
  });

  it('defines no header builder of its own', () => {
    // Regression guard: 21 sites once repeated the same bearer header inline,
    // which is exactly how it survived unnoticed. Re-inlining a builder here —
    // or reviving authHeaders — puts us back there.
    expect(codeOnly).not.toMatch(/function\s+(writeHeaders|jsonHeaders|authHeaders)\s*\(/);
    expect(codeOnly).not.toMatch(/const\s+(writeHeaders|jsonHeaders|authHeaders)\s*=/);
  });
});

describe('DetailView.jsx — the credential source', () => {
  it('reads the auth context exactly once', () => {
    // useAuth() belongs in the DetailView component body only. A second read
    // means it leaked into one of the exported helper factories, which 15 test
    // files call WITHOUT mounting the component — that would break all of them.
    const reads = codeOnly.match(/useAuth\s*\(/g) ?? [];
    expect(reads.length).toBe(1);
  });

  it('imports useAuth from the auth context module', () => {
    expect(codeOnly).toMatch(/import\s*\{[^}]*\buseAuth\b[^}]*\}\s*from\s*['"]@\/auth\/AuthContext(\.jsx)?['"]/);
  });

  it('threads the proof into the helper factories as csrfToken', () => {
    // The five exported helpers must receive the proof as a plain option, NOT
    // read it from context themselves.
    expect(codeOnly).toMatch(/csrfToken/);
    for (const helper of [
      'getSecondaryRowUpdateHandler',
      'buildSecondaryLineHandlers',
      'buildInlineRowUpdateHandler',
      'buildDeleteRowHandler',
      'executeDetailProcessImpl',
    ]) {
      const decl = codeOnly.match(
        new RegExp(`(export\\s+)?(async\\s+)?function\\s+${helper}\\s*\\(([\\s\\S]*?)\\)\\s*\\{`),
      );
      expect(decl, `expected a declaration for ${helper}`).toBeTruthy();
      expect(decl[3], `${helper} must not destructure a bare token`).not.toMatch(/\btoken\b/);
    }
  });
});

// Everything above proves each fetch site *spells* writeHeaders(csrfToken), and
// that the helpers honour the proof when handed one. None of it proves the proof
// ARRIVES: the helper suites call the helpers directly with their own deps, so
// deleting a hand-off in DetailView leaves 5 of the 6 helper sites sending no
// X-Go-CSRF — a 403 on every one — with the whole suite green. That is the exact
// failure mode ETP-4576 exists to remove, so each hand-off is pinned here.
//
// Only `detailProcessDeps` was already covered, by DetailView.detailProcesses'
// mounted flow. A behavioural test for the other four would have to drive inline
// JSX arrow props through long interaction flows that do not exist today; those
// stay in the named-gap bucket. This is the textual complement.
describe('DetailView.jsx — the proof reaches every consumer', () => {
  const HANDOFFS = [
    ['SecondaryTableTab render', /<SecondaryTableTab\b[\s\S]*?\/>/],
    ['buildSecondaryLineHandlers call', /buildSecondaryLineHandlers\(\{[\s\S]*?\}\)/],
    ['buildInlineRowUpdateHandler call', /buildInlineRowUpdateHandler\(\{[^}]*\}\)/],
    ['buildDeleteRowHandler call', /buildDeleteRowHandler\(\{[^}]*\}\)/],
    ['detailProcessDeps object', /detailProcessDeps\s*=\s*\{[^}]*\}/],
  ];

  for (const [label, pattern] of HANDOFFS) {
    it(`passes csrfToken at the ${label}`, () => {
      const match = codeOnly.match(pattern);
      expect(match, `expected to find the ${label}`).toBeTruthy();
      expect(match[0], `the ${label} must forward csrfToken`).toMatch(/\bcsrfToken\b/);
    });
  }

  it('hands the proof to getSecondaryRowUpdateHandler through the tab ctx', () => {
    // SecondaryTableTab is the one exported sub-component that needs the proof.
    // It cannot call useAuth (15 test files render it unprovided), so it takes a
    // prop and forwards it into the ctx this handler destructures.
    // Anchored on `props.` so this matches the call site, not the declaration.
    const ctx = codeOnly.match(/getSecondaryRowUpdateHandler\(\s*props\.[\s\S]*?\}\)/);
    expect(ctx, 'expected the getSecondaryRowUpdateHandler call site').toBeTruthy();
    expect(ctx[0]).toMatch(/csrfToken:\s*props\.csrfToken/);
  });
});
