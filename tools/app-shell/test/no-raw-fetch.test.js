import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ETP-5022 guardrail — requests have exactly one home.
 *
 * The companion policy test (auth-header-policy.test.js) stops a call site from
 * hand-rolling the Authorization header. This one stops it from bypassing the request
 * helper altogether, which is how the header gap kept reappearing: a raw `fetch` is a
 * blank slate, so every one of them re-decides the base URL, `credentials`, the FormData
 * boundary and what an expired session does. 293 of them across 121 files were replaced
 * by `apiFetch` / `useApiFetch`; this test is what keeps the count from climbing back.
 *
 * Two ways out, both deliberately visible in a diff:
 *   - the file-level list below, for a module that is unauthenticated by design;
 *   - a `raw-fetch-ok:` comment on (or directly above) the call, for a one-off that is
 *     not an API request at all — reading a `blob:` URL, for instance.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src');

// Unauthenticated by design. Each entry names WHY, because "it was already there" is not
// a reason and this list is the only place the exception is recorded.
const ALLOWED_FILES = new Map([
  [join('auth', 'api.js'), 're-exports the helper itself'],
  [join('pages', 'ArtifactViewerPage.jsx'), 'dev-server /api/artifacts, no token expected'],
  [join('preview', 'PreviewPage.jsx'), 'dev-server /api/source, no token expected'],
  [join('components', 'support', 'helpDocs.js'), 'public mkdocs assets (mkdocs.yml, search_index.json)'],
]);

const OPT_OUT = 'raw-fetch-ok';

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

// `(?<![\w.])` keeps `apiFetch(`, `this.fetch(` and `window.fetch` bindings out of the
// match; only a bare `fetch(` call counts.
const RAW_FETCH = /(?<![\w.])fetch\s*\(/;

/**
 * Blanks out every comment while preserving the line count, so a `fetch()` written in
 * prose does not read as a call site. Line-by-line stripping is not enough: a JSDoc block
 * spans lines, and several of this repo's block comments discuss `fetch()` by name.
 */
function blankComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

function rawFetchLines(source) {
  const lines = source.split('\n');
  const code = blankComments(source).split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!RAW_FETCH.test(code[i])) continue;
    // The opt-out marker lives in a comment, so it is read from the ORIGINAL lines.
    const nearby = `${lines[i - 2] || ''}\n${lines[i - 1] || ''}\n${lines[i]}`;
    if (nearby.includes(OPT_OUT)) continue;
    hits.push(i + 1);
  }
  return hits;
}

describe('request policy (ETP-5022)', () => {
  it('no source file calls fetch directly', () => {
    const offenders = [];
    for (const file of collectSourceFiles(SRC)) {
      if (ALLOWED_FILES.has(relative(SRC, file))) continue;
      const lines = rawFetchLines(readFileSync(file, 'utf8'));
      const name = relative(SRC, file).split(sep).join('/');
      for (const line of lines) offenders.push(`${name}:${line}`);
    }

    assert.deepEqual(
      offenders,
      [],
      'These call sites use a raw fetch instead of the shared request helper:\n'
      + offenders.map((o) => `  - ${o}`).join('\n')
      + '\n\nUse the helper, which supplies Authorization + Accept-Language, the base URL,\n'
      + "credentials: 'include', the FormData boundary and 401 -> logout:\n"
      + "  in a component or hook:  const apiFetch = useApiFetch(apiBaseUrl)   // @/auth/useApiFetch.js\n"
      + "  in a plain module:       import { apiFetch } from '@etendosoftware/app-shell-core/auth/api'\n"
      + `\nIf the call is genuinely not an API request (reading a blob: URL, say), put a\n`
      + `"${OPT_OUT}: <reason>" comment on it or on the line above.\n`,
    );
  });

  it('every allowed exception still exists and still needs the exception', () => {
    // A stale entry silently re-opens the hole for whatever later occupies that path.
    for (const [file, reason] of ALLOWED_FILES) {
      const full = join(SRC, file);
      assert.doesNotThrow(() => statSync(full), `${file} is listed as an exception but no longer exists`);
      assert.ok(reason.length > 10, `${file} needs a real reason, got "${reason}"`);
    }
  });
});
