import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ETP-5020 guardrail — "Concepto contable" must never come back.
 *
 * The ticket renamed every user-visible occurrence of "Concepto contable" /
 * "Accounting concept" (plus the pre-existing "GL Item" / "G/L Item" / "APRM
 * GL Item" variants it converged on) to "Cuenta contable" / "Accounting
 * account" across es_ES.json and en_US.json. Nothing enforced that mapping
 * before this test — a future edit (a new field label, a copy-pasted string,
 * a merge that reintroduces an old branch) could reintroduce either the
 * Spanish phrase or the English one with no signal until a human happens to
 * spot it in the running app. This test reads the two locale source files
 * (the generated `locales/generated/core.*.json` mirrors are build output,
 * regenerated from these at dev/build time — not a second source to guard)
 * and fails loudly if either regresses.
 *
 * Deliberately out of scope (do not add here without re-reading
 * `docs/plans/santo_ETP-5020-gl-item-auto-management.md` §2.5):
 *   - `es_AR.json` — explicitly excluded from the rename (only the
 *     es_ES/en_US pair is in scope per CLAUDE.md's i18n policy).
 *   - `tools/app-shell/src/windows/custom/financial-account/index.jsx`
 *     (`MOVEMENT_CSV_COLUMNS` / `LINE_CSV_COLUMNS`) — the CSV export headers
 *     are a deliberate byte-for-byte mirror of Classic's own English export
 *     column names, never localized, and reviewed/kept as-is.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, '..', 'src', 'locales');

const ES_ES_PATH = join(LOCALES_DIR, 'es_ES.json');
const EN_US_PATH = join(LOCALES_DIR, 'en_US.json');

const esEsRaw = readFileSync(ES_ES_PATH, 'utf8');
const enUsRaw = readFileSync(EN_US_PATH, 'utf8');

// AD-derived field-label entries key on the ORIGINAL AD English label text
// (e.g. "G/L Item", "GL Item", "APRM GL Item") — that key is a stable
// identifier pulled from Etendo Classic's own AD metadata, not user-visible
// copy, so it is expected to keep saying "GL Item" forever. Only the
// translated *value* under each key is user-visible and must say the new
// term. This regex walks every such key and captures its nested "label".
const AD_LABEL_KEY_VALUE_RE = /"(?:APRM )?G\/?L Item":\s*\{\s*"label":\s*"([^"]*)"/g;

function collectAdLabelValues(raw) {
  const values = [];
  let match;
  AD_LABEL_KEY_VALUE_RE.lastIndex = 0;
  while ((match = AD_LABEL_KEY_VALUE_RE.exec(raw)) !== null) {
    values.push(match[1]);
  }
  return values;
}

describe('ETP-5020 — "Concepto contable" / "GL Item" must stay renamed (es_ES.json)', () => {
  it('contains zero occurrences of "concepto contable" (case-insensitive)', () => {
    assert.doesNotMatch(esEsRaw, /concepto contable/i);
  });

  it('contains zero occurrences of "accounting concept" (case-insensitive)', () => {
    assert.doesNotMatch(esEsRaw, /accounting concept/i);
  });

  it('every AD-label-keyed "G/L Item"-family entry translates its label to "cuenta contable"', () => {
    const values = collectAdLabelValues(esEsRaw);
    assert.ok(values.length > 0, 'expected to find at least one G/L Item AD-label key in es_ES.json');
    for (const value of values) {
      assert.match(
        value,
        /cuenta contable/i,
        `expected AD-label value "${value}" to contain "cuenta contable"`
      );
    }
  });
});

describe('ETP-5020 — "Concepto contable" / "GL Item" must stay renamed (en_US.json)', () => {
  it('contains zero occurrences of "concepto contable" (case-insensitive)', () => {
    assert.doesNotMatch(enUsRaw, /concepto contable/i);
  });

  it('contains zero occurrences of "accounting concept" (case-insensitive)', () => {
    assert.doesNotMatch(enUsRaw, /accounting concept/i);
  });

  it('every AD-label-keyed "G/L Item"-family entry translates its label to "accounting account"', () => {
    const values = collectAdLabelValues(enUsRaw);
    assert.ok(values.length > 0, 'expected to find at least one G/L Item AD-label key in en_US.json');
    for (const value of values) {
      assert.match(
        value,
        /accounting account/i,
        `expected AD-label value "${value}" to contain "accounting account"`
      );
    }
  });
});
