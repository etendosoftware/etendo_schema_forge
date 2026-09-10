/**
 * ETP-5013 (round 2) — the REAL root cause of the "PDF font does not match the
 * GO app" mismatch, found by generating a PDF against the actual jsreport
 * container and reading the `/FontName /...` entries embedded inside it.
 *
 * Embedding Inter (see `report-base-css-branding.test.js`) fixed the *body*
 * text, but the amount / date / account-code columns still came out wrong,
 * because they were styled with a SYSTEM monospace stack:
 *
 *     --font-mono: 'SF Mono', 'Fira Code', monospace;
 *
 * Neither 'SF Mono' nor 'Fira Code' is installed in jsreport's Alpine
 * container, so Chrome fell back to Alpine's typewriter faces
 * (`FreeMono` / `FreeMonoBold` / `FreeMonoOblique`) — while the interactive
 * preview, which renders on the user's own Mac where 'SF Mono' DOES exist,
 * showed something completely different. A system-font stack can never match
 * across two different operating systems, which is exactly what a report is:
 * preview on the user's machine, PDF inside a Linux container.
 *
 * On top of that, the GO app itself never used a mono font for numbers:
 * `DataTable.jsx` renders numeric cells as `text-right tabular-nums`, i.e. the
 * regular font (Inter) with tabular figures. So the report was diverging from
 * the app even before this ticket.
 *
 * The fix replaces the mono font with `font-variant-numeric: tabular-nums`
 * everywhere — same digit alignment, no typeface switch, no system-font
 * dependency:
 *   1. `templates/reports/base.css` (BOTH repo copies): `--font-mono` deleted
 *      from `:root`, `.cell-number, .cell-amount` now uses `tabular-nums`.
 *   2. `artifacts/report-general-ledger/template.hbs`: both `var(--font-mono)`
 *      usages (the `.acct-card-head .code` rule and the group-header inline
 *      `<span style="...">`).
 *   3. The 8 `artifacts/print-<doc>` template.hbs files, which carry their own
 *      inline `<style>` (they do NOT include `base.css`) and hardcoded
 *      `font-family: 'SF Mono', monospace` in `.doc-table tbody td.right`
 *      (all 8) and `.doc-totals-amount` (5 of them).
 *
 * These tests read the REAL files from disk, strip comments first (the fix
 * deliberately LEFT explanatory comments that mention "monospace" and
 * "'SF Mono'" — those must stay allowed, only real declarations are banned),
 * and additionally render two templates through real Handlebars to assert the
 * final HTML that reaches Chrome carries no mono `font-family` at all.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { registerReportHelpers } from '../../../templates/reports/helpers/report-html-helpers.js';

const _require = createRequire(import.meta.url);

const ARTIFACTS_ROOT = fileURLToPath(new URL('../../../artifacts', import.meta.url));
const PARTIALS_ROOT = fileURLToPath(new URL('../../../templates/reports', import.meta.url));
const THIS_BASE_CSS = fileURLToPath(new URL('../../../templates/reports/base.css', import.meta.url));
const CORE_BASE_CSS = fileURLToPath(
  new URL('../../../../schema_forge_core/templates/reports/base.css', import.meta.url)
);

/** The 8 document templates that carry their own inline <style> (no base.css). */
const PRINT_TEMPLATES = [
  'print-goods-shipment',
  'print-payment-in',
  'print-purchase-order',
  'print-return-material-receipt',
  'print-return-to-vendor-shipment',
  'print-sales-invoice',
  'print-sales-order',
  'print-sales-quotation',
];

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Strips CSS block comments, HTML `<!-- -->` and Handlebars `{{!-- --}}` ones.
 * The fix intentionally documents itself in comments that spell out the banned
 * values ("do not re-add a system-font stack", "where e.g. 'SF Mono' exists"),
 * so every ban below must be evaluated on comment-free source only.
 */
function stripComments(source) {
  return source
    .replace(/\{\{!--[\s\S]*?--\}\}/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Every `font-family: <value>` declaration value found in comment-free source. */
function fontFamilyValues(source) {
  const values = [];
  const re = /font-family\s*:\s*([^;}"'<]*)/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    values.push(match[1].trim());
  }
  return values;
}

/** Returns the declaration body of the first `selector { ... }` rule, or null. */
function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return match ? match[1] : null;
}

function assertNoMonoFontFamily(source, label) {
  const clean = stripComments(source);
  for (const value of fontFamilyValues(clean)) {
    assert.doesNotMatch(
      value,
      /mono/i,
      `[${label}] font-family must not reference any monospace stack ` +
        `(a system font cannot resolve identically in the preview and in the ` +
        `jsreport Alpine container) — found: font-family: ${value}`
    );
  }
  assert.doesNotMatch(
    clean,
    /var\(\s*--font-mono\s*\)/,
    `[${label}] the removed --font-mono token must not be referenced anymore`
  );
}

const BRANDING_PARTIAL = readFileSync(`${PARTIALS_ROOT}/document-branding.hbs`, 'utf8');

function expandReportPartials(templateContent) {
  return templateContent.replace(/\{\{>\s*document-branding\s*\}\}/g, BRANDING_PARTIAL);
}

function renderTemplate(reportId, data) {
  const Handlebars = _require('handlebars');
  registerReportHelpers(Handlebars, '');
  const raw = readFileSync(`${ARTIFACTS_ROOT}/${reportId}/template.hbs`, 'utf8');
  return Handlebars.compile(expandReportPartials(raw))(data);
}

// ── 1. base.css (both repo copies) ─────────────────────────────────────────

/** The two independent copies; the core one is optional (functional-only devs). */
const BASE_CSS_COPIES = [
  { label: 'schema_forge', path: THIS_BASE_CSS, optional: false },
  { label: 'schema_forge_core', path: CORE_BASE_CSS, optional: true },
];

describe('base.css no longer defines or uses a monospace font (ETP-5013)', () => {
  for (const { label, path, optional } of BASE_CSS_COPIES) {
    describe(label, () => {
      const load = () => {
        if (optional && !existsSync(path)) return null;
        return readFileSync(path, 'utf8');
      };

      it('does not declare a --font-mono custom property', () => {
        const css = load();
        if (css === null) return;
        assert.doesNotMatch(
          stripComments(css),
          /--font-mono\s*:/,
          'the --font-mono token must be gone from :root — any system-monospace ' +
            'stack resolves differently in the PDF container than in the preview'
        );
      });

      it('does not reference var(--font-mono) anywhere in the file', () => {
        const css = load();
        if (css === null) return;
        assert.doesNotMatch(css, /var\(\s*--font-mono\s*\)/);
      });

      it('has no font-family declaration pointing at a monospace stack', () => {
        const css = load();
        if (css === null) return;
        assertNoMonoFontFamily(css, label);
      });

      it('still declares --font-sans (the Inter stack is untouched by this fix)', () => {
        const css = load();
        if (css === null) return;
        assert.match(stripComments(css), /--font-sans\s*:\s*'Inter'/);
      });

      it('.cell-number, .cell-amount uses font-variant-numeric: tabular-nums', () => {
        const css = load();
        if (css === null) return;
        const body = ruleBody(stripComments(css), '.cell-number, .cell-amount');
        assert.ok(body, `[${label}] expected a ".cell-number, .cell-amount" rule`);
        assert.match(
          body,
          /font-variant-numeric\s*:\s*tabular-nums/,
          'amount/number cells must align digits via tabular figures, matching ' +
            "DataTable.jsx's `text-right tabular-nums` in the GO app"
        );
      });

      it('.cell-number, .cell-amount sets no font-family at all (typeface stays Inter)', () => {
        const css = load();
        if (css === null) return;
        const body = ruleBody(stripComments(css), '.cell-number, .cell-amount');
        assert.ok(body);
        assert.doesNotMatch(
          body,
          /font-family\s*:/,
          'the rule must not switch typeface — only the numeric variant changes'
        );
      });

      it('.cell-number, .cell-amount keeps its right alignment and 8.5pt size', () => {
        const css = load();
        if (css === null) return;
        const body = ruleBody(stripComments(css), '.cell-number, .cell-amount');
        assert.ok(body);
        assert.match(body, /text-align\s*:\s*right/);
        assert.match(body, /font-size\s*:\s*8\.5pt/);
      });
    });
  }

  it('both repo copies declare the IDENTICAL .cell-number/.cell-amount rule (no drift)', () => {
    if (!existsSync(CORE_BASE_CSS)) return;
    const normalize = (body) => body.replace(/\s+/g, ' ').trim();
    const mine = ruleBody(stripComments(readFileSync(THIS_BASE_CSS, 'utf8')), '.cell-number, .cell-amount');
    const core = ruleBody(stripComments(readFileSync(CORE_BASE_CSS, 'utf8')), '.cell-number, .cell-amount');
    assert.ok(mine && core, 'expected the rule in both copies');
    assert.equal(
      normalize(mine),
      normalize(core),
      'the numeric-cell rule must be identical in both base.css copies'
    );
  });
});

// ── 2. report-general-ledger/template.hbs ──────────────────────────────────

describe('report-general-ledger template dropped var(--font-mono) (ETP-5013)', () => {
  const src = readFileSync(`${ARTIFACTS_ROOT}/report-general-ledger/template.hbs`, 'utf8');

  it('no longer references var(--font-mono) anywhere', () => {
    assert.doesNotMatch(src, /var\(\s*--font-mono\s*\)/);
  });

  it('declares no monospace font-family', () => {
    assertNoMonoFontFamily(src, 'report-general-ledger');
  });

  it('.acct-card-head .code uses font-variant-numeric: tabular-nums', () => {
    const body = ruleBody(stripComments(src), '.acct-card-head .code');
    assert.ok(body, 'expected an ".acct-card-head .code" rule');
    assert.match(body, /font-variant-numeric\s*:\s*tabular-nums/);
    assert.doesNotMatch(body, /font-family\s*:/);
  });

  // ETP-5013 follow-up: the flat (ungrouped-by-dimension) layout used to
  // carry its OWN inline-styled `<span style="...">{{this.value}}</span>`
  // (a second, separate former var(--font-mono) site) — now it renders the
  // exact same `.acct-card-head` structure (and the same `<span class="code">`)
  // the dimension-grouped layout already used, so there is only ONE site
  // left: the shared `.acct-card-head .code` rule tested above, which now
  // applies to both layouts. No separate "inline span" test remains.
  it('covers what used to be the second var(--font-mono) site — now the same class-based rule as the grouped layout', () => {
    const occurrences = stripComments(src).match(/tabular-nums/g) || [];
    assert.equal(
      occurrences.length,
      1,
      `expected exactly 1 tabular-nums usage (the shared .acct-card-head .code rule, used by both layouts now), got ${occurrences.length}`
    );
  });
});

// ── 3. the 8 print-*/template.hbs document templates ───────────────────────

describe('print-* document templates dropped the hardcoded SF Mono stack (ETP-5013)', () => {
  for (const reportId of PRINT_TEMPLATES) {
    describe(reportId, () => {
      const src = readFileSync(`${ARTIFACTS_ROOT}/${reportId}/template.hbs`, 'utf8');
      const clean = stripComments(src);

      it("declares no font-family with 'SF Mono' / monospace", () => {
        assertNoMonoFontFamily(src, reportId);
      });

      it("contains no 'SF Mono' literal outside of comments", () => {
        assert.doesNotMatch(
          clean,
          /SF Mono/,
          "'SF Mono' only exists on the user's Mac, never inside the jsreport Alpine container"
        );
      });

      it('.doc-table tbody td.right uses font-variant-numeric: tabular-nums', () => {
        const body = ruleBody(clean, '.doc-table tbody td.right');
        assert.ok(body, 'expected a ".doc-table tbody td.right" rule');
        assert.match(body, /font-variant-numeric\s*:\s*tabular-nums/);
        assert.doesNotMatch(body, /font-family\s*:/);
      });

      it('.doc-table tbody td.right keeps right alignment and 8.5pt size', () => {
        const body = ruleBody(clean, '.doc-table tbody td.right');
        assert.ok(body);
        assert.match(body, /text-align\s*:\s*right/);
        assert.match(body, /font-size\s*:\s*8\.5pt/);
      });

      it('.doc-totals-amount, where declared, uses tabular-nums and no font-family', () => {
        const body = ruleBody(clean, '.doc-totals-amount');
        if (body === null) {
          // Only 5 of the 8 templates render a totals block; the shipment /
          // receipt / return templates have no amounts to total.
          assert.doesNotMatch(clean, /doc-totals-amount/,
            'a template that USES .doc-totals-amount must also declare the rule');
          return;
        }
        assert.match(body, /font-variant-numeric\s*:\s*tabular-nums/);
        assert.doesNotMatch(body, /font-family\s*:/);
      });
    });
  }

  it('all 8 templates declare the same numeric-cell typography (no per-document drift)', () => {
    const normalize = (body) => body.replace(/\s+/g, ' ').trim();
    const bodies = PRINT_TEMPLATES.map((reportId) => {
      const clean = stripComments(readFileSync(`${ARTIFACTS_ROOT}/${reportId}/template.hbs`, 'utf8'));
      return normalize(ruleBody(clean, '.doc-table tbody td.right') || '');
    });
    const [first, ...rest] = bodies;
    assert.ok(first, 'expected a numeric-cell rule in the first print template');
    for (let i = 0; i < rest.length; i += 1) {
      assert.equal(rest[i], first, `${PRINT_TEMPLATES[i + 1]} drifted from ${PRINT_TEMPLATES[0]}`);
    }
  });
});

// ── 4. real Handlebars renders — what Chrome actually receives ─────────────

describe('rendered HTML carries tabular-nums and zero mono font-family (ETP-5013)', () => {
  /** GL renders two different layouts: flat (`groupBy: ''`) vs. dimension cards. */
  const glData = (groupBy) => ({
    meta: {
      params: { groupBy, showDimensions: 'false' },
      labels: {},
      descriptionLabel: 'Description',
      ui: { initialBalance: 'Initial balance', subtotal: 'Subtotal', total: 'Total' },
      groups: [
        {
          name: 'Assets',
          accounts: [
            {
              value: '10000',
              name: 'Cash',
              opening: { amtacctdr: 100, amtacctcr: 0, total: 100 },
              subtotal: { amtacctdr: 100, amtacctcr: 0, total: 100 },
              total: { amtacctdr: 100, amtacctcr: 0, total: 100 },
              rows: [
                {
                  fact_acct_group_id: 'FAG1',
                  dateacct: '2026-08-10',
                  amtacctdr: 1234.5,
                  amtacctcr: 0,
                  runningBalance: 1234.5,
                  groupbyname: 'Cash',
                },
              ],
            },
          ],
        },
      ],
    },
  });

  it('report-general-ledger flat layout renders the account code with .acct-card-head .code, no mono font', () => {
    // `groupBy: ''` takes the {{else}} branch. ETP-5013 follow-up: this used
    // to have its OWN inline-styled span (a second former var(--font-mono)
    // site) — it now renders the exact same `.acct-card-head`/`class="code"`
    // structure as the dimension-grouped layout below, styled by the one
    // shared `.acct-card-head .code` rule.
    const html = renderTemplate('report-general-ledger', glData(''));

    assertNoMonoFontFamily(html, 'report-general-ledger flat (rendered)');
    assert.match(html, /<span class="code">10000<\/span>/);
    // And the numeric cells are still the ones base.css styles.
    assert.match(html, /class="cell-amount"/);
    // formatCurrency output confirms the digits themselves are unaffected.
    assert.match(html, /1\.234,50/);
  });

  it('report-general-ledger dimension-card layout renders .acct-card-head .code with no mono font', () => {
    // A non-empty `groupBy` takes the dim-group card branch — styled by the
    // same `.acct-card-head .code` rule as the flat layout above.
    const html = renderTemplate('report-general-ledger', glData('account'));

    assertNoMonoFontFamily(html, 'report-general-ledger cards (rendered)');
    assert.match(html, /<span class="code">10000<\/span>/);
    assert.match(
      html,
      /\.acct-card-head \.code \{[^}]*font-variant-numeric:\s*tabular-nums/,
      'the inlined <style> must ship the tabular-nums rule for the account code'
    );
  });

  it('print-sales-order renders numeric cells with no mono font-family in the output', () => {
    const html = renderTemplate('print-sales-order', {
      header: {
        documentno: 'SO-0001',
        bp_name: 'ACME',
        dateordered: '2026-08-10',
        totallines: 1234.5,
        grandtotal: 1493.75,
      },
      lines: [
        { line: 10, product_name: 'Widget', quantity: 2, uom: 'Unit', priceactual: 617.25, linenetamt: 1234.5 },
      ],
      taxes: [{ taxamt: 259.25 }],
      meta: { labels: {}, filters: [] },
    });

    assertNoMonoFontFamily(html, 'print-sales-order (rendered)');
    assert.doesNotMatch(stripComments(html), /SF Mono/);
    assert.match(html, /font-variant-numeric: tabular-nums/,
      'the inline <style> must ship tabular-nums for the numeric columns');
    assert.match(html, /<td class="right">/,
      'the rendered line table must still emit right-aligned numeric cells');
  });
});
