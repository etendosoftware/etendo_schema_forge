/**
 * ETP-5013 — the PDF export used a different font and color palette than the
 * GO app itself: two colors were hardcoded independently in
 * `templates/reports/base.css` (`--color-primary: #1a1a2e`,
 * `--color-text-muted: #64748b`) and never synced with the app's real design
 * tokens (`--foreground: #0F1729`, `--muted-foreground: #6C6C89` in
 * `app-shell-core/src/styles.css`); and the report never declared the
 * "Inter" font the app loads from Google Fonts, so jsreport's Alpine
 * container — which has no font packages installed — fell back to a generic
 * monospaced-looking system font.
 *
 * The fix: (1) `--color-primary`/`--color-text-muted` now use the app's
 * EXACT hex values, and (2) four `@font-face` rules declare "Inter" (weights
 * 400/500/600/700) with TWO `src` entries each — the SAME file embedded as a
 * base64 `data:` URI FIRST, then Google's hosted woff2 URL second — and
 * `--font-sans` now lists 'Inter' first.
 *
 * The embedded copy must be FIRST, not just present: jsreport/Puppeteer's
 * chrome-pdf can snapshot the page into a PDF before a REMOTE `@font-face`
 * finishes its network fetch (`page.pdf()` does not reliably wait on
 * `document.fonts.ready` for cross-origin fonts), so a network-first `src`
 * silently produced a PDF with the fallback system font even though the
 * interactive HTML preview (no such deadline) showed Inter correctly. A
 * `data:` URI needs no network round-trip, so it's what actually gets
 * embedded in the PDF, every time.
 *
 * These tests guard against regressions in EITHER of the two independent
 * `base.css` copies (this repo's `templates/reports/base.css` and the
 * sibling `schema_forge_core` repo's copy) drifting from the app's real
 * design tokens again, and from the two copies drifting from each other.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const THIS_BASE_CSS = fileURLToPath(new URL('../../../templates/reports/base.css', import.meta.url));
const CORE_BASE_CSS = fileURLToPath(
  new URL('../../../../schema_forge_core/templates/reports/base.css', import.meta.url)
);

const EXPECTED_COLOR_PRIMARY = '#0F1729';
const EXPECTED_COLOR_TEXT_MUTED = '#6C6C89';
const OLD_COLOR_PRIMARY = '#1a1a2e';
const OLD_COLOR_TEXT_MUTED = '#64748b';
const GSTATIC_URL =
  'https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2';

/** Extracts every `@font-face { ... }` block's raw body as an array of strings. */
function extractFontFaceBlocks(css) {
  const blocks = [];
  const re = /@font-face\s*\{([^}]*)\}/g;
  let match;
  while ((match = re.exec(css)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

/** Extracts the base64 payload (without the surrounding url(...) wrapper) from a font-face body. */
function extractBase64Payload(blockBody) {
  const match = blockBody.match(/data:font\/woff2;base64,([^)]+)\)/);
  return match ? match[1] : null;
}

function assertInterFontFaces(css, label) {
  const blocks = extractFontFaceBlocks(css);
  assert.ok(blocks.length >= 4, `[${label}] expected at least 4 @font-face blocks, got ${blocks.length}`);

  const interBlocks = blocks.filter((b) => /font-family:\s*'Inter'/.test(b));
  assert.equal(interBlocks.length, 4, `[${label}] expected exactly 4 'Inter' @font-face blocks`);

  const weights = interBlocks.map((b) => {
    const m = b.match(/font-weight:\s*(\d+)/);
    return m ? m[1] : null;
  });
  assert.deepEqual(
    weights.sort(),
    ['400', '500', '600', '700'],
    `[${label}] expected @font-face blocks for weights 400, 500, 600, 700`
  );

  for (const block of interBlocks) {
    assert.match(
      block,
      new RegExp(GSTATIC_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `[${label}] each Inter @font-face must list the Google-hosted woff2 URL`
    );
    assert.match(
      block,
      /url\(data:font\/woff2;base64,[A-Za-z0-9+/=]+\)\s*format\('woff2'\)/,
      `[${label}] each Inter @font-face must also list an embedded base64 woff2 entry`
    );
    // The embedded base64 entry MUST come first — this is the actual fix for
    // the Chrome-headless PDF snapshot race (page.pdf() does not reliably
    // wait on document.fonts.ready for cross-origin fonts): a `data:` URI
    // needs no network round-trip, so it's guaranteed to be ready by the time
    // Puppeteer snapshots the page into a PDF, unlike the gstatic URL. If
    // this ordering regresses, the PDF export silently falls back to a
    // generic system font again (the bug this test guards against).
    const gstaticIndex = block.indexOf(GSTATIC_URL);
    const base64Index = block.indexOf('data:font/woff2;base64,');
    assert.ok(gstaticIndex >= 0 && base64Index >= 0 && base64Index < gstaticIndex,
      `[${label}] the embedded base64 entry must precede the gstatic URL in the src list ` +
      `(base64-first avoids the Chrome-headless PDF snapshot race on remote @font-face)`);
  }

  return interBlocks;
}

function assertFontSansUsesInter(css, label) {
  const match = css.match(/--font-sans:\s*([^;]+);/);
  assert.ok(match, `[${label}] expected a --font-sans declaration`);
  const value = match[1].trim();
  assert.ok(
    value.startsWith("'Inter'"),
    `[${label}] --font-sans must list 'Inter' first, got: ${value}`
  );
}

function assertBrandColors(css, label) {
  const primaryMatch = css.match(/--color-primary:\s*(#[0-9A-Fa-f]+)/);
  assert.ok(primaryMatch, `[${label}] expected a --color-primary declaration`);
  assert.equal(
    primaryMatch[1],
    EXPECTED_COLOR_PRIMARY,
    `[${label}] --color-primary must match the app's --foreground exactly`
  );

  const mutedMatch = css.match(/--color-text-muted:\s*(#[0-9A-Fa-f]+)/);
  assert.ok(mutedMatch, `[${label}] expected a --color-text-muted declaration`);
  assert.equal(
    mutedMatch[1],
    EXPECTED_COLOR_TEXT_MUTED,
    `[${label}] --color-text-muted must match the app's --muted-foreground exactly`
  );

  assert.doesNotMatch(
    css,
    new RegExp(OLD_COLOR_PRIMARY, 'i'),
    `[${label}] the old, unsynced --color-primary value must not reappear`
  );
  assert.doesNotMatch(
    css,
    new RegExp(OLD_COLOR_TEXT_MUTED, 'i'),
    `[${label}] the old, unsynced --color-text-muted value must not reappear`
  );

  return { primary: primaryMatch[1], muted: mutedMatch[1] };
}

describe('base.css brand colors match the app design tokens (ETP-5013)', () => {
  it('schema_forge repo copy: --color-primary and --color-text-muted match the app exactly', () => {
    const css = readFileSync(THIS_BASE_CSS, 'utf8');
    assertBrandColors(css, 'schema_forge');
  });

  it('schema_forge_core sibling repo copy: --color-primary and --color-text-muted match the app exactly', () => {
    if (!existsSync(CORE_BASE_CSS)) {
      // The sibling checkout may not exist in every environment (e.g. a
      // functional-only dev without ../schema_forge_core cloned) — skip
      // rather than fail, matching this repo's opt-in LOCAL_CORE posture.
      return;
    }
    const css = readFileSync(CORE_BASE_CSS, 'utf8');
    assertBrandColors(css, 'schema_forge_core');
  });

  it('both copies use the IDENTICAL color values (no drift between the two repos)', () => {
    if (!existsSync(CORE_BASE_CSS)) {
      return;
    }
    const thisColors = assertBrandColors(readFileSync(THIS_BASE_CSS, 'utf8'), 'schema_forge');
    const coreColors = assertBrandColors(readFileSync(CORE_BASE_CSS, 'utf8'), 'schema_forge_core');
    assert.equal(thisColors.primary, coreColors.primary, '--color-primary must be identical in both repo copies');
    assert.equal(thisColors.muted, coreColors.muted, '--color-text-muted must be identical in both repo copies');
  });
});

describe("base.css declares the 'Inter' font with an embedded base64 entry first and gstatic as fallback (ETP-5013)", () => {
  it('schema_forge repo copy: 4 @font-face rules (400/500/600/700) with both src entries in base64-first order, and --font-sans lists Inter first', () => {
    const css = readFileSync(THIS_BASE_CSS, 'utf8');
    assertInterFontFaces(css, 'schema_forge');
    assertFontSansUsesInter(css, 'schema_forge');
  });

  it('schema_forge_core sibling repo copy: 4 @font-face rules (400/500/600/700) with both src entries in base64-first order, and --font-sans lists Inter first', () => {
    if (!existsSync(CORE_BASE_CSS)) {
      return;
    }
    const css = readFileSync(CORE_BASE_CSS, 'utf8');
    assertInterFontFaces(css, 'schema_forge_core');
    assertFontSansUsesInter(css, 'schema_forge_core');
  });

  it('schema_forge repo copy: all 4 embedded base64 payloads are byte-identical (same font blob, not 4 different copy-pasted blobs)', () => {
    const css = readFileSync(THIS_BASE_CSS, 'utf8');
    const blocks = extractFontFaceBlocks(css).filter((b) => /font-family:\s*'Inter'/.test(b));
    const payloads = blocks.map(extractBase64Payload);
    assert.equal(payloads.length, 4, 'expected to extract a base64 payload from each of the 4 Inter @font-face blocks');
    assert.ok(payloads.every(Boolean), 'every Inter @font-face block must have an embedded base64 payload');
    const [first, ...rest] = payloads;
    for (const payload of rest) {
      assert.equal(payload, first, 'all 4 embedded base64 payloads must be the exact same string');
    }
  });

  it('schema_forge_core sibling repo copy: all 4 embedded base64 payloads are byte-identical', () => {
    if (!existsSync(CORE_BASE_CSS)) {
      return;
    }
    const css = readFileSync(CORE_BASE_CSS, 'utf8');
    const blocks = extractFontFaceBlocks(css).filter((b) => /font-family:\s*'Inter'/.test(b));
    const payloads = blocks.map(extractBase64Payload);
    assert.equal(payloads.length, 4);
    const [first, ...rest] = payloads;
    for (const payload of rest) {
      assert.equal(payload, first, 'all 4 embedded base64 payloads must be the exact same string');
    }
  });

  it('the embedded base64 payload is identical between both repo copies (no drift between the two files)', () => {
    if (!existsSync(CORE_BASE_CSS)) {
      return;
    }
    const thisPayload = extractBase64Payload(
      extractFontFaceBlocks(readFileSync(THIS_BASE_CSS, 'utf8')).find((b) => /font-family:\s*'Inter'/.test(b))
    );
    const corePayload = extractBase64Payload(
      extractFontFaceBlocks(readFileSync(CORE_BASE_CSS, 'utf8')).find((b) => /font-family:\s*'Inter'/.test(b))
    );
    assert.ok(thisPayload && corePayload, 'expected to extract a base64 payload from both repo copies');
    assert.equal(thisPayload, corePayload, 'the embedded font blob must be identical between schema_forge and schema_forge_core');
  });
});
