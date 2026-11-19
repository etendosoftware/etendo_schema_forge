/**
 * ETP-5384 — encode-on-output guardrail (ADR-0005 in com.etendoerp.go).
 *
 * Stored free text reaches jsreport HTML templates. Handlebars `{{ }}` HTML-escapes it; a raw
 * `{{{ }}}` / `{{& }}` / `{{{{raw}}}}` or a `SafeString` helper would render it as markup. The only
 * raw output allowed in an HTML template is the platform-owned `{{{css}}}` (also in its
 * whitespace-control form `{{{~css~}}}`). CSV and Excel templates are exempt: they are not HTML and
 * are covered by the ADR-0004 `csvField` neutralization.
 *
 * The rules are exercised against bad in-test fixtures so the guardrail cannot pass vacuously.
 * `dangerouslySetInnerHTML` is allowlisted to the reviewed files below.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// {{{{raw}}}} blocks are rejected outright: their body is emitted unescaped. Matched first so the
// inner {{{ }}} are not reported twice.
const COMMENTS = /\{\{!--[\s\S]*?--\}\}|\{\{![\s\S]*?\}\}/g;
const RAW_BLOCK = /\{\{\{\{[\s\S]*?\}\}\}\}/g;
const RAW_OUTPUT = /\{\{\{([^}]*)\}\}\}|\{\{~?&([^}]*)\}\}/g;

function findRawOutputs(source) {
  const src = source.replace(COMMENTS, '');
  const found = [...src.matchAll(RAW_BLOCK)].map((m) => m[0]);
  const rest = src.replace(RAW_BLOCK, '');
  for (const m of rest.matchAll(RAW_OUTPUT)) {
    const expr = (m[1] ?? m[2] ?? '').replace(/~/g, '').trim();
    if (m[1] !== undefined && expr === 'css') continue;
    found.push(m[0]);
  }
  return found;
}

const usesSafeString = (source) => /SafeString/.test(source);

// Reviewed `dangerouslySetInnerHTML` sites. ArtifactViewerPage entity-escapes `& < >` first.
const INNER_HTML_ALLOWLIST = ['tools/app-shell/src/pages/ArtifactViewerPage.jsx'];

const SKIP_DIRS = new Set(['node_modules', '.git', 'build', 'dist', 'artifacts-out']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const isTestFile = (f) => /(^|\/)(__tests__|test|e2e)\//.test(relative(ROOT, f))
  || /\.test\.[cm]?jsx?$/.test(f);

const allFiles = walk(ROOT);
const htmlTemplates = allFiles.filter(
  (f) => f.endsWith('.hbs') && !/-(csv|excel)\.hbs$/.test(f));
const sourceFiles = allFiles.filter(
  (f) => /\.[cm]?jsx?$/.test(f) && !isTestFile(f));

describe('ETP-5384 encode-on-output: rule self-check', () => {
  const BAD_TEMPLATES = [
    '{{{description}}}',
    '{{& description}}',
    '{{{~ description ~}}}',
    '{{~& description}}',
    '{{{{raw}}}} {{description}} {{{{/raw}}}}',
    '{{{css}}}{{{description}}}',
  ];
  for (const bad of BAD_TEMPLATES) {
    it(`reports ${JSON.stringify(bad)}`, () => {
      assert.ok(findRawOutputs(bad).length > 0);
    });
  }

  it('accepts the allowed forms', () => {
    for (const ok of ['{{{css}}}', '{{{~css~}}}', '{{ description }}', '{{!-- {{{x}}} --}}']) {
      assert.deepEqual(findRawOutputs(ok), [], ok);
    }
  });

  it('detects SafeString by new, import, alias and bracket access', () => {
    for (const bad of [
      'new Handlebars.SafeString(x)',
      "import { SafeString } from 'handlebars'",
      'const S = Handlebars.SafeString; S(x)',
      "Handlebars['SafeString'](x)",
    ]) {
      assert.ok(usesSafeString(bad), bad);
    }
  });
});

describe('ETP-5384 encode-on-output', () => {
  it('finds the HTML templates', () => {
    assert.ok(htmlTemplates.length > 0);
  });

  it('HTML templates only emit raw output for {{{css}}}', () => {
    const offenders = [];
    for (const f of htmlTemplates) {
      for (const raw of findRawOutputs(readFileSync(f, 'utf8'))) {
        offenders.push(`${relative(ROOT, f)}: ${raw}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it('no helper anywhere in the repo uses Handlebars SafeString', () => {
    assert.ok(sourceFiles.length > 0);
    const offenders = sourceFiles.filter((f) => usesSafeString(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f));
    assert.deepEqual(offenders, []);
  });

  it('dangerouslySetInnerHTML appears only in reviewed files', () => {
    const offenders = sourceFiles
      .filter((f) => f.includes(`${join('tools', 'app-shell', 'src')}`))
      .filter((f) => readFileSync(f, 'utf8').includes('dangerouslySetInnerHTML'))
      .map((f) => relative(ROOT, f))
      .filter((f) => !INNER_HTML_ALLOWLIST.includes(f));
    assert.deepEqual(offenders, []);
  });
});
