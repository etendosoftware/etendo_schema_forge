import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ETP-5106 — the two invoice grids' `OutstandingAmt` label must match their spec.
 *
 * Both invoice windows bypass the generated `HeaderPage` when listing and render `ListView`
 * directly, so the spec-emitted `window.labelOverrides` never reach the grid. Each wrapper
 * therefore keeps a hand-written `LABEL_OVERRIDES` mirror of `decisions.json`, and the code
 * comments ask for the two to be kept in sync by hand — nothing enforced it until now, which is
 * how the grid could silently drift from the contract that drives the detail form, the advanced
 * filter and the list export.
 *
 * The suite reads both sides as text and data respectively and compares only `OutstandingAmt`,
 * the column this ticket renamed. It deliberately does not assert the whole override map: the
 * other columns are covered by each window's own `__tests__/index.test.js`.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_SHELL_SRC = join(__dirname, '..', '..', '..', '..');
const REPO_ROOT = join(APP_SHELL_SRC, '..', '..', '..');

const COLUMN = 'OutstandingAmt';
const ES_ES_LABEL = 'Saldo pendiente';
const ES_AR_LABEL = 'Saldo pendiente';
const EN_US_LABEL = 'Outstanding Amount';

const EXPECTED = { es_ES: ES_ES_LABEL, en_US: EN_US_LABEL, es_AR: ES_AR_LABEL };

const WINDOWS = [
  { spec: 'purchase-invoice', wrapper: 'purchase-invoice' },
  { spec: 'sales-invoice', wrapper: 'sales-invoice' },
];

/** Reads `window.labelOverrides` from a window's decisions.json. */
function readSpecOverrides(spec) {
  const path = join(REPO_ROOT, 'artifacts', spec, 'decisions.json');
  return JSON.parse(readFileSync(path, 'utf8')).window.labelOverrides;
}

/**
 * Extracts `LABEL_OVERRIDES[locale][COLUMN]` from a wrapper's source.
 *
 * The constant is read as text rather than imported because `index.jsx` pulls in the whole
 * window (React, the generated HeaderPage, the auth context), which a plain `node --test` run
 * cannot load. Returns `null` when the locale or the column is absent, so a missing block fails
 * with a readable diff instead of a TypeError.
 */
function readWrapperOverride(wrapper, locale) {
  const path = join(APP_SHELL_SRC, 'windows', 'custom', wrapper, 'index.jsx');
  const src = readFileSync(path, 'utf8');
  const pattern = new RegExp(`${locale}:\\s*\\{[^}]*?${COLUMN}:\\s*'([^']*)'`);
  return src.match(pattern)?.[1] ?? null;
}

describe('ETP-5106 — invoice LABEL_OVERRIDES stay in sync with decisions.json', () => {
  for (const { spec, wrapper } of WINDOWS) {
    for (const [locale, expected] of Object.entries(EXPECTED)) {
      it(`${spec}: decisions.json declares ${COLUMN} as "${expected}" for ${locale}`, () => {
        assert.equal(readSpecOverrides(spec)[locale]?.[COLUMN], expected);
      });

      it(`${wrapper}/index.jsx mirrors ${COLUMN} as "${expected}" for ${locale}`, () => {
        assert.equal(readWrapperOverride(wrapper, locale), expected);
      });
    }

    it(`${spec}: the wrapper mirror matches the spec for every locale it declares`, () => {
      const specOverrides = readSpecOverrides(spec);
      for (const locale of Object.keys(specOverrides)) {
        assert.equal(
          readWrapperOverride(wrapper, locale),
          specOverrides[locale][COLUMN],
          `${wrapper}/index.jsx drifted from artifacts/${spec}/decisions.json for ${locale}`,
        );
      }
    });
  }
});
