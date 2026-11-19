/**
 * ETP-5384 — encode-on-output guardrail (ADR-0005 in com.etendoerp.go).
 *
 * Stored free text reaches jsreport HTML templates. Handlebars `{{ }}` HTML-escapes it; a raw
 * `{{{ }}}` / `{{& }}` or a `SafeString` helper would render it as markup. The only raw output
 * allowed in an HTML template is the platform-owned `{{{css}}}`. CSV templates are exempt: they are
 * not HTML and are covered by the ADR-0004 `csvField` neutralization.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = [...walk(join(ROOT, 'artifacts')), ...walk(join(ROOT, 'templates'))]
  .filter((f) => !f.includes('__tests__'));
const htmlTemplates = files.filter(
  (f) => f.endsWith('.hbs') && !/-(csv|excel)\.hbs$/.test(f));

describe('ETP-5384 encode-on-output', () => {
  it('finds the HTML templates', () => {
    assert.ok(htmlTemplates.length > 0);
  });

  it('HTML templates only emit raw output for {{{css}}}', () => {
    const offenders = [];
    for (const f of htmlTemplates) {
      const src = readFileSync(f, 'utf8').replace(/\{\{!--[\s\S]*?--\}\}|\{\{![\s\S]*?\}\}/g, '');
      for (const m of src.matchAll(/\{\{\{([^}]*)\}\}\}|\{\{&([^}]*)\}\}/g)) {
        if ((m[1] ?? '').trim() !== 'css') offenders.push(`${f}: ${m[0]}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it('no helper returns Handlebars SafeString', () => {
    const offenders = files
      .filter((f) => f.endsWith('.js') && /SafeString/.test(readFileSync(f, 'utf8')))
      .filter((f) => !f.endsWith('report-templates-encode-on-output.test.js'));
    assert.deepEqual(offenders, []);
  });
});
