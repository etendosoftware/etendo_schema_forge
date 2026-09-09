// Shared node:test assertions for a custom list wrapper's LABEL_OVERRIDES constant.
//
// Both invoice wrappers bypass the generated HeaderPage when listing, so the spec's
// labelOverrides never reach DataTable and each index.jsx keeps a hand-written mirror of
// artifacts/<window>/decisions.json → window.labelOverrides. Their tests asserted that mirror
// with the same source-reading regex per column and locale, copy-pasted per file — flagged by
// Copilot review as a duplicated block across purchase-invoice/ and sales-invoice/.
//
// Following the resolveProductCodeAssertions.js precedent, this module registers the whole
// `it(...)` block rather than only the assertion bodies: that earlier extraction was re-flagged
// because the test titles and their leading comments were still duplicated verbatim even once
// the bodies were shared. Each call site is now a single `registerLabelOverrideTests(...)` call.
import { it } from 'node:test';

const REGEXP_SPECIAL = /[.*+?^${}()|[\]\\]/g;

function escapeRegExp(value) {
  return value.replace(REGEXP_SPECIAL, '\\$&');
}

/** The label a wrapper declares for one column under one locale, read off its source. */
export function assertLabelOverride(assert, src, locale, column, expected) {
  // Same shape the per-file tests used before the extraction: find the locale block, then the
  // column inside it. Deliberately kept lazy-and-permissive rather than tightened, so the
  // pre-existing POReference / delivery-status cases keep asserting exactly what they did.
  const pattern = new RegExp(`${locale}:\\s*\\{[\\s\\S]*?${column}:\\s*'${escapeRegExp(expected)}'`);
  assert.match(src, pattern, `LABEL_OVERRIDES.${locale}.${column} should be '${expected}'`);
}

/** "Saldo pendiente" / "Outstanding Amount" — distinct values only, so a locale that shares
 *  a translation with another does not repeat it in the test title. */
function describeLabels(labels) {
  return [...new Set(Object.values(labels))].map((label) => `"${label}"`).join(' / ');
}

/**
 * Registers one `it(...)` per column, asserting its label in every locale the case declares.
 *
 * @param assert node:assert/strict, passed in so this module stays runner-agnostic
 * @param {string} src the wrapper's index.jsx source
 * @param {Array<{column: string, labels: Record<string, string>}>} cases one entry per
 *   overridden column; `labels` is keyed by locale (es_ES, en_US, es_AR).
 */
export function registerLabelOverrideTests(assert, src, cases) {
  for (const { column, labels } of cases) {
    it(`renames ${column} to ${describeLabels(labels)}`, () => {
      for (const [locale, expected] of Object.entries(labels)) {
        assertLabelOverride(assert, src, locale, column, expected);
      }
    });
  }
}

/**
 * ETP-5106 — the outstanding-amount column, renamed from "Pendiente de pago" / "Pending Payment"
 * to balance wording in both invoice grids.
 *
 * Exported as a constant because the two wrappers declare it identically, down to the locale
 * values: inlining it in each file would reintroduce the duplication this module removes. es_AR
 * was added by the same ticket — it carried no overrides at all, so the grid fell through to the
 * raw AD label "Total Pendiente".
 */
export const OUTSTANDING_AMT_CASE = {
  column: 'OutstandingAmt',
  labels: {
    es_ES: 'Saldo pendiente',
    en_US: 'Outstanding Amount',
    es_AR: 'Saldo pendiente',
  },
};
