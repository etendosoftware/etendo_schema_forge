/**
 * ETP-5013 follow-up — UX/UI decided the whole report surface goes grayscale
 * (no brand-yellow), superseding the earlier "brand-yellow bands, neutral only
 * under @media print" design from earlier in this same session. The 3
 * accent-highlight tokens are now neutral by DEFAULT, not just under print:
 * `--color-accent-highlight`/`-muted` are transparent (a border/light stripe
 * carries any needed separation instead of a fill), and
 * `--color-accent-highlight-foreground` reuses `--color-primary`. Because
 * every report routes its group/section title bands through these 3 tokens
 * (not a hardcoded hex per template), this ONE change in `base.css` retro-fits
 * all 10 reports at once — no template.hbs edits needed for the color removal
 * itself. Screen and print/PDF are identical now, so there is no longer a
 * separate `@media print` override for these tokens (removed — it would just
 * re-declare the same default values).
 *
 * `.report-table thead th` is back to the neutral, pre-yellow pair
 * (`--color-bg-header`/`--color-text-muted`, thin `--color-border` bottom
 * border) instead of a solid fill.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const THIS_BASE_CSS = fileURLToPath(new URL('../../../templates/reports/base.css', import.meta.url));
const CORE_BASE_CSS = fileURLToPath(
  new URL('../../../../schema_forge_core/templates/reports/base.css', import.meta.url)
);

function assertGrayscalePalette(cssPath, label) {
  const css = readFileSync(cssPath, 'utf8');

  assert.match(
    css,
    /--color-accent-highlight:\s*transparent\s*;/,
    `[${label}] the strong accent band must default to transparent (no brand-yellow fill)`
  );
  assert.match(
    css,
    /--color-accent-highlight-foreground:\s*var\(--color-primary\)\s*;/,
    `[${label}] the accent foreground text must reuse --color-primary`
  );
  assert.match(
    css,
    /--color-accent-highlight-muted:\s*transparent\s*;/,
    `[${label}] the muted accent band must default to transparent (no brand-yellow fill)`
  );

  // No more @media print override for these 3 tokens — screen and print are
  // now the same grayscale palette by default, so a leftover print-only
  // block would be dead/confusing code.
  assert.doesNotMatch(
    css,
    /@media print\s*\{\s*:root\s*\{/,
    `[${label}] no @media print :root override should remain for these tokens`
  );

  const theadRuleMatch = css.match(/\.report-table thead th\s*\{([^}]*)\}/);
  assert.ok(theadRuleMatch, `[${label}] expected a .report-table thead th rule`);
  assert.match(
    theadRuleMatch[1],
    /background:\s*var\(--color-bg-header\)\s*;/,
    `[${label}] thead must use the neutral --color-bg-header fill, not the accent token`
  );
  assert.match(
    theadRuleMatch[1],
    /color:\s*var\(--color-text-muted\)\s*;/,
    `[${label}] thead text must use the neutral --color-text-muted, not the accent foreground`
  );
  assert.match(
    theadRuleMatch[1],
    /border-bottom:\s*2px solid var\(--color-border\)\s*;/,
    `[${label}] thead must carry a real border again now that no fill separates it`
  );
}

describe('base.css grayscale accent-highlight palette (ETP-5013 follow-up)', () => {
  it('schema_forge repo copy', () => {
    assertGrayscalePalette(THIS_BASE_CSS, 'schema_forge');
  });

  it('schema_forge_core sibling repo copy', () => {
    if (!existsSync(CORE_BASE_CSS)) {
      // The sibling checkout may not exist in every environment (e.g. a
      // functional-only dev without ../schema_forge_core cloned) — skip
      // rather than fail, matching this repo's opt-in LOCAL_CORE posture.
      return;
    }
    assertGrayscalePalette(CORE_BASE_CSS, 'schema_forge_core');
  });

  it('the two copies declare byte-identical accent-highlight tokens (no drift between repos)', () => {
    if (!existsSync(CORE_BASE_CSS)) return;
    const extractTokens = (css) => {
      const m = css.match(/--color-accent-highlight:[\s\S]*?--color-accent-highlight-muted:[^;]*;/);
      return m ? m[0] : null;
    };
    const thisTokens = extractTokens(readFileSync(THIS_BASE_CSS, 'utf8'));
    const coreTokens = extractTokens(readFileSync(CORE_BASE_CSS, 'utf8'));
    assert.ok(thisTokens, 'schema_forge: expected to find the 3 accent-highlight token declarations');
    assert.equal(thisTokens, coreTokens);
  });
});
